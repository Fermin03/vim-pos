-- ============================================================================
-- 0161 — Tienda en línea, entrega 1: la base.
-- Diseño: docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md
--
-- La tienda propia del restaurante es UN CANAL MÁS del núcleo de pedidos (ADR 0011), no un
-- sistema paralelo: el pedido cae en delivery_pedidos, baja a la caja por el mismo sondeo y se
-- vuelve ticket con una función hermana de crear_ticket_desde_app.
--
-- Nada de esto se ve todavía: el complemento nace inactivo y ningún negocio tiene el interruptor.
-- ============================================================================

-- ── §1 delivery_pedidos admite el canal Tienda ───────────────────────────────
-- En canal TIENDA, `app` es el modo de servicio del ticket que resultará: DRIVE_THRU es el
-- Pick-up del POS y DELIVERY_PROPIO es Domicilio. Así delivery_enlazar_tickets (0096), que
-- empareja por `t.modo_servicio = p.app`, sirve sin tocarla.
ALTER TABLE delivery_pedidos
  ADD COLUMN IF NOT EXISTS canal            text NOT NULL DEFAULT 'APP' CHECK (canal IN ('APP', 'TIENDA')),
  ADD COLUMN IF NOT EXISTS cliente_email    citext NULL,
  ADD COLUMN IF NOT EXISTS tienda_cuenta_id uuid NULL,
  ADD COLUMN IF NOT EXISTS zona_envio_id    uuid NULL,
  ADD COLUMN IF NOT EXISTS direccion        jsonb NULL,
  ADD COLUMN IF NOT EXISTS pago_al_recibir  text NULL CHECK (pago_al_recibir IN ('EFECTIVO', 'TARJETA')),
  ADD COLUMN IF NOT EXISTS paga_con_mxn     numeric(12,2) NULL CHECK (paga_con_mxn IS NULL OR paga_con_mxn >= 0),
  ADD COLUMN IF NOT EXISTS seguimiento_hash text NULL;

-- SIN llave foránea a propósito en tienda_cuenta_id y zona_envio_id: esta tabla se espeja en la
-- caja, donde las cuentas de la tienda no existen y una zona recién creada en el admin puede no
-- haber bajado todavía. Una FK haría fallar el espejo entero, pedidos de Uber incluidos. Quien
-- valida la zona es fijar_envio_ticket, al crear el ticket.
COMMENT ON COLUMN delivery_pedidos.canal IS 'APP = Uber/DiDi/Rappi (ADR 0011). TIENDA = la tienda en línea del restaurante.';
COMMENT ON COLUMN delivery_pedidos.direccion IS 'Solo canal TIENDA a domicilio: calle, numero_exterior, numero_interior, colonia, codigo_postal, ciudad, estado, referencias.';
COMMENT ON COLUMN delivery_pedidos.seguimiento_hash IS 'SHA-256 del código del enlace de seguimiento. El código en claro no se guarda.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_pedidos_seguimiento
  ON delivery_pedidos (seguimiento_hash) WHERE seguimiento_hash IS NOT NULL;

ALTER TABLE delivery_pedidos ALTER COLUMN conexion_id DROP NOT NULL;

ALTER TABLE delivery_pedidos DROP CONSTRAINT IF EXISTS delivery_pedido_app_valida;
ALTER TABLE delivery_pedidos ADD CONSTRAINT delivery_pedido_app_valida CHECK (
     (canal = 'APP'    AND app IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI') AND conexion_id IS NOT NULL)
  OR (canal = 'TIENDA' AND app IN ('DRIVE_THRU', 'DELIVERY_PROPIO')         AND conexion_id IS NULL));

-- Retención (0095): cuerpo copiado ÍNTEGRO de 0095_*.sql; se añaden las columnas de la tienda.
CREATE OR REPLACE FUNCTION delivery_anonimizar_pedidos_viejos(p_dias integer DEFAULT 30) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n integer := 0;
BEGIN
  WITH anon AS (
    UPDATE delivery_pedidos
    SET cliente_nombre       = CASE WHEN cliente_nombre IS NULL THEN NULL ELSE 'Cliente de app' END,
        cliente_telefono     = NULL,
        cliente_telefono_pin = NULL,
        direccion_texto      = NULL,
        payload_raw          = '{"anonimizado": true}'::jsonb,   -- la columna es NOT NULL
        repartidor_nombre    = NULL,
        repartidor_telefono  = NULL,
        cliente_email        = NULL,
        direccion            = NULL,
        seguimiento_hash     = NULL
    WHERE recibido_at < now() - make_interval(days => GREATEST(p_dias, 1))
      AND estado IN ('ENTREGADO', 'RECHAZADO', 'CANCELADO', 'EXPIRADO', 'LISTO', 'ERROR')
      AND (cliente_telefono IS NOT NULL OR cliente_telefono_pin IS NOT NULL OR direccion_texto IS NOT NULL
           OR payload_raw <> '{"anonimizado": true}'::jsonb OR repartidor_telefono IS NOT NULL OR repartidor_nombre IS NOT NULL
           OR cliente_email IS NOT NULL OR direccion IS NOT NULL OR seguimiento_hash IS NOT NULL
           OR (cliente_nombre IS NOT NULL AND cliente_nombre <> 'Cliente de app'))
    RETURNING id
  )
  SELECT count(*) INTO v_n FROM anon;
  -- El payload de los webhooks también lleva datos del cliente: misma ventana.
  UPDATE delivery_eventos SET payload = '{"anonimizado": true}'::jsonb
  WHERE payload IS NOT NULL AND payload <> '{"anonimizado": true}'::jsonb
    AND created_at < now() - make_interval(days => GREATEST(p_dias, 1));
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION delivery_anonimizar_pedidos_viejos(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_anonimizar_pedidos_viejos(integer) TO service_role;

-- ── §2 El bucle de renglones, compartido ─────────────────────────────────────
-- Extraído SIN CAMBIOS de crear_ticket_desde_app (0112): la tienda manda los renglones con la
-- misma forma (producto_id, cantidad, precio_unitario_mxn, nota, modificadores) y necesita
-- exactamente las mismas reglas de combos. Dos copias de este bucle se desincronizarían.
CREATE OR REPLACE FUNCTION _delivery_items_a_ticket(p_ticket_id uuid, p_items jsonb, p_generico_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_item        jsonb;
  v_modif       jsonb;
  v_producto_id uuid;
  v_item_id     uuid;
  v_precio      numeric(12,2);
  v_alergenos   text;
  v_nota_item   text;
  v_hay_alergia boolean := false;
  v_es_combo    boolean;
  v_componentes jsonb;
  v_extras      numeric(12,2);
  v_comp        jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_producto_id := NULLIF(v_item->>'producto_id', '')::uuid;
    IF v_producto_id IS NULL THEN
      IF p_generico_id IS NULL THEN
        RAISE EXCEPTION 'ITEM_SIN_MAPEAR: % (sin producto genérico configurado)', v_item->>'nombre_app';
      END IF;
      v_producto_id := p_generico_id;
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
      CASE WHEN v_producto_id = p_generico_id THEN v_item->>'nombre_app' END,
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

      -- Guardarraíl 2 (ronda de revisión 1, ampliado en la ronda 2): el UPDATE de más abajo que
      -- cobra los modificadores del segundo nivel empareja por producto (hijo.producto_id), sin
      -- distinguir de qué elección —ni de qué SLOT— vino cada hijo. El principio es "negarse a
      -- adivinar cuando no se puede saber a qué hijo va el dinero"; la clave tiene que ser solo
      -- opcion_modificador_id, no (grupo_id, opcion_modificador_id): un combo "elige dos bebidas"
      -- se configura tan naturalmente como dos SLOTS de la misma categoría como con un slot de
      -- maximo_selecciones=2, y si el mismo producto se elige en dos slots distintos con extras de
      -- segundo nivel distintos, el UPDATE tampoco puede distinguirlos aunque el grupo_id difiera.
      -- Dos elecciones del mismo producto SIN modificadores anidados en ninguna (vengan del mismo
      -- slot o de dos distintos) no entran aquí y siguen produciendo ticket con su dinero correcto.
      IF EXISTS (
        SELECT 1
          FROM jsonb_array_elements(COALESCE(v_item->'modificadores', '[]'::jsonb)) m
         WHERE NULLIF(m->>'grupo_id', '') IS NOT NULL AND NULLIF(m->>'opcion_modificador_id', '') IS NOT NULL
         GROUP BY m->>'opcion_modificador_id'
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
        p_ticket_id, v_producto_id, (v_item->>'cantidad')::numeric,
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
      p_ticket_id, v_producto_id, (v_item->>'cantidad')::numeric,
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
  RETURN v_hay_alergia;
END;
$$;
REVOKE ALL ON FUNCTION _delivery_items_a_ticket(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION _delivery_items_a_ticket(uuid, jsonb, uuid) TO service_role;

-- crear_ticket_desde_app: cuerpo de 0112_combos_uber.sql. Dos cambios: el bucle de renglones vive
-- ahora en _delivery_items_a_ticket, y se niega a procesar un pedido que no sea de una app.
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
  v_generico_id uuid;
  v_total       numeric(12,2);
  v_claims_prev text;
  v_hay_alergia boolean := false;
BEGIN
  SELECT * INTO v_pedido FROM delivery_pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NO_EXISTE: %', p_pedido_id; END IF;
  IF v_pedido.ticket_id IS NOT NULL THEN RETURN v_pedido.ticket_id; END IF;   -- idempotente
  IF v_pedido.canal <> 'APP' THEN RAISE EXCEPTION 'PEDIDO_NO_ES_DE_APP: canal %', v_pedido.canal; END IF;
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

  v_hay_alergia := _delivery_items_a_ticket(v_ticket_id, v_pedido.items, v_generico_id);

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
