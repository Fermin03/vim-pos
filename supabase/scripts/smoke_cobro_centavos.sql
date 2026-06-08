-- Smoke: un total FRACCIONARIO (tras % de descuento) se paga EXACTO y cierra.
-- Demuestra que el numpad de centavos (modal-cobro) puede capturar el monto que antes no podía.
-- ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno uuid; v_ticket uuid; v_pp uuid; v_auth uuid; v_total numeric; v_estado text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_maria::text,'tenant_id',v_tenant::text)::text,true);
  UPDATE turnos SET estado='CERRADO' WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
    VALUES(v_tenant,v_suc,v_caja,'SMK-CTV',CURRENT_DATE,v_maria,500,'TOTAL') RETURNING id INTO v_turno;
  SELECT id INTO v_pp FROM productos WHERE tenant_id=v_tenant AND nombre='Papas Gajo' LIMIT 1;
  v_ticket := abrir_ticket(v_suc,v_caja,v_turno,'PARA_LLEVAR'::modo_servicio,NULL,NULL,'ctv-1',v_maria);
  PERFORM agregar_item_a_ticket(v_ticket,v_pp,1,NULL,'[]'::jsonb,'ctv-h'); -- $55
  INSERT INTO autorizaciones_pin(tenant_id,usuario_solicitante_id,usuario_autorizo_id,accion,permiso_codigo,motivo,caja_id,turno_id)
    VALUES(v_tenant,v_maria,v_maria,'descuento','descuento.manual_aplicar','t',v_caja,v_turno) RETURNING id INTO v_auth;
  PERFORM aplicar_descuento_manual(v_ticket,NULL,'PORCENTAJE'::descuento_manual_tipo,10,'CLIENTE_FRECUENTE'::descuento_manual_motivo,'10pct',v_auth,v_maria,v_maria,'ctv-desc');
  SELECT total_mxn INTO v_total FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'total tras 10%% descuento: % (esperado 49.50 fraccionario)', v_total;
  PERFORM aplicar_pago(v_ticket,'EFECTIVO'::metodo_pago, v_total, v_total, NULL,NULL,NULL,false,NULL,'ctv-pago');
  SELECT estado_fiscal INTO v_estado FROM tickets WHERE id=v_ticket;
  IF v_estado<>'PAGADO' THEN RAISE EXCEPTION 'no cerró con pago fraccionario exacto (%).', v_total; END IF;
  RAISE NOTICE 'SMOKE CENTAVOS OK: total 49.50 pagado exacto -> PAGADO.';
END $$;
ROLLBACK;
