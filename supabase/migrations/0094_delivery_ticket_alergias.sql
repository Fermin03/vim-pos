-- ============================================================================
-- 0094 — Alergias del cliente en el ticket de app (obligación A7 del contrato con Uber).
--
-- Los ítems normalizados traen `alergenos` (en español) y `alergia_nota`. La alergia va SIEMPRE al
-- frente de la nota de cocina del ítem (campo text, nunca se trunca) y, si algún ítem la trae, la
-- nota general del ticket arranca con un aviso. Así llega a la caja, al KDS y a la comanda impresa
-- sin tocar ninguna pantalla. Solo cambia crear_ticket_desde_app (0091); todo lo demás igual.
-- ============================================================================
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
BEGIN
  SELECT * INTO v_pedido FROM delivery_pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NO_EXISTE: %', p_pedido_id; END IF;
  IF v_pedido.ticket_id IS NOT NULL THEN RETURN v_pedido.ticket_id; END IF;   -- idempotente
  IF v_pedido.estado NOT IN ('RECIBIDO', 'ERROR') THEN
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
COMMENT ON FUNCTION crear_ticket_desde_app IS
  'Crea el ticket (pagado por la app, en cocina) a partir de delivery_pedidos; la alergia del cliente va al frente de la nota de cocina (A7). Idempotente. Solo service_role.';
