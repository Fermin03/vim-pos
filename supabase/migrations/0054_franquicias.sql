-- 0054 — Fase 5 Enterprise: franquicias. Una franquicia agrupa sucursales del tenant
-- (franquiciatario) para el reporteo central: el consolidado puede agruparse/filtrarse
-- por franquicia. El scope del franquiciatario se da con usuarios_acceso por sucursal
-- (una fila por sucursal asignada, D68 — ya soportado por el esquema).

CREATE TABLE franquicias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre      varchar(150) NOT NULL,
  notas       text NULL,
  activa      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  CONSTRAINT franquicia_nombre_unico UNIQUE (tenant_id, nombre)
);
COMMENT ON TABLE franquicias IS 'Fase 5: agrupación de sucursales (franquiciatarios) para reporteo central.';

ALTER TABLE franquicias ENABLE ROW LEVEL SECURITY;
CREATE POLICY franq_select ON franquicias FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY franq_insert ON franquicias FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY franq_update ON franquicias FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY franq_delete ON franquicias FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS franquicia_id uuid NULL REFERENCES franquicias(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sucursales_franquicia ON sucursales(franquicia_id) WHERE franquicia_id IS NOT NULL;
COMMENT ON COLUMN sucursales.franquicia_id IS 'Franquicia a la que pertenece la sucursal (NULL = operación propia).';
