-- Smoke F19 Delivery: ticket DELIVERY_PROPIO pagado → asignar repartidor → salida → entrega
-- → liquidar, verificando los estados de delivery_asignaciones en cada paso. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_ticket uuid; v_prod uuid; v_asig uuid; v_estado text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-DEL', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, NULL, NULL, 'smoke-del-1', v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'smoke-del-item');
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, 120, 120, NULL, NULL, NULL, false, NULL, 'smoke-del-pago');

  -- Asignar repartidor (usamos a María como repartidor para el smoke).
  v_asig := asignar_delivery(v_ticket, v_maria, 120, 30, NULL, NULL, NULL, 'smoke-del-asig');
  SELECT estado INTO v_estado FROM delivery_asignaciones WHERE id=v_asig;
  RAISE NOTICE 'tras asignar: % (esperado ASIGNADO)', v_estado;
  IF v_estado <> 'ASIGNADO' THEN RAISE EXCEPTION 'no quedó ASIGNADO'; END IF;

  -- Salida → EN_RUTA
  PERFORM confirmar_salida_delivery(v_asig);
  SELECT estado INTO v_estado FROM delivery_asignaciones WHERE id=v_asig;
  RAISE NOTICE 'tras salida: % (esperado EN_RUTA)', v_estado;
  IF v_estado <> 'EN_RUTA' THEN RAISE EXCEPTION 'no quedó EN_RUTA'; END IF;

  -- Entrega → ENTREGADO (con propina al repartidor)
  PERFORM confirmar_entrega_delivery(v_asig, 20);
  SELECT estado INTO v_estado FROM delivery_asignaciones WHERE id=v_asig;
  RAISE NOTICE 'tras entrega: % (esperado ENTREGADO)', v_estado;
  IF v_estado <> 'ENTREGADO' THEN RAISE EXCEPTION 'no quedó ENTREGADO'; END IF;

  -- Liquidar → LIQUIDADO (el repartidor entrega 120 en efectivo)
  PERFORM liquidar_delivery(v_asig, 120, 0, v_maria, 'Liquidación smoke');
  SELECT estado INTO v_estado FROM delivery_asignaciones WHERE id=v_asig;
  RAISE NOTICE 'tras liquidar: % (esperado LIQUIDADO)', v_estado;
  IF v_estado <> 'LIQUIDADO' THEN RAISE EXCEPTION 'no quedó LIQUIDADO'; END IF;

  RAISE NOTICE 'SMOKE DELIVERY OK: ASIGNADO → EN_RUTA → ENTREGADO → LIQUIDADO.';
END $$;
ROLLBACK;
