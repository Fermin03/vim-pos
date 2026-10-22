-- Belleza, entrega 3: los correos de una cita reservada en línea.
--
--   CONFIRMACION  la cita quedó apartada: al reservar, o al aprobarse el anticipo en línea (nunca
--                 para la que espera su pago y vence sin pagarse);
--   RECORDATORIO  24 h antes, solo si se reservó (o se cambió por última vez) con más de 24 h;
--   CAMBIO        la cita cambió de horario (en línea, en la caja o en el admin);
--   CANCELACION   la cita se canceló (la clienta, el negocio, la caja o el pago que no llegó).
--
-- Solo citas con `reservo_email` (las reservadas en línea): una cita de la caja no recibe nada.
--
-- CÓMO SALE. El molde de la tienda (0176): un disparador en `citas` deja el renglón en la cola
-- `agenda_correos`; cada minuto `tienda_correos_barrer` (extendido aquí) mete los recordatorios,
-- caduca y limpia, y si hay algo que mandar llama a la función `tienda-correos`, que ahora también
-- despacha esta cola (agenda_correos_tomar / agenda_correo_resultado). Mismos plazos de reintento
-- (1, 5 y 15 minutos; al cuarto fallo, MUERTO) y mismo tope por hora, contado aparte.
--
-- VERSIÓN. Llave única (cita, tipo, version). CONFIRMACION y CANCELACION van con versión 0. Cada
-- cambio de horario es la versión siguiente (la mayor de sus CAMBIO + 1) y descarta lo pendiente
-- que ya no corresponde (el cambio anterior y el recordatorio). El recordatorio lleva la versión
-- vigente: un cambio lo reprograma. Cancelar descarta todo lo pendiente salvo la cancelación.
--
-- EL ENLACE. El código en claro solo existe al reservar (agenda_reservar_en_linea lo devuelve una
-- vez). La función `tienda` lo cifra como el de los pedidos (enlace.ts, atado al hash de la cita) y
-- lo deja con `agenda_enlace_guardar`. Vive hasta el día siguiente al de la cita (en México); el
-- barrido lo borra después.
--
-- EN LA CAJA INSTALADA corre igual y no hace nada: solo se encola donde hay pg_cron (la nube). Lo
-- que la caja mueve o cancela llega a la nube por el push y ahí dispara el correo.
--
-- PRIVACIDAD. La cola guarda cita, tipo, versión y cómo va el envío: ni correo ni nombre.

-- ── §1 Las tablas ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agenda_correos (
  id                  bigserial PRIMARY KEY,
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cita_id             uuid NOT NULL REFERENCES citas(id) ON DELETE CASCADE,
  tipo                varchar(20) NOT NULL,
  version             integer NOT NULL DEFAULT 0,
  estado              varchar(12) NOT NULL DEFAULT 'PENDIENTE',
  intentos            integer NOT NULL DEFAULT 0,
  proximo_intento_at  timestamptz NULL,
  tomado_at           timestamptz NULL,
  enviado_at          timestamptz NULL,
  motivo              varchar(20) NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_correo_tipo_valido CHECK (tipo IN ('CONFIRMACION', 'RECORDATORIO', 'CANCELACION', 'CAMBIO')),
  CONSTRAINT agenda_correo_estado_valido CHECK (estado IN ('PENDIENTE', 'ENVIADO', 'DESCARTADO', 'MUERTO')),
  CONSTRAINT agenda_correo_unico UNIQUE (cita_id, tipo, version)
);
COMMENT ON TABLE agenda_correos IS 'Cola de los correos de una cita reservada en línea. Un renglón por cita, tipo y versión (sube con cada cambio de horario). Sin datos personales. Solo service_role.';
CREATE INDEX IF NOT EXISTS idx_agenda_correos_pendientes ON agenda_correos (created_at) WHERE estado = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS idx_agenda_correos_tomado ON agenda_correos (tomado_at) WHERE tomado_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agenda_correos_tenant ON agenda_correos (tenant_id);
ALTER TABLE agenda_correos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agenda_correos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON agenda_correos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE agenda_correos_id_seq TO service_role;

-- El código del enlace de la cita, cifrado por la función `tienda` (la llave no está en la base).
CREATE TABLE IF NOT EXISTS agenda_enlaces (
  cita_id     uuid PRIMARY KEY REFERENCES citas(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cifrado     text NOT NULL CHECK (cifrado ~ '^[A-Za-z0-9_-]{40,200}$'),
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE agenda_enlaces IS 'Código del enlace de una cita en línea, cifrado con una llave que solo tienen las Edge Functions. Para los correos de la cita. Se borra pasado el día siguiente al de la cita. Solo service_role.';
CREATE INDEX IF NOT EXISTS idx_agenda_enlaces_tenant ON agenda_enlaces (tenant_id);
ALTER TABLE agenda_enlaces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agenda_enlaces FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON agenda_enlaces TO service_role;

-- Para el recordatorio: las citas en línea por llegar.
CREATE INDEX IF NOT EXISTS idx_citas_en_linea_por_llegar ON citas (inicia)
  WHERE reservo_email IS NOT NULL AND estado = 'AGENDADA';

-- Guarda el enlace cifrado de la cita de ese hash y negocio. Solo si dejó correo; una vez.
CREATE OR REPLACE FUNCTION agenda_enlace_guardar(p_tenant uuid, p_enlace_hash text, p_cifrado text)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO agenda_enlaces (cita_id, tenant_id, cifrado)
  SELECT c.id, c.tenant_id, p_cifrado FROM citas c
   WHERE c.enlace_hash = p_enlace_hash AND c.tenant_id = p_tenant AND c.reservo_email IS NOT NULL
  ON CONFLICT (cita_id) DO NOTHING;
$$;

-- ── §2 Encolar ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _agenda_correo_plazo(p_tipo text)
RETURNS interval
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN p_tipo = 'RECORDATORIO' THEN interval '12 hours' ELSE interval '24 hours' END;
$$;

-- La versión vigente de la cita: la de su último cambio de horario (0 si nunca cambió).
CREATE OR REPLACE FUNCTION _agenda_correo_version(p_cita uuid)
RETURNS integer
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(max(version), 0) FROM agenda_correos WHERE cita_id = p_cita AND tipo = 'CAMBIO';
$$;

-- Deja el correo pendiente. Solo donde hay quien lo mande (pg_cron: la nube) y solo si la cita se
-- reservó con correo. Nunca falla hacia quien cambió la cita.
CREATE OR REPLACE FUNCTION _agenda_correo_encolar(p_cita uuid, p_tipo text, p_version integer DEFAULT 0)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN RETURN; END IF;   -- la caja instalada: aquí no se manda nada
  INSERT INTO agenda_correos (tenant_id, cita_id, tipo, version)
  SELECT c.tenant_id, c.id, p_tipo, p_version FROM citas c
   WHERE c.id = p_cita AND c.reservo_email IS NOT NULL
  ON CONFLICT (cita_id, tipo, version) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '_agenda_correo_encolar(%, %): %', p_cita, p_tipo, SQLERRM;
END;
$$;

-- La cita nació, se pagó, se canceló o cambió de hora. Qué correo toca:
--   nace AGENDADA sin pago pendiente          → CONFIRMACION
--   pago_hasta pasa a NULL y sigue AGENDADA   → CONFIRMACION (se aprobó su anticipo)
--   pasa a CANCELADA                          → CANCELACION (y lo pendiente se descarta)
--   cambia `inicia`                           → CAMBIO con la versión siguiente (si espera su pago,
--                                               queda registrado pero DESCARTADO: no se avisa)
CREATE OR REPLACE FUNCTION citas_correo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_version integer;
BEGIN
  IF to_regnamespace('cron') IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'AGENDADA' AND NEW.pago_hasta IS NULL THEN
      PERFORM _agenda_correo_encolar(NEW.id, 'CONFIRMACION');
    END IF;
    RETURN NULL;
  END IF;

  IF NEW.estado = 'CANCELADA' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    UPDATE agenda_correos SET estado = 'DESCARTADO', motivo = 'OBSOLETO'
     WHERE cita_id = NEW.id AND estado = 'PENDIENTE' AND tipo <> 'CANCELACION';
    PERFORM _agenda_correo_encolar(NEW.id, 'CANCELACION');
    RETURN NULL;
  END IF;
  -- agenda_reservar_en_linea inserta la cita y DESPUÉS, si lleva anticipo, le pone pago_hasta: la
  -- confirmación del alta (aún sin tomar, en esta misma transacción) se retira y sale al pagar.
  IF OLD.pago_hasta IS NULL AND NEW.pago_hasta IS NOT NULL THEN
    DELETE FROM agenda_correos
     WHERE cita_id = NEW.id AND tipo = 'CONFIRMACION' AND estado = 'PENDIENTE' AND intentos = 0;
  END IF;
  IF NEW.estado = 'CANCELADA' THEN RETURN NULL; END IF;

  IF OLD.pago_hasta IS NOT NULL AND NEW.pago_hasta IS NULL AND NEW.estado = 'AGENDADA' THEN
    PERFORM _agenda_correo_encolar(NEW.id, 'CONFIRMACION');
  END IF;
  -- Sin bloque que se trague errores: si la versión no se puede calcular, el cambio de hora falla
  -- (mejor que perder el aviso en silencio).
  IF OLD.inicia IS DISTINCT FROM NEW.inicia AND NEW.inicia IS NOT NULL THEN
    v_version := _agenda_correo_version(NEW.id) + 1;
    UPDATE agenda_correos SET estado = 'DESCARTADO', motivo = 'OBSOLETO'
     WHERE cita_id = NEW.id AND estado = 'PENDIENTE' AND tipo IN ('CAMBIO', 'RECORDATORIO');
    IF NEW.pago_hasta IS NULL THEN
      PERFORM _agenda_correo_encolar(NEW.id, 'CAMBIO', v_version);
    ELSE
      -- Espera su pago: la clienta no tiene confirmación, así que no se avisa; pero el cambio
      -- cuenta (versión y hora del cambio, que usa la regla de 24 h del recordatorio).
      INSERT INTO agenda_correos (tenant_id, cita_id, tipo, version, estado, motivo)
      VALUES (NEW.tenant_id, NEW.id, 'CAMBIO', v_version, 'DESCARTADO', 'SIN_PAGO')
      ON CONFLICT (cita_id, tipo, version) DO NOTHING;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_citas_correo_alta ON citas;
CREATE TRIGGER trg_citas_correo_alta
  AFTER INSERT ON citas
  FOR EACH ROW WHEN (NEW.reservo_email IS NOT NULL)
  EXECUTE FUNCTION citas_correo();
DROP TRIGGER IF EXISTS trg_citas_correo ON citas;
CREATE TRIGGER trg_citas_correo
  AFTER UPDATE OF estado, pago_hasta, inicia ON citas
  FOR EACH ROW
  WHEN (NEW.reservo_email IS NOT NULL AND (OLD.estado IS DISTINCT FROM NEW.estado
        OR OLD.pago_hasta IS DISTINCT FROM NEW.pago_hasta OR OLD.inicia IS DISTINCT FROM NEW.inicia))
  EXECUTE FUNCTION citas_correo();

-- Los recordatorios de las citas que empiezan en las próximas 24 h, si se apartaron (o se
-- cambiaron por última vez) con más de 24 h. Una vez por versión. Devuelve cuántos encoló.
CREATE OR REPLACE FUNCTION agenda_recordatorios_encolar()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n integer;
BEGIN
  IF to_regnamespace('cron') IS NULL THEN RETURN 0; END IF;
  INSERT INTO agenda_correos (tenant_id, cita_id, tipo, version)
  SELECT c.tenant_id, c.id, 'RECORDATORIO', v.version
    FROM citas c
    CROSS JOIN LATERAL (SELECT COALESCE(max(a.version), 0) AS version, max(a.created_at) AS cambio_at
                          FROM agenda_correos a WHERE a.cita_id = c.id AND a.tipo = 'CAMBIO') v
   WHERE c.reservo_email IS NOT NULL AND c.estado = 'AGENDADA' AND c.pago_hasta IS NULL
     AND c.inicia > now() AND c.inicia <= now() + interval '24 hours'
     AND COALESCE(v.cambio_at, c.created_at) <= c.inicia - interval '24 hours'
  ON CONFLICT (cita_id, tipo, version) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ── §3 Mandar ────────────────────────────────────────────────────────────────
-- Molde de tienda_correos_tomar (0176). `cita` = lo que la clienta ve de su cita + estado, quién
-- canceló, la versión vigente y sus anticipos (en línea y todos), para que la función decida el
-- texto y descarte lo que ya no corresponde.
-- ponytail: tope contado por cola (tienda y citas, cada una el suyo); juntar si el SMTP aprieta.
CREATE OR REPLACE FUNCTION agenda_correos_tomar(p_max integer DEFAULT 10, p_tope_hora integer DEFAULT 30)
RETURNS TABLE (id bigint, tipo text, version integer, tenant_id uuid, slug text, negocio text, email text,
               enlace_hash text, cifrado text, cita jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_esperas integer[] := ARRAY[1, 5, 15, 15];
  v_cupo    integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('agenda_correos_tomar'));
  SELECT GREATEST(COALESCE(p_tope_hora, 0), 0) - count(*)::integer INTO v_cupo
    FROM agenda_correos c WHERE c.tomado_at > now() - interval '1 hour';

  RETURN QUERY
  WITH toca AS (
    SELECT c.id FROM agenda_correos c
     WHERE c.estado = 'PENDIENTE' AND c.intentos < 4
       AND (c.proximo_intento_at IS NULL OR c.proximo_intento_at <= now())
       AND c.created_at > now() - _agenda_correo_plazo(c.tipo)
       -- La confirmación espera hasta 5 minutos a que la función guarde el enlace cifrado
       -- (agenda_enlace_guardar va justo después de reservar); pasado eso sale sin botón.
       AND NOT (c.tipo = 'CONFIRMACION' AND c.created_at > now() - interval '5 minutes'
                AND NOT EXISTS (SELECT 1 FROM agenda_enlaces e WHERE e.cita_id = c.cita_id))
     ORDER BY (c.tipo = 'CANCELACION') DESC, c.created_at
     LIMIT GREATEST(LEAST(COALESCE(p_max, 10), v_cupo), 0) FOR UPDATE SKIP LOCKED
  ), tomados AS (
    UPDATE agenda_correos c
       SET intentos = c.intentos + 1, tomado_at = now(),
           proximo_intento_at = now() + make_interval(mins => v_esperas[c.intentos + 1])
      FROM toca WHERE c.id = toca.id
    RETURNING c.id, c.tipo, c.version, c.tenant_id, c.cita_id
  )
  SELECT t.id, t.tipo::text, t.version, t.tenant_id, g.slug, n.nombre_comercial::text, ci.reservo_email,
         ci.enlace_hash, e.cifrado,
         _agenda_cita_resumen(ci.id) || jsonb_build_object(
           'estado', ci.estado,
           'cancelada_por', ci.cancelada_por,
           'version', _agenda_correo_version(ci.id),
           'anticipo_en_linea_mxn', (SELECT COALESCE(sum(a.monto_mxn), 0) FROM anticipos_cita a
                                      WHERE a.cita_id = ci.id AND a.metodo_pago = 'PAGO_EN_LINEA'),
           'anticipo_mxn', (SELECT COALESCE(sum(a.monto_mxn), 0) FROM anticipos_cita a WHERE a.cita_id = ci.id),
           -- Mercado Pago devuelve solo el anticipo entero (misma regla que el reembolso automático).
           'reembolso_mp', _anticipo_en_linea_entero(ci.id),
           -- Un cobro que llegó tarde (cita ya vencida) y que Mercado Pago devuelve.
           'cobro_tardio', EXISTS (SELECT 1 FROM tienda_pagos p
                                  WHERE p.cita_id = ci.id AND p.estado IN ('POR_DEVOLVER', 'DEVUELTO')))
    FROM tomados t
    JOIN citas ci ON ci.id = t.cita_id
    JOIN tenants n ON n.id = t.tenant_id
    LEFT JOIN tienda_config g ON g.tenant_id = t.tenant_id
    LEFT JOIN agenda_enlaces e ON e.cita_id = t.cita_id;
END;
$$;

-- Cómo le fue a un envío. Mismo contrato que tienda_correo_resultado (0176).
CREATE OR REPLACE FUNCTION agenda_correo_resultado(p_id bigint, p_resultado text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_estado text;
BEGIN
  IF p_resultado IS NULL OR p_resultado NOT IN ('ENVIADO', 'OBSOLETO', 'SIN_CORREO', 'FALLO') THEN
    RAISE EXCEPTION 'CORREO_RESULTADO_INVALIDO: %', COALESCE(left(p_resultado, 40), 'NULL');
  END IF;
  UPDATE agenda_correos
     SET estado = CASE WHEN p_resultado = 'ENVIADO' THEN 'ENVIADO'
                       WHEN p_resultado IN ('OBSOLETO', 'SIN_CORREO') THEN 'DESCARTADO'
                       WHEN intentos >= 4 THEN 'MUERTO'
                       ELSE estado END,
         enviado_at = CASE WHEN p_resultado = 'ENVIADO' THEN now() ELSE enviado_at END,
         motivo = CASE WHEN p_resultado = 'ENVIADO' THEN NULL WHEN p_resultado = 'FALLO' THEN 'ENVIO' ELSE p_resultado END
   WHERE id = p_id AND estado = 'PENDIENTE'
  RETURNING estado INTO v_estado;
  RETURN COALESCE(v_estado, (SELECT c.estado FROM agenda_correos c WHERE c.id = p_id));
END;
$$;

-- ── §4 El barrido de cada minuto (cuerpo vigente de 0176 + lo de las citas) ──
CREATE OR REPLACE FUNCTION tienda_correos_barrer() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n       integer;
  v_secreto text;
  v_base    text;
BEGIN
  UPDATE tienda_correos SET estado = 'DESCARTADO', motivo = 'VENCIDO'
   WHERE estado = 'PENDIENTE' AND created_at <= now() - _tienda_correo_plazo(tipo);
  UPDATE tienda_correos SET estado = 'MUERTO', motivo = 'SIN_RESULTADO'
   WHERE estado = 'PENDIENTE' AND intentos >= 4 AND proximo_intento_at <= now();
  DELETE FROM tienda_enlaces WHERE created_at < now() - interval '48 hours';
  DELETE FROM tienda_correos WHERE created_at < now() - interval '30 days';

  -- Las citas (0226), en su propio bloque: un error aquí no frena los correos de la tienda.
  BEGIN
    PERFORM agenda_recordatorios_encolar();
    UPDATE agenda_correos SET estado = 'DESCARTADO', motivo = 'VENCIDO'
     WHERE estado = 'PENDIENTE' AND created_at <= now() - _agenda_correo_plazo(tipo);
    UPDATE agenda_correos SET estado = 'MUERTO', motivo = 'SIN_RESULTADO'
     WHERE estado = 'PENDIENTE' AND intentos >= 4 AND proximo_intento_at <= now();
    DELETE FROM agenda_enlaces e USING citas c
     WHERE c.id = e.cita_id
       AND (COALESCE(c.inicia, e.created_at) AT TIME ZONE 'America/Mexico_City')::date + 1
           < (now() AT TIME ZONE 'America/Mexico_City')::date;
    DELETE FROM agenda_correos WHERE created_at < now() - interval '30 days';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tienda_correos_barrer (citas): %', SQLERRM;
  END;

  SELECT (SELECT count(*) FROM tienda_correos
           WHERE estado = 'PENDIENTE' AND intentos < 4 AND (proximo_intento_at IS NULL OR proximo_intento_at <= now()))
       + (SELECT count(*) FROM agenda_correos
           WHERE estado = 'PENDIENTE' AND intentos < 4 AND (proximo_intento_at IS NULL OR proximo_intento_at <= now()))
    INTO v_n;

  BEGIN
    IF v_n > 0 THEN
      v_secreto := _vim_secreto('vim_interno');
      v_base    := _vim_secreto('vim_functions_url');
      IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') OR v_secreto IS NULL OR v_base IS NULL THEN
        IF NOT EXISTS (SELECT 1 FROM tienda_eventos e
                        WHERE e.accion = 'correos:sin_configurar' AND e.created_at > now() - interval '1 hour') THEN
          INSERT INTO tienda_eventos (accion, error, payload)
          VALUES ('correos:sin_configurar', 'hay correos de estado por mandar y el barrido no puede llamar a la función',
                  jsonb_build_object('pg_net', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net'),
                                     'vim_interno', v_secreto IS NOT NULL, 'vim_functions_url', v_base IS NOT NULL));
        END IF;
        RAISE WARNING 'tienda_correos_barrer: sin pg_net o sin los secretos vim_interno / vim_functions_url en Vault; hay correos de estado sin mandar';
      ELSE
        EXECUTE format(
          'SELECT net.http_post(url := %L, body := %L::jsonb, headers := %L::jsonb, timeout_milliseconds := 5000)',
          rtrim(v_base, '/') || '/tienda-correos',
          '{"barrido": true}',
          jsonb_build_object('Content-Type', 'application/json', 'x-vim-interno', v_secreto)::text);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tienda_correos_barrer: %', SQLERRM;
  END;

  RETURN v_n;
END;
$$;
COMMENT ON FUNCTION tienda_correos_barrer IS
  'Caduca los correos de la tienda y de las citas en línea que ya no deben salir, encola los recordatorios de cita, limpia enlaces y colas y, si hay algo que mandar, llama a tienda-correos (pg_net). Cron cada minuto (nube). Devuelve cuántos esperan envío.';

-- ── Privilegios ──────────────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['agenda_enlace_guardar(uuid, text, text)', 'agenda_correos_tomar(integer, integer)',
                           'agenda_correo_resultado(bigint, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['_agenda_correo_plazo(text)', '_agenda_correo_version(uuid)',
                           '_agenda_correo_encolar(uuid, text, integer)', 'citas_correo()',
                           'agenda_recordatorios_encolar()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
END $$;
