-- Smoke D45 §12 · pedidos en espera: abrir ticket QS → poner_ticket_en_espera (etiqueta
-- obligatoria) → aparece en la lista por caja → retomar_ticket → cobrar normal. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t uuid:='99999999-0000-0000-0000-0000000000aa'; v_s uuid:='99999999-0000-0000-0000-0000000000bb';
  v_c uuid:='99999999-0000-0000-0000-0000000000cc'; v_m uuid:='99999999-0000-0000-0000-000000000001';
  v_turno uuid; v_ticket uuid; v_prod uuid; v_n int; v_espera boolean; v_estado text; v_total numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_m::text,'tenant_id',v_t::text)::text, true);
  UPDATE turnos SET estado='CERRADO' WHERE caja_id=v_c AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
  VALUES(v_t,v_s,v_c,'SM-ESPERA',CURRENT_DATE,v_m,500,'TOTAL') RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_t LIMIT 1;

  -- 1) Ticket QS con un ítem (lo que persiste el POS antes de poner en espera)
  v_ticket:=abrir_ticket(v_s,v_c,v_turno,'PARA_LLEVAR'::modo_servicio,NULL,NULL,'sm-espera-1',v_m);
  PERFORM agregar_item_a_ticket(v_ticket,v_prod,2,NULL,'[]'::jsonb,'sm-espera-item');

  -- 2) Poner en espera con etiqueta
  PERFORM poner_ticket_en_espera(v_ticket, 'Cliente camisa azul');
  SELECT en_espera INTO v_espera FROM tickets WHERE id=v_ticket;
  IF NOT v_espera THEN RAISE EXCEPTION 'no quedó en espera'; END IF;

  -- 3) La consulta de la lista del POS lo encuentra (por caja, BORRADOR/ABIERTO)
  SELECT count(*) INTO v_n FROM tickets
  WHERE caja_id=v_c AND en_espera=true AND estado_fiscal IN ('BORRADOR','ABIERTO') AND etiqueta_espera='Cliente camisa azul';
  RAISE NOTICE 'en lista de espera=%', v_n;
  IF v_n<>1 THEN RAISE EXCEPTION 'no aparece en la lista de espera'; END IF;

  -- 4) Retomar y cobrar normal (el flujo completo de la caja)
  PERFORM retomar_ticket(v_ticket);
  SELECT en_espera INTO v_espera FROM tickets WHERE id=v_ticket;
  IF v_espera THEN RAISE EXCEPTION 'sigue en espera tras retomar'; END IF;

  SELECT total_mxn INTO v_total FROM tickets WHERE id=v_ticket;
  PERFORM aplicar_pago(v_ticket,'EFECTIVO'::metodo_pago, v_total, v_total, NULL, NULL, NULL, false, NULL, 'sm-espera-pago');
  SELECT estado_fiscal INTO v_estado FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'estado tras cobrar=%', v_estado;
  IF v_estado<>'PAGADO' THEN RAISE EXCEPTION 'no se pudo cobrar el ticket retomado: %', v_estado; END IF;

  -- 5) La etiqueta es obligatoria: en_espera sin etiqueta debe fallar (constraint)
  BEGIN
    UPDATE tickets SET etiqueta_espera=NULL, en_espera=true WHERE id=v_ticket;
    RAISE EXCEPTION 'constraint espera_requiere_etiqueta no disparó';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'constraint etiqueta obligatoria OK';
  END;

  RAISE NOTICE 'SMOKE ESPERA OK: poner en espera → lista por caja → retomar → cobrar.';
END $$;
ROLLBACK;
