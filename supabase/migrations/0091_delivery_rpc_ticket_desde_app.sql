-- ============================================================================
-- 0091 — Crear el ticket a partir de un pedido de app (ADR 0011).
--
-- Corre como service_role desde las Edge Functions (no hay JWT de empleado). `pagos.usuario_id` es
-- NOT NULL y las RPCs de venta leen auth.uid(), así que aquí se fija el claim `sub` al usuario
-- que abrió el turno: el ticket queda "procesado por la caja", igual que si lo hubiera capturado
-- el cajero en turno. Solo service_role puede ejecutarla; el POS pasa por delivery-accion.
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

    v_item_id := agregar_item_a_ticket(
      v_ticket_id, v_producto_id, (v_item->>'cantidad')::numeric,
      NULLIF(concat_ws(' · ',
        CASE WHEN v_producto_id = v_generico_id THEN v_item->>'nombre_app' END,
        v_item->>'nota'), ''),
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
      nota_general      = v_pedido.nota_cliente
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
  'Crea el ticket (pagado por la app, en cocina) a partir de delivery_pedidos. Idempotente. Solo service_role.';

-- Transición de estado del pedido con sello de tiempo (solo service_role: el POS pasa por delivery-accion).
CREATE OR REPLACE FUNCTION delivery_pedido_transicion(p_pedido_id uuid, p_estado text, p_detalle text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE delivery_pedidos
  SET estado = p_estado,
      listo_at      = CASE WHEN p_estado = 'LISTO' THEN now() ELSE listo_at END,
      entregado_at  = CASE WHEN p_estado = 'ENTREGADO' THEN now() ELSE entregado_at END,
      cancelado_at  = CASE WHEN p_estado IN ('RECHAZADO', 'CANCELADO', 'EXPIRADO') THEN now() ELSE cancelado_at END,
      motivo_cancelacion = CASE WHEN p_estado IN ('RECHAZADO', 'CANCELADO', 'EXPIRADO') THEN p_detalle ELSE motivo_cancelacion END,
      ultimo_error  = CASE WHEN p_estado = 'ERROR' THEN p_detalle ELSE ultimo_error END
  WHERE id = p_pedido_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NO_EXISTE: %', p_pedido_id; END IF;
END;
$$;
REVOKE ALL ON FUNCTION delivery_pedido_transicion(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_pedido_transicion(uuid, text, text) TO service_role;
COMMENT ON FUNCTION delivery_pedido_transicion IS 'Cambia el estado de un pedido de app sellando la fecha del hito. Solo service_role.';
