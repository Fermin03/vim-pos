-- ============================================================================
-- 0115 — Zonas de envío: el domicilio se cobra según dónde vive el cliente.
--
-- POR QUÉ UN RENGLÓN DEL TICKET Y NO UNA COLUMNA DE tickets
--
-- La tentación es copiar `propina_mxn`: una columna más y a otra cosa. No se puede. Los totales
-- del ticket salen SOLO de ticket_items (recalcular_totales_ticket, 0008 §8.1), y el armador de
-- conceptos del CFDI valida que la suma de los renglones dé exactamente tickets.total_mxn — y
-- truena a propósito si no (ConceptosIncoherentes, _shared/pac/conceptos.ts). Un cargo por fuera
-- de los renglones produciría tickets que no se pueden facturar.
--
-- Como renglón, en cambio, no hay que tocar nada: totales, ticket impreso, CFDI, factura global,
-- reportes y sync ya saben qué hacer con un renglón.
-- ============================================================================

CREATE TABLE IF NOT EXISTS zonas_envio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  nombre      varchar(60) NOT NULL,
  costo_mxn   numeric(12,2) NOT NULL DEFAULT 0 CHECK (costo_mxn >= 0),
  orden       integer NOT NULL DEFAULT 0,
  activa      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL
);

COMMENT ON TABLE zonas_envio IS 'Zonas de reparto por sucursal con su cargo de envío. El cargo entra al ticket como renglón (cargo_tipo=ENVIO), nunca como columna.';

-- Por sucursal y no por tenant: las colonias de León no le sirven a una sucursal de otra ciudad.
-- Se comparan sin distinguir mayúsculas ni espacios de sobra, que es como se capturan de verdad.
CREATE UNIQUE INDEX IF NOT EXISTS zona_envio_nombre_uq
  ON zonas_envio (sucursal_id, lower(btrim(nombre))) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_zonas_envio_sucursal
  ON zonas_envio (sucursal_id) WHERE deleted_at IS NULL AND activa;

ALTER TABLE zonas_envio ENABLE ROW LEVEL SECURITY;

-- Explícito y no por default privileges (0065): esos solo aplican si la tabla la crea el mismo rol
-- que los definió, y una tabla sin privilegio falla con "permission denied" antes del RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON zonas_envio TO authenticated, service_role;

DO $$ BEGIN
  CREATE POLICY zonas_envio_select ON zonas_envio
    FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY zonas_envio_insert ON zonas_envio
    FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY zonas_envio_update ON zonas_envio
    FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY zonas_envio_delete ON zonas_envio
    FOR DELETE USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TRIGGER trg_zonas_envio_updated_at
  BEFORE UPDATE ON zonas_envio
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- La zona se recuerda en la dirección (para que salga sola la próxima vez) y se congela en el
-- ticket (para poder agrupar ventas por zona sin parsear el nombre del renglón).
ALTER TABLE direcciones_cliente ADD COLUMN IF NOT EXISTS zona_envio_id uuid NULL REFERENCES zonas_envio(id);
ALTER TABLE tickets             ADD COLUMN IF NOT EXISTS zona_envio_id uuid NULL REFERENCES zonas_envio(id);

-- Marca del renglón. Hace falta explícita: producto_id YA es nulo para los renglones cuyo producto
-- se borró del catálogo (FK blanda, 0008:547), así que "sin producto" no significa "es un cargo".
ALTER TABLE ticket_items ADD COLUMN IF NOT EXISTS cargo_tipo varchar(20) NULL;

DO $$ BEGIN
  ALTER TABLE ticket_items ADD CONSTRAINT ticket_items_cargo_tipo_chk CHECK (cargo_tipo IN ('ENVIO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN ticket_items.cargo_tipo IS 'NULL = renglón de producto. ENVIO = cargo de envío: no va a cocina, no consume inventario, no es un producto vendido.';

-- La garantía va en la base, no en que el código se acuerde.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_envio_unico
  ON ticket_items (ticket_id) WHERE cargo_tipo = 'ENVIO' AND cancelado = false;
