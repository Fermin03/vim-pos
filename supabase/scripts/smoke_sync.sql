-- Smoke Fase 3 · sincronización offline: sync_procesar_push crea un sync_evento, un conflicto
-- (choque de dos dispositivos) se lista pendiente y el admin lo resuelve (RESUELTO_OPERADOR).
-- Valida el contrato que usan lib/sync (POS) y la pantalla de conflictos (admin). ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"99999999-0000-0000-0000-000000000001","tenant_id":"99999999-0000-0000-0000-0000000000aa","role":"authenticated"}';
DO $$
DECLARE v_t uuid:='99999999-0000-0000-0000-0000000000aa'; v_resp jsonb; v_evt uuid; v_conf uuid; v_pend int;
BEGIN
  v_resp := sync_procesar_push('caja-smoke','Caja 01','[]'::jsonb);
  v_evt := (v_resp->>'sync_evento_id')::uuid;
  IF v_evt IS NULL OR v_resp->'totales' IS NULL THEN RAISE EXCEPTION 'push no devolvió evento/totales'; END IF;
  INSERT INTO sync_conflictos(tenant_id, sync_evento_id, tipo_conflicto, entidad_tipo, entidad_id_local, client_id_local,
    payload_intentado, payload_servidor, diferencia_detectada, resolucion)
  VALUES (v_t, v_evt, 'TICKET_YA_PAGADO_SERVIDOR'::sync_conflicto_tipo, 'ticket', gen_random_uuid(), 'cli-conf-1',
    '{"estado":"CANCELADO"}'::jsonb, '{"estado":"PAGADO"}'::jsonb, '{"campo":"estado"}'::jsonb, 'PENDIENTE')
  RETURNING id INTO v_conf;
  SELECT count(*) INTO v_pend FROM sync_conflictos WHERE resolucion='PENDIENTE' AND id=v_conf;
  IF v_pend<>1 THEN RAISE EXCEPTION 'conflicto no quedó pendiente'; END IF;
  PERFORM sync_resolver_conflicto(v_conf, 'RESUELTO_OPERADOR'::sync_conflicto_resolucion, 'Se conservó la versión del dispositivo.');
  SELECT count(*) INTO v_pend FROM sync_conflictos WHERE resolucion='PENDIENTE' AND id=v_conf;
  IF v_pend<>0 THEN RAISE EXCEPTION 'no se resolvió'; END IF;
  RAISE NOTICE 'SMOKE SYNC OK: push crea evento + conflicto listado + resuelto por operador.';
END $$;
ROLLBACK;
