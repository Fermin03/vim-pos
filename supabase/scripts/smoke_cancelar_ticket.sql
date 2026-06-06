-- Smoke F6.2 cancelar_ticket_pagado (rol postgres). Crea ticket ABIERTO con 2 items y lo
-- cancela completo (devolver_dinero=false porque no hubo pago). Verifica que queda CANCELADO.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_ticket uuid; v_prod_h uuid; v_prod_p uuid; v_cancel uuid;
  v_auth   uuid; v_estado text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';

  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-CT', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT id INTO v_prod_h FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  SELECT id INTO v_prod_p FROM productos WHERE tenant_id=v_tenant AND nombre='Papas Gajo' LIMIT 1;

  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ct-1', v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod_h, 1, NULL, '[]'::jsonb, 'smoke-ct-h');
  PERFORM agregar_item_a_ticket(v_ticket, v_prod_p, 1, NULL, '[]'::jsonb, 'smoke-ct-p');

  -- Autorización propia (María tiene venta.cancelar_abierta)
  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_abierta', 'ticket', v_ticket, NULL, 'Cliente desistió')
  RETURNING id INTO v_auth;

  -- Cancelar ticket completo (no devolver dinero — el ticket estaba ABIERTO)
  v_cancel := cancelar_ticket_pagado(
    p_ticket_id              := v_ticket,
    p_caja_id                := v_caja,
    p_turno_id               := v_turno,
    p_motivo                 := 'CLIENTE_DESISTIO'::cancelacion_motivo,
    p_motivo_texto           := 'Cliente desistió antes de cobrar',
    p_autorizacion_pin_id    := v_auth,
    p_usuario_solicitante_id := v_maria,
    p_usuario_autorizo_id    := v_maria,
    p_reversar_inventario    := true,
    p_cancelar_cfdi_sat      := false,
    p_devolver_dinero        := false,
    p_client_id_local        := 'smoke-ct-cancel'
  );
  RAISE NOTICE 'cancelacion id: %', v_cancel;

  SELECT estado_fiscal INTO v_estado FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'ticket estado: %', v_estado;
  IF v_estado <> 'CANCELADO' THEN RAISE EXCEPTION 'ticket no quedó CANCELADO: %', v_estado; END IF;

  RAISE NOTICE 'SMOKE CANCELAR TICKET OK: cancelacion % estado=%', v_cancel, v_estado;
END $$;
ROLLBACK;
