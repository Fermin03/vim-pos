-- ============================================================================
-- 0082 — La factura global (fase 6 del CFDI).
--
-- Un negocio no emite una factura por cada taco: emite UNA que ampara todas las ventas del periodo
-- en las que nadie pidió comprobante. Eso rompe el supuesto con el que nació `tickets_cfdi`, que
-- era 1 CFDI ↔ 1 ticket.
--
-- LA COORDINACIÓN QUE IMPORTA
--
-- En cuanto se timbra la global de un periodo, los tickets de ese periodo DEJAN de poder
-- autofacturarse: ya están amparados. Si esa coordinación falla, o se factura dos veces la misma
-- venta —problema del cliente ante el SAT— o el comensal se queda sin poder facturar. Por eso el
-- estado del periodo vive en su propia tabla y no se deduce de mirar los CFDI.
--
-- Y OJO CON LA VENTANA: no es "el mes en curso". El comensal puede facturar hasta que se emita la
-- global de SU periodo, y el periodo lo declara cada negocio (diario, semanal, quincenal, mensual
-- o bimestral). Un negocio que cierra a diario deja de aceptar la factura del ticket de ayer.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Un CFDI puede no colgar de un solo ticket.
--
-- `ticket_id` pasa a nullable SOLO para las globales; el CHECK impide que un CFDI normal se quede
-- huérfano por accidente. El índice único que evita el doble timbrado de un ticket sigue intacto:
-- Postgres no considera iguales dos NULL, así que las globales no chocan entre sí.
-- ---------------------------------------------------------------------------
ALTER TABLE tickets_cfdi ALTER COLUMN ticket_id DROP NOT NULL;

ALTER TABLE tickets_cfdi
  ADD COLUMN IF NOT EXISTS es_global boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE tickets_cfdi ADD CONSTRAINT global_sin_ticket CHECK (
    (es_global = false AND ticket_id IS NOT NULL)
    OR (es_global = true AND ticket_id IS NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN tickets_cfdi.es_global IS
  'TRUE = ampara N tickets del periodo (ver cfdi_global_tickets). Su ticket_id es NULL por definición.';

-- ---------------------------------------------------------------------------
-- Qué tickets ampara cada global.
--
-- Sin esto no se puede contestar la única pregunta que el portal de autofactura necesita: "¿este
-- ticket ya está en una global?". Y sin poder contestarla, la alternativa es adivinar por fechas,
-- que falla justo en los bordes del periodo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cfdi_global_tickets (
  cfdi_id    uuid NOT NULL REFERENCES tickets_cfdi(id) ON DELETE CASCADE,
  ticket_id  uuid NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cfdi_id, ticket_id)
);

-- Un ticket no puede estar en dos globales: sería declararlo dos veces ante el SAT.
CREATE UNIQUE INDEX IF NOT EXISTS idx_global_tickets_uno_por_ticket
  ON cfdi_global_tickets(ticket_id);
CREATE INDEX IF NOT EXISTS idx_global_tickets_tenant ON cfdi_global_tickets(tenant_id);

ALTER TABLE cfdi_global_tickets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY global_tickets_select_tenant ON cfdi_global_tickets FOR SELECT
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Los periodos y su estado.
--
-- Es la tabla que consulta el portal público. Tres estados y ninguno más:
--   ABIERTO    — se siguen acumulando ventas; el comensal SÍ puede autofacturar.
--   EN_PROCESO — se está timbrando ahora mismo.
--   TIMBRADA   — la global salió; los tickets quedan amparados y ya NO se autofacturan.
--   ERROR      — se intentó y falló. Sigue bloqueando la autofactura a propósito: reabrirla podría
--                dejar una venta facturada dos veces cuando el reintento funcione.
--
-- EN_PROCESO no es un adorno: timbrar una global de un mes cargado tarda medio minuto —medido, 37
-- segundos con 5000 conceptos— y en esa ventana caben de sobra un segundo clic impaciente y un
-- comensal autofacturando el ticket que la global está a punto de amparar. El estado cierra las
-- dos puertas mientras dura.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cfdi_periodos_globales (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  periodicidad  varchar(2) NOT NULL,
  desde         date NOT NULL,
  hasta         date NOT NULL,
  estado        varchar(12) NOT NULL DEFAULT 'ABIERTO',
  cfdi_id       uuid NULL REFERENCES tickets_cfdi(id),
  n_tickets     integer NOT NULL DEFAULT 0,
  total_mxn     numeric(12,2) NOT NULL DEFAULT 0,
  cerrado_at    timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT periodo_coherente CHECK (hasta >= desde),
  CONSTRAINT periodo_estado_valido CHECK (estado IN ('ABIERTO', 'EN_PROCESO', 'TIMBRADA', 'ERROR'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_periodos_globales_unico
  ON cfdi_periodos_globales(tenant_id, desde, hasta);
CREATE INDEX IF NOT EXISTS idx_periodos_globales_estado
  ON cfdi_periodos_globales(tenant_id, estado, hasta DESC);

ALTER TABLE cfdi_periodos_globales ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY periodos_globales_select_tenant ON cfdi_periodos_globales FOR SELECT
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_periodos_globales_updated_at
    BEFORE UPDATE ON cfdi_periodos_globales
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Los límites del periodo que contiene una fecha.
--
-- Función PURA, para que el POS, el panel y el portal calculen el mismo periodo sin ponerse de
-- acuerdo. Las convenciones donde el SAT no manda quedan aquí y no repartidas por el código:
--   · Semanal   → lunes a domingo (ISO). El SAT no lo define; se elige una y se documenta.
--   · Quincenal → 1–15 y 16–fin de mes, que es como factura todo el mundo en México.
--   · Bimestral → bloques desde enero (ene-feb, mar-abr…), que es como los numera el SAT.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION periodo_global_de(p_periodicidad varchar, p_fecha date)
RETURNS TABLE (desde date, hasta date)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_mes  integer := EXTRACT(MONTH FROM p_fecha);
  v_ini  date;
BEGIN
  CASE p_periodicidad
    WHEN '01' THEN                                    -- diario
      RETURN QUERY SELECT p_fecha, p_fecha;
    WHEN '02' THEN                                    -- semanal (lunes a domingo)
      v_ini := date_trunc('week', p_fecha)::date;
      RETURN QUERY SELECT v_ini, (v_ini + 6);
    WHEN '03' THEN                                    -- quincenal
      IF EXTRACT(DAY FROM p_fecha) <= 15 THEN
        RETURN QUERY SELECT date_trunc('month', p_fecha)::date,
                            (date_trunc('month', p_fecha)::date + 14);
      ELSE
        RETURN QUERY SELECT (date_trunc('month', p_fecha)::date + 15),
                            (date_trunc('month', p_fecha) + interval '1 month - 1 day')::date;
      END IF;
    WHEN '05' THEN                                    -- bimestral (ene-feb, mar-abr…)
      v_ini := make_date(EXTRACT(YEAR FROM p_fecha)::int, ((v_mes - 1) / 2) * 2 + 1, 1);
      RETURN QUERY SELECT v_ini, (v_ini + interval '2 months - 1 day')::date;
    ELSE                                              -- '04' mensual y cualquier valor raro
      RETURN QUERY SELECT date_trunc('month', p_fecha)::date,
                          (date_trunc('month', p_fecha) + interval '1 month - 1 day')::date;
  END CASE;
END;
$$;

COMMENT ON FUNCTION periodo_global_de IS
  'Límites del periodo de factura global que contiene una fecha, según c_Periodicidad del SAT.';

-- ---------------------------------------------------------------------------
-- ¿Este ticket todavía se puede autofacturar?
--
-- Es LA pregunta del portal público, y por eso vive en la base y no en la app: la contestan el
-- portal, el POS y el panel, y tres respuestas distintas serían tres formas de facturar dos veces.
--
-- Tres condiciones: el ticket está pagado, no tiene ya un CFDI propio vigente, y su periodo no se
-- ha cerrado con una global.
--
-- SECURITY DEFINER porque el portal pregunta SIN sesión — quien escanea el QR no es usuario de
-- nada. Devuelve solo un booleano, ningún dato del negocio.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ticket_autofacturable(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ticket   tickets%ROWTYPE;
  v_period   varchar(2);
  v_desde    date;
  v_hasta    date;
BEGIN
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND OR v_ticket.estado_fiscal <> 'PAGADO' THEN RETURN false; END IF;

  -- ¿Ya tiene factura propia?
  IF EXISTS (
    SELECT 1 FROM tickets_cfdi
     WHERE ticket_id = p_ticket_id
       AND tipo_comprobante = 'INGRESO'
       AND estado_sat IN ('TIMBRADO', 'EN_PROCESO_CANCELACION')
  ) THEN RETURN false; END IF;

  -- ¿Ya lo ampara una global?
  IF EXISTS (SELECT 1 FROM cfdi_global_tickets WHERE ticket_id = p_ticket_id) THEN
    RETURN false;
  END IF;

  -- ¿Se cerró el periodo al que pertenece?
  SELECT COALESCE(e.periodicidad_global, '04') INTO v_period
    FROM tenant_cfdi_emisor e WHERE e.tenant_id = v_ticket.tenant_id;
  SELECT p.desde, p.hasta INTO v_desde, v_hasta
    FROM periodo_global_de(COALESCE(v_period, '04'), v_ticket.dia_contable) p;

  RETURN NOT EXISTS (
    SELECT 1 FROM cfdi_periodos_globales
     WHERE tenant_id = v_ticket.tenant_id
       AND desde = v_desde AND hasta = v_hasta
       AND estado IN ('EN_PROCESO', 'TIMBRADA', 'ERROR')
  );
END;
$$;

COMMENT ON FUNCTION ticket_autofacturable IS
  'TRUE si el comensal todavía puede facturar este ticket: pagado, sin CFDI propio y con su periodo global abierto.';

REVOKE EXECUTE ON FUNCTION ticket_autofacturable(uuid) FROM public;
GRANT EXECUTE ON FUNCTION ticket_autofacturable(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Los tickets que le tocan a la global de un periodo.
--
-- Pagados, dentro del periodo y sin CFDI propio vigente. Se excluyen también los ya amparados por
-- otra global, que no debería pasar pero cuesta una línea comprobarlo y evita declarar dos veces
-- la misma venta si alguien cierra un periodo solapado a mano.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tickets_de_periodo_global(p_tenant_id uuid, p_desde date, p_hasta date)
RETURNS TABLE (ticket_id uuid, folio varchar, total_mxn numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT t.id, t.folio_completo, t.total_mxn
    FROM tickets t
   WHERE t.tenant_id = p_tenant_id
     AND t.dia_contable BETWEEN p_desde AND p_hasta
     AND t.estado_fiscal = 'PAGADO'
     AND NOT EXISTS (
       SELECT 1 FROM tickets_cfdi c
        WHERE c.ticket_id = t.id
          AND c.tipo_comprobante = 'INGRESO'
          AND c.estado_sat IN ('TIMBRADO', 'EN_PROCESO_CANCELACION')
     )
     AND NOT EXISTS (SELECT 1 FROM cfdi_global_tickets g WHERE g.ticket_id = t.id)
   ORDER BY t.dia_contable, t.folio_completo;
$$;

-- ---------------------------------------------------------------------------
-- Escritura para el admin del negocio.
--
-- Mismo patrón que 0026 con `tenant_cfdi_emisor`: la Edge Function que timbra la global corre con
-- el JWT de quien la pide, no con `service_role`. Así el RLS sigue siendo la última palabra sobre
-- qué tenant se toca, en vez de depender de que la función acierte con el `tenant_id`.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE POLICY periodos_globales_insert_admin ON cfdi_periodos_globales
    FOR INSERT TO authenticated
    WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid AND es_admin_del_tenant(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY periodos_globales_update_admin ON cfdi_periodos_globales
    FOR UPDATE TO authenticated
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid AND es_admin_del_tenant(tenant_id))
    WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid AND es_admin_del_tenant(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY global_tickets_insert_admin ON cfdi_global_tickets
    FOR INSERT TO authenticated
    WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid AND es_admin_del_tenant(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Toma el periodo para timbrarlo, o se niega.
--
-- Es un `UPDATE ... WHERE estado = 'ABIERTO'` deliberado, no un SELECT seguido de un UPDATE: la
-- condición y el cambio ocurren en la misma sentencia, así que de dos peticiones simultáneas solo
-- una encuentra la fila abierta y la otra recibe cero filas. Es el candado que evita timbrar dos
-- veces el mismo periodo durante el medio minuto que tarda.
--
-- Crea la fila si el periodo aún no existe: los periodos no se dan de alta por adelantado, nacen
-- cuando alguien los cierra.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cfdi_tomar_periodo_global(
  p_tenant_id uuid, p_periodicidad varchar, p_desde date, p_hasta date
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO cfdi_periodos_globales (tenant_id, periodicidad, desde, hasta, estado)
  VALUES (p_tenant_id, p_periodicidad, p_desde, p_hasta, 'ABIERTO')
  ON CONFLICT (tenant_id, desde, hasta) DO NOTHING;

  UPDATE cfdi_periodos_globales
     SET estado = 'EN_PROCESO', updated_at = now()
   WHERE tenant_id = p_tenant_id AND desde = p_desde AND hasta = p_hasta
     AND estado IN ('ABIERTO', 'ERROR')
  RETURNING id INTO v_id;

  RETURN v_id;   -- NULL = alguien más lo tomó, o ya está timbrado
END;
$$;

COMMENT ON FUNCTION cfdi_tomar_periodo_global IS
  'Marca el periodo EN_PROCESO si estaba abierto. Devuelve NULL si ya lo tomó otro: es el candado anti doble timbrado.';
