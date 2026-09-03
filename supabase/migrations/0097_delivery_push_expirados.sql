-- ============================================================================
-- 0097 — Aviso push al dueño cuando vencen pedidos de apps sin aceptar.
--
-- El cron `delivery-expirados` (0093) marca los pedidos EXPIRADO. Aquí, en la misma pasada, avisa
-- a los dispositivos del negocio vía la Edge Function enviar-push, llamada desde la base con pg_net
-- y un secreto interno guardado en Vault (`vim_interno`) — así nadie tiene que tener la app abierta.
-- Todo está protegido: sin pg_net, sin Vault o sin secretos, marcar sigue funcionando y solo se
-- omite el aviso (RAISE NOTICE). En el Postgres embebido del escritorio no hay nada de esto.
--
-- Secretos en Vault (dashboard → Vault):
--   vim_interno        → cadena aleatoria (32+ caracteres); la MISMA va en Edge Functions → Secrets
--                        como VIM_INTERNO_SECRET.
--   vim_functions_url  → https://<proyecto>.supabase.co/functions/v1
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  END IF;
END $$;

-- Lee un secreto de Vault; NULL si no hay Vault o no existe el secreto.
CREATE OR REPLACE FUNCTION _vim_secreto(p_nombre text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN RETURN NULL; END IF;
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1' INTO v USING p_nombre;
  RETURN v;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION _vim_secreto(text) FROM PUBLIC, anon, authenticated;

-- Manda el aviso de expirados de una sucursal. Devuelve true si se encoló la llamada.
CREATE OR REPLACE FUNCTION delivery_avisar_expirados(p_tenant uuid, p_sucursal uuid, p_n integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_secreto  text := _vim_secreto('vim_interno');
  v_base     text := _vim_secreto('vim_functions_url');
  v_sucursal text;
  v_titulo   text;
  v_cuerpo   text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'delivery_avisar_expirados: sin pg_net, aviso omitido'; RETURN false;
  END IF;
  IF v_secreto IS NULL OR v_base IS NULL THEN
    RAISE NOTICE 'delivery_avisar_expirados: faltan secretos vim_interno / vim_functions_url en Vault, aviso omitido'; RETURN false;
  END IF;
  SELECT nombre INTO v_sucursal FROM sucursales WHERE id = p_sucursal;
  v_titulo := 'Uber Eats: pedido sin aceptar';
  v_cuerpo := CASE WHEN p_n = 1 THEN '1 pedido venció sin aceptar' ELSE p_n || ' pedidos vencieron sin aceptar' END
              || COALESCE(' en ' || v_sucursal, '') || '. Revisa la caja.';
  EXECUTE format(
    'SELECT net.http_post(url := %L, body := %L::jsonb, headers := %L::jsonb, timeout_milliseconds := 5000)',
    rtrim(v_base, '/') || '/enviar-push',
    jsonb_build_object('tenant_id', p_tenant, 'titulo', v_titulo, 'cuerpo', v_cuerpo, 'url', '/configuracion/integraciones')::text,
    jsonb_build_object('Content-Type', 'application/json', 'x-vim-interno', v_secreto)::text
  );
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'delivery_avisar_expirados: %', SQLERRM;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION delivery_avisar_expirados(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_avisar_expirados(uuid, uuid, integer) TO service_role;

-- delivery_marcar_expirados (0093) + aviso por sucursal con expirados nuevos en esta pasada.
CREATE OR REPLACE FUNCTION delivery_marcar_expirados() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer := 0;
  r record;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _exp_pasada (id uuid, tenant_id uuid, sucursal_id uuid) ON COMMIT DROP;
  DELETE FROM _exp_pasada;

  WITH exp AS (
    UPDATE delivery_pedidos
    SET estado = 'EXPIRADO', cancelado_at = now(), motivo_cancelacion = 'Venció la ventana de aceptación'
    WHERE estado = 'RECIBIDO' AND vence_aceptacion IS NOT NULL AND vence_aceptacion < now()
    RETURNING id, tenant_id, sucursal_id, conexion_id, app, id_externo
  ), ev AS (
    INSERT INTO delivery_eventos (tenant_id, conexion_id, app, direccion, tipo, id_externo, procesado, error)
    SELECT tenant_id, conexion_id, app, 'SALIDA', 'expirado', id_externo, true, 'Pedido expirado sin aceptar' FROM exp
    RETURNING conexion_id
  ), cx AS (
    UPDATE delivery_conexiones c
    SET ultimo_error = 'Pedidos expirados sin aceptar: revisar la caja', ultimo_evento_at = now()
    WHERE c.id IN (SELECT conexion_id FROM ev)
    RETURNING c.id
  )
  INSERT INTO _exp_pasada (id, tenant_id, sucursal_id) SELECT id, tenant_id, sucursal_id FROM exp;

  SELECT count(*) INTO v_n FROM _exp_pasada;

  -- Un aviso por sucursal con expirados nuevos (best-effort: nunca tira el marcado).
  FOR r IN SELECT tenant_id, sucursal_id, count(*)::integer AS n FROM _exp_pasada GROUP BY tenant_id, sucursal_id LOOP
    PERFORM delivery_avisar_expirados(r.tenant_id, r.sucursal_id, r.n);
  END LOOP;

  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION delivery_marcar_expirados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_marcar_expirados() TO service_role;
COMMENT ON FUNCTION delivery_marcar_expirados IS
  'Marca EXPIRADO los pedidos de apps RECIBIDOS cuya ventana venció; deja evento y aviso en la conexión y manda push al dueño (pg_net → enviar-push). Cron cada minuto (nube).';
