-- 0176 · Tienda en línea: un correo al cliente cada vez que su pedido cambia de estado.
--
-- Hasta hoy el cliente recibía un solo correo (la confirmación, que sale desde `pedir`) y lo demás
-- lo veía solo si dejaba abierta la página del pedido. Desde esta entrega recibe además:
--
--   EN_PREPARACION  el restaurante aceptó el pedido;
--   LISTO           listo para recoger (recoger) o en camino (domicilio);
--   CANCELADO       lo rechazaron, venció sin aceptar o lo cancelaron (y, si pagó, que se devuelve);
--   DEVUELTO        la devolución de su pago en línea quedó hecha.
--
-- NO hay correo de «Entregado» (decisión de producto), ni del pedido en línea que nunca se pagó
-- (sin pago, verificación del banco abandonada, tarjeta rechazada): ese cliente ya lo vio en
-- pantalla y nunca tuvo un pedido confirmado. Solo canal TIENDA; nunca Uber.
--
-- CÓMO SALE. El cambio de estado deja un renglón en la cola `tienda_correos` (disparadores sobre
-- delivery_pedidos y tienda_pagos: da igual si lo movió la caja, el POS web o un barrido), y cada
-- minuto `tienda_correos_barrer` (pg_cron) llama a la función `tienda-correos` (pg_net, puerta
-- interna `x-vim-interno`, igual que el barrido de pagos de la 0173), que arma y manda.
--
-- LO QUE LA COLA GARANTIZA:
--   · un correo por pedido y tipo, nunca repetido (llave única). Un estado saltado no manda nada;
--     volver atrás y repetir un estado, tampoco;
--   · un correo viejo no sale: «en preparación» y «listo» caducan a los 30 minutos; «cancelado» y
--     «devuelto», a las 24 horas. Y el de un estado que el pedido ya dejó atrás se descarta al
--     ir a mandarlo (lo decide la función, con lo mismo que enseña la página);
--   · hasta 4 intentos, con esperas de 1, 5 y 15 minutos; al cuarto fallo queda MUERTO, a la vista;
--   · un tope de envíos por hora (lo pone quien llama; ver `tienda_correos_tomar`) para no dejar
--     sin cupo de SMTP a los correos de confirmación ni a los avisos internos;
--   · nada de esto puede tumbar el cambio de estado: el disparador se traga sus propios errores.
--
-- EN LA CAJA INSTALADA esta migración corre igual (sin Vault, sin pg_net, sin pg_cron) y NO hace
-- nada: los disparadores existen pero solo encolan donde hay pg_cron (el esquema `cron`), que es
-- donde alguien va a mandar. La caja mueve su copia local del pedido y se lo cuenta a la nube; el
-- correo sale una vez, desde la nube, cuando la nube conoce el cambio.
--
-- PRIVACIDAD. La cola guarda pedido, tipo y cómo va el envío: ni correo ni nombre (se leen del
-- pedido al enviar). `tienda_enlaces` guarda el código de seguimiento CIFRADO con una llave que
-- solo tienen las funciones (deriva de VIM_TIENDA_SECRET): quien lea la base sigue sin poder abrir
-- el seguimiento de nadie. Se borra a las 48 horas; la cola, a los 30 días. Las dos se van con el
-- pedido (ON DELETE CASCADE).
--
-- ORDEN DE DESPLIEGUE:  1) esta migración  →  2) la función `tienda-correos` (nueva)  →  3) la
-- función `tienda`. Con la migración sola los correos se encolan y caducan sin salir (y queda un
-- renglón por hora en tienda_eventos, 'correos:sin_configurar', si faltan los secretos de Vault).
-- La función `tienda` vieja sigue funcionando: solo que sus pedidos no guardan enlace y sus correos
-- de estado salen sin botón.

-- ── §1 La cola ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tienda_correos (
  id                  bigserial PRIMARY KEY,
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pedido_id           uuid NOT NULL REFERENCES delivery_pedidos(id) ON DELETE CASCADE,
  tipo                varchar(20) NOT NULL,
  estado              varchar(12) NOT NULL DEFAULT 'PENDIENTE',
  intentos            integer NOT NULL DEFAULT 0,
  proximo_intento_at  timestamptz NULL,          -- no antes de: la espera tras un fallo (o tras tomarlo)
  tomado_at           timestamptz NULL,          -- último intento de envío: con él se cuenta el tope por hora
  enviado_at          timestamptz NULL,
  motivo              varchar(20) NULL,          -- por qué se descartó o murió. Un código; nunca el error de SMTP (puede traer la dirección)
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tienda_correo_tipo_valido CHECK (tipo IN ('EN_PREPARACION', 'LISTO', 'CANCELADO', 'DEVUELTO')),
  CONSTRAINT tienda_correo_estado_valido CHECK (estado IN ('PENDIENTE', 'ENVIADO', 'DESCARTADO', 'MUERTO')),
  CONSTRAINT tienda_correo_unico UNIQUE (pedido_id, tipo)
);
COMMENT ON TABLE tienda_correos IS 'Cola de los correos de estado de un pedido de la tienda en línea. Un renglón por pedido y tipo. Sin datos personales. Solo la escriben las funciones; solo service_role.';
CREATE INDEX IF NOT EXISTS idx_tienda_correos_pendientes ON tienda_correos (created_at) WHERE estado = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS idx_tienda_correos_tomado ON tienda_correos (tomado_at) WHERE tomado_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tienda_correos_tenant ON tienda_correos (tenant_id);
ALTER TABLE tienda_correos ENABLE ROW LEVEL SECURITY;
-- Sin políticas, a propósito (como tienda_eventos): nadie más que service_role.
REVOKE ALL ON tienda_correos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tienda_correos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE tienda_correos_id_seq TO service_role;

-- El código de seguimiento, cifrado (AES-GCM) por la función `tienda` al crear el pedido, para que
-- los correos de estado lleven el MISMO enlace que el de confirmación. La llave no está en la base.
CREATE TABLE IF NOT EXISTS tienda_enlaces (
  pedido_id   uuid PRIMARY KEY REFERENCES delivery_pedidos(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cifrado     text NOT NULL CHECK (cifrado ~ '^[A-Za-z0-9_-]{40,200}$'),
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE tienda_enlaces IS 'Código de seguimiento de un pedido de la tienda, cifrado con una llave que solo tienen las Edge Functions. Solo para armar el enlace de los correos de estado. Se borra a las 48 horas. Solo service_role.';
CREATE INDEX IF NOT EXISTS idx_tienda_enlaces_created ON tienda_enlaces (created_at);
CREATE INDEX IF NOT EXISTS idx_tienda_enlaces_tenant ON tienda_enlaces (tenant_id);
ALTER TABLE tienda_enlaces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tienda_enlaces FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON tienda_enlaces TO service_role;

-- Guarda el enlace cifrado del pedido de esa huella. Solo si el pedido dejó correo (sin correo no
-- hay a quién escribirle y no se guarda nada). Una vez por pedido: repetirlo no cambia nada.
CREATE OR REPLACE FUNCTION tienda_enlace_guardar(p_tenant uuid, p_seguimiento_hash text, p_cifrado text)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO tienda_enlaces (pedido_id, tenant_id, cifrado)
  SELECT d.id, d.tenant_id, p_cifrado FROM delivery_pedidos d
   WHERE d.seguimiento_hash = p_seguimiento_hash AND d.tenant_id = p_tenant AND d.canal = 'TIENDA'
     AND d.cliente_email IS NOT NULL
  ON CONFLICT (pedido_id) DO NOTHING;
$$;

-- ── §2 Encolar ───────────────────────────────────────────────────────────────
-- Cuánto vive un correo sin salir. Pasado esto ya no se manda.
CREATE OR REPLACE FUNCTION _tienda_correo_plazo(p_tipo text)
RETURNS interval
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN p_tipo IN ('CANCELADO', 'DEVUELTO') THEN interval '24 hours' ELSE interval '30 minutes' END;
$$;

-- Deja el correo pendiente. Solo donde hay quien lo mande (pg_cron: la nube), solo pedidos de la
-- tienda y solo si el cliente dejó correo. Nunca falla hacia quien cambió el estado.
CREATE OR REPLACE FUNCTION _tienda_correo_encolar(p_pedido uuid, p_tipo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN RETURN; END IF;   -- la caja instalada: aquí no se manda nada
  INSERT INTO tienda_correos (tenant_id, pedido_id, tipo)
  SELECT d.tenant_id, d.id, p_tipo FROM delivery_pedidos d
   WHERE d.id = p_pedido AND d.canal = 'TIENDA' AND d.cliente_email IS NOT NULL
  ON CONFLICT (pedido_id, tipo) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '_tienda_correo_encolar(%, %): %', p_pedido, p_tipo, SQLERRM;
END;
$$;

-- El pedido cambió de estado. Qué correo le toca al estado NUEVO (el viejo no importa: la llave
-- única evita repetir, y un estado saltado simplemente nunca fue «nuevo»):
--   ACEPTADO, EN_PREPARACION        → EN_PREPARACION (para el cliente son el mismo paso)
--   LISTO                           → LISTO
--   RECHAZADO, CANCELADO, EXPIRADO  → CANCELADO, salvo el pedido en línea que nunca se pagó
--   lo demás (RECIBIDO, ENTREGADO, POR_PAGAR, ERROR) → nada
CREATE OR REPLACE FUNCTION delivery_pedidos_correo_de_estado()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo text := CASE
    WHEN NEW.estado IN ('ACEPTADO', 'EN_PREPARACION') THEN 'EN_PREPARACION'
    WHEN NEW.estado = 'LISTO' THEN 'LISTO'
    WHEN NEW.estado IN ('RECHAZADO', 'CANCELADO', 'EXPIRADO')
         AND NOT (NEW.pago_al_recibir IS NOT DISTINCT FROM 'EN_LINEA' AND NEW.pagado_at IS NULL) THEN 'CANCELADO'
    END;
BEGIN
  IF v_tipo IS NOT NULL THEN PERFORM _tienda_correo_encolar(NEW.id, v_tipo); END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_delivery_pedidos_correo_de_estado ON delivery_pedidos;
CREATE TRIGGER trg_delivery_pedidos_correo_de_estado
  AFTER UPDATE OF estado ON delivery_pedidos
  FOR EACH ROW
  WHEN (NEW.canal = 'TIENDA' AND OLD.estado IS DISTINCT FROM NEW.estado)
  EXECUTE FUNCTION delivery_pedidos_correo_de_estado();

-- La devolución del pago del pedido quedó hecha. Los cobros de más (`extra`) no avisan: el pedido
-- sigue con su pago bueno y «te devolvimos tu pago» lo confundiría.
CREATE OR REPLACE FUNCTION tienda_pagos_correo_de_devolucion()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM _tienda_correo_encolar(NEW.pedido_id, 'DEVUELTO');
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_tienda_pagos_correo_de_devolucion ON tienda_pagos;
CREATE TRIGGER trg_tienda_pagos_correo_de_devolucion
  AFTER UPDATE OF estado ON tienda_pagos
  FOR EACH ROW
  WHEN (NEW.estado = 'DEVUELTO' AND OLD.estado IS DISTINCT FROM NEW.estado AND NOT NEW.extra)
  EXECUTE FUNCTION tienda_pagos_correo_de_devolucion();

-- ── §3 Mandar ────────────────────────────────────────────────────────────────
-- Lo que la función `tienda-correos` va a mandar ahora, tomado para que dos pasadas no manden lo
-- mismo. Cada toma cuenta un intento y aparta el renglón lo que dure la espera de ese intento
-- (1, 5 y 15 minutos): si la función muere a medias, vuelve a salir solo.
--   · p_tope_hora: cuántos intentos de envío caben en una hora (los de la última hora ya cuentan).
--     Con el tope lleno los correos esperan; si se les pasa el plazo, caducan. Los de «cancelado» y
--     «devuelto» van primero.
--   · Devuelve lo mínimo para armar el correo; el resto lo da tienda_seguimiento, que es lo que ve
--     el cliente en su página. `email` NULL = el pedido ya no tiene a quién escribirle.
-- ponytail: el tope cuenta renglones tomados en la última hora, no intentos (un renglón reintentado
-- tres veces en la hora cuenta uno); contar intentos en tabla aparte si el SMTP llegara a apretar.
CREATE OR REPLACE FUNCTION tienda_correos_tomar(p_max integer DEFAULT 10, p_tope_hora integer DEFAULT 30)
RETURNS TABLE (id bigint, tipo text, tenant_id uuid, slug text, negocio text, email text, seguimiento_hash text, cifrado text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_esperas integer[] := ARRAY[1, 5, 15, 15];   -- minutos tras tomar el intento 1.º, 2.º…
  v_cupo    integer;
BEGIN
  -- Una pasada a la vez: el tope por hora se cuenta y se gasta sin carreras.
  PERFORM pg_advisory_xact_lock(hashtext('tienda_correos_tomar'));
  SELECT GREATEST(COALESCE(p_tope_hora, 0), 0) - count(*)::integer INTO v_cupo
    FROM tienda_correos c WHERE c.tomado_at > now() - interval '1 hour';

  RETURN QUERY
  WITH toca AS (
    SELECT c.id FROM tienda_correos c
     WHERE c.estado = 'PENDIENTE' AND c.intentos < 4
       AND (c.proximo_intento_at IS NULL OR c.proximo_intento_at <= now())
       AND c.created_at > now() - _tienda_correo_plazo(c.tipo)
     ORDER BY (c.tipo IN ('CANCELADO', 'DEVUELTO')) DESC, c.created_at
     LIMIT GREATEST(LEAST(COALESCE(p_max, 10), v_cupo), 0) FOR UPDATE SKIP LOCKED
  ), tomados AS (
    UPDATE tienda_correos c
       SET intentos = c.intentos + 1, tomado_at = now(),
           proximo_intento_at = now() + make_interval(mins => v_esperas[c.intentos + 1])
      FROM toca WHERE c.id = toca.id
    RETURNING c.id, c.tipo, c.tenant_id, c.pedido_id
  )
  SELECT t.id, t.tipo::text, t.tenant_id, g.slug, n.nombre_comercial::text, d.cliente_email::text, d.seguimiento_hash, e.cifrado
    FROM tomados t
    JOIN delivery_pedidos d ON d.id = t.pedido_id
    JOIN tenants n ON n.id = t.tenant_id
    LEFT JOIN tienda_config g ON g.tenant_id = t.tenant_id
    LEFT JOIN tienda_enlaces e ON e.pedido_id = t.pedido_id;
END;
$$;

-- Cómo le fue a un envío:
--   ENVIADO     salió;
--   OBSOLETO    el pedido ya no está en ese estado (o nunca debió avisarse): DESCARTADO;
--   SIN_CORREO  el pedido ya no tiene correo: DESCARTADO;
--   FALLO       no salió: se reintenta cuando toque; al cuarto intento fallido, MUERTO.
-- Solo sobre un renglón PENDIENTE. Devuelve el estado en que queda.
CREATE OR REPLACE FUNCTION tienda_correo_resultado(p_id bigint, p_resultado text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_estado text;
BEGIN
  IF p_resultado IS NULL OR p_resultado NOT IN ('ENVIADO', 'OBSOLETO', 'SIN_CORREO', 'FALLO') THEN
    RAISE EXCEPTION 'CORREO_RESULTADO_INVALIDO: %', COALESCE(left(p_resultado, 40), 'NULL');
  END IF;
  UPDATE tienda_correos
     SET estado = CASE WHEN p_resultado = 'ENVIADO' THEN 'ENVIADO'
                       WHEN p_resultado IN ('OBSOLETO', 'SIN_CORREO') THEN 'DESCARTADO'
                       WHEN intentos >= 4 THEN 'MUERTO'
                       ELSE estado END,
         enviado_at = CASE WHEN p_resultado = 'ENVIADO' THEN now() ELSE enviado_at END,
         motivo = CASE WHEN p_resultado = 'ENVIADO' THEN NULL WHEN p_resultado = 'FALLO' THEN 'ENVIO' ELSE p_resultado END
   WHERE id = p_id AND estado = 'PENDIENTE'
  RETURNING estado INTO v_estado;
  RETURN COALESCE(v_estado, (SELECT c.estado FROM tienda_correos c WHERE c.id = p_id));
END;
$$;

-- ── §4 El barrido de cada minuto ─────────────────────────────────────────────
--   1) caduca los pendientes a los que se les pasó el plazo (DESCARTADO / VENCIDO);
--   2) da por MUERTO el que gastó sus cuatro intentos y nunca reportó cómo le fue (la función murió);
--   3) limpia: enlaces de más de 48 horas y renglones de la cola de más de 30 días;
--   4) si hay algo que mandar, llama a la función `tienda-correos` (pg_net + Vault, como el barrido
--      de pagos). Sin pg_net o sin los secretos queda un renglón por hora en tienda_eventos.
-- Devuelve cuántos correos esperan envío.
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

  SELECT count(*)::integer INTO v_n FROM tienda_correos
   WHERE estado = 'PENDIENTE' AND intentos < 4 AND (proximo_intento_at IS NULL OR proximo_intento_at <= now());

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
  'Caduca los correos de estado de la tienda que ya no deben salir, limpia enlaces (48 h) y cola (30 días) y, si hay algo que mandar, llama a tienda-correos (pg_net). Cron cada minuto (nube). Devuelve cuántos esperan envío.';

-- ── Privilegios ──────────────────────────────────────────────────────────────
-- Nada para el público ni para el personal. Las internas y las de disparador, ni a service_role.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS firma, p.proname
             FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('tienda_enlace_guardar', 'tienda_correos_tomar', 'tienda_correo_resultado', 'tienda_correos_barrer',
                                '_tienda_correo_plazo', '_tienda_correo_encolar',
                                'delivery_pedidos_correo_de_estado', 'tienda_pagos_correo_de_devolucion')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.firma);
    IF f.proname LIKE 'tienda\_enlace%' OR f.proname LIKE 'tienda\_correo%' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.firma);
    ELSE
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM service_role', f.firma);
    END IF;
  END LOOP;
END $$;

-- Programación: solo donde pg_cron exista (Supabase nube). En la caja no se hace nada. Molde de 0173.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tienda-correos') THEN
      PERFORM cron.unschedule('tienda-correos');
    END IF;
    PERFORM cron.schedule('tienda-correos', '* * * * *', 'SELECT public.tienda_correos_barrer()');
  END IF;
END $$;
