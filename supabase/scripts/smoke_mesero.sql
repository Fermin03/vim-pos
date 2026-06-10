-- Smoke B1 Full Service · mesero: abrir mesa → atribuir mesero → enviar a cocina (aparece en KDS)
-- → cobrar con propina → vw_ventas_por_mesero atribuye venta+propina al mesero. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t uuid:='99999999-0000-0000-0000-0000000000aa'; v_s uuid:='99999999-0000-0000-0000-0000000000bb';
  v_c uuid:='99999999-0000-0000-0000-0000000000cc'; v_m uuid:='99999999-0000-0000-0000-000000000001';
  v_turno uuid; v_ticket uuid; v_prod uuid; v_cocina text; v_en_kds int; v_prop numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_m::text,'tenant_id',v_t::text)::text, true);
  UPDATE turnos SET estado='CERRADO' WHERE caja_id=v_c AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
  VALUES(v_t,v_s,v_c,'SM-MESERO2',CURRENT_DATE,v_m,500,'TOTAL') RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_t LIMIT 1;

  -- abrir cuenta de mesa + atribuir mesero (lo que hace el POS)
  v_ticket:=abrir_ticket(v_s,v_c,v_turno,'MESA'::modo_servicio,NULL,NULL,'sm-mesero2-1',v_m);
  PERFORM agregar_item_a_ticket(v_ticket,v_prod,2,NULL,'[]'::jsonb,'sm-mesero2-item');
  UPDATE tickets SET mesero_id=v_m WHERE id=v_ticket;

  -- enviar a cocina (pre-pago) → estado_cocina EN_COCINA
  UPDATE tickets SET estado_cocina='EN_COCINA' WHERE id=v_ticket AND estado_cocina='SIN_ENVIAR';
  SELECT estado_cocina INTO v_cocina FROM tickets WHERE id=v_ticket;
  -- ¿aparecería en el KDS? (tickets EN_COCINA/LISTO de la sucursal)
  SELECT count(*) INTO v_en_kds FROM tickets WHERE id=v_ticket AND estado_cocina IN ('EN_COCINA','LISTO');
  RAISE NOTICE 'cocina=% · visible_en_KDS=%', v_cocina, (v_en_kds=1);
  IF v_cocina<>'EN_COCINA' OR v_en_kds<>1 THEN RAISE EXCEPTION 'no llegó al KDS'; END IF;

  -- cobrar con propina
  PERFORM establecer_propina_ticket(v_ticket, 30);
  PERFORM aplicar_pago(v_ticket,'EFECTIVO'::metodo_pago, 270, 270, NULL, NULL, NULL, false, NULL, 'sm-mesero2-pago');

  -- vw_ventas_por_mesero atribuye al mesero (venta + propina)
  SELECT propinas_capturadas_mxn INTO v_prop FROM vw_ventas_por_mesero WHERE mesero_id=v_m ORDER BY dia_contable DESC LIMIT 1;
  RAISE NOTICE 'propina atribuida al mesero=% (esperado 30)', v_prop;
  IF v_prop IS DISTINCT FROM 30 THEN RAISE EXCEPTION 'propina no atribuida: %', v_prop; END IF;

  RAISE NOTICE 'SMOKE MESERO OK: atribución + enviar a cocina (KDS) + propina del mesero.';
END $$;
ROLLBACK;
