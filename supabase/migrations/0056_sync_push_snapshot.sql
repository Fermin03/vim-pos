-- 0056 — sync_push_snapshot(tenant, snapshot): recibe la "rebanada operativa" que el POS de
-- escritorio generó offline (turnos, tickets, items, modificadores, pagos, movimientos) y la
-- replica VERBATIM en la nube. Simétrica a sync_pull_snapshot (0055).
--
-- Clave del local-first: se aplica en modo réplica (session_replication_role=replica) para NO
-- disparar triggers → el folio, los totales y el estado PAGADO que el DEVICE ya generó (y quizá
-- imprimió) se conservan EXACTOS; la nube no re-genera folios (eso rompería el folio fiscal).
-- Idempotente (ON CONFLICT por id). Fuerza tenant_id = p_tenant en cada tabla (anti cross-tenant).
-- SECURITY DEFINER, solo service_role (Edge sync-push, autenticada como dispositivo).

-- Helper: upsert dinámico de un array jsonb de filas en una tabla (excluye columnas generadas,
-- filtra por tenant). Interno; lo llama sync_push_snapshot dentro del contexto definer.
CREATE OR REPLACE FUNCTION _vim_apply_rows(p_tabla text, p_rows jsonb, p_tenant uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cols text;
  v_set  text;
  v_n    integer;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;
  SELECT string_agg(quote_ident(column_name), ', '),
         string_agg(CASE WHEN column_name <> 'id' THEN quote_ident(column_name) || '=EXCLUDED.' || quote_ident(column_name) END, ', ')
    INTO v_cols, v_set
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = p_tabla
     AND is_generated <> 'ALWAYS' AND is_identity <> 'YES';
  IF v_cols IS NULL THEN RETURN 0; END IF;

  EXECUTE format(
    'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1) WHERE tenant_id = $2 ON CONFLICT (id) DO UPDATE SET %s',
    p_tabla, v_cols, v_cols, p_tabla, v_set)
  USING p_rows, p_tenant;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION _vim_apply_rows(text, jsonb, uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION sync_push_snapshot(p_tenant uuid, p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tabla text;
  v_res   jsonb := '{}'::jsonb;
BEGIN
  -- Modo réplica: no dispara triggers (folio/totales/cerrar_ticket_si_pagado). Requiere el
  -- privilegio de superusuario del dueño de la función (definer), no del service_role llamante.
  SET LOCAL session_replication_role = replica;
  FOREACH v_tabla IN ARRAY ARRAY['turnos','tickets','ticket_items','ticket_item_modificadores','pagos','movimientos_caja'] LOOP
    v_res := v_res || jsonb_build_object(v_tabla, _vim_apply_rows(v_tabla, p_snapshot->v_tabla, p_tenant));
  END LOOP;
  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION sync_push_snapshot(uuid, jsonb) IS 'Replica verbatim (modo réplica, sin triggers) la rebanada operativa del device a la nube, conservando folios/totales/estado. Simétrica a sync_pull_snapshot. Solo service_role.';

REVOKE EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) TO service_role;
