-- ============================================================================
-- 0286 — Agente de WhatsApp (fase 1): conversaciones, mensajes, avisos a Fermín, pausa y tope de IA.
--
-- Todo con RLS activado y SIN políticas: solo lo toca service_role (Edge Functions y /platform).
-- Horario de atención: 9:00 a 18:00 hora de México; fuera de él los avisos esperan a las 9:00.
-- El cron `wa-avisos` llama a la función `whatsapp-avisos` con pg_net + Vault (mismo patrón que 0097);
-- sin pg_net, sin pg_cron o sin secretos solo se avisa con NOTICE y la migración sigue.
-- ============================================================================

CREATE TABLE wa_conversaciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id             text NOT NULL UNIQUE,
  nombre_perfil     text,
  estado            text NOT NULL DEFAULT 'ACTIVA'
                    CHECK (estado IN ('ACTIVA','PROSPECTO_CALIENTE','URGENTE_SOPORTE','DUDA_SIN_RESPUESTA','RESUELTO')),
  pausado_hasta     timestamptz,
  modelo            text NOT NULL DEFAULT 'haiku' CHECK (modelo IN ('haiku','sonnet')),
  prospecto_id      uuid REFERENCES prospectos(id) ON DELETE SET NULL,
  resumen           text,
  ultimo_mensaje_en timestamptz,
  creado_en         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wa_mensajes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES wa_conversaciones(id) ON DELETE CASCADE,
  wamid           text NOT NULL UNIQUE,
  autor           text NOT NULL CHECK (autor IN ('CLIENTE','AGENTE','FERMIN')),
  texto           text,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wa_mensajes_conversacion_idx ON wa_mensajes (conversacion_id, creado_en);

CREATE TABLE wa_avisos_fermin (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid REFERENCES wa_conversaciones(id) ON DELETE CASCADE,
  motivo          text,
  resumen         text,
  sale_en         timestamptz NOT NULL,
  enviado_en      timestamptz
);

CREATE TABLE wa_preguntas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES wa_conversaciones(id) ON DELETE CASCADE,
  pregunta        text NOT NULL CHECK (length(pregunta) <= 500),
  creado_en       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wa_config (
  id               boolean PRIMARY KEY DEFAULT true CHECK (id),
  fundador_abierta boolean NOT NULL DEFAULT true
);
INSERT INTO wa_config DEFAULT VALUES;

CREATE TABLE wa_uso_ia (
  mes         date PRIMARY KEY,
  usd         numeric(10,4) NOT NULL DEFAULT 0,
  alertado_80 boolean NOT NULL DEFAULT false
);

ALTER TABLE wa_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_mensajes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_avisos_fermin  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_preguntas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_config         ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_uso_ia         ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wa_conversaciones, wa_mensajes, wa_avisos_fermin, wa_preguntas, wa_config, wa_uso_ia
  FROM PUBLIC, anon, authenticated;

-- Si p_ts cae en [9:00, 18:00) hora de México, p_ts; si no, las 9:00 siguientes.
CREATE FUNCTION wa_siguiente_horario(p_ts timestamptz) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH l AS (SELECT p_ts AT TIME ZONE 'America/Mexico_City' AS t)
  SELECT CASE
    WHEN l.t::time >= time '09:00' AND l.t::time < time '18:00' THEN p_ts
    WHEN l.t::time < time '09:00' THEN (l.t::date + time '09:00') AT TIME ZONE 'America/Mexico_City'
    ELSE (l.t::date + 1 + time '09:00') AT TIME ZONE 'America/Mexico_City'
  END FROM l
$$;

-- Conversación de un wa_id; la crea si falta.
CREATE FUNCTION wa_conversacion_de(p_wa_id text) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO wa_conversaciones (wa_id) VALUES (p_wa_id)
  ON CONFLICT (wa_id) DO UPDATE SET wa_id = EXCLUDED.wa_id
  RETURNING id
$$;

CREATE FUNCTION wa_registrar_entrante(p_wa_id text, p_wamid text, p_nombre text, p_texto text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid; v_nueva boolean; v_ins uuid; v_pausa timestamptz;
BEGIN
  INSERT INTO wa_conversaciones (wa_id, nombre_perfil) VALUES (p_wa_id, p_nombre)
  ON CONFLICT (wa_id) DO UPDATE SET nombre_perfil = COALESCE(EXCLUDED.nombre_perfil, wa_conversaciones.nombre_perfil)
  RETURNING id, (xmax = 0) INTO v_id, v_nueva;

  INSERT INTO wa_mensajes (conversacion_id, wamid, autor, texto) VALUES (v_id, p_wamid, 'CLIENTE', p_texto)
  ON CONFLICT (wamid) DO NOTHING RETURNING id INTO v_ins;
  IF v_ins IS NULL THEN
    RETURN jsonb_build_object('conversacion_id', v_id, 'duplicado', true, 'nueva', false, 'responder', false);
  END IF;

  UPDATE wa_conversaciones
     SET ultimo_mensaje_en = now(),
         estado = CASE WHEN estado = 'RESUELTO' THEN 'ACTIVA' ELSE estado END
   WHERE id = v_id RETURNING pausado_hasta INTO v_pausa;

  RETURN jsonb_build_object('conversacion_id', v_id, 'duplicado', false, 'nueva', v_nueva,
                            'responder', v_pausa IS NULL OR v_pausa < now());
END $$;

-- Con un wamid ya registrado devuelve false y no toca nada: un eco de lo que mandó el agente no pausa.
CREATE FUNCTION wa_registrar_salida(p_conversacion_id uuid, p_wamid text, p_autor text, p_texto text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ins uuid;
BEGIN
  INSERT INTO wa_mensajes (conversacion_id, wamid, autor, texto) VALUES (p_conversacion_id, p_wamid, p_autor, p_texto)
  ON CONFLICT (wamid) DO NOTHING RETURNING id INTO v_ins;
  IF v_ins IS NULL THEN RETURN false; END IF;
  UPDATE wa_conversaciones
     SET ultimo_mensaje_en = now(),
         pausado_hasta = CASE WHEN p_autor = 'FERMIN' THEN now() + interval '12 hours' ELSE pausado_hasta END
   WHERE id = p_conversacion_id;
  RETURN true;
END $$;

CREATE FUNCTION wa_pasar_a_fermin(p_conversacion_id uuid, p_estado text, p_motivo text, p_resumen text) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sale timestamptz := wa_siguiente_horario(now());
BEGIN
  UPDATE wa_conversaciones SET estado = p_estado, pausado_hasta = v_sale + interval '12 hours'
   WHERE id = p_conversacion_id;
  INSERT INTO wa_avisos_fermin (conversacion_id, motivo, resumen, sale_en)
  VALUES (p_conversacion_id, p_motivo, p_resumen, v_sale);
  RETURN v_sale;
END $$;

-- Resolver cierra la conversación y descarta sus avisos pendientes (ya no hay nada que avisar).
CREATE FUNCTION wa_resolver(p_conversacion_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE wa_conversaciones SET estado = 'RESUELTO', pausado_hasta = NULL WHERE id = p_conversacion_id;
  UPDATE wa_avisos_fermin SET enviado_en = now() WHERE conversacion_id = p_conversacion_id AND enviado_en IS NULL;
$$;

-- Suma gasto de IA del mes (hora de México). cruzo_80 es true solo la primera vez que pasa de 80 % del tope.
CREATE FUNCTION wa_sumar_uso(p_usd numeric, p_tope numeric) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_mes date := date_trunc('month', now() AT TIME ZONE 'America/Mexico_City')::date;
  v_usd numeric; v_antes boolean; v_cruzo boolean;
BEGIN
  INSERT INTO wa_uso_ia (mes) VALUES (v_mes) ON CONFLICT (mes) DO NOTHING;
  UPDATE wa_uso_ia u SET usd = u.usd + p_usd WHERE u.mes = v_mes RETURNING u.usd, u.alertado_80 INTO v_usd, v_antes;
  v_cruzo := NOT v_antes AND v_usd > 0.8 * p_tope;
  IF v_cruzo THEN UPDATE wa_uso_ia SET alertado_80 = true WHERE mes = v_mes; END IF;
  RETURN jsonb_build_object('usd_mes', v_usd, 'cruzo_80', v_cruzo);
END $$;

CREATE FUNCTION wa_avisos_por_enviar() RETURNS SETOF wa_avisos_fermin
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT * FROM wa_avisos_fermin WHERE sale_en <= now() AND enviado_en IS NULL ORDER BY sale_en
$$;

CREATE FUNCTION wa_marcar_avisos(p_ids uuid[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE wa_avisos_fermin SET enviado_en = now() WHERE id = ANY(p_ids)
$$;

-- Despierta la función whatsapp-avisos. Best-effort: sin pg_net o sin secretos, solo NOTICE.
CREATE FUNCTION wa_avisos_cron() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_secreto text := _vim_secreto('vim_interno');
  v_base    text := _vim_secreto('vim_functions_url');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'wa_avisos_cron: sin pg_net, omitido'; RETURN;
  END IF;
  IF v_secreto IS NULL OR v_base IS NULL THEN
    RAISE NOTICE 'wa_avisos_cron: faltan secretos vim_interno / vim_functions_url en Vault, omitido'; RETURN;
  END IF;
  EXECUTE format(
    'SELECT net.http_post(url := %L, body := %L::jsonb, headers := %L::jsonb, timeout_milliseconds := 5000)',
    rtrim(v_base, '/') || '/whatsapp-avisos', '{}',
    jsonb_build_object('Content-Type', 'application/json', 'x-vim-interno', v_secreto)::text
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'wa_avisos_cron: %', SQLERRM;
END $$;

REVOKE ALL ON FUNCTION
  wa_siguiente_horario(timestamptz), wa_conversacion_de(text), wa_registrar_entrante(text, text, text, text),
  wa_registrar_salida(uuid, text, text, text), wa_pasar_a_fermin(uuid, text, text, text), wa_resolver(uuid),
  wa_sumar_uso(numeric, numeric), wa_avisos_por_enviar(), wa_marcar_avisos(uuid[]), wa_avisos_cron()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  wa_siguiente_horario(timestamptz), wa_conversacion_de(text), wa_registrar_entrante(text, text, text, text),
  wa_registrar_salida(uuid, text, text, text), wa_pasar_a_fermin(uuid, text, text, text), wa_resolver(uuid),
  wa_sumar_uso(numeric, numeric), wa_avisos_por_enviar(), wa_marcar_avisos(uuid[]), wa_avisos_cron()
  TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-avisos') THEN PERFORM cron.unschedule('wa-avisos'); END IF;
    PERFORM cron.schedule('wa-avisos', '*/5 * * * *', 'SELECT public.wa_avisos_cron()');
  ELSE
    RAISE NOTICE '0286: sin pg_cron, cron wa-avisos no programado';
  END IF;
END $$;
