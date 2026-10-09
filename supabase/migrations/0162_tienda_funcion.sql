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
  v_local := p_ahora AT TIME ZONE COALESCE(NULLIF(p_tz, ''), 'America/Mexico_City');
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
