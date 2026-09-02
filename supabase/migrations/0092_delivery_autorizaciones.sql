-- ============================================================================
-- 0092 — Token temporal del dueño para activar tiendas de apps (spec F1b, ADR 0011).
--
-- El dueño autoriza a VIM con OAuth (scope eats.pos_provisioning en Uber); el token resultante
-- solo sirve para listar sus tiendas y asociarlas a sucursales. Vive aquí mientras dura el
-- asistente y lo usa únicamente la Edge Function delivery-uber-conexion (service_role).
-- Nadie más lo lee: RLS activo sin políticas y sin GRANT a anon/authenticated.
-- ============================================================================
CREATE TABLE delivery_autorizaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app           modo_servicio NOT NULL CHECK (app IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI')),
  entorno       text NOT NULL CHECK (entorno IN ('sandbox', 'produccion')),
  access_token  text NOT NULL,
  vence_at      timestamptz NOT NULL,
  creado_por    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, app, entorno)
);
COMMENT ON TABLE delivery_autorizaciones IS
  'Token OAuth del dueño para activar tiendas de apps de delivery. Temporal; solo service_role.';

ALTER TABLE delivery_autorizaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON delivery_autorizaciones FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_autorizaciones TO service_role;
