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

-- ── §3 crear_ticket_desde_tienda ─────────────────────────────────────────────
-- Hermana de crear_ticket_desde_app. Tres diferencias que importan:
--   · el ticket lleva CLIENTE (resuelto por teléfono, la identidad del sistema: ADR 0030),
--     y en domicilio su dirección y su renglón de envío;
--   · NO se aplica ningún pago: la tienda cobra al recibir, y el cobro lo hace el cajero;
--   · el total del ticket tiene que ser el que se le cotizó al cliente, o no hay ticket.
-- Existe en la nube (POS web) y en la caja (agente de espejo), como la de apps.
CREATE OR REPLACE FUNCTION crear_ticket_desde_tienda(p_pedido_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_pedido      delivery_pedidos%ROWTYPE;
  v_turno       record;
  v_ticket_id   uuid;
  v_cliente_id  uuid;
  v_bloqueado   boolean;
  v_dir_id      uuid;
  v_total       numeric(12,2);
  v_claims_prev text;
  v_pago        text;
BEGIN
  SELECT * INTO v_pedido FROM delivery_pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NO_EXISTE: %', p_pedido_id; END IF;
  IF v_pedido.ticket_id IS NOT NULL THEN RETURN v_pedido.ticket_id; END IF;   -- idempotente
  IF v_pedido.canal <> 'TIENDA' THEN RAISE EXCEPTION 'PEDIDO_NO_ES_DE_TIENDA: canal %', v_pedido.canal; END IF;
  IF v_pedido.estado NOT IN ('RECIBIDO', 'ERROR', 'ACEPTADO') THEN
    RAISE EXCEPTION 'PEDIDO_NO_ACEPTABLE: estado %', v_pedido.estado;
  END IF;

  SELECT t.id, t.caja_id, t.usuario_apertura_id INTO v_turno
  FROM turnos t
  WHERE t.sucursal_id = v_pedido.sucursal_id AND t.estado = 'ABIERTO'
  ORDER BY t.fecha_apertura DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'SIN_TURNO_ABIERTO: sucursal %', v_pedido.sucursal_id; END IF;

  -- El cliente: por teléfono (comparado por dígitos), o se crea.
  v_cliente_id := lealtad_resolver_cliente(v_pedido.tenant_id, NULL, v_pedido.cliente_telefono);
  IF v_cliente_id IS NULL THEN
    INSERT INTO clientes (tenant_id, nombre, telefono, email, created_by)
    VALUES (v_pedido.tenant_id, LEFT(COALESCE(NULLIF(btrim(v_pedido.cliente_nombre), ''), 'Cliente de la tienda'), 200),
            LEFT(regexp_replace(v_pedido.cliente_telefono, '\D', '', 'g'), 20),
            v_pedido.cliente_email, v_turno.usuario_apertura_id)
    RETURNING id INTO v_cliente_id;
  ELSE
    SELECT estado = 'BLOQUEADO' INTO v_bloqueado FROM clientes WHERE id = v_cliente_id;
    IF v_bloqueado THEN RAISE EXCEPTION 'CLIENTE_BLOQUEADO: %', v_cliente_id; END IF;
  END IF;

  -- Actuar como el usuario del turno (auth.uid() en las RPCs de venta), igual que la de apps.
  v_claims_prev := current_setting('request.jwt.claims', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_turno.usuario_apertura_id::text,
                      'tenant_id', v_pedido.tenant_id::text,
                      'role', 'authenticated')::text,
    true);

  v_ticket_id := abrir_ticket(v_pedido.sucursal_id, v_turno.caja_id, v_turno.id, v_pedido.app,
                              v_cliente_id, NULL,
                              'tienda:' || v_pedido.id_externo,
                              v_turno.usuario_apertura_id);

  -- La tienda solo vende productos del catálogo: no hay producto genérico.
  PERFORM _delivery_items_a_ticket(v_ticket_id, v_pedido.items, NULL);

  IF v_pedido.app = 'DELIVERY_PROPIO' THEN
    -- La dirección del pedido se guarda en el cliente; si ya tenía esa misma, se reutiliza.
    SELECT d.id INTO v_dir_id FROM direcciones_cliente d
     WHERE d.cliente_id = v_cliente_id AND d.activa
       AND lower(btrim(d.calle)) = lower(btrim(v_pedido.direccion->>'calle'))
       AND lower(btrim(d.numero_exterior)) = lower(btrim(v_pedido.direccion->>'numero_exterior'))
       AND d.codigo_postal = v_pedido.direccion->>'codigo_postal'
     ORDER BY d.created_at LIMIT 1;
    IF v_dir_id IS NULL THEN
      INSERT INTO direcciones_cliente (tenant_id, cliente_id, etiqueta, calle, numero_exterior, numero_interior,
        colonia, codigo_postal, ciudad, estado_geo, referencias, zona_envio_id, created_by)
      VALUES (v_pedido.tenant_id, v_cliente_id, 'Tienda en línea',
        LEFT(v_pedido.direccion->>'calle', 255), LEFT(v_pedido.direccion->>'numero_exterior', 20),
        NULLIF(LEFT(v_pedido.direccion->>'numero_interior', 20), ''),
        LEFT(v_pedido.direccion->>'colonia', 150), LEFT(v_pedido.direccion->>'codigo_postal', 5),
        LEFT(v_pedido.direccion->>'ciudad', 100), LEFT(v_pedido.direccion->>'estado', 50),
        NULLIF(v_pedido.direccion->>'referencias', ''), v_pedido.zona_envio_id, v_turno.usuario_apertura_id)
      RETURNING id INTO v_dir_id;
    END IF;
    UPDATE tickets SET direccion_entrega_id = v_dir_id WHERE id = v_ticket_id;

    -- fijar_envio_ticket valida que la zona sea de la sucursal y crea el renglón al precio de HOY.
    -- Lo cotizado manda: si hay renglón, se pisa con el envío del pedido, como los precios de arriba.
    PERFORM fijar_envio_ticket(v_ticket_id, v_pedido.zona_envio_id);
    UPDATE ticket_items SET precio_unitario_snapshot = v_pedido.envio_mxn
     WHERE ticket_id = v_ticket_id AND cargo_tipo = 'ENVIO' AND cancelado = false;
  END IF;

  PERFORM recalcular_totales_ticket(v_ticket_id);

  v_pago := CASE v_pedido.pago_al_recibir
              WHEN 'EFECTIVO' THEN 'Efectivo' || COALESCE(', paga con $' || to_char(v_pedido.paga_con_mxn, 'FM999999990.00'), '')
              WHEN 'TARJETA'  THEN 'Tarjeta al recibir'
            END;
  UPDATE tickets
  SET folio_externo_app = v_pedido.id_externo,
      origen_creacion   = 'API_EXTERNA',
      nombre_cliente    = LEFT(v_pedido.cliente_nombre, 100),
      nota_general      = NULLIF(concat_ws(' · ', v_pago, NULLIF(v_pedido.nota_cliente, '')), '')
  WHERE id = v_ticket_id;

  -- Lo que se le cotizó al cliente es lo que se le va a cobrar, o no hay ticket. El RAISE revierte
  -- todo lo anterior: no queda ticket a medias.
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket_id;
  IF v_total IS DISTINCT FROM v_pedido.total_cliente_mxn THEN
    RAISE EXCEPTION 'TOTAL_NO_COINCIDE: ticket % vs pedido %', v_total, v_pedido.total_cliente_mxn;
  END IF;

  -- SIN aplicar_pago: la tienda cobra al recibir.
  UPDATE tickets SET estado_cocina = 'EN_COCINA' WHERE id = v_ticket_id AND estado_cocina = 'SIN_ENVIAR';

  UPDATE delivery_pedidos
  SET ticket_id = v_ticket_id, estado = 'ACEPTADO',
      aceptado_at = COALESCE(aceptado_at, now()), ultimo_error = NULL
  WHERE id = p_pedido_id;

  PERFORM set_config('request.jwt.claims', v_claims_prev, true);
  RETURN v_ticket_id;
END;
$$;
REVOKE ALL ON FUNCTION crear_ticket_desde_tienda(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_ticket_desde_tienda(uuid) TO service_role;
COMMENT ON FUNCTION crear_ticket_desde_tienda(uuid) IS
  'Convierte un pedido de la tienda en línea en ticket ABIERTO y sin pago, con cliente por teléfono, dirección y envío. Idempotente.';

-- ── §4 Configuración, cuentas de clientes y fotos ────────────────────────────

-- El interruptor del dueño, hermano de modulo_delivery_activo (0113) y modulo_lealtad_activo (0156).
ALTER TABLE configuracion_tenant
  ADD COLUMN IF NOT EXISTS modulo_tienda_activo boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN configuracion_tenant.modulo_tienda_activo IS
  'Interruptor del dueño para la tienda en línea. VIM concede el complemento TIENDA; el dueño la enciende.';

CREATE TABLE IF NOT EXISTS tienda_config (
  tenant_id          uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  -- La dirección pública: pedidos.vimpos.com.mx/<slug>. Las reservadas son rutas de la aplicación.
  slug               text NOT NULL UNIQUE
                     CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
                            AND slug NOT IN ('api', 'admin', 'pedido', 'cuenta', 'privacidad', 'terminos', 'static', 'assets')),
  color              text NOT NULL DEFAULT '#111111' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  descripcion        varchar(200) NULL,
  aceptacion         text NOT NULL DEFAULT 'MANUAL' CHECK (aceptacion IN ('MANUAL', 'AUTO')),
  minutos_aceptacion integer NOT NULL DEFAULT 5 CHECK (minutos_aceptacion BETWEEN 3 AND 15),
  pago_efectivo      boolean NOT NULL DEFAULT true,
  pago_tarjeta       boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tienda_config_algun_pago CHECK (pago_efectivo OR pago_tarjeta)
);
COMMENT ON TABLE tienda_config IS 'Tienda en línea de un negocio: dirección, apariencia, aceptación y formas de pago al recibir.';

CREATE TABLE IF NOT EXISTS tienda_sucursales (
  sucursal_id uuid PRIMARY KEY REFERENCES sucursales(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  participa   boolean NOT NULL DEFAULT false,
  recoger     boolean NOT NULL DEFAULT true,
  domicilio   boolean NOT NULL DEFAULT false,
  -- Un rango por día: {"1": ["13:00","22:00"], …}; 1 = lunes … 7 = domingo. Día ausente = cerrado.
  -- Cierre menor que apertura = cierra pasada la medianoche. Hora de México.
  horario     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(horario) = 'object'),
  pausa_hasta timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE tienda_sucursales IS 'Qué sucursales venden en la tienda en línea, cómo y a qué horas. pausa_hasta la pone el cajero.';
CREATE INDEX IF NOT EXISTS idx_tienda_sucursales_tenant ON tienda_sucursales (tenant_id);

-- Lee cualquier empleado del negocio; escriben dueño y administradores. Molde de anuncios_pantalla (0150).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tienda_config', 'tienda_sucursales'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated, service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id = current_tenant_id())', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id)) WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))', t || '_delete', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', 'trg_' || t || '_updated_at', t);
  END LOOP;
END $$;

-- Las cuentas de los CLIENTES de la tienda. No viven en Supabase Auth a propósito: ahí el correo es
-- único en toda la plataforma (el choque que ya se conoce con los empleados) y el público quedaría
-- en el mismo rol `authenticated` que el personal. Aquí el correo es único POR NEGOCIO.
-- Cerradas a todo rol salvo service_role: solo las toca la Edge Function `tienda`.
CREATE TABLE IF NOT EXISTS tienda_cuentas (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email                citext NOT NULL,
  password_hash        text NOT NULL,
  nombre               varchar(100) NOT NULL,
  apellido             varchar(100) NULL,
  telefono             varchar(20) NOT NULL,
  fecha_nacimiento     date NULL,
  acepto_privacidad_at timestamptz NULL,
  intentos_fallidos    integer NOT NULL DEFAULT 0,
  bloqueada_hasta      timestamptz NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS tienda_cuentas_email_uq ON tienda_cuentas (tenant_id, email) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS tienda_sesiones (
  token_hash text PRIMARY KEY,                      -- SHA-256 del token; el token solo vive en la cookie
  cuenta_id  uuid NOT NULL REFERENCES tienda_cuentas(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expira_at  timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tienda_sesiones_cuenta ON tienda_sesiones (cuenta_id);

CREATE TABLE IF NOT EXISTS tienda_recuperaciones (
  token_hash text PRIMARY KEY,
  cuenta_id  uuid NOT NULL REFERENCES tienda_cuentas(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expira_at  timestamptz NOT NULL,
  usada_at   timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tienda_direcciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id       uuid NOT NULL REFERENCES tienda_cuentas(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  etiqueta        varchar(50) NOT NULL DEFAULT 'Casa',
  calle           varchar(255) NOT NULL,
  numero_exterior varchar(20) NOT NULL,
  numero_interior varchar(20) NULL,
  colonia         varchar(150) NOT NULL,
  codigo_postal   varchar(5) NOT NULL,
  ciudad          varchar(100) NOT NULL,
  estado          varchar(50) NOT NULL,
  referencias     text NULL,
  zona_envio_id   uuid NULL REFERENCES zonas_envio(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tienda_direcciones_cuenta ON tienda_direcciones (cuenta_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tienda_cuentas', 'tienda_sesiones', 'tienda_recuperaciones', 'tienda_direcciones'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO service_role', t);
  END LOOP;
END $$;

-- Fotos de productos: molde del almacén `anuncios` (0150). Público para leer —es el menú de una
-- tienda pública—; escribe solo el dueño o el admin, dentro de la carpeta de su negocio. En el
-- Postgres embebido de la caja no hay storage.buckets: los bloques se omiten.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('productos', 'productos', true, 1048576, ARRAY['image/jpeg', 'image/png', 'image/webp'])
    ON CONFLICT (id) DO NOTHING;

    DROP POLICY IF EXISTS "productos_read_own_tenant" ON storage.objects;
    CREATE POLICY "productos_read_own_tenant" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'productos' AND (storage.foldername(name))[1] = current_tenant_id()::text);

    DROP POLICY IF EXISTS "productos_write_own_tenant" ON storage.objects;
    CREATE POLICY "productos_write_own_tenant" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'productos'
        AND (storage.foldername(name))[1] = current_tenant_id()::text
        AND es_admin_del_tenant(current_tenant_id()));

    DROP POLICY IF EXISTS "productos_delete_own_tenant" ON storage.objects;
    CREATE POLICY "productos_delete_own_tenant" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'productos'
        AND (storage.foldername(name))[1] = current_tenant_id()::text
        AND es_admin_del_tenant(current_tenant_id()));
  END IF;
END $$;

-- ── §5 Complemento, plan y módulo ────────────────────────────────────────────
-- Molde de 0113 (delivery) y 0156 (lealtad): VIM concede el complemento, el dueño enciende.
-- Nace INACTIVO: el panel de VIM lista todo complemento activo con un botón de activar y todavía
-- no hay pantallas detrás. Se activa, y se concede a quien ya está en Negocio o Cadena, en la
-- migración de salida (entrega 7), igual que hizo lealtad en 0159.
INSERT INTO addons (codigo, nombre, descripcion, precio_mensual_mxn, features_activadas, activo, orden_visualizacion)
VALUES (
  'TIENDA',
  'Tienda en línea',
  'Tus clientes piden desde su teléfono, para recoger o a domicilio, y el pedido cae en la caja. '
    || 'Sin comisión por pedido. Incluida sin cargo desde el plan Negocio; en Esencial se contrata aparte.',
  100.00,
  jsonb_build_object('tienda', true),
  false,
  30
)
ON CONFLICT (codigo) DO NOTHING;

UPDATE planes
   SET features_incluidos = COALESCE(features_incluidos, '{}'::jsonb) || jsonb_build_object('tienda_incluida', codigo <> 'ESENCIAL'),
       updated_at = now()
 WHERE codigo IN ('ESENCIAL', 'NEGOCIO', 'CADENA', 'FT', 'QS', 'CB', 'FS', 'DK', 'ENT');

-- El cambio de plan también concede y retira la tienda. Cuerpo copiado ÍNTEGRO de
-- 0159_lealtad_admin.sql (única definición vigente); el único cambio es la pareja nueva en la lista.
-- Su espejo en TS es ADDONS_DEL_PLAN (apps/platform/app/lib/cambio-plan.ts): si cambias uno, cambia el otro.
CREATE OR REPLACE FUNCTION public._sincronizar_addons_del_plan(p_tenant uuid, p_plan uuid, p_retirar boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hoy      date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_feat     jsonb;
  v_plan_nom text;
  v_nota     text;
  v_addon    uuid;
  v_fila     public.tenant_addons%ROWTYPE;
  v_n        int;
  r          record;
  v_conc     text[] := '{}';
  v_ret      text[] := '{}';
BEGIN
  SELECT COALESCE(features_incluidos, '{}'::jsonb), nombre INTO v_feat, v_plan_nom FROM public.planes WHERE id = p_plan;
  v_nota := 'Incluido en el plan ' || COALESCE(v_plan_nom, '');

  FOR r IN SELECT * FROM (VALUES ('CFDI', 'cfdi_incluido'), ('DELIVERY', 'delivery_incluido'), ('LEALTAD', 'lealtad_incluido'), ('TIENDA', 'tienda_incluida')) AS x(codigo, bandera) LOOP
    SELECT id INTO v_addon FROM public.addons WHERE codigo = r.codigo;
    CONTINUE WHEN v_addon IS NULL;

    IF COALESCE((v_feat->>r.bandera)::boolean, false) THEN
      SELECT * INTO v_fila FROM public.tenant_addons
       WHERE tenant_id = p_tenant AND addon_id = v_addon AND activo
       ORDER BY fecha_inicio DESC LIMIT 1
       FOR UPDATE;

      IF FOUND AND v_fila.incluido_en_plan AND v_fila.precio_mensual_mxn = 0 THEN
        CONTINUE;                                            -- ya lo tiene incluido
      ELSIF FOUND AND v_fila.fecha_inicio = v_hoy THEN
        -- Se dio de alta hoy (pagado): se corrige en su lugar, no cabe otra fila con la misma fecha.
        UPDATE public.tenant_addons
           SET precio_mensual_mxn = 0, incluido_en_plan = true, notas = v_nota, updated_at = now()
         WHERE id = v_fila.id;
      ELSE
        -- ¿Una baja de HOY? Se reactiva esa fila: un INSERT chocaría con addon_unico_activo.
        UPDATE public.tenant_addons
           SET activo = true, fecha_fin = NULL, precio_mensual_mxn = 0, incluido_en_plan = true, notas = v_nota, updated_at = now()
         WHERE tenant_id = p_tenant AND addon_id = v_addon AND fecha_inicio = v_hoy AND NOT activo;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO public.tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, notas, incluido_en_plan)
          VALUES (p_tenant, v_addon, v_hoy, true, 0, v_nota, true);
        END IF;
        IF v_fila.id IS NOT NULL THEN
          -- Lo pagaba aparte: esa fila se cierra hoy (la historia de lo que pagó se queda) y ya entró
          -- la nueva a $0. Cobrarle aparte lo que su plan ya incluye sería cobrarlo dos veces.
          -- DIFERENCIA CON 0141: allá la pagada se cerraba ANTES de dejar activa la incluida. Para CFDI
          -- y DELIVERY el orden da igual, pero al cerrar una fila de LEALTAD se dispara
          -- trg_tenant_addons_apaga_lealtad (0156), que si en ese instante no ve ninguna fila vigente
          -- apaga el interruptor del dueño: quien subía de plan perdía su programa encendido. Con la
          -- incluida ya activa el trigger la ve y no apaga nada. Las dos filas no chocan con
          -- addon_unico_activo: a esta rama solo llega una pagada con fecha_inicio distinta de hoy.
          -- (Se pregunta por v_fila.id y no por FOUND, que el UPDATE y el INSERT de arriba ya pisaron.)
          UPDATE public.tenant_addons
             SET activo = false, fecha_fin = v_hoy, updated_at = now(),
                 notas = concat_ws(' · ', notas, 'Pasa a incluido en el plan ' || COALESCE(v_plan_nom, ''))
           WHERE id = v_fila.id;
        END IF;
      END IF;
      v_conc := v_conc || r.codigo;

    ELSIF p_retirar THEN
      -- Solo lo que dio el plan. Lo que paga aparte o se le regaló por cortesía no se toca.
      UPDATE public.tenant_addons
         SET activo = false, fecha_fin = v_hoy, updated_at = now()
       WHERE tenant_id = p_tenant AND addon_id = v_addon AND activo AND incluido_en_plan;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_ret := v_ret || r.codigo; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('concedidos', to_jsonb(v_conc), 'retirados', to_jsonb(v_ret));
END;
$$;
REVOKE ALL ON FUNCTION public._sincronizar_addons_del_plan(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._sincronizar_addons_del_plan(uuid, uuid, boolean) TO service_role;
COMMENT ON FUNCTION public._sincronizar_addons_del_plan(uuid, uuid, boolean) IS
  'Interna (0141, 0159, 0161): concede a $0 los add-ons que el plan incluye (CFDI, DELIVERY, LEALTAD, TIENDA) y, si p_retirar, quita los que se dieron por el plan anterior. Respeta addon_unico_activo reactivando la fila del día.';

-- Lectura única de módulos: se añade 'tienda'. Cuerpo copiado ÍNTEGRO de 0156_lealtad.sql; solo se
-- añaden v_tie y el bloque de la tienda. resolver_directivas no se toca: copia `efectivos` entero.
CREATE OR REPLACE FUNCTION modulos_efectivos(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan       jsonb;
  v_inv        boolean;
  v_del        boolean;
  v_lea        boolean;
  v_tie        boolean;
  v_permitidos jsonb := '{}'::jsonb;
  v_efectivos  jsonb := '{}'::jsonb;
  v_codigo     text;
  v_perm       boolean;
  v_enc        boolean;
  v_flag       boolean;
BEGIN
  IF p_tenant IS NULL THEN RETURN NULL; END IF;
  -- Un usuario autenticado solo puede preguntar por su propio tenant. Se decide por el ROL del
  -- JWT y no por la ausencia del claim: el hook de acceso (0006) emite tokens SIN tenant_id a
  -- empleados dados de baja, y un token así seguiría siendo `authenticated`. Sin JWT (sesión
  -- directa a la base: pruebas, semillas) o con service_role, pasa.
  IF auth.jwt() IS NOT NULL
     AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role'
     AND current_tenant_id() IS DISTINCT FROM p_tenant THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(p.features_incluidos->'modulos', '{}'::jsonb)
    INTO v_plan
    FROM tenants t LEFT JOIN planes p ON p.id = t.plan_actual_id
   WHERE t.id = p_tenant;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(c.modulo_inventario_activo, false) INTO v_inv
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;

  FOREACH v_codigo IN ARRAY ARRAY['kds', 'recetas', 'reservaciones', 'promociones'] LOOP
    v_flag := NULL;
    SELECT f.activado INTO v_flag
      FROM tenant_feature_flags f
     WHERE f.tenant_id = p_tenant AND f.flag_codigo = v_codigo
       AND f.fecha_inicio <= now() AND (f.fecha_fin IS NULL OR f.fecha_fin > now());
    v_perm := COALESCE(v_flag, (v_plan->>v_codigo)::boolean, false);
    v_enc  := CASE v_codigo WHEN 'recetas' THEN COALESCE(v_inv, false) ELSE true END;
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, v_perm);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, (v_perm AND v_enc));
  END LOOP;

  v_perm := tenant_addon_activo(p_tenant, 'CFDI');
  v_permitidos := v_permitidos || jsonb_build_object('cfdi', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('cfdi', v_perm);

  SELECT COALESCE(c.modulo_delivery_activo, false) INTO v_del
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;

  -- Delivery es el único módulo con las DOS capas a la vez: add-on de pago (como el CFDI) e
  -- interruptor del dueño (como recetas). El add-on dice si puede; el interruptor, si quiere.
  v_perm := tenant_addon_activo(p_tenant, 'DELIVERY');
  v_permitidos := v_permitidos || jsonb_build_object('delivery_apps', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('delivery_apps', (v_perm AND COALESCE(v_del, false)));

  -- Lealtad: mismas dos capas que delivery. El add-on dice si puede; el interruptor, si quiere.
  SELECT COALESCE(c.modulo_lealtad_activo, false) INTO v_lea
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'LEALTAD');
  v_permitidos := v_permitidos || jsonb_build_object('lealtad', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('lealtad', (v_perm AND COALESCE(v_lea, false)));

  -- Tienda en línea: mismas dos capas que delivery y lealtad.
  SELECT COALESCE(c.modulo_tienda_activo, false) INTO v_tie
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'TIENDA');
  v_permitidos := v_permitidos || jsonb_build_object('tienda', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('tienda', (v_perm AND COALESCE(v_tie, false)));

  RETURN jsonb_build_object('permitidos', v_permitidos, 'efectivos', v_efectivos);
END;
$$;
COMMENT ON FUNCTION modulos_efectivos(uuid) IS
  'Módulos por cliente: permitidos (plan + flags) y efectivos (AND encendido por el dueño). Única lectura autorizada (ADR 0014).';
REVOKE EXECUTE ON FUNCTION modulos_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION modulos_efectivos(uuid) TO authenticated, service_role;

-- ── §6 La señal de "caja lista" ──────────────────────────────────────────────
-- El turno abierto llega a la nube por el push, con hasta 10 minutos de retraso: no sirve para
-- decidir si la tienda acepta un pedido AHORA. La única señal de segundos es el sondeo del
-- espejo (0096), así que la caja manda ahí si tiene turno abierto y delivery-espejo lo sella.
-- Una caja vieja no manda el dato, queda en false, y la tienda de esa sucursal no abre.
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS espejo_turno_abierto boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN cajas.espejo_turno_abierto IS
  'Si la caja reportó turno abierto en su último sondeo de espejo (espejo_apps_at). La tienda en línea solo recibe pedidos con esto en true.';

CREATE OR REPLACE FUNCTION sucursal_recibe_pedidos(p_sucursal uuid, p_segundos integer DEFAULT 90) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM cajas c
    WHERE c.sucursal_id = p_sucursal AND c.activa AND c.espejo_turno_abierto
      AND c.espejo_apps_at IS NOT NULL AND c.espejo_apps_at > now() - make_interval(secs => p_segundos));
$$;
REVOKE ALL ON FUNCTION sucursal_recibe_pedidos(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sucursal_recibe_pedidos(uuid, integer) TO service_role;
COMMENT ON FUNCTION sucursal_recibe_pedidos(uuid, integer) IS
  'TRUE si alguna caja activa de la sucursal sondeó en los últimos p_segundos y reportó turno abierto.';
