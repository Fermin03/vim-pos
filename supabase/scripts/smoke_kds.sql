-- Smoke F9 KDS: un ticket pagado entra EN_COCINA (auto al pagar), avanza LISTO → ENTREGADO
-- por UPDATE normal (sin PIN), los timestamps se ponen solos, y una reversa sin autorización
-- es rechazada por el trigger validador. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_ticket uuid; v_prod uuid;
  v_ec text; v_envio timestamptz; v_listo timestamptz; v_entrega timestamptz;
  v_reversa_bloqueada boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-KDS', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'COMER_AQUI'::modo_servicio, NULL, NULL, 'smoke-kds-1', v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'smoke-kds-item');
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, 120, 120, NULL, NULL, NULL, false, NULL, 'smoke-kds-pago');

  SELECT estado_cocina, fecha_envio_cocina INTO v_ec, v_envio FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'tras pago: estado_cocina=% envio=%', v_ec, (v_envio IS NOT NULL);
  IF v_ec <> 'EN_COCINA' THEN RAISE EXCEPTION 'no entró EN_COCINA al pagar (auto-envío): %', v_ec; END IF;
  IF v_envio IS NULL THEN RAISE EXCEPTION 'fecha_envio_cocina no se puso sola'; END IF;

  -- Avance EN_COCINA → LISTO (UPDATE normal, sin PIN)
  UPDATE tickets SET estado_cocina='LISTO' WHERE id=v_ticket;
  SELECT estado_cocina, fecha_listo INTO v_ec, v_listo FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'tras marcar listo: estado=% fecha_listo=%', v_ec, (v_listo IS NOT NULL);
  IF v_ec <> 'LISTO' OR v_listo IS NULL THEN RAISE EXCEPTION 'transición a LISTO falló'; END IF;

  -- Avance LISTO → ENTREGADO
  UPDATE tickets SET estado_cocina='ENTREGADO' WHERE id=v_ticket;
  SELECT estado_cocina, fecha_entrega INTO v_ec, v_entrega FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'tras entregar: estado=% fecha_entrega=%', v_ec, (v_entrega IS NOT NULL);
  IF v_ec <> 'ENTREGADO' OR v_entrega IS NULL THEN RAISE EXCEPTION 'transición a ENTREGADO falló'; END IF;

  -- Reversa NO autorizada (ENTREGADO → EN_COCINA) debe ser rechazada por el validador
  BEGIN
    UPDATE tickets SET estado_cocina='EN_COCINA' WHERE id=v_ticket;
  EXCEPTION WHEN others THEN
    v_reversa_bloqueada := true;
  END;
  RAISE NOTICE 'reversa sin auth bloqueada: %', v_reversa_bloqueada;
  IF NOT v_reversa_bloqueada THEN RAISE EXCEPTION 'el validador NO bloqueó la reversa sin autorización'; END IF;

  RAISE NOTICE 'SMOKE KDS OK: EN_COCINA → LISTO → ENTREGADO con timestamps; reversa sin auth bloqueada.';
END $$;
ROLLBACK;
