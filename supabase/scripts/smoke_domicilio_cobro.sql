-- Smoke C/domicilio: flujo crítico CON cliente asociado (la integración nueva del POS).
-- registrar cliente+dirección → abrir_ticket(DELIVERY_PROPIO, p_cliente_id) → item → pago →
-- verificar ticket.cliente_id + modo, y que el cierre (reporte_z) cuente el Domicilio. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno uuid; v_ticket uuid; v_prod uuid; v_cli uuid; v_dir uuid;
  v_modo text; v_ticket_cli uuid; v_estado text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  -- Turno limpio
  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-DOM', CURRENT_DATE, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;

  -- 1) Registrar cliente + dirección (lo que hace el POS al elegir Domicilio)
  INSERT INTO clientes(tenant_id, nombre, telefono) VALUES (v_tenant, 'Pedro Domicilio', '4775551212') RETURNING id INTO v_cli;
  INSERT INTO direcciones_cliente(tenant_id, cliente_id, etiqueta, calle, numero_exterior, colonia, codigo_postal, ciudad, estado_geo, referencias)
  VALUES (v_tenant, v_cli, 'Principal', 'Blvd. Adolfo López Mateos', '1200', 'Jardines', '37000', 'León', 'Guanajuato', 'Reja negra') RETURNING id INTO v_dir;

  -- 2) Cobro en Domicilio CON cliente (abrir_ticket recibe p_cliente_id, como el POS ahora)
  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, v_cli, NULL, 'smoke-dom-1', v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 2, NULL, '[]'::jsonb, 'smoke-dom-item');
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, 240, 240, NULL, NULL, NULL, false, NULL, 'smoke-dom-pago');

  -- 3) Verificar que el ticket quedó asociado al cliente + modo correcto + pagado
  SELECT modo_servicio::text, cliente_id, estado_fiscal INTO v_modo, v_ticket_cli, v_estado FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'ticket modo=% cliente_asociado=% estado=%', v_modo, (v_ticket_cli = v_cli), v_estado;
  IF v_modo <> 'DELIVERY_PROPIO' THEN RAISE EXCEPTION 'modo incorrecto: %', v_modo; END IF;
  IF v_ticket_cli IS DISTINCT FROM v_cli THEN RAISE EXCEPTION 'cliente NO asociado al ticket'; END IF;

  -- 4) El ticket de Domicilio cuenta en la venta del turno (lo que el reporte Z agrega por modo)
  PERFORM 1 FROM tickets WHERE turno_id=v_turno AND modo_servicio='DELIVERY_PROPIO' AND estado_fiscal='PAGADO';
  IF NOT FOUND THEN RAISE EXCEPTION 'el ticket de Domicilio no está en el turno'; END IF;
  RAISE NOTICE 'SMOKE DOMICILIO-COBRO OK: cliente asociado + cobro + ticket de Domicilio en el turno.';
END $$;
ROLLBACK;
