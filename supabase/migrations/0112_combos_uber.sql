-- 0112 — De pedido a ticket con combo (Task 7, ADR 0015 + spec 2026-09-10-combos-uber).
--
-- Un pedido de una app de delivery (Uber Eats hoy) que trae un combo tiene que entrar a la caja
-- como un ticket que cuadre EXACTAMENTE con lo que la app ya le cobró al cliente. Hoy
-- crear_ticket_desde_app (0096) llama siempre a agregar_item_a_ticket, que rechaza un combo con
-- una excepción explícita (0111): "El producto ... es un combo: usa agregar_combo_a_ticket". Esta
-- migración añade la rama que falta, sin tocar 0111 (ya en producción, no se edita).
--
-- De dónde sale el dinero: para un ítem-combo, precio_unitario_mxn es SOLO la base del combo (la
-- fila price_type=ITEM del desglose de Uber); cada elección de slot llega en modificadores, con su
-- grupo_id (el slot elegido), su opcion_modificador_id (el producto elegido) y su precio_extra_mxn
-- (lo que Uber cobró por esa elección). El precio del padre es la base MÁS la suma de las
-- elecciones — si se tomara precio_unitario_mxn tal cual, el ticket cobraría solo la base y
-- regalaría el resto de las elecciones en cada pedido. Los modificadores del segundo nivel (p. ej.
-- el término de la hamburguesa) cuelgan de cada elección y sí se cobran como modificadores de un
-- hijo, porque las vistas de ventas sí cuentan a los hijos.

-- ── reprorratear_combo ───────────────────────────────────────────────────────
-- El prorrateo de los hijos vive en dos sitios: lo calcula agregar_combo_a_ticket al vender en
-- caja, y hay que recalcularlo cuando un pedido de app impone el precio que cobró la plataforma
-- (distinto del que sale de sumar catálogo + deltas). Para no tener la misma aritmética escrita
-- dos veces, se extrae aquí. Mismos atributos de función que agregar_combo_a_ticket (0111): sin
-- SECURITY DEFINER (invoker), plpgsql plano — corre bajo el mismo contexto RLS que la RPC de caja.
CREATE OR REPLACE FUNCTION reprorratear_combo(p_padre_id uuid, p_precio_padre numeric)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_carta   numeric(12,2) := 0;
  v_acum    numeric(12,2) := 0;
  v_n       integer;
  v_i       integer := 0;
  v_hijo    record;
  v_asig    numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(precio_unitario_original_snapshot * cantidad), 0), COUNT(*)
    INTO v_carta, v_n
    FROM ticket_items WHERE parent_item_id = p_padre_id AND cancelado = false;
  IF v_n = 0 THEN RETURN; END IF;

  FOR v_hijo IN
    SELECT id, precio_unitario_original_snapshot * cantidad AS carta
      FROM ticket_items WHERE parent_item_id = p_padre_id AND cancelado = false
     ORDER BY orden_visualizacion, id
  LOOP
    v_i := v_i + 1;
    IF v_carta > 0 THEN v_asig := ROUND(p_precio_padre * v_hijo.carta / v_carta, 2);
    ELSE v_asig := ROUND(p_precio_padre / v_n, 2); END IF;
    -- El último absorbe la diferencia: así la suma es EXACTA, no "casi".
    IF v_i = v_n THEN v_asig := p_precio_padre - v_acum; ELSE v_acum := v_acum + v_asig; END IF;
    UPDATE ticket_items SET precio_asignado_mxn = v_asig WHERE id = v_hijo.id;
  END LOOP;
END;
$$;
COMMENT ON FUNCTION reprorratear_combo IS 'Recalcula precio_asignado_mxn de los hijos de un combo para un precio de padre dado. Lo usa crear_ticket_desde_app cuando la app impone su precio.';

-- ── crear_ticket_desde_app con la rama de combo ──────────────────────────────
-- Redefinida COMPLETA tomando como base 0096_delivery_espejo_escritorio.sql: mismos atributos
-- (LANGUAGE plpgsql, SECURITY DEFINER, SET search_path = public, auth, pg_temp) y el mismo cuerpo
-- para un pedido normal (alergias, ítem genérico, precio_unitario_snapshot, modificadores,
-- recalcular_totales_ticket, actualización de tickets/delivery_pedidos) — solo se añade la rama de
-- combo, bifurcando después de resolver v_producto_id y la nota del ítem.
CREATE OR REPLACE FUNCTION crear_ticket_desde_app(p_pedido_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_pedido      delivery_pedidos%ROWTYPE;
  v_conexion    delivery_conexiones%ROWTYPE;
  v_turno       record;
  v_ticket_id   uuid;
  v_item        jsonb;
  v_modif       jsonb;
  v_producto_id uuid;
  v_generico_id uuid;
  v_item_id     uuid;
  v_precio      numeric(12,2);
  v_total       numeric(12,2);
  v_claims_prev text;
  v_alergenos   text;
  v_nota_item   text;
  v_hay_alergia boolean := false;
  v_es_combo    boolean;
  v_componentes jsonb;
  v_extras      numeric(12,2);
  v_comp        jsonb;
BEGIN
  SELECT * INTO v_pedido FROM delivery_pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NO_EXISTE: %', p_pedido_id; END IF;
  IF v_pedido.ticket_id IS NOT NULL THEN RETURN v_pedido.ticket_id; END IF;   -- idempotente
  -- ACEPTADO sin ticket: la nube ya aceptó en Uber (gestión ESCRITORIO) y el ticket lo crea la caja.
  IF v_pedido.estado NOT IN ('RECIBIDO', 'ERROR', 'ACEPTADO') THEN
    RAISE EXCEPTION 'PEDIDO_NO_ACEPTABLE: estado %', v_pedido.estado;
  END IF;

  SELECT * INTO v_conexion FROM delivery_conexiones WHERE id = v_pedido.conexion_id;
  v_generico_id := NULLIF(v_conexion.config->>'producto_generico_id', '')::uuid;

  -- Turno abierto más reciente de la sucursal (cualquier caja).
  SELECT t.id, t.caja_id, t.usuario_apertura_id INTO v_turno
  FROM turnos t
  WHERE t.sucursal_id = v_pedido.sucursal_id AND t.estado = 'ABIERTO'
  ORDER BY t.fecha_apertura DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'SIN_TURNO_ABIERTO: sucursal %', v_pedido.sucursal_id; END IF;

  -- Actuar como el usuario del turno (auth.uid() en las RPCs de venta).
  v_claims_prev := current_setting('request.jwt.claims', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_turno.usuario_apertura_id::text,
                      'tenant_id', v_pedido.tenant_id::text,
                      'role', 'authenticated')::text,
    true);

  v_ticket_id := abrir_ticket(v_pedido.sucursal_id, v_turno.caja_id, v_turno.id, v_pedido.app,
                              NULL, v_conexion.marca_virtual_id,
                              'app:' || v_pedido.app::text || ':' || v_pedido.id_externo,
                              v_turno.usuario_apertura_id);

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_pedido.items) LOOP
    v_producto_id := NULLIF(v_item->>'producto_id', '')::uuid;
    IF v_producto_id IS NULL THEN
      IF v_generico_id IS NULL THEN
        RAISE EXCEPTION 'ITEM_SIN_MAPEAR: % (sin producto genérico configurado)', v_item->>'nombre_app';
      END IF;
      v_producto_id := v_generico_id;
    END IF;

    -- A7: "⚠ ALERGIA: cacahuate, lácteos — "texto del cliente"" al frente; después la nota normal.
    SELECT string_agg(a, ', ') INTO v_alergenos
    FROM jsonb_array_elements_text(COALESCE(v_item->'alergenos', '[]'::jsonb)) AS a;
    IF v_alergenos IS NOT NULL OR NULLIF(v_item->>'alergia_nota', '') IS NOT NULL THEN
      v_hay_alergia := true;
      v_alergenos := '⚠ ALERGIA: ' || COALESCE(v_alergenos, 'ver nota')
        || COALESCE(' — "' || NULLIF(v_item->>'alergia_nota', '') || '"', '');
    END IF;
    v_nota_item := NULLIF(concat_ws(' · ',
      v_alergenos,
      CASE WHEN v_producto_id = v_generico_id THEN v_item->>'nombre_app' END,
      NULLIF(v_item->>'nota', '')), '');

    SELECT es_combo INTO v_es_combo FROM productos WHERE id = v_producto_id;

    IF COALESCE(v_es_combo, false) THEN
      -- Un combo entra por su propia RPC: el padre cobra y los hijos cocinan (ADR 0015). Los
      -- modificadores del ítem son las elecciones de slot; los suyos propios cuelgan de cada uno.
      --
      -- Guardarraíl 1 (ronda de revisión 1, "importante"): toda elección con grupo_id tiene que
      -- ser un slot ACTIVO de ESTE combo Y traer su producto mapeado. Dos rutas la rompen sin
      -- ningún error de catálogo: (a) un slot con maximo_selecciones > 1 donde una elección está
      -- mapeada y otra no —el normalizador (uber.ts) deja grupo_id puesto y opcion_modificador_id
      -- en null cuando el producto elegido no está en catálogo todavía; el mínimo/máximo del slot
      -- lo satisface la elección mapeada, así que agregar_combo_a_ticket no se entera— y (b) un
      -- grupo de modificadores propio del combo (nada lo prohíbe: productos_grupos_modificadores
      -- no excluye es_combo) que Uber nos devuelva con la forma de una elección. En ambos casos, si
      -- no se frena aquí, esa elección suma su precio_extra_mxn al padre (más abajo, v_extras) sin
      -- generar un hijo: el cliente paga por algo que cocina nunca ve. Se fija el filtro que compara
      -- 0111 (activo = true AND deleted_at IS NULL, agregar_combo_a_ticket líneas 308-309 y 322-323)
      -- para que "es un slot de este combo" signifique lo mismo en las dos funciones.
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(v_item->'modificadores', '[]'::jsonb)) m
         WHERE NULLIF(m->>'grupo_id', '') IS NOT NULL
           AND (
             NULLIF(m->>'opcion_modificador_id', '') IS NULL
             OR NOT EXISTS (
                  SELECT 1 FROM combo_grupos g
                   WHERE g.id = (m->>'grupo_id')::uuid AND g.combo_producto_id = v_producto_id
                     AND g.activo = true AND g.deleted_at IS NULL)
           )
      ) THEN
        RAISE EXCEPTION 'COMBO_ELECCION_SIN_MAPEAR: el combo "%" trae una elección que no es un slot activo de este combo o cuyo producto no está mapeado en el catálogo', v_item->>'nombre_app';
      END IF;

      -- Guardarraíl 2 (ronda de revisión 1, "importante", patrón del plan): el UPDATE de más abajo
      -- que cobra los modificadores del segundo nivel empareja por producto (hijo.producto_id), no
      -- por elección individual. Si un slot con maximo_selecciones > 1 trae el MISMO producto
      -- elegido dos veces y alguna de esas dos apariciones trae modificadores anidados (p. ej. dos
      -- refrescos, uno con un extra distinto del otro), no hay forma de saber a cuál hijo va cada
      -- extra: se niega a adivinar en vez de atribuir el dinero a la fila equivocada. Dos elecciones
      -- iguales SIN modificadores anidados (el caso normal de "2 refrescos") no entra aquí.
      IF EXISTS (
        SELECT 1
          FROM jsonb_array_elements(COALESCE(v_item->'modificadores', '[]'::jsonb)) m
         WHERE NULLIF(m->>'grupo_id', '') IS NOT NULL AND NULLIF(m->>'opcion_modificador_id', '') IS NOT NULL
         GROUP BY m->>'grupo_id', m->>'opcion_modificador_id'
        HAVING count(*) > 1 AND bool_or(jsonb_array_length(COALESCE(m->'modificadores', '[]'::jsonb)) > 0)
      ) THEN
        RAISE EXCEPTION 'COMBO_ELECCION_AMBIGUA: el combo "%" repite la misma elección de slot con modificadores de segundo nivel en alguna de las repeticiones; no se puede saber a qué unidad va cada extra', v_item->>'nombre_app';
      END IF;

      SELECT jsonb_agg(jsonb_build_object(
               'grupo_id', m->>'grupo_id',
               'producto_id', m->>'opcion_modificador_id',
               'cantidad', COALESCE((m->>'cantidad')::numeric, 1),
               'modificadores', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'opcion_modificador_id', s->>'opcion_modificador_id',
                          'cantidad', COALESCE((s->>'cantidad')::int, 1)))
                   FROM jsonb_array_elements(COALESCE(m->'modificadores', '[]'::jsonb)) s
                  WHERE NULLIF(s->>'opcion_modificador_id', '') IS NOT NULL), '[]'::jsonb)))
        INTO v_componentes
        FROM jsonb_array_elements(COALESCE(v_item->'modificadores', '[]'::jsonb)) m
       WHERE NULLIF(m->>'grupo_id', '') IS NOT NULL
         AND NULLIF(m->>'opcion_modificador_id', '') IS NOT NULL
         AND EXISTS (SELECT 1 FROM combo_grupos g
                      WHERE g.id = (m->>'grupo_id')::uuid AND g.combo_producto_id = v_producto_id
                        AND g.activo = true AND g.deleted_at IS NULL);

      v_item_id := agregar_combo_a_ticket(
        v_ticket_id, v_producto_id, (v_item->>'cantidad')::numeric,
        COALESCE(v_componentes, '[]'::jsonb),
        '[]'::jsonb,   -- la línea del padre no admite modificadores (0111)
        v_nota_item, NULL);

      -- El precio que manda es el de la app: Uber ya le cobró al cliente con su carta. Ojo: la
      -- fila ITEM del desglose es SOLO la base del combo; cada elección de slot llega como una
      -- fila OPTION aparte, que en el camino normal (0096) se cobra en el modificador. Aquí no hay
      -- modificador donde ponerla —las elecciones son hijos a precio 0— así que se suman al padre.
      -- Si no se sumaran, el ticket cobraría $45 por un combo de $190.
      SELECT COALESCE(SUM((m->>'precio_extra_mxn')::numeric(12,2) * COALESCE((m->>'cantidad')::numeric, 1)), 0)
        INTO v_extras
        FROM jsonb_array_elements(COALESCE(v_item->'modificadores', '[]'::jsonb)) m
       WHERE NULLIF(m->>'grupo_id', '') IS NOT NULL;

      v_precio := (v_item->>'precio_unitario_mxn')::numeric(12,2) + v_extras;
      UPDATE ticket_items SET precio_unitario_snapshot = v_precio WHERE id = v_item_id;
      PERFORM reprorratear_combo(v_item_id, v_precio * (v_item->>'cantidad')::numeric);

      -- Los modificadores del SEGUNDO nivel (el término, un extra pagado sobre la hamburguesa)
      -- sí cuelgan de un hijo, así que se cobran donde el camino normal los cobra. La cantidad del
      -- HIJO (hijo.cantidad) ya lleva dentro la cantidad del combo pedido: agregar_combo_a_ticket
      -- llama a agregar_item_a_ticket con v_n * p_cantidad (0111), así que aquí hay que multiplicar
      -- también por ella y no solo por la cantidad propia del modificador (tim.cantidad) — si no,
      -- un pedido de 2 combos cobraría la mitad de lo que Uber cobró por el extra del segundo.
      FOR v_comp IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'modificadores', '[]'::jsonb)) LOOP
        FOR v_modif IN SELECT * FROM jsonb_array_elements(COALESCE(v_comp->'modificadores', '[]'::jsonb)) LOOP
          IF NULLIF(v_modif->>'opcion_modificador_id', '') IS NOT NULL THEN
            UPDATE ticket_item_modificadores tim
               SET precio_extra_snapshot = (v_modif->>'precio_extra_mxn')::numeric(12,2),
                   monto_total_mxn = (v_modif->>'precio_extra_mxn')::numeric(12,2) * tim.cantidad * hijo.cantidad
              FROM ticket_items hijo
             WHERE tim.ticket_item_id = hijo.id
               AND hijo.parent_item_id = v_item_id
               AND hijo.producto_id = (v_comp->>'opcion_modificador_id')::uuid
               AND tim.opcion_modificador_id = (v_modif->>'opcion_modificador_id')::uuid;
          END IF;
        END LOOP;
      END LOOP;
      CONTINUE;
    END IF;

    v_item_id := agregar_item_a_ticket(
      v_ticket_id, v_producto_id, (v_item->>'cantidad')::numeric,
      v_nota_item,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'opcion_modificador_id', m->>'opcion_modificador_id',
                    'cantidad', COALESCE((m->>'cantidad')::int, 1)))
                FROM jsonb_array_elements(COALESCE(v_item->'modificadores', '[]'::jsonb)) m
                WHERE NULLIF(m->>'opcion_modificador_id', '') IS NOT NULL), '[]'::jsonb),
      NULL);

    -- El precio del ticket es el que pagó el cliente en la app, no el de catálogo.
    v_precio := (v_item->>'precio_unitario_mxn')::numeric(12,2);
    UPDATE ticket_items SET precio_unitario_snapshot = v_precio WHERE id = v_item_id;
    FOR v_modif IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'modificadores', '[]'::jsonb)) LOOP
      IF NULLIF(v_modif->>'opcion_modificador_id', '') IS NOT NULL THEN
        UPDATE ticket_item_modificadores
        SET precio_extra_snapshot = (v_modif->>'precio_extra_mxn')::numeric(12,2),
            monto_total_mxn = (v_modif->>'precio_extra_mxn')::numeric(12,2) * cantidad * (v_item->>'cantidad')::numeric
        WHERE ticket_item_id = v_item_id
          AND opcion_modificador_id = (v_modif->>'opcion_modificador_id')::uuid;
      END IF;
    END LOOP;
  END LOOP;

  PERFORM recalcular_totales_ticket(v_ticket_id);

  UPDATE tickets
  SET folio_externo_app = v_pedido.id_externo,
      origen_creacion   = 'API_EXTERNA',
      nombre_cliente    = LEFT(v_pedido.cliente_nombre, 100),
      nota_general      = NULLIF(concat_ws(' · ',
                            CASE WHEN v_hay_alergia THEN '⚠ PEDIDO CON ALERGIA: revisar cada ítem' END,
                            NULLIF(v_pedido.nota_cliente, '')), '')
  WHERE id = v_ticket_id;

  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket_id;
  IF v_total > 0 THEN
    PERFORM aplicar_pago(v_ticket_id, v_pedido.app::text::metodo_pago, v_total, NULL, NULL, NULL,
                         v_pedido.id_externo, false, 'Pagado en la app',
                         'app-pago:' || v_pedido.app::text || ':' || v_pedido.id_externo);
  END IF;

  -- A cocina de inmediato (el trigger de 0008 sella fecha_envio_cocina).
  UPDATE tickets SET estado_cocina = 'EN_COCINA' WHERE id = v_ticket_id AND estado_cocina = 'SIN_ENVIAR';

  UPDATE delivery_pedidos
  SET ticket_id = v_ticket_id, estado = 'ACEPTADO',
      aceptado_at = COALESCE(aceptado_at, now()), ultimo_error = NULL
  WHERE id = p_pedido_id;

  PERFORM set_config('request.jwt.claims', v_claims_prev, true);
  RETURN v_ticket_id;
END;
$$;

REVOKE ALL ON FUNCTION crear_ticket_desde_app(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_ticket_desde_app(uuid) TO service_role;
