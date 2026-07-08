-- Smoke sync PUSH (0056): un ticket creado en el "device" (folio + PAGADO) se replica a la
-- "nube" vía sync_push_snapshot conservando folio/estado EXACTOS (modo réplica, sin regenerar).
-- Requiere 0056 aplicada. Se auto-envuelve en transacción con ROLLBACK (no persiste nada).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t uuid:='99999999-0000-0000-0000-0000000000aa'; v_s uuid:='99999999-0000-0000-0000-0000000000bb';
  v_c uuid:='99999999-0000-0000-0000-0000000000cc'; v_m uuid:='99999999-0000-0000-0000-000000000001';
  v_turno uuid; v_ticket uuid; v_prod uuid; v_total numeric; v_folio text; v_snap jsonb; v_folio2 text; v_estado text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_m::text,'tenant_id',v_t::text)::text, true);
  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_c AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
  VALUES(v_t,v_s,v_c,'SM-PUSH',CURRENT_DATE,v_m,500,'TOTAL') RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_t LIMIT 1;

  -- 1) Venta en el "device": ticket con folio + PAGADO
  v_ticket:=abrir_ticket(v_s,v_c,v_turno,'PARA_LLEVAR'::modo_servicio,NULL,NULL,'push-smoke-1',v_m);
  PERFORM agregar_item_a_ticket(v_ticket,v_prod,1,NULL,'[]'::jsonb,'push-smoke-item');
  SELECT total_mxn INTO v_total FROM tickets WHERE id=v_ticket;
  PERFORM aplicar_pago(v_ticket,'EFECTIVO'::metodo_pago,v_total,v_total,NULL,NULL,NULL,false,NULL,'push-smoke-pago');
  SELECT folio_completo INTO v_folio FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'device: ticket folio=% PAGADO $%', v_folio, v_total;

  -- 2) Snapshot que enviaría el device (filas completas)
  SELECT jsonb_build_object(
    'turnos',       (SELECT jsonb_agg(to_jsonb(x)) FROM turnos x WHERE x.id=v_turno),
    'tickets',      (SELECT jsonb_agg(to_jsonb(x)) FROM tickets x WHERE x.id=v_ticket),
    'ticket_items', (SELECT jsonb_agg(to_jsonb(x)) FROM ticket_items x WHERE x.ticket_id=v_ticket),
    'pagos',        (SELECT jsonb_agg(to_jsonb(x)) FROM pagos x WHERE x.ticket_id=v_ticket)
  ) INTO v_snap;

  -- 3) Simular nube SIN ese ticket (borrar en modo réplica para saltar FKs RESTRICT)
  SET session_replication_role = replica;
  DELETE FROM pagos WHERE ticket_id=v_ticket;
  DELETE FROM ticket_items WHERE ticket_id=v_ticket;
  DELETE FROM tickets WHERE id=v_ticket;
  SET session_replication_role = default;
  IF EXISTS(SELECT 1 FROM tickets WHERE id=v_ticket) THEN RAISE EXCEPTION 'no se borró el ticket'; END IF;

  -- 4) PUSH: aplicar el snapshot como lo hará la nube
  PERFORM sync_push_snapshot(v_t, v_snap);

  SELECT folio_completo, estado_fiscal INTO v_folio2, v_estado FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'nube tras push: folio=% estado=%', v_folio2, v_estado;
  IF v_folio2 IS DISTINCT FROM v_folio THEN RAISE EXCEPTION 'FOLIO NO SE CONSERVÓ: % vs %', v_folio2, v_folio; END IF;
  IF v_estado <> 'PAGADO' THEN RAISE EXCEPTION 'ESTADO no se conservó: %', v_estado; END IF;

  -- 5) Idempotencia: re-aplicar no rompe ni duplica
  PERFORM sync_push_snapshot(v_t, v_snap);
  IF (SELECT count(*) FROM pagos WHERE ticket_id=v_ticket) <> 1 THEN RAISE EXCEPTION 'push no idempotente (pagos duplicados)'; END IF;

  RAISE NOTICE 'SMOKE PUSH OK: folio % y PAGADO replicados verbatim; idempotente.', v_folio2;
END $$;
ROLLBACK;
