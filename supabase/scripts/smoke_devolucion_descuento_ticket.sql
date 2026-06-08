-- Smoke 0041: una devolución total de un ticket con descuento a NIVEL TICKET reembolsa
-- EXACTAMENTE lo pagado (no el bruto pre-descuento). ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid:='99999999-0000-0000-0000-0000000000aa'; v_suc uuid:='99999999-0000-0000-0000-0000000000bb';
  v_caja uuid:='99999999-0000-0000-0000-0000000000cc'; v_maria uuid:='99999999-0000-0000-0000-000000000001';
  v_turno uuid; v_ticket uuid; v_pp uuid; v_item uuid; v_auth uuid; v_total numeric; v_dev uuid; v_devuelto numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_maria::text,'tenant_id',v_tenant::text)::text,true);
  UPDATE turnos SET estado='CERRADO' WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
    VALUES(v_tenant,v_suc,v_caja,'SMK-ORF',CURRENT_DATE,v_maria,500,'TOTAL') RETURNING id INTO v_turno;
  SELECT id INTO v_pp FROM productos WHERE tenant_id=v_tenant AND nombre='Papas Gajo' LIMIT 1;
  v_ticket:=abrir_ticket(v_suc,v_caja,v_turno,'PARA_LLEVAR'::modo_servicio,NULL,NULL,'orf-1',v_maria);
  v_item:=agregar_item_a_ticket(v_ticket,v_pp,1,NULL,'[]'::jsonb,'orf-h');
  INSERT INTO autorizaciones_pin(tenant_id,usuario_solicitante_id,usuario_autorizo_id,accion,permiso_codigo,motivo,caja_id,turno_id)
    VALUES(v_tenant,v_maria,v_maria,'d','descuento.manual_aplicar','t',v_caja,v_turno) RETURNING id INTO v_auth;
  PERFORM aplicar_descuento_manual(v_ticket,NULL,'PORCENTAJE'::descuento_manual_tipo,10,'CLIENTE_FRECUENTE'::descuento_manual_motivo,'10',v_auth,v_maria,v_maria,'orf-desc');
  SELECT total_mxn INTO v_total FROM tickets WHERE id=v_ticket;
  PERFORM aplicar_pago(v_ticket,'EFECTIVO'::metodo_pago,v_total,v_total,NULL,NULL,NULL,false,NULL,'orf-pago');
  v_dev:=crear_devolucion(v_ticket,v_caja,v_turno,'TOTAL'::devolucion_alcance,'PRODUCTO_DEFECTUOSO'::devolucion_motivo,'x','EFECTIVO'::devolucion_medio,v_auth,v_maria,v_maria,jsonb_build_array(jsonb_build_object('ticket_item_id',v_item,'cantidad_devuelta',1)),false,NULL,'orf-dev');
  SELECT total_devuelto_mxn INTO v_devuelto FROM devoluciones WHERE id=v_dev;
  IF v_devuelto <> v_total THEN RAISE EXCEPTION 'over/under-refund: devuelto % != pagado %', v_devuelto, v_total; END IF;
  RAISE NOTICE 'SMOKE DEVOLUCION DESC TICKET OK: devuelto=% = pagado=% (49.50).', v_devuelto, v_total;
END $$;
ROLLBACK;
