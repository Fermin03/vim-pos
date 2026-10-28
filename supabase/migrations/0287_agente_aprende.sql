-- ============================================================================
-- 0287 — El agente de WhatsApp aprende de cada conversación: tabla de lecciones y cron del revisor.
--
-- Cada noche (8:00 UTC = 2:00 CDMX) el cron `wa-aprender` caduca las lecciones que Fermín no contestó
-- en 3 días y despierta la función `whatsapp-aprender`. Mismo patrón y degradación que `wa-avisos` (0286).
-- RLS activado y SIN políticas: solo lo toca service_role.
-- ============================================================================

CREATE TABLE wa_lecciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                text NOT NULL CHECK (tipo IN ('DUDA','TONO','PREGUNTA')),
  comercial           boolean NOT NULL DEFAULT false,
  pregunta            text,
  texto               text NOT NULL CHECK (length(texto) <= 2000),
  evidencia           text NOT NULL CHECK (length(evidencia) <= 1000),
  escenario           jsonb,
  conversacion_id     uuid REFERENCES wa_conversaciones(id) ON DELETE SET NULL,
  estado              text NOT NULL DEFAULT 'PENDIENTE'
                      CHECK (estado IN ('PENDIENTE','ENVIADA','APROBADA','DESCARTADA','CADUCADA','RETIRADA')),
  orden               smallint,
  wamid_envio         text UNIQUE,
  wamid_confirmacion  text UNIQUE,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  decidido_en         timestamptz
);

ALTER TABLE wa_lecciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wa_lecciones FROM PUBLIC, anon, authenticated;
GRANT ALL ON wa_lecciones TO service_role;

-- Pasa a CADUCADA las lecciones sin decidir con más de 3 días; devuelve cuántas.
CREATE FUNCTION wa_caducar_lecciones() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n int;
BEGIN
  UPDATE wa_lecciones SET estado = 'CADUCADA', decidido_en = now()
   WHERE estado IN ('PENDIENTE','ENVIADA') AND creado_en < now() - interval '3 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- Caduca y despierta la función whatsapp-aprender. Best-effort: sin pg_net o sin secretos, solo NOTICE.
CREATE FUNCTION wa_aprender_cron() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_secreto text := _vim_secreto('vim_interno');
  v_base    text := _vim_secreto('vim_functions_url');
BEGIN
  PERFORM wa_caducar_lecciones();
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'wa_aprender_cron: sin pg_net, omitido'; RETURN;
  END IF;
  IF v_secreto IS NULL OR v_base IS NULL THEN
    RAISE NOTICE 'wa_aprender_cron: faltan secretos vim_interno / vim_functions_url en Vault, omitido'; RETURN;
  END IF;
  EXECUTE format(
    'SELECT net.http_post(url := %L, body := %L::jsonb, headers := %L::jsonb, timeout_milliseconds := 150000)',
    rtrim(v_base, '/') || '/whatsapp-aprender', '{}',
    jsonb_build_object('Content-Type', 'application/json', 'x-vim-interno', v_secreto)::text
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'wa_aprender_cron: %', SQLERRM;
END $$;

REVOKE ALL ON FUNCTION wa_caducar_lecciones(), wa_aprender_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_caducar_lecciones(), wa_aprender_cron() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-aprender') THEN PERFORM cron.unschedule('wa-aprender'); END IF;
    PERFORM cron.schedule('wa-aprender', '0 8 * * *', 'SELECT public.wa_aprender_cron()');
  ELSE
    RAISE NOTICE '0287: sin pg_cron, cron wa-aprender no programado';
  END IF;
END $$;
