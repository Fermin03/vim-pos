-- ============================================================================
-- 0162 — Tienda en línea, entrega 2: las funciones que usa la función pública `tienda`.
-- Diseño: docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md (§7, §10)
--
-- Toda la lógica vive aquí y no en la Edge Function por dos razones: se prueba con smokes contra
-- un Postgres real, y la cotización tiene que dar el MISMO total que recalcular_totales_ticket al
-- centavo — crear_ticket_desde_tienda (0161) rechaza el pedido si no coincide.
--
-- Todas son SECURITY DEFINER y solo para service_role: el público nunca las llama; las llama la
-- Edge Function, que a su vez solo atiende al servidor de la tienda.
-- ============================================================================

-- ── §1 Estado de la tienda y datos del negocio ───────────────────────────────

-- ¿Cae p_ahora dentro del horario? p_horario: {"1": ["13:00","22:00"], …}, 1 = lunes … 7 = domingo.
-- Día ausente = cerrado. Cierre <= apertura = cierra pasada la medianoche (o, si son iguales, no
-- cierra). Cualquier cosa mal formada cuenta como cerrado: una tienda que no se sabe si abre, no abre.
CREATE OR REPLACE FUNCTION tienda_horario_abierto(p_horario jsonb, p_ahora timestamptz, p_tz text)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_local timestamp;
  v_hora  time;
  v_dow   integer;
  v_ayer  integer;
  v_a     time;
  v_c     time;
BEGIN
  IF p_horario IS NULL OR jsonb_typeof(p_horario) <> 'object' OR p_ahora IS NULL THEN RETURN false; END IF;
  -- sucursales.timezone y tenants.timezone son texto libre: una zona inválida cuenta como cerrado.
  BEGIN
    v_local := p_ahora AT TIME ZONE COALESCE(NULLIF(p_tz, ''), 'America/Mexico_City');
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  v_hora  := v_local::time;
  v_dow   := EXTRACT(isodow FROM v_local)::integer;
  v_ayer  := CASE WHEN v_dow = 1 THEN 7 ELSE v_dow - 1 END;

  -- El tramo de hoy.
  BEGIN
    v_a := (p_horario -> v_dow::text ->> 0)::time;
    v_c := (p_horario -> v_dow::text ->> 1)::time;
  EXCEPTION WHEN OTHERS THEN
    v_a := NULL; v_c := NULL;
  END;
  IF v_a IS NOT NULL AND v_c IS NOT NULL THEN
    IF v_c > v_a  AND v_hora >= v_a AND v_hora < v_c THEN RETURN true; END IF;
    IF v_c <= v_a AND v_hora >= v_a THEN RETURN true; END IF;
  END IF;

  -- El tramo de ayer, si cruzó la medianoche.
  BEGIN
    v_a := (p_horario -> v_ayer::text ->> 0)::time;
    v_c := (p_horario -> v_ayer::text ->> 1)::time;
  EXCEPTION WHEN OTHERS THEN
    v_a := NULL; v_c := NULL;
  END;
  IF v_a IS NOT NULL AND v_c IS NOT NULL AND v_c <= v_a AND v_hora < v_c THEN RETURN true; END IF;

  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION tienda_horario_abierto(jsonb, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_horario_abierto(jsonb, timestamptz, text) TO service_role;

-- ¿Recibe pedidos esta sucursal en este modo? NULL = sí. Si no, el motivo, en este orden.
CREATE OR REPLACE FUNCTION tienda_estado_sucursal(p_sucursal uuid, p_modo text, p_ahora timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_suc  record;
  v_ts   tienda_sucursales%ROWTYPE;
BEGIN
  SELECT s.id, s.tenant_id, COALESCE(s.timezone, t.timezone) AS tz
    INTO v_suc
    FROM sucursales s JOIN tenants t ON t.id = s.tenant_id
   WHERE s.id = p_sucursal AND s.deleted_at IS NULL AND s.activa
     AND t.deleted_at IS NULL AND t.estado IN ('ACTIVO', 'TRIAL', 'INTERNO')
     AND (t.bloqueo_desde IS NULL OR t.bloqueo_desde > p_ahora);
  IF NOT FOUND THEN RETURN 'TIENDA_NO_DISPONIBLE'; END IF;

  IF NOT EXISTS (SELECT 1 FROM tienda_config c WHERE c.tenant_id = v_suc.tenant_id)
     OR COALESCE((modulos_efectivos(v_suc.tenant_id) -> 'efectivos' ->> 'tienda')::boolean, false) IS NOT TRUE THEN
    RETURN 'TIENDA_NO_DISPONIBLE';
  END IF;

  SELECT * INTO v_ts FROM tienda_sucursales WHERE sucursal_id = p_sucursal AND tenant_id = v_suc.tenant_id;
  IF NOT FOUND OR NOT v_ts.participa THEN RETURN 'NO_PARTICIPA'; END IF;

  IF p_modo = 'RECOGER' THEN
    IF NOT v_ts.recoger THEN RETURN 'MODO_NO_DISPONIBLE'; END IF;
  ELSIF p_modo = 'DOMICILIO' THEN
    IF NOT v_ts.domicilio
       OR NOT EXISTS (SELECT 1 FROM zonas_envio z
                       WHERE z.sucursal_id = p_sucursal AND z.tenant_id = v_suc.tenant_id
                         AND z.activa AND z.deleted_at IS NULL) THEN
      RETURN 'MODO_NO_DISPONIBLE';
    END IF;
  ELSE
    RETURN 'MODO_NO_DISPONIBLE';
  END IF;

  IF v_ts.pausa_hasta IS NOT NULL AND v_ts.pausa_hasta > p_ahora THEN RETURN 'EN_PAUSA'; END IF;
  IF NOT tienda_horario_abierto(v_ts.horario, p_ahora, v_suc.tz) THEN RETURN 'FUERA_DE_HORARIO'; END IF;
  IF NOT sucursal_recibe_pedidos(p_sucursal) THEN RETURN 'CAJA_NO_LISTA'; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION tienda_estado_sucursal(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_estado_sucursal(uuid, text, timestamptz) TO service_role;

-- Lo que la tienda enseña del negocio. NULL = no hay tienda que enseñar (no existe, el negocio
-- está de baja o bloqueado, o no tiene el módulo). La Edge Function responde igual en los tres
-- casos: no se confirma qué direcciones existen.
-- Devuelve {tenant_id, publico: {…}}: `tenant_id` es para la función, que NUNCA lo manda al cliente.
CREATE OR REPLACE FUNCTION tienda_negocio(p_slug text, p_ahora timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c  tienda_config%ROWTYPE;
  v_t  record;
  v_sucursales jsonb;
BEGIN
  SELECT * INTO v_c FROM tienda_config WHERE slug = lower(btrim(COALESCE(p_slug, '')));
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT t.id, t.nombre_comercial, t.logo_png_url INTO v_t
    FROM tenants t
   WHERE t.id = v_c.tenant_id AND t.deleted_at IS NULL AND t.estado IN ('ACTIVO', 'TRIAL', 'INTERNO')
     AND (t.bloqueo_desde IS NULL OR t.bloqueo_desde > p_ahora);
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF COALESCE((modulos_efectivos(v_c.tenant_id) -> 'efectivos' ->> 'tienda')::boolean, false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'nombre', s.nombre,
           'telefono', s.telefono,
           'direccion', NULLIF(concat_ws(', ',
                          NULLIF(concat_ws(' ', s.direccion_calle, s.direccion_numero), ''),
                          s.direccion_colonia, s.ciudad), ''),
           'recoger', ts.recoger,
           'domicilio', ts.domicilio,
           'horario', ts.horario,
           'estado', jsonb_build_object(
             'recoger',   tienda_estado_sucursal(s.id, 'RECOGER', p_ahora),
             'domicilio', tienda_estado_sucursal(s.id, 'DOMICILIO', p_ahora)),
           'zonas', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', z.id, 'nombre', z.nombre, 'costo_mxn', z.costo_mxn::text)
                              ORDER BY z.orden, z.nombre)
               FROM zonas_envio z
              WHERE z.sucursal_id = s.id AND z.tenant_id = v_c.tenant_id AND z.activa AND z.deleted_at IS NULL),
             '[]'::jsonb))
         ORDER BY s.nombre), '[]'::jsonb)
    INTO v_sucursales
    FROM tienda_sucursales ts
    JOIN sucursales s ON s.id = ts.sucursal_id AND s.tenant_id = ts.tenant_id
   WHERE ts.tenant_id = v_c.tenant_id AND ts.participa AND s.activa AND s.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'tenant_id', v_c.tenant_id,
    'publico', jsonb_build_object(
      'slug', v_c.slug,
      'nombre', v_t.nombre_comercial,
      'logo_url', v_t.logo_png_url,
      'color', v_c.color,
      'descripcion', v_c.descripcion,
      'pago_efectivo', v_c.pago_efectivo,
      'pago_tarjeta', v_c.pago_tarjeta,
      'sucursales', v_sucursales));
END;
$$;
REVOKE ALL ON FUNCTION tienda_negocio(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_negocio(text, timestamptz) TO service_role;

-- ── §2 El menú ───────────────────────────────────────────────────────────────
-- La tienda enseña lo que la caja vende en esa sucursal: mismos filtros que el catálogo del POS
-- (apps/pos/app/lib/catalogo.ts, modificadores.ts y combos.ts) y la misma regla de precio y
-- disponibilidad que la venta (precio_producto_en_sucursal y motivo_no_disponible_en_sucursal, 0152).

-- Los grupos de modificadores de un producto, con minimo/maximo ya normalizados por tipo de
-- selección para que el cliente no tenga que conocer los tipos. Interna: solo la llama tienda_menu.
-- Una opción agotada se enseña marcada. Una de precio negativo no sale: ticket_item_modificadores
-- tiene CHECK >= 0 (0008) y reventaría la creación del ticket.
CREATE OR REPLACE FUNCTION _tienda_grupos_de(p_producto uuid, p_tenant uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', g.id,
           'nombre', g.nombre,
           'tipo_seleccion', g.tipo_seleccion,
           'minimo', CASE g.tipo_seleccion
                       WHEN 'UNICA_OBLIGATORIA' THEN 1
                       WHEN 'UNICA_OPCIONAL'    THEN 0
                       ELSE COALESCE(g.minimo_selecciones, 0) END,
           'maximo', CASE WHEN g.tipo_seleccion IN ('UNICA_OBLIGATORIA', 'UNICA_OPCIONAL') THEN 1
                          ELSE g.maximo_selecciones END,
           'opciones', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', o.id,
                      'nombre', o.nombre,
                      'precio_extra_mxn', to_char(o.precio_extra_mxn, 'FM999999990.00'),
                      'agotada', o.agotada,
                      'es_default', o.es_default)
                    ORDER BY o.orden_visualizacion, o.nombre)
               FROM opciones_modificador o
              WHERE o.grupo_id = g.id AND o.tenant_id = p_tenant
                AND o.activa AND o.deleted_at IS NULL AND o.precio_extra_mxn >= 0),
             '[]'::jsonb))
         ORDER BY pg.orden_visualizacion, g.nombre), '[]'::jsonb)
    FROM productos_grupos_modificadores pg
    JOIN grupos_modificadores g ON g.id = pg.grupo_id
   WHERE pg.producto_id = p_producto AND pg.tenant_id = p_tenant
     AND g.tenant_id = p_tenant AND g.activo AND g.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION _tienda_grupos_de(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- El menú de una sucursal: {categorias: [{id, nombre, productos: [{…, grupos, slots}]}]}.
-- Todos los importes son texto con dos decimales; minimo/maximo son los únicos números.
CREATE OR REPLACE FUNCTION tienda_menu(p_tenant uuid, p_sucursal uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_categorias jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sucursales s WHERE s.id = p_sucursal AND s.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'SUCURSAL_DE_OTRO_NEGOCIO: la sucursal % no es de este negocio', p_sucursal;
  END IF;

  WITH
  -- Lo que la caja enseña en esta sucursal, sea renglón del menú u opción de un slot. `agotado`:
  -- lo está en la sucursal, o un grupo obligatorio se quedó sin ninguna opción que se pueda pedir.
  vendibles AS (
    SELECT p.id, p.categoria_id, p.nombre, p.descripcion, p.imagen_url, p.es_combo, p.orden_visualizacion,
           precio_producto_en_sucursal(p.id, p_sucursal) AS precio,
           g.grupos,
           m.motivo IS NOT NULL   -- el WHERE solo deja pasar NULL o 'AGOTADO'
             OR EXISTS (SELECT 1 FROM jsonb_array_elements(g.grupos) gr
                         WHERE (gr ->> 'minimo')::integer >= 1
                           AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(gr -> 'opciones') op
                                            WHERE NOT (op ->> 'agotada')::boolean)) AS agotado
      FROM productos p
     CROSS JOIN LATERAL (SELECT motivo_no_disponible_en_sucursal(p.id, p_sucursal) AS motivo) m
     -- Un combo no lleva modificadores en su línea: agregar_combo_a_ticket los rechaza.
     CROSS JOIN LATERAL (SELECT CASE WHEN p.es_combo THEN '[]'::jsonb ELSE _tienda_grupos_de(p.id, p_tenant) END AS grupos) g
     WHERE p.tenant_id = p_tenant AND p.deleted_at IS NULL AND p.visible_en_pos
       AND (m.motivo IS NULL OR m.motivo = 'AGOTADO')
  ),
  -- Los slots de cada combo. Qué es opción lo decide lo mismo que valida agregar_combo_a_ticket
  -- (0152) y enseña la caja (combos.ts): en un slot por categoría, los productos de la categoría
  -- menos los excluidos (fila con activa = false); sin categoría, solo las filas activas.
  slots AS (
    SELECT cg.combo_producto_id,
           jsonb_agg(jsonb_build_object(
             'id', cg.id,
             'nombre', cg.nombre,
             'minimo', cg.minimo_selecciones,
             'maximo', cg.maximo_selecciones,
             'opciones', o.opciones) ORDER BY cg.orden_visualizacion, cg.nombre) AS slots,
           bool_or(cg.minimo_selecciones >= 1 AND NOT o.hay_vendible) AS incompleto
      FROM combo_grupos cg
     CROSS JOIN LATERAL (
       SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'producto_id', v.id,
                'nombre', v.nombre,
                'precio_extra_mxn', to_char(
                  CASE WHEN cg.modo_precio = 'SUMA_PRECIO_PRODUCTO' THEN v.precio ELSE 0 END
                  + COALESCE(co.precio_delta_mxn, 0), 'FM999999990.00'),
                'agotado', v.agotado,
                'es_default', COALESCE(co.es_default, false),
                'grupos', v.grupos)
              ORDER BY CASE WHEN cg.categoria_id IS NULL THEN co.orden_visualizacion ELSE v.orden_visualizacion END,
                       v.nombre), '[]'::jsonb) AS opciones,
              COALESCE(bool_or(NOT v.agotado), false) AS hay_vendible
         FROM vendibles v
         LEFT JOIN combo_opciones co
                ON co.grupo_id = cg.id AND co.producto_id = v.id AND co.deleted_at IS NULL
        WHERE NOT v.es_combo
          AND CASE WHEN cg.categoria_id IS NULL
                   THEN COALESCE(co.activa AND co.tenant_id = p_tenant, false)
                   ELSE v.categoria_id = cg.categoria_id
                        AND COALESCE(co.activa AND co.tenant_id = p_tenant, true)
              END) o
     WHERE cg.tenant_id = p_tenant AND cg.activo AND cg.deleted_at IS NULL
     GROUP BY cg.combo_producto_id
  )
  SELECT COALESCE(jsonb_agg(c.categoria ORDER BY c.orden_visualizacion, c.nombre), '[]'::jsonb)
    INTO v_categorias
    FROM (
      -- El JOIN deja fuera la categoría sin productos visibles.
      SELECT cat.orden_visualizacion, cat.nombre,
             jsonb_build_object(
               'id', cat.id,
               'nombre', cat.nombre,
               'productos', jsonb_agg(jsonb_build_object(
                 'id', v.id,
                 'nombre', v.nombre,
                 'descripcion', v.descripcion,
                 'imagen_url', v.imagen_url,
                 'precio_mxn', to_char(v.precio, 'FM999999990.00'),
                 -- Un combo, además, se agota si a un slot obligatorio no le queda opción vendible.
                 'agotado', v.agotado OR COALESCE(s.incompleto, false),
                 'es_combo', v.es_combo,
                 'grupos', v.grupos,
                 'slots', COALESCE(s.slots, '[]'::jsonb))
               ORDER BY v.orden_visualizacion, v.nombre)) AS categoria
        FROM categorias cat
        JOIN vendibles v ON v.categoria_id = cat.id
        LEFT JOIN slots s ON s.combo_producto_id = v.id AND v.es_combo
       WHERE cat.tenant_id = p_tenant AND cat.deleted_at IS NULL AND cat.activa
       GROUP BY cat.id
    ) c;

  RETURN jsonb_build_object('categorias', v_categorias);
END;
$$;
REVOKE ALL ON FUNCTION tienda_menu(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_menu(uuid, uuid) TO service_role;

-- ── §3 La cotización ─────────────────────────────────────────────────────────
-- Dos promesas. Una: lo que se cotiza es EXACTAMENTE lo que el menú ofrece; por eso no se le vuelve
-- a preguntar al catálogo qué se vende: el carrito se valida contra el propio JSON de tienda_menu.
-- Dos: el total es, al centavo, el que dará recalcular_totales_ticket (0156) cuando
-- crear_ticket_desde_tienda (0161) arme el ticket con estos renglones; si no coincide, ese pedido
-- no se puede aceptar (TOTAL_NO_COINCIDE).

-- Un entero JSON entre p_min y p_max, o NULL. Vale `2`; no valen `2.0`, `"2"`, `1.5` ni null:
-- _delivery_items_a_ticket (0161) lee la cantidad de un modificador con ::int, y '2.0' ahí revienta.
CREATE OR REPLACE FUNCTION _tienda_entero(p_valor jsonb, p_min integer, p_max integer)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF jsonb_typeof(p_valor) = 'number' AND p_valor::text ~ '^[0-9]{1,6}$' THEN
    v_n := p_valor::text::integer;
    IF v_n BETWEEN p_min AND p_max THEN RETURN v_n; END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION _tienda_entero(jsonb, integer, integer) FROM PUBLIC, anon, authenticated;

-- Lo que cobra el ticket por un renglón de importe neto p_neto: el IVA es el del producto y solo
-- se suma si va por fuera, redondeado POR RENGLÓN (recalcular_totales_ticket, 0156:714-721).
CREATE OR REPLACE FUNCTION _tienda_con_iva(p_neto numeric, p_producto uuid, p_tenant uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_neto + CASE WHEN p.iva_incluido_en_precio THEN 0 ELSE ROUND(p_neto * p.tasa_iva / 100, 2) END
    FROM productos p
   WHERE p.id = p_producto AND p.tenant_id = p_tenant;
$$;
REVOKE ALL ON FUNCTION _tienda_con_iva(numeric, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Valida lo elegido (p_mods: [{opcion_id, cantidad}]) contra los grupos que el menú ofrece para ese
-- producto (p_grupos, la salida de _tienda_grupos_de) y devuelve {normalizados, monto}; NULL si no
-- es válido. El código de error lo pone quien llama: no es el mismo en un producto que en un hijo
-- de combo. p_cantidad es la del renglón que los lleva (en un hijo: elección × combos), porque el
-- ticket cobra precio_extra × cantidad del modificador × cantidad del renglón (0161:262-275, 294-298).
-- Una opción inactiva, negativa, de otro negocio o de un grupo que no es del producto no está en
-- p_grupos, así que cae por «no ofrecida».
CREATE OR REPLACE FUNCTION _tienda_modificadores(p_grupos jsonb, p_mods jsonb, p_cantidad integer)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mods  jsonb := COALESCE(NULLIF(p_mods, 'null'::jsonb), '[]'::jsonb);
  v_ok    boolean;
  v_norm  jsonb;
  v_monto numeric(12,2);
BEGIN
  IF jsonb_typeof(v_mods) <> 'array' THEN RETURN NULL; END IF;

  WITH elegidas AS (
    SELECT e.ord, lower(e.m ->> 'opcion_id') AS opcion_id, _tienda_entero(e.m -> 'cantidad', 1, 10) AS cantidad
      FROM jsonb_array_elements(v_mods) WITH ORDINALITY AS e(m, ord)
  ),
  ofrecidas AS (
    SELECT g ->> 'id' AS grupo_id, o ->> 'id' AS opcion_id, o ->> 'nombre' AS nombre,
           o ->> 'precio_extra_mxn' AS precio, (o ->> 'agotada')::boolean AS agotada
      FROM jsonb_array_elements(p_grupos) g, jsonb_array_elements(g -> 'opciones') o
  ),
  pares AS (
    SELECT e.ord, e.opcion_id, e.cantidad, f.grupo_id, f.nombre, f.precio, f.agotada
      FROM elegidas e LEFT JOIN ofrecidas f USING (opcion_id)
  )
  SELECT
    -- Todas ofrecidas, ninguna agotada, cantidades de 1 a 10 y ninguna repetida… «IS NOT FALSE»:
    -- una opción sin la clave `agotada` no se puede vender (del lado seguro).
    NOT EXISTS (SELECT 1 FROM pares WHERE grupo_id IS NULL OR agotada IS NOT FALSE OR cantidad IS NULL)
    AND (SELECT count(*) = count(DISTINCT opcion_id) FROM pares)
    -- …y cada grupo, con su mínimo y su máximo (ya normalizados por tipo; máximo null = sin tope).
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_grupos) g
       CROSS JOIN LATERAL (SELECT COALESCE(sum(p.cantidad), 0) AS n FROM pares p WHERE p.grupo_id = g ->> 'id') s
       WHERE s.n < (g ->> 'minimo')::integer OR s.n > (g ->> 'maximo')::integer),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
                       'opcion_modificador_id', opcion_id,
                       'grupo_id', NULL,           -- solo una elección de slot lleva grupo_id (0161:184-196)
                       'nombre_app', nombre,
                       'cantidad', cantidad,
                       'precio_extra_mxn', precio) ORDER BY ord)
                FROM pares), '[]'::jsonb),
    COALESCE((SELECT sum(ROUND(precio::numeric * cantidad * p_cantidad, 2)) FROM pares), 0)
  INTO v_ok, v_norm, v_monto;

  IF v_ok IS NOT TRUE THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('normalizados', v_norm, 'monto', v_monto);
END;
$$;
REVOKE ALL ON FUNCTION _tienda_modificadores(jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;

-- La cotización de un carrito. NO mira si la tienda está abierta (eso es de tienda_crear_pedido):
-- cotizar con la tienda cerrada sirve para enseñar el carrito.
-- Devuelve {items, renglones, subtotal_mxn, envio_mxn, envio_total_mxn, total_mxn}:
--   · items: los renglones normalizados, tal cual los consume _delivery_items_a_ticket (0161);
--   · renglones: lo mismo, para enseñárselo al cliente;
--   · envio_mxn: el costo de la zona, como se guarda en delivery_pedidos.envio_mxn (sin el IVA que
--     el ticket le sume); envio_total_mxn: lo que el envío le cuesta al cliente;
--   · total_mxn = subtotal_mxn + envio_total_mxn = lo que dará tickets.total_mxn.
-- Por cada renglón del ticket (producto, padre de combo, cada hijo, envío):
--   neto  = cantidad × precio + Σ precio_extra × cantidad del modificador × cantidad del renglón
--   total = neto, más ROUND(neto × tasa / 100, 2) si el IVA va por fuera.
-- ponytail: arma el menú entero de la sucursal en cada cotización (una consulta por producto
-- visible). Sobra para cartas de cientos de productos; si un día pesa, sacar de tienda_menu una
-- función «un producto como lo enseña el menú» y usarla aquí y allá.
CREATE OR REPLACE FUNCTION tienda_cotizar(p_tenant uuid, p_sucursal uuid, p_modo text, p_zona uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_uuid       CONSTANT text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_menu       jsonb;
  v_r          jsonb;            -- un renglón del carrito
  v_pid        text;
  v_p          jsonb;            -- su producto, como lo enseña el menú
  v_cant       integer;
  v_precio     numeric(12,2);    -- precio unitario del renglón (en un combo: base + elecciones)
  v_total      numeric(12,2);    -- lo que el ticket cobrará por el renglón (un combo: padre + hijos)
  v_mods       jsonb;            -- sus modificadores normalizados (en un combo: las elecciones)
  v_m          jsonb;
  v_comps      jsonb;
  v_comp       jsonb;
  v_slot       jsonb;
  v_op         jsonb;
  v_n          integer;
  v_items      jsonb := '[]'::jsonb;
  v_renglones  jsonb := '[]'::jsonb;
  v_subtotal   numeric(12,2) := 0;
  v_envio      numeric(12,2) := 0;
  v_envio_tot  numeric(12,2) := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sucursales s WHERE s.id = p_sucursal AND s.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'SUCURSAL_DE_OTRO_NEGOCIO: la sucursal % no es de este negocio', p_sucursal;
  END IF;

  IF p_modo = 'DOMICILIO' THEN
    SELECT z.costo_mxn INTO v_envio
      FROM zonas_envio z
     WHERE z.id = p_zona AND z.tenant_id = p_tenant AND z.sucursal_id = p_sucursal
       AND z.activa AND z.deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'ZONA_INVALIDA: a domicilio hace falta una zona activa de esta sucursal'; END IF;
  ELSIF p_modo = 'RECOGER' THEN
    IF p_zona IS NOT NULL THEN RAISE EXCEPTION 'ZONA_INVALIDA: al recoger no hay zona de envío'; END IF;
  ELSE
    RAISE EXCEPTION 'MODO_INVALIDO: el modo es RECOGER o DOMICILIO';
  END IF;

  -- jsonb_array_length revienta con lo que no es arreglo: el CASE lo deja en NULL.
  IF COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items END), 0) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'CARRITO_INVALIDO: el carrito es un arreglo de 1 a 40 renglones';
  END IF;

  v_menu := tienda_menu(p_tenant, p_sucursal);

  FOR v_r IN SELECT e.r FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(r, ord) ORDER BY e.ord LOOP
    v_pid  := lower(v_r ->> 'producto_id');
    v_cant := _tienda_entero(v_r -> 'cantidad', 1, 50);
    IF jsonb_typeof(v_r) IS DISTINCT FROM 'object' OR jsonb_typeof(v_r -> 'producto_id') IS DISTINCT FROM 'string'
       OR v_pid !~ c_uuid OR v_cant IS NULL THEN
      RAISE EXCEPTION 'CARRITO_INVALIDO: cada renglón lleva producto_id y una cantidad entera de 1 a 50';
    END IF;

    -- Que esté en el menú y no agotado ES la regla de qué se vende (tienda_menu, reglas 1, 2, 6 y 8).
    v_p := jsonb_path_query_first(v_menu, '$.categorias[*].productos[*] ? (@.id == $id)', jsonb_build_object('id', v_pid));
    -- «IS NOT FALSE»: sin la clave `agotado` tampoco se vende.
    IF v_p IS NULL OR (v_p ->> 'agotado')::boolean IS NOT FALSE THEN
      RAISE EXCEPTION 'PRODUCTO_NO_DISPONIBLE: %', v_pid;
    END IF;
    v_precio := (v_p ->> 'precio_mxn')::numeric;

    IF NOT (v_p ->> 'es_combo')::boolean THEN
      IF COALESCE(v_r -> 'componentes', '[]'::jsonb) NOT IN ('[]'::jsonb, 'null'::jsonb) THEN
        RAISE EXCEPTION 'CARRITO_INVALIDO: solo un combo lleva componentes';
      END IF;
      v_m := _tienda_modificadores(v_p -> 'grupos', v_r -> 'modificadores', v_cant);
      IF v_m IS NULL THEN RAISE EXCEPTION 'MODIFICADORES_INVALIDOS: %', v_pid; END IF;
      v_mods  := v_m -> 'normalizados';
      v_total := _tienda_con_iva(ROUND(v_cant * v_precio, 2) + (v_m ->> 'monto')::numeric, v_pid::uuid, p_tenant);
    ELSE
      -- Un combo: el padre cobra base + elecciones (con el IVA del combo); cada hijo va a precio 0
      -- y solo cobra sus propios modificadores (con el IVA del hijo). Anexo §4.
      v_comps := COALESCE(NULLIF(v_r -> 'componentes', 'null'::jsonb), '[]'::jsonb);
      IF COALESCE(v_r -> 'modificadores', '[]'::jsonb) NOT IN ('[]'::jsonb, 'null'::jsonb)
         OR jsonb_typeof(v_comps) <> 'array' THEN
        RAISE EXCEPTION 'COMBO_INVALIDO: %', v_pid;
      END IF;
      v_mods  := '[]'::jsonb;
      v_total := 0;
      FOR v_comp IN SELECT e.c FROM jsonb_array_elements(v_comps) WITH ORDINALITY AS e(c, ord) ORDER BY e.ord LOOP
        v_slot := jsonb_path_query_first(v_p, '$.slots[*] ? (@.id == $id)',
                                         jsonb_build_object('id', lower(v_comp ->> 'grupo_id')));
        v_op   := jsonb_path_query_first(v_slot, '$.opciones[*] ? (@.producto_id == $id)',
                                         jsonb_build_object('id', lower(v_comp ->> 'producto_id')));
        v_n    := _tienda_entero(v_comp -> 'cantidad', 1, 999);   -- el tope de verdad es el máximo del slot
        IF v_op IS NULL OR (v_op ->> 'agotado')::boolean IS NOT FALSE OR v_n IS NULL THEN
          RAISE EXCEPTION 'COMBO_INVALIDO: %', v_pid;
        END IF;
        v_m := _tienda_modificadores(v_op -> 'grupos', v_comp -> 'modificadores', v_n * v_cant);
        IF v_m IS NULL THEN RAISE EXCEPTION 'COMBO_INVALIDO: %', v_pid; END IF;

        v_precio := v_precio + (v_op ->> 'precio_extra_mxn')::numeric * v_n;
        v_total  := v_total + _tienda_con_iva((v_m ->> 'monto')::numeric, (v_op ->> 'producto_id')::uuid, p_tenant);
        v_mods   := v_mods || jsonb_build_object(
          'opcion_modificador_id', v_op ->> 'producto_id',   -- el PRODUCTO elegido (0161:218-234)
          'grupo_id', v_slot ->> 'id',
          'nombre_app', v_op ->> 'nombre',
          'cantidad', v_n,                                     -- por unidad de combo
          'precio_extra_mxn', v_op ->> 'precio_extra_mxn',
          'modificadores', v_m -> 'normalizados');
      END LOOP;
      -- El mismo producto dos veces no se admite: el ticket empareja los modificadores de un hijo
      -- por producto y no sabría a cuál van (0161, COMBO_ELECCION_AMBIGUA). Y cada slot, con su
      -- mínimo y su máximo.
      IF (SELECT count(*) <> count(DISTINCT m ->> 'opcion_modificador_id') FROM jsonb_array_elements(v_mods) m)
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(v_p -> 'slots') s
            CROSS JOIN LATERAL (SELECT COALESCE(sum((m ->> 'cantidad')::integer), 0) AS n
                                  FROM jsonb_array_elements(v_mods) m
                                 WHERE m ->> 'grupo_id' = s ->> 'id') x
            WHERE x.n NOT BETWEEN (s ->> 'minimo')::integer AND (s ->> 'maximo')::integer) THEN
        RAISE EXCEPTION 'COMBO_INVALIDO: %', v_pid;
      END IF;
      v_total := v_total + _tienda_con_iva(ROUND(v_cant * v_precio, 2), v_pid::uuid, p_tenant);
    END IF;

    -- Una elección de slot puede restar (precio_delta_mxn no tiene CHECK), pero el renglón no puede
    -- quedar en negativo: ticket_items.precio_unitario_snapshot tiene CHECK >= 0.
    IF v_precio < 0 THEN RAISE EXCEPTION 'PRECIO_INVALIDO: un precio unitario quedó en negativo'; END IF;

    v_items := v_items || jsonb_build_object(
      'producto_id', v_pid,
      'nombre_app', v_p ->> 'nombre',
      'cantidad', v_cant,
      'precio_unitario_mxn', v_p ->> 'precio_mxn',   -- en un combo, la base: las elecciones suman aparte
      -- Texto del público, última red (la función `tienda` ya lo limpia): los caracteres de control
      -- se vuelven espacio antes de recortar. Va a la comanda y al ticket impreso.
      'nota', CASE WHEN jsonb_typeof(v_r -> 'nota') = 'string'
                   THEN NULLIF(left(btrim(regexp_replace(v_r ->> 'nota', '[[:cntrl:]]', ' ', 'g')), 200), '') END,
      'alergenos', '[]'::jsonb,
      'alergia_nota', NULL,
      'modificadores', v_mods);
    v_renglones := v_renglones || jsonb_build_object(
      'nombre', v_p ->> 'nombre',
      'cantidad', v_cant,
      'detalle', (SELECT string_agg(m ->> 'nombre_app', ', ') FROM jsonb_array_elements(v_mods) m),
      'total_mxn', to_char(v_total, 'FM999999990.00'));
    v_subtotal := v_subtotal + v_total;
  END LOOP;

  -- El envío es un renglón más del ticket, de cantidad 1, con el IVA del PRIMER renglón del
  -- carrito (fijar_envio_ticket, 0116:193-205). Una zona de $0 no deja renglón.
  IF v_envio > 0 THEN
    v_envio_tot := _tienda_con_iva(v_envio, lower(p_items -> 0 ->> 'producto_id')::uuid, p_tenant);
  END IF;

  RETURN jsonb_build_object(
    'items', v_items,
    'renglones', v_renglones,
    'subtotal_mxn', to_char(v_subtotal, 'FM999999990.00'),
    'envio_mxn', to_char(v_envio, 'FM999999990.00'),
    'envio_total_mxn', to_char(v_envio_tot, 'FM999999990.00'),
    'total_mxn', to_char(v_subtotal + v_envio_tot, 'FM999999990.00'));
END;
$$;
REVOKE ALL ON FUNCTION tienda_cotizar(uuid, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_cotizar(uuid, uuid, text, uuid, jsonb) TO service_role;

-- ── §4 El alta del pedido ────────────────────────────────────────────────────
-- La frontera con el público: todo lo que entra a delivery_pedidos por la tienda pasa por aquí, y
-- nada del cliente se guarda sin validar. La Edge Function ya normaliza; esto es la última red, y
-- la que no se puede saltar. Los importes y los renglones NO son los del cliente: son los de
-- tienda_cotizar. Lo que crear_ticket_desde_tienda (0161) exige después de la fila, se cumple aquí.
-- Devuelve {pedido_id, folio_corto, total_mxn, vence_aceptacion}.
CREATE OR REPLACE FUNCTION tienda_crear_pedido(
  p_tenant uuid, p_sucursal uuid, p_modo text, p_zona uuid, p_items jsonb,
  p_cliente jsonb,          -- {nombre, telefono (10 dígitos), email | null}
  p_direccion jsonb,        -- NULL al recoger; a domicilio {calle, numero_exterior, numero_interior?, colonia, codigo_postal, ciudad, estado, referencias?}
  p_pago text,              -- 'EFECTIVO' | 'TARJETA'
  p_paga_con numeric,       -- NULL salvo EFECTIVO
  p_nota text,
  p_seguimiento_hash text,  -- SHA-256 en hex del código que solo conoce el cliente
  p_cuenta uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_motivo text;
  v_nombre text := btrim(p_cliente ->> 'nombre');
  v_tel    text := p_cliente ->> 'telefono';
  v_email  text := p_cliente ->> 'email';
  v_cfg    tienda_config%ROWTYPE;
  v_q      jsonb;
  v_total  numeric(12,2);
  v_dir    jsonb := NULLIF(p_direccion, 'null'::jsonb);
  v_dir_ok boolean;
  v_id_ext text := replace(gen_random_uuid()::text, '-', '');
  v_ped    record;
BEGIN
  -- 1) La sucursal es del negocio (antes que nada: no se contesta por la tienda de otro) y recibe
  --    pedidos ahora en ese modo. Un modo que no existe sale por aquí como MODO_NO_DISPONIBLE.
  IF NOT EXISTS (SELECT 1 FROM sucursales s WHERE s.id = p_sucursal AND s.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'SUCURSAL_DE_OTRO_NEGOCIO: la sucursal % no es de este negocio', p_sucursal;
  END IF;
  v_motivo := tienda_estado_sucursal(p_sucursal, p_modo);
  IF v_motivo IS NOT NULL THEN RAISE EXCEPTION 'TIENDA_CERRADA: %', v_motivo; END IF;

  -- 2) El cliente. «IS NOT TRUE»: una clave ausente deja la condición en NULL, y NULL no es válido.
  IF (char_length(v_nombre) BETWEEN 1 AND 100
      AND v_tel ~ '^[0-9]{10}$'
      AND (v_email IS NULL OR (char_length(v_email) <= 254 AND v_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))) IS NOT TRUE THEN
    RAISE EXCEPTION 'CLIENTE_INVALIDO: nombre de 1 a 100 caracteres, teléfono de 10 dígitos y correo válido o ausente';
  END IF;

  -- 3 y 4) Cliente bloqueado o con 3 pedidos vivos: el MISMO error, letra por letra, para no revelar
  --    si un teléfono existe o está bloqueado. El candado hace de uno en uno las altas de un mismo
  --    teléfono: sin él, varias simultáneas contarían lo mismo y pasarían todas el tope.
  -- ponytail: el conteo no tiene índice propio; recorre los pedidos vivos (índice parcial de 0090),
  -- que son pocos. Si un día pesa, un índice parcial por (tenant_id, cliente_telefono).
  PERFORM pg_advisory_xact_lock(hashtextextended('tienda_pedido:' || p_tenant || ':' || v_tel, 0));
  IF EXISTS (SELECT 1 FROM clientes c
              WHERE c.id = lealtad_resolver_cliente(p_tenant, NULL, v_tel) AND c.estado = 'BLOQUEADO')
     OR (SELECT count(*) FROM delivery_pedidos d
          WHERE d.tenant_id = p_tenant AND d.canal = 'TIENDA' AND d.cliente_telefono = v_tel
            AND d.estado IN ('RECIBIDO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO')) > 2 THEN
    RAISE EXCEPTION 'NO_SE_PUDO_CREAR: no se pudo crear el pedido';
  END IF;

  -- 5) La forma de pago, habilitada por el negocio. (tienda_estado_sucursal ya exigió la fila.)
  SELECT * INTO v_cfg FROM tienda_config WHERE tenant_id = p_tenant;
  IF ((p_pago = 'EFECTIVO' AND v_cfg.pago_efectivo) OR (p_pago = 'TARJETA' AND v_cfg.pago_tarjeta)) IS NOT TRUE THEN
    RAISE EXCEPTION 'PAGO_INVALIDO: esa forma de pago no está disponible';
  END IF;

  -- 6) La cotización: valida el carrito y la zona, y pone los renglones y los importes. Sus errores
  --    pasan tal cual.
  v_q     := tienda_cotizar(p_tenant, p_sucursal, p_modo, p_zona, p_items);
  v_total := (v_q ->> 'total_mxn')::numeric;

  -- 7) «Paga con»: solo en efectivo, y entre el total y el total + 5000 (el tope también deja
  --    fuera NaN e infinito, que para numeric son mayores que todo).
  IF p_paga_con IS NOT NULL AND (p_pago <> 'EFECTIVO' OR p_paga_con < v_total OR p_paga_con > v_total + 5000) THEN
    RAISE EXCEPTION 'PAGO_INVALIDO: «paga con» va solo en efectivo y entre el total y el total más 5000';
  END IF;

  -- 8) La dirección: a domicilio, completa y dentro de las longitudes de direcciones_cliente (que
  --    es donde crear_ticket_desde_tienda la guardará); al recoger, ninguna. Se guarda recortada y
  --    solo con estas claves: lo demás que mande el cliente no entra.
  IF p_modo = 'DOMICILIO' THEN
    SELECT bool_and(char_length(x.valor) BETWEEN k.minimo AND k.maximo),
           jsonb_object_agg(k.clave, x.valor) FILTER (WHERE x.valor <> '')
      INTO v_dir_ok, v_dir
      FROM (VALUES ('calle', 1, 255), ('numero_exterior', 1, 20), ('numero_interior', 0, 20), ('colonia', 1, 150),
                   ('codigo_postal', 5, 5), ('ciudad', 1, 100), ('estado', 1, 50), ('referencias', 0, 300)) AS k(clave, minimo, maximo)
     CROSS JOIN LATERAL (SELECT btrim(COALESCE(v_dir ->> k.clave, ''))) AS x(valor);
    IF (v_dir_ok AND v_dir ->> 'codigo_postal' ~ '^[0-9]{5}$') IS NOT TRUE THEN
      RAISE EXCEPTION 'DIRECCION_INVALIDA: a domicilio hacen falta calle, número, colonia, código postal de 5 dígitos, ciudad y estado';
    END IF;
  ELSIF v_dir IS NOT NULL THEN
    RAISE EXCEPTION 'DIRECCION_INVALIDA: al recoger no hay dirección';
  END IF;

  -- 9) La huella del código de seguimiento. Repetida, la rechaza el índice único (0161 §1).
  IF (p_seguimiento_hash ~ '^[0-9a-f]{64}$') IS NOT TRUE THEN
    RAISE EXCEPTION 'SEGUIMIENTO_INVALIDO: la huella del seguimiento es un SHA-256 en hexadecimal';
  END IF;

  -- La cuenta del cliente, si viene, es de este negocio y sigue viva. delivery_pedidos no tiene
  -- llave foránea a tienda_cuentas (0161 §1): quien lo comprueba es esta función.
  IF p_cuenta IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tienda_cuentas c
                                           WHERE c.id = p_cuenta AND c.tenant_id = p_tenant AND c.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'CUENTA_INVALIDA: la cuenta no existe en este negocio';
  END IF;

  -- 10 y 11) La fila. id_externo: 32 hex al azar ('tienda:' || id_externo cabe en el varchar(64) de
  --    tickets.client_id_local) y único en toda la plataforma, como pide UNIQUE (app, id_externo).
  INSERT INTO delivery_pedidos (
    tenant_id, sucursal_id, canal, app, conexion_id, estado, tipo_entrega, id_externo, folio_corto,
    items, subtotal_mxn, envio_mxn, total_cliente_mxn, total_restaurante_mxn, efectivo_a_cobrar_mxn,
    cliente_nombre, cliente_telefono, cliente_email, direccion, zona_envio_id,
    pago_al_recibir, paga_con_mxn, nota_cliente, seguimiento_hash, tienda_cuenta_id,
    vence_aceptacion, gestion, payload_raw)
  VALUES (
    p_tenant, p_sucursal, 'TIENDA',
    (CASE p_modo WHEN 'DOMICILIO' THEN 'DELIVERY_PROPIO' ELSE 'DRIVE_THRU' END)::modo_servicio,
    NULL, 'RECIBIDO',
    CASE p_modo WHEN 'DOMICILIO' THEN 'RESTAURANTE_REPARTE' ELSE 'RECOGE_CLIENTE' END,
    v_id_ext, 'T' || upper(left(v_id_ext, 5)),
    v_q -> 'items', (v_q ->> 'subtotal_mxn')::numeric,
    (v_q ->> 'envio_mxn')::numeric,   -- el costo de la zona, no el total con IVA: así lo espera el ticket
    v_total, v_total, CASE p_pago WHEN 'EFECTIVO' THEN v_total ELSE 0 END,
    v_nombre, v_tel, v_email, v_dir, p_zona,
    p_pago, p_paga_con, NULLIF(left(btrim(p_nota), 300), ''), p_seguimiento_hash, p_cuenta,
    now() + make_interval(mins => v_cfg.minutos_aceptacion),
    -- Misma regla que los pedidos de apps (procesar-uber.ts): con una caja instalada viva, el
    -- ticket lo crea la caja.
    CASE WHEN sucursal_con_espejo(p_sucursal) THEN 'ESCRITORIO' ELSE 'NUBE' END,
    '{}'::jsonb)                      -- nada del cuerpo crudo: ni IP, ni token, ni sesión
  RETURNING id, folio_corto, vence_aceptacion INTO v_ped;

  -- 12)
  RETURN jsonb_build_object(
    'pedido_id', v_ped.id,
    'folio_corto', v_ped.folio_corto,
    'total_mxn', v_q ->> 'total_mxn',
    'vence_aceptacion', v_ped.vence_aceptacion);
END;
$$;
REVOKE ALL ON FUNCTION tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_crear_pedido(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, text, numeric, text, text, uuid) TO service_role;

-- ── §5 Seguimiento ───────────────────────────────────────────────────────────
-- Lo que ve el cliente con su enlace. La huella es la única llave: quien la tiene ve ESE pedido y
-- nada más, y por eso no se devuelve ningún dato personal (ni teléfono, ni correo, ni dirección).
--
-- De dónde sale el estado: con caja instalada (gestion ESCRITORIO) el ticket vive en la caja y la
-- nube solo sabe lo que la caja reporta en delivery_pedidos.estado. Sin caja (NUBE) el ticket está
-- aquí, y el estado se deriva de él al leer, con la misma regla que usará el agente de la caja
-- (diseño §8): cancelado > cobrado > impreso o con repartidor.
--
-- El motivo de una cancelación: delivery_pedidos.motivo_cancelacion guarda `<CODIGO>` o
-- `<CODIGO>: <texto libre del cajero>` (delivery-accion), y el texto puede traer nombres o teléfonos.
-- Al público solo llega el código, y solo si es de la lista cerrada (AGOTADO, CERRADO, SATURADO,
-- OTRO); cualquier otra cosa, o nada, es OTRO. Nunca NULL ni texto libre en un pedido cancelado.
CREATE OR REPLACE FUNCTION tienda_seguimiento(p_tenant uuid, p_seguimiento_hash text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      delivery_pedidos%ROWTYPE;
  v_estado text;
  v_t      record;
  v_envio_total numeric(12,2);
BEGIN
  IF p_seguimiento_hash IS NULL OR p_seguimiento_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO v_p FROM delivery_pedidos
   WHERE seguimiento_hash = p_seguimiento_hash AND tenant_id = p_tenant AND canal = 'TIENDA';
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_estado := v_p.estado;
  IF v_p.gestion = 'NUBE' AND v_p.ticket_id IS NOT NULL AND v_estado IN ('ACEPTADO', 'EN_PREPARACION', 'LISTO') THEN
    SELECT t.estado_fiscal::text AS fiscal, t.ticket_impreso_at,
           EXISTS (SELECT 1 FROM delivery_asignaciones a WHERE a.ticket_id = t.id) AS con_repartidor
      INTO v_t FROM tickets t WHERE t.id = v_p.ticket_id AND t.tenant_id = p_tenant;
    IF FOUND THEN
      v_estado := CASE
        WHEN v_t.fiscal = 'CANCELADO' THEN 'CANCELADO'
        WHEN v_t.fiscal IN ('PAGADO', 'FACTURADO') THEN 'ENTREGADO'
        WHEN v_t.ticket_impreso_at IS NOT NULL OR v_t.con_repartidor THEN 'LISTO'
        ELSE v_estado END;
    END IF;
  END IF;

  v_envio_total := v_p.total_cliente_mxn - COALESCE(v_p.subtotal_mxn, v_p.total_cliente_mxn);

  RETURN jsonb_build_object(
    'folio_corto', v_p.folio_corto,
    'modo', CASE v_p.app WHEN 'DELIVERY_PROPIO' THEN 'DOMICILIO' ELSE 'RECOGER' END,
    'estado', CASE
      WHEN v_estado = 'RECIBIDO' THEN 'EN_PROCESO'
      WHEN v_estado IN ('ACEPTADO', 'EN_PREPARACION') THEN 'EN_PREPARACION'
      WHEN v_estado = 'LISTO' AND v_p.app = 'DELIVERY_PROPIO' THEN 'EN_CAMINO'
      WHEN v_estado = 'LISTO' THEN 'LISTO_PARA_RECOGER'
      WHEN v_estado = 'ENTREGADO' THEN 'ENTREGADO'
      ELSE 'CANCELADO' END,
    'motivo', CASE
      WHEN v_estado = 'EXPIRADO' THEN 'SIN_RESPUESTA'
      WHEN v_estado IN ('RECHAZADO', 'CANCELADO', 'ERROR') THEN
        CASE WHEN upper(btrim(split_part(v_p.motivo_cancelacion, ':', 1))) IN ('AGOTADO', 'CERRADO', 'SATURADO', 'OTRO')
             THEN upper(btrim(split_part(v_p.motivo_cancelacion, ':', 1)))
             ELSE 'OTRO' END
      END,
    'renglones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'nombre', i ->> 'nombre_app',
               'cantidad', (i ->> 'cantidad')::integer,
               'detalle', (SELECT string_agg(m ->> 'nombre_app', ', ')
                             FROM jsonb_array_elements(COALESCE(i -> 'modificadores', '[]'::jsonb)) m)))
        FROM jsonb_array_elements(v_p.items) i), '[]'::jsonb),
    'subtotal_mxn', to_char(COALESCE(v_p.subtotal_mxn, v_p.total_cliente_mxn), 'FM999999990.00'),
    'envio_total_mxn', to_char(v_envio_total, 'FM999999990.00'),
    'total_mxn', to_char(v_p.total_cliente_mxn, 'FM999999990.00'),
    'pago', v_p.pago_al_recibir,
    'recibido_at', v_p.recibido_at,
    'sucursal', (SELECT jsonb_build_object('nombre', s.nombre, 'telefono', s.telefono)
                   FROM sucursales s WHERE s.id = v_p.sucursal_id));
END;
$$;
REVOKE ALL ON FUNCTION tienda_seguimiento(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_seguimiento(uuid, text) TO service_role;
