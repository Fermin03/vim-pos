-- ============================================================================
-- 0084 — Los prospectos que llegan por el sitio web.
--
-- POR QUÉ UNA TABLA Y NO UN CORREO
--
-- La versión anterior del plan del sitio mandaba el formulario por SMTP y ahí se acababa. Un
-- correo entre otros cincuenta se pierde, y un lead perdido cuesta más que todo el sitio. Aquí
-- la fila es la fuente de verdad y el correo es solo el aviso: si el correo falla, el prospecto
-- sigue estando.
--
-- ESTA TABLA NO TIENE tenant_id, Y ES A PROPÓSITO
--
-- Todo lo operativo lleva `tenant_id` + RLS por negocio (regla dura 1 de CLAUDE.md). Un prospecto
-- todavía no es un negocio: es alguien que llenó un formulario y a quien no le corresponde
-- ningún tenant. Por eso el aislamiento aquí no es por negocio sino total — la política de RLS
-- niega a todo el mundo, y solo `service_role` (la Edge Function y `/platform`, ambos del lado
-- servidor) toca la tabla. Con la llave pública no se lee ni se escribe nada.
--
-- Es importante que quede escrito: alguien que vea "tabla sin tenant_id" en una revisión futura
-- debe encontrar aquí el motivo, no asumir que se olvidó.
--
-- DATOS PERSONALES
--
-- Nombre y WhatsApp de una persona física identificable. El aviso de privacidad del sitio
-- (`sitio-web/aviso-privacidad.html`) declara esta finalidad —contactar para agendar una demo— y
-- `borrar_prospectos_viejos()` existe para poder cumplir el principio de no guardarlos más de lo
-- necesario.
-- ============================================================================

CREATE TABLE IF NOT EXISTS prospectos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lo que llena la persona. `nombre` y `whatsapp` son lo mínimo para devolver el contacto.
  nombre        text        NOT NULL CHECK (length(trim(nombre)) BETWEEN 2 AND 120),
  whatsapp      text        NOT NULL CHECK (length(regexp_replace(whatsapp, '\D', '', 'g')) BETWEEN 10 AND 15),
  negocio       text        NOT NULL CHECK (length(trim(negocio)) BETWEEN 2 AND 150),

  -- Las dos preguntas que deciden el plan y si la cuenta se sostiene sola. Sin ellas la llamada
  -- empieza a ciegas, así que van obligatorias aunque cuesten una fricción en el formulario.
  cajas         smallint    NOT NULL CHECK (cajas BETWEEN 1 AND 99),
  sucursales    smallint    NOT NULL CHECK (sucursales BETWEEN 1 AND 99),

  -- El giro usa la misma lista que `tenants.vertical_principal`, para que al convertirlo en
  -- cliente no haya que traducir nada. Se guarda como texto y no como el enum: si mañana el enum
  -- cambia, un prospecto viejo no debe bloquear la migración.
  giro          text        NULL CHECK (giro IS NULL OR giro IN
                  ('FOODTRUCK','QUICK_SERVICE','FULL_SERVICE','CAFE_BAR','DARK_KITCHEN','ENTERPRISE')),

  usa_hoy       text        NULL CHECK (usa_hoy IS NULL OR length(usa_hoy) <= 300),
  mensaje       text        NULL CHECK (mensaje IS NULL OR length(mensaje) <= 1000),

  -- De dónde vino. `origen` es la página; los `utm_*` solo se llenan si la visita traía campaña.
  origen        text        NOT NULL DEFAULT 'sitio-web' CHECK (length(origen) <= 60),
  utm_source    text        NULL CHECK (utm_source IS NULL OR length(utm_source) <= 100),
  utm_campaign  text        NULL CHECK (utm_campaign IS NULL OR length(utm_campaign) <= 100),

  -- Seguimiento comercial. El estado es corto a propósito: esto es una bandeja de entrada, no un
  -- CRM. En cuanto haga falta más de esto, el prospecto ya debería ser un tenant.
  estado        text        NOT NULL DEFAULT 'NUEVO'
                  CHECK (estado IN ('NUEVO','CONTACTADO','DEMO_AGENDADA','GANADO','PERDIDO','SPAM')),
  notas         text        NULL,
  atendido_en   timestamptz NULL,

  creado_en     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE prospectos IS
  'Formulario de demo del sitio público. Sin tenant_id a propósito: un prospecto todavía no es un negocio. RLS niega a todos; solo service_role lo toca.';
COMMENT ON COLUMN prospectos.cajas IS
  'Cuántas cajas dice tener. Junto con sucursales decide el escalón de plan que se le ofrece.';
COMMENT ON COLUMN prospectos.giro IS
  'Misma lista que tenants.vertical_principal, guardada como texto para que un prospecto viejo no bloquee un cambio del enum.';

-- El listado de /platform siempre pide lo nuevo primero.
CREATE INDEX IF NOT EXISTS idx_prospectos_creado ON prospectos (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_prospectos_pendientes
  ON prospectos (creado_en DESC) WHERE estado = 'NUEVO';

-- ---------------------------------------------------------------------------
-- RLS: cerrada del todo.
--
-- Sin ninguna política, RLS habilitado ya niega a `anon` y a `authenticated`. Se deja explícito
-- con una política que no admite a nadie para que se lea como una decisión y no como un olvido —
-- la diferencia importa cuando alguien revisa la tabla dentro de un año. `service_role` salta RLS
-- por definición, que es como entran la Edge Function y /platform.
-- ---------------------------------------------------------------------------
ALTER TABLE prospectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospectos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospectos_nadie ON prospectos;
CREATE POLICY prospectos_nadie ON prospectos
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

REVOKE ALL ON prospectos FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retención.
--
-- No se borra solo: no hay cron en este proyecto y un borrado automático de leads sería una
-- sorpresa desagradable. La función existe para poder ejecutarla a mano —o desde /platform— y
-- para que el aviso de privacidad pueda prometer un plazo con algo detrás.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION borrar_prospectos_viejos(p_meses int DEFAULT 24)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_borrados integer;
BEGIN
  IF p_meses < 1 THEN
    RAISE EXCEPTION 'El plazo mínimo es de un mes (se pidió %)', p_meses;
  END IF;

  -- Los ganados no se tocan: ésos ya son historia comercial del negocio, no un contacto en frío.
  DELETE FROM prospectos
   WHERE creado_en < now() - make_interval(months => p_meses)
     AND estado <> 'GANADO';

  GET DIAGNOSTICS v_borrados = ROW_COUNT;
  RETURN v_borrados;
END;
$$;

COMMENT ON FUNCTION borrar_prospectos_viejos(int) IS
  'Borra prospectos con más de N meses, salvo los GANADOS. Se ejecuta a mano; sostiene el plazo que promete el aviso de privacidad.';

REVOKE ALL ON FUNCTION borrar_prospectos_viejos(int) FROM PUBLIC, anon, authenticated;
