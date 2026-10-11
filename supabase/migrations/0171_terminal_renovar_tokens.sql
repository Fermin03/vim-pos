-- ============================================================================
-- 0171 · El permiso de Mercado Pago se renueva solo (ADR 0033).
--
-- El access token de cada restaurante dura 180 días. Una vez al día la base le pide a la función
-- `terminal-mp-renovar` que renueve los que venzan en menos de 30. Mismo camino que el aviso de
-- expirados de la 0097: pg_cron → pg_net, con el secreto interno de Vault (`vim_interno`) y la
-- dirección de las funciones (`vim_functions_url`). Sin pg_net, sin pg_cron o sin secretos no hace
-- nada: es lo que pasa en el Postgres de la caja, donde esta migración también corre.
-- ============================================================================

CREATE OR REPLACE FUNCTION terminal_pedir_renovacion() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_secreto text := _vim_secreto('vim_interno');
  v_base    text := _vim_secreto('vim_functions_url');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN RETURN false; END IF;
  IF v_secreto IS NULL OR v_base IS NULL THEN
    RAISE NOTICE 'terminal_pedir_renovacion: faltan secretos vim_interno / vim_functions_url en Vault'; RETURN false;
  END IF;
  -- Nada que renovar: no se despierta a la función.
  IF NOT EXISTS (SELECT 1 FROM terminal_conexiones WHERE estado = 'ACTIVA' AND vence_at < now() + interval '30 days') THEN
    RETURN false;
  END IF;
  EXECUTE format(
    'SELECT net.http_post(url := %L, body := %L::jsonb, headers := %L::jsonb, timeout_milliseconds := 60000)',
    rtrim(v_base, '/') || '/terminal-mp-renovar', '{}',
    jsonb_build_object('Content-Type', 'application/json', 'x-vim-interno', v_secreto)::text
  );
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'terminal_pedir_renovacion: %', SQLERRM;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION terminal_pedir_renovacion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION terminal_pedir_renovacion() TO service_role;

-- Todos los días a las 10:40 UTC (4:40 de la mañana en el centro de México): nadie está cobrando.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'terminal-renovar-tokens') THEN
      PERFORM cron.unschedule('terminal-renovar-tokens');
    END IF;
    PERFORM cron.schedule('terminal-renovar-tokens', '40 10 * * *', 'SELECT public.terminal_pedir_renovacion()');
  END IF;
END $$;
