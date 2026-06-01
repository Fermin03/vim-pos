-- 0002 — Núcleo comercial (tenants, planes, suscripciones, folios). Fuente: 1A §3, §3.9, §8.3.
-- ============================================================================
-- Orden de dependencias:
--   1) enums (§3.1)
--   2) planes (§3.2), addons (§3.3)                  → catálogos del sistema
--   3) tenants (§3.4)                                → depende de planes
--   4) suscripciones (§3.5), tenant_addons (§3.6),
--      tenant_feature_flags (§3.7)                   → dependen de tenants/planes/addons
--   5) calcular_dia_contable (§8.3)                  → depende de tenants
--   6) folios: enum + folios_paquetes (§3.9.1),
--      tenant_folios_saldo (§3.9.2),
--      folios_movimientos (§3.9.3),
--      consumir_folio_cfdi (§3.9.4)                  → dependen de tenants/folios_paquetes
--   7) RLS (§3.8, §3.9.5) + triggers updated_at (§8.5)
-- NOTA: current_tenant_id() y set_updated_at() ya existen en 0001; aquí NO se redefinen.
-- NOTA: los INSERT de seed (planes, addons, paquetes) los maneja seed.sql (otro agente).
-- ============================================================================


-- ============================================================================
-- §3.1 — Enums asociados
-- ============================================================================

-- Estado del tenant (negocio cliente)
CREATE TYPE tenant_estado AS ENUM (
  'TRIAL',         -- en periodo de prueba (Fase 3+)
  'ACTIVO',        -- suscripción al corriente
  'SUSPENDIDO',    -- pago vencido > 7 días
  'CANCELADO',     -- baja voluntaria o forzosa
  'INTERNO'        -- tenant de uso interno de VIM (Knock-Out en MVP)
);

-- Vertical principal del tenant (determina módulo por defecto)
CREATE TYPE vertical_tipo AS ENUM (
  'FOODTRUCK',
  'QUICK_SERVICE',
  'FULL_SERVICE',
  'CAFE_BAR',
  'DARK_KITCHEN',
  'ENTERPRISE'
);

-- Régimen fiscal SAT (subset relevante para restauranteros)
-- La lista completa se carga vía seed; estos son los más comunes
CREATE TYPE regimen_fiscal_sat AS ENUM (
  '601',  -- General de Ley Personas Morales
  '603',  -- Personas Morales con Fines no Lucrativos
  '605',  -- Sueldos y Salarios e Ingresos Asimilados a Salarios
  '612',  -- Personas Físicas con Actividades Empresariales y Profesionales
  '621',  -- Incorporación Fiscal
  '625',  -- Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas
  '626'   -- Régimen Simplificado de Confianza (RESICO)
);

-- Estado de una suscripción
CREATE TYPE suscripcion_estado AS ENUM (
  'ACTIVA',
  'PAUSADA',
  'CANCELADA',
  'EXPIRADA'
);


-- ============================================================================
-- §3.2 — Tabla `planes`
-- Catálogo de planes disponibles. Catálogo del sistema (no por tenant).
-- ============================================================================

CREATE TABLE planes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo              varchar(50) NOT NULL UNIQUE,        -- 'QS', 'FT', 'FS', 'CB', 'DK', 'ENT'
  nombre              varchar(100) NOT NULL,              -- 'Quick Service'
  descripcion         text,
  vertical            vertical_tipo NOT NULL,
  precio_mensual_mxn  numeric(10,2) NOT NULL CHECK (precio_mensual_mxn >= 0),

  -- Límites del plan (NULL = ilimitado)
  max_sucursales        integer NULL,
  max_cajas_por_sucursal integer NULL,
  max_usuarios          integer NULL,
  timbres_cfdi_mensuales integer NULL,                    -- folios base mensuales incluidos, NO acumulables (D96). Excedente vía paquetes prepagados

  -- Feature flags incluidos en el plan (qué módulos puede activar)
  -- Estructura: { "inventario_avanzado": true, "crm_pro": false, ... }
  features_incluidos  jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Visibilidad y disponibilidad
  visible_publico     boolean NOT NULL DEFAULT true,     -- ¿se muestra en página de precios?
  activo              boolean NOT NULL DEFAULT true,     -- ¿se puede contratar?
  orden_visualizacion integer NOT NULL DEFAULT 0,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE planes IS 'Catálogo de planes de suscripción. No tiene tenant_id porque es catálogo del sistema.';
COMMENT ON COLUMN planes.features_incluidos IS 'JSON con flags de módulos. La app lee esto al iniciar para decidir qué UI mostrar.';


-- ============================================================================
-- §3.3 — Tabla `addons`
-- Add-ons transversales que cualquier tenant puede contratar adicional a su plan.
-- ============================================================================

CREATE TABLE addons (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo              varchar(50) NOT NULL UNIQUE,        -- 'INV_AV', 'CRM_PRO', 'ANALITICA', etc.
  nombre              varchar(100) NOT NULL,
  descripcion         text,
  precio_mensual_mxn  numeric(10,2) NOT NULL CHECK (precio_mensual_mxn >= 0),

  -- Qué flags activa este add-on cuando está vigente
  features_activadas  jsonb NOT NULL DEFAULT '{}'::jsonb,

  visible_publico     boolean NOT NULL DEFAULT true,
  activo              boolean NOT NULL DEFAULT true,
  orden_visualizacion integer NOT NULL DEFAULT 0,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE addons IS 'Add-ons disponibles. Ej: Inventario Avanzado ($299), CRM Pro ($399), Analítica ($499).';


-- ============================================================================
-- §3.4 — Tabla `tenants`
-- El negocio cliente. Una fila por cada negocio que opera con VIM POS.
-- ============================================================================

CREATE TABLE tenants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identidad comercial
  codigo                varchar(50) NOT NULL UNIQUE,    -- slug: 'knockout', 'chickngo'
  nombre_comercial      varchar(150) NOT NULL,          -- 'Knock-Out Burger'
  estado                tenant_estado NOT NULL DEFAULT 'TRIAL',

  -- Datos fiscales (pueden estar vacíos en TRIAL; obligatorios para CFDI Fase Final)
  razon_social          varchar(255) NULL,
  rfc                   varchar(13) NULL,
  regimen_fiscal        regimen_fiscal_sat NULL,
  codigo_postal_fiscal  varchar(5) NULL,
  email_fiscal          citext NULL,                    -- para envío de facturas

  -- Vertical y plan vigente (denormalizado para lectura rápida)
  vertical_principal    vertical_tipo NOT NULL,
  plan_actual_id        uuid NULL REFERENCES planes(id),

  -- Contacto principal del negocio (usuario dueño)
  usuario_dueno_id      uuid NULL REFERENCES auth.users(id),

  -- Configuración global (denormalizada para acceso rápido sin join)
  timezone              varchar(50) NOT NULL DEFAULT 'America/Mexico_City',
  hora_cierre_dia_contable time NOT NULL DEFAULT '03:00:00',  -- §25.2

  -- Auditoría
  fecha_alta            timestamptz NOT NULL DEFAULT now(),
  fecha_baja            timestamptz NULL,
  motivo_baja           text NULL,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz NULL,

  CONSTRAINT rfc_formato_valido CHECK (
    rfc IS NULL OR rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'
  )
);

CREATE INDEX idx_tenants_codigo ON tenants(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_estado ON tenants(estado) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_vertical ON tenants(vertical_principal) WHERE deleted_at IS NULL;

COMMENT ON TABLE tenants IS 'Negocio cliente de VIM POS. Cada fila = un cliente del SaaS.';
COMMENT ON COLUMN tenants.codigo IS 'Slug único usado en subdominios, prefijos de folios, etc.';
COMMENT ON COLUMN tenants.hora_cierre_dia_contable IS '03:00 default (§25.2 del /core). Configurable por tenant.';


-- ============================================================================
-- §3.5 — Tabla `suscripciones`
-- Histórico de suscripciones del tenant. Una fila por cada periodo de contratación.
-- ============================================================================

CREATE TABLE suscripciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  plan_id             uuid NOT NULL REFERENCES planes(id),

  -- Periodo de vigencia
  fecha_inicio        date NOT NULL,
  fecha_fin           date NULL,                          -- NULL = vigente / indefinida
  estado              suscripcion_estado NOT NULL DEFAULT 'ACTIVA',

  -- Precio acordado (snapshot del precio al contratar — protege de cambios futuros)
  precio_mensual_mxn  numeric(10,2) NOT NULL CHECK (precio_mensual_mxn >= 0),
  ciclo_facturacion   varchar(20) NOT NULL DEFAULT 'MENSUAL',  -- MENSUAL | ANUAL
  descuento_porcentaje numeric(5,2) NOT NULL DEFAULT 0 CHECK (descuento_porcentaje BETWEEN 0 AND 100),

  -- Próximo cobro
  proxima_fecha_cobro date NULL,
  ultima_fecha_cobro  date NULL,

  -- Notas comerciales
  notas               text NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT periodo_valido CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE INDEX idx_suscripciones_tenant ON suscripciones(tenant_id);
CREATE INDEX idx_suscripciones_activas ON suscripciones(tenant_id, estado) WHERE estado = 'ACTIVA';
CREATE INDEX idx_suscripciones_proximo_cobro ON suscripciones(proxima_fecha_cobro) WHERE estado = 'ACTIVA';

COMMENT ON TABLE suscripciones IS 'Histórico de contrataciones. Una fila por cada periodo (cambio de plan = nueva fila).';


-- ============================================================================
-- §3.6 — Tabla `tenant_addons`
-- Add-ons activos para cada tenant.
-- ============================================================================

CREATE TABLE tenant_addons (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  addon_id            uuid NOT NULL REFERENCES addons(id),

  fecha_inicio        date NOT NULL,
  fecha_fin           date NULL,
  activo              boolean NOT NULL DEFAULT true,
  precio_mensual_mxn  numeric(10,2) NOT NULL CHECK (precio_mensual_mxn >= 0),

  notas               text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- No puede haber 2 add-ons del mismo tipo activos al mismo tiempo
  CONSTRAINT addon_unico_activo UNIQUE (tenant_id, addon_id, fecha_inicio)
);

CREATE INDEX idx_tenant_addons_vigentes ON tenant_addons(tenant_id) WHERE activo = true;


-- ============================================================================
-- §3.7 — Tabla `tenant_feature_flags`
-- Overrides individuales de features por tenant.
-- ============================================================================

CREATE TABLE tenant_feature_flags (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag_codigo     varchar(100) NOT NULL,     -- 'beta_kds', 'cfdi_activo', etc.
  activado        boolean NOT NULL DEFAULT true,

  -- Vigencia opcional (NULL = sin vencimiento)
  fecha_inicio    timestamptz NOT NULL DEFAULT now(),
  fecha_fin       timestamptz NULL,

  -- Quién y por qué
  motivo          text NULL,
  activado_por    uuid REFERENCES auth.users(id),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT flag_unico_por_tenant UNIQUE (tenant_id, flag_codigo)
);

CREATE INDEX idx_tenant_flags_lookup ON tenant_feature_flags(tenant_id, flag_codigo);

COMMENT ON TABLE tenant_feature_flags IS 'Overrides de feature flags por tenant. Combina con planes.features_incluidos.';


-- ============================================================================
-- §8.3 — Función `calcular_dia_contable(tenant_id, ts)`
-- Depende de tenants. Calcula a qué día contable pertenece una fecha/hora (§25.3).
-- ============================================================================

CREATE OR REPLACE FUNCTION calcular_dia_contable(
  p_tenant_id uuid,
  p_ts timestamptz DEFAULT now()
) RETURNS date
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_hora_cierre time;
  v_tz          text;
  v_ts_local    timestamp;
BEGIN
  SELECT t.hora_cierre_dia_contable, t.timezone
  INTO v_hora_cierre, v_tz
  FROM tenants t
  WHERE t.id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant % no existe', p_tenant_id;
  END IF;

  -- Convertir a timezone del negocio
  v_ts_local := p_ts AT TIME ZONE v_tz;

  -- Si la hora local es anterior a la hora de cierre, pertenece al día anterior
  IF v_ts_local::time < v_hora_cierre THEN
    RETURN (v_ts_local::date - INTERVAL '1 day')::date;
  ELSE
    RETURN v_ts_local::date;
  END IF;
END;
$$;

COMMENT ON FUNCTION calcular_dia_contable IS 'Día contable según hora de cierre del negocio (§25.3). Inmutable una vez asignado (D7).';


-- ============================================================================
-- §3.9.1 — Enum y tabla `folios_paquetes` (catálogo del sistema)
-- ============================================================================

CREATE TYPE folio_movimiento_tipo AS ENUM (
  'BASE_RESET',        -- crédito de base mensual al iniciar periodo contable (no acumulable)
  'CONSUMO_BASE',      -- timbrado descontado de la base mensual
  'COMPRA_PAQUETE',    -- alta de folios por compra de paquete prepagado
  'CONSUMO_PAQUETE',   -- timbrado descontado del saldo prepagado
  'AJUSTE_MANUAL'      -- corrección por soporte VIM (service_role)
);

-- Catálogo de paquetes disponibles. Como planes/addons: sin tenant_id, lectura pública.
CREATE TABLE folios_paquetes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo              varchar(50) NOT NULL UNIQUE,        -- 'PACK_100', 'PACK_1000'
  nombre              varchar(100) NOT NULL,              -- 'Paquete 100 folios'
  cantidad_folios     integer NOT NULL CHECK (cantidad_folios > 0),
  precio_mxn          numeric(10,2) NOT NULL CHECK (precio_mxn >= 0),
  -- Precio unitario derivado, almacenado para mostrar en UI (precio_mxn / cantidad_folios)
  precio_por_folio    numeric(8,4) NOT NULL CHECK (precio_por_folio >= 0),

  visible_publico     boolean NOT NULL DEFAULT true,
  activo              boolean NOT NULL DEFAULT true,
  orden_visualizacion integer NOT NULL DEFAULT 0,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE folios_paquetes IS 'Catálogo de paquetes de folios CFDI prepagados. Sin tenant_id (catálogo del sistema). Seed en §9.x.';


-- ============================================================================
-- §3.9.2 — Tabla `tenant_folios_saldo` (1:1 con tenant)
-- Estado vigente de folios de cada tenant. Una fila por tenant.
-- ============================================================================

CREATE TABLE tenant_folios_saldo (
  tenant_id               uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

  -- Base mensual (no acumulable): cuántos da el plan y cuántos van consumidos este periodo
  folios_base_mensuales   integer NOT NULL DEFAULT 0 CHECK (folios_base_mensuales >= 0),
  folios_base_consumidos  integer NOT NULL DEFAULT 0 CHECK (folios_base_consumidos >= 0),
  periodo_actual          date NOT NULL,                  -- mes contable vigente (primer día del periodo)

  -- Saldo de paquetes prepagados (persistente, no expira mientras suscripción activa)
  saldo_paquetes          integer NOT NULL DEFAULT 0 CHECK (saldo_paquetes >= 0),

  -- Umbral para alerta de saldo bajo y bandera de autorecarga
  umbral_alerta           integer NOT NULL DEFAULT 20 CHECK (umbral_alerta >= 0),
  autorecarga_activa      boolean NOT NULL DEFAULT false,
  autorecarga_paquete_id  uuid NULL REFERENCES folios_paquetes(id),

  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenant_folios_saldo IS 'Saldo vigente de folios CFDI por tenant. Base mensual no acumulable + paquetes prepagados. D96.';
COMMENT ON COLUMN tenant_folios_saldo.folios_base_consumidos IS 'Se resetea a 0 al cambiar periodo_actual (ver consumir_folio_cfdi).';


-- ============================================================================
-- §3.9.3 — Tabla `folios_movimientos` (ledger universal — patrón D23)
-- Bitácora inmutable de cada movimiento de folios.
-- ============================================================================

CREATE TABLE folios_movimientos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  tipo                folio_movimiento_tipo NOT NULL,
  cantidad            integer NOT NULL,                   -- positivo (crédito) o negativo (consumo)

  -- Trazabilidad del origen
  paquete_id          uuid NULL REFERENCES folios_paquetes(id),  -- si tipo = COMPRA_PAQUETE
  cfdi_id             uuid NULL,                          -- si CONSUMO_* (FK lógica a tickets_cfdi de 1C.2)
  precio_pagado_mxn   numeric(10,2) NULL,                 -- si COMPRA_PAQUETE

  -- Snapshot del saldo de paquetes después del movimiento (auditoría)
  saldo_paquetes_resultante integer NOT NULL,

  dia_contable        date NOT NULL,                      -- D7
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_folios_mov_tenant_fecha ON folios_movimientos(tenant_id, created_at DESC);
CREATE INDEX idx_folios_mov_tipo ON folios_movimientos(tenant_id, tipo);

COMMENT ON TABLE folios_movimientos IS 'Ledger inmutable de movimientos de folios CFDI. Balance auditable. D96 + patrón D23.';


-- ============================================================================
-- §3.9.4 — Función `consumir_folio_cfdi(tenant_id, cfdi_id)`
-- Aplica el orden de consumo (base mensual → paquetes) y el reset de periodo.
-- ============================================================================

CREATE OR REPLACE FUNCTION consumir_folio_cfdi(
  p_tenant_id  uuid,
  p_cfdi_id    uuid,
  p_es_global  boolean DEFAULT false   -- la factura global tiene tolerancia (ver abajo)
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_saldo      tenant_folios_saldo%ROWTYPE;
  v_periodo    date := date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City'))::date;
  v_fuente     text;
BEGIN
  SELECT * INTO v_saldo FROM tenant_folios_saldo WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant % sin fila de saldo de folios', p_tenant_id;
  END IF;

  -- Reset de base mensual si cambió el periodo (no acumulable)
  IF v_saldo.periodo_actual < v_periodo THEN
    UPDATE tenant_folios_saldo
       SET folios_base_consumidos = 0, periodo_actual = v_periodo, updated_at = now()
     WHERE tenant_id = p_tenant_id;
    INSERT INTO folios_movimientos(tenant_id, tipo, cantidad, saldo_paquetes_resultante, dia_contable)
    VALUES (p_tenant_id, 'BASE_RESET', v_saldo.folios_base_mensuales, v_saldo.saldo_paquetes, v_periodo);
    v_saldo.folios_base_consumidos := 0;
  END IF;

  -- 1) Consumir de la base mensual si queda
  IF v_saldo.folios_base_consumidos < v_saldo.folios_base_mensuales THEN
    UPDATE tenant_folios_saldo
       SET folios_base_consumidos = folios_base_consumidos + 1, updated_at = now()
     WHERE tenant_id = p_tenant_id;
    INSERT INTO folios_movimientos(tenant_id, tipo, cantidad, cfdi_id, saldo_paquetes_resultante, dia_contable)
    VALUES (p_tenant_id, 'CONSUMO_BASE', -1, p_cfdi_id, v_saldo.saldo_paquetes, CURRENT_DATE);
    v_fuente := 'BASE';

  -- 2) Si no, consumir del saldo de paquetes
  ELSIF v_saldo.saldo_paquetes > 0 THEN
    UPDATE tenant_folios_saldo
       SET saldo_paquetes = saldo_paquetes - 1, updated_at = now()
     WHERE tenant_id = p_tenant_id;
    INSERT INTO folios_movimientos(tenant_id, tipo, cantidad, cfdi_id, saldo_paquetes_resultante, dia_contable)
    VALUES (p_tenant_id, 'CONSUMO_PAQUETE', -1, p_cfdi_id, v_saldo.saldo_paquetes - 1, CURRENT_DATE);
    v_fuente := 'PAQUETE';

  -- 3) Sin folios: la factura global se permite igual (cumplimiento SAT no se bloquea);
  --    el timbrado individual sí se bloquea y la UI obliga a comprar paquete.
  ELSE
    IF p_es_global THEN
      INSERT INTO folios_movimientos(tenant_id, tipo, cantidad, cfdi_id, saldo_paquetes_resultante, dia_contable)
      VALUES (p_tenant_id, 'CONSUMO_PAQUETE', -1, p_cfdi_id, -1, CURRENT_DATE);  -- saldo negativo tolerado solo para global
      v_fuente := 'GLOBAL_TOLERADO';
    ELSE
      RETURN jsonb_build_object('ok', false, 'motivo', 'SIN_FOLIOS',
        'mensaje', 'Sin folios disponibles. Compra un paquete para seguir facturando.');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'fuente', v_fuente);
END;
$$;

COMMENT ON FUNCTION consumir_folio_cfdi IS 'Descuenta 1 folio al timbrar. Orden: base mensual → paquetes. Global tolera saldo negativo para no romper cumplimiento SAT. D96.';


-- ============================================================================
-- §3.8 — RLS y políticas (tenants, planes, suscripciones, etc.)
-- ============================================================================

-- planes y addons: lectura pública, escritura solo service_role
ALTER TABLE planes ENABLE ROW LEVEL SECURITY;
CREATE POLICY planes_select_publico ON planes FOR SELECT USING (true);

ALTER TABLE addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY addons_select_publico ON addons FOR SELECT USING (true);

-- tenants: solo el propio tenant
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_select_propio ON tenants FOR SELECT
  USING (id = (auth.jwt() ->> 'tenant_id')::uuid AND deleted_at IS NULL);

-- suscripciones, tenant_addons, tenant_feature_flags
ALTER TABLE suscripciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY suscripciones_select_tenant ON suscripciones FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE tenant_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_addons_select_tenant ON tenant_addons FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE tenant_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_flags_select_tenant ON tenant_feature_flags FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);


-- ============================================================================
-- §3.9.5 — RLS de las tablas de folios
-- ============================================================================

-- folios_paquetes: catálogo, lectura pública
ALTER TABLE folios_paquetes ENABLE ROW LEVEL SECURITY;
CREATE POLICY folios_paquetes_select_publico ON folios_paquetes FOR SELECT USING (true);

-- tenant_folios_saldo y folios_movimientos: solo el propio tenant (lectura)
ALTER TABLE tenant_folios_saldo ENABLE ROW LEVEL SECURITY;
CREATE POLICY folios_saldo_select_tenant ON tenant_folios_saldo FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE folios_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY folios_mov_select_tenant ON folios_movimientos FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Escritura (compra de paquete, ajustes) solo vía funciones SECURITY DEFINER / service_role:
-- la app nunca hace INSERT directo al ledger ni UPDATE al saldo.


-- ============================================================================
-- Triggers updated_at (§8.5) — usan set_updated_at() definido en 0001.
-- Solo para las tablas de esta migración que tienen columna updated_at.
-- ============================================================================

CREATE TRIGGER trg_planes_updated_at
  BEFORE UPDATE ON planes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_addons_updated_at
  BEFORE UPDATE ON addons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_suscripciones_updated_at
  BEFORE UPDATE ON suscripciones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tenant_addons_updated_at
  BEFORE UPDATE ON tenant_addons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tenant_feature_flags_updated_at
  BEFORE UPDATE ON tenant_feature_flags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_folios_paquetes_updated_at
  BEFORE UPDATE ON folios_paquetes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tenant_folios_saldo_updated_at
  BEFORE UPDATE ON tenant_folios_saldo
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
