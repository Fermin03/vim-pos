-- Smoke lealtad · corte (0157). El corte X reporta lo descontado por canje de lealtad en las cuentas
-- cobradas del turno, aparte de descuentos y promociones, y no cuenta una cuenta que sigue abierta.
-- Hace ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid; v_cli uuid; v_t uuid; v_t2 uuid;
  v_x      jsonb;
BEGIN
  -- aplicar_pago y reporte_x leen al empleado y el tenant del JWT.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Ana Corte', '4770001571') RETURNING id INTO v_cli;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-LCOR', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;

  -- Un turno sin ventas reporta lealtad en cero, no NULL ni ausente.
  v_x := reporte_x(v_turno);
  IF NOT (v_x->'tickets' ? 'lealtad_mxn') THEN RAISE EXCEPTION 'reporte_x no trae la clave lealtad_mxn'; END IF;
  IF (v_x->'tickets'->>'lealtad_mxn')::numeric <> 0 THEN RAISE EXCEPTION 'turno vacío: lealtad % (esperado 0)', v_x->'tickets'->>'lealtad_mxn'; END IF;

  -- Cuenta de $240 con un canje de $40: se cobra en $200.
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lcor-1', v_maria);
  PERFORM agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcor-1a');
  PERFORM agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcor-1b');
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_t, v_cli, 40, 40);

  -- Mientras sigue abierta, el corte no la cuenta.
  v_x := reporte_x(v_turno);
  IF (v_x->'tickets'->>'lealtad_mxn')::numeric <> 0 THEN RAISE EXCEPTION 'una cuenta abierta se coló en el corte: %', v_x->'tickets'->>'lealtad_mxn'; END IF;

  PERFORM aplicar_pago(v_t, 'EFECTIVO'::metodo_pago, 200, 200);

  -- Otra cuenta con canje que se queda abierta: tampoco cuenta.
  v_t2 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lcor-2', v_maria);
  PERFORM agregar_item_a_ticket(v_t2, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcor-2a');
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_t2, v_cli, 15, 15);

  v_x := reporte_x(v_turno);
  IF (v_x->'tickets'->>'lealtad_mxn')::numeric <> 40 THEN RAISE EXCEPTION 'lealtad del corte % (esperado 40)', v_x->'tickets'->>'lealtad_mxn'; END IF;
  IF (v_x->'tickets'->>'total_neto_mxn')::numeric <> 200 THEN RAISE EXCEPTION 'venta neta % (esperado 200)', v_x->'tickets'->>'total_neto_mxn'; END IF;
  -- El canje no se cuela en los otros dos carriles.
  IF (v_x->'tickets'->>'descuentos_manuales_mxn')::numeric <> 0 OR (v_x->'tickets'->>'promociones_mxn')::numeric <> 0 THEN
    RAISE EXCEPTION 'el canje se reportó como descuento o promoción';
  END IF;
  -- Y el efectivo esperado es lo que de verdad entró: fondo 500 + 200.
  IF (v_x->>'efectivo_esperado_mxn')::numeric <> 700 THEN RAISE EXCEPTION 'efectivo esperado % (esperado 700)', v_x->>'efectivo_esperado_mxn'; END IF;

  RAISE NOTICE 'SMOKE LEALTAD CORTE OK';
END $$;
ROLLBACK;
