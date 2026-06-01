-- 0013 — CFDI orquestación (cola en tickets_cfdi + tenant_cfdi_emisor). Fuente: doc 13 §2.2, §7.2.
-- NOTA: tickets_cfdi se crea en 0009 (1C.2 §6); tenants en 0002. set_updated_at() ya existe en 0001.

-- ── §2.2 Columnas de control (extensión a tickets_cfdi) ──────────────────────

-- Aditivo a tickets_cfdi (1C.2 §6). Si alguna ya existe, omitir.
ALTER TABLE tickets_cfdi
  ADD COLUMN IF NOT EXISTS intentos            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proximo_reintento_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ultimo_error_codigo  varchar(50) NULL,
  ADD COLUMN IF NOT EXISTS ultimo_error_msg     text NULL,
  ADD COLUMN IF NOT EXISTS error_es_permanente  boolean NOT NULL DEFAULT false;

-- Índice que define "qué está listo para timbrar"
CREATE INDEX IF NOT EXISTS idx_cfdi_cola_pendiente
  ON tickets_cfdi (tenant_id, proximo_reintento_at)
  WHERE estado_sat IN ('BORRADOR','ERROR_TIMBRADO')
    AND error_es_permanente = false;

-- ── §7.2 Tabla de referencia del emisor (mínima) + RLS ───────────────────────

CREATE TABLE tenant_cfdi_emisor (
  tenant_id          uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  rfc                varchar(13) NOT NULL,
  facturama_issuer_ref varchar(100) NOT NULL,        -- handle del emisor en Facturama
  csd_vigencia_hasta date NULL,                       -- para alertar antes de que venza
  estado             varchar(20) NOT NULL DEFAULT 'ACTIVO',  -- ACTIVO | CSD_VENCIDO | SUSPENDIDO
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_cfdi_emisor ENABLE ROW LEVEL SECURITY;
CREATE POLICY cfdi_emisor_select_tenant ON tenant_cfdi_emisor FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
-- Escritura solo service_role (alta/renovación del CSD).

-- Trigger updated_at (convención repo §8.5) — usa set_updated_at() definido en 0001.
CREATE TRIGGER trg_tenant_cfdi_emisor_updated_at
  BEFORE UPDATE ON tenant_cfdi_emisor
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
