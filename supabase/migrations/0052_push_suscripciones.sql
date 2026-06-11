-- 0052 — Fase 2: push notifications de eventos críticos (Web Push).
-- Suscripciones por dispositivo/navegador del tenant. La edge function enviar-push
-- (service_role) las lee para mandar la notificación; el usuario gestiona las suyas.

CREATE TABLE push_suscripciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  descripcion varchar(150) NULL,           -- "Chrome · laptop del dueño"
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT endpoint_unico UNIQUE (endpoint)
);

CREATE INDEX idx_push_susc_tenant ON push_suscripciones(tenant_id);

ALTER TABLE push_suscripciones ENABLE ROW LEVEL SECURITY;

-- El usuario ve/gestiona SOLO sus suscripciones (dentro de su tenant).
CREATE POLICY push_susc_select ON push_suscripciones FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid AND usuario_id = auth.uid());
CREATE POLICY push_susc_insert ON push_suscripciones FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid AND usuario_id = auth.uid());
CREATE POLICY push_susc_delete ON push_suscripciones FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid AND usuario_id = auth.uid());

COMMENT ON TABLE push_suscripciones IS 'Fase 2: suscripciones Web Push por dispositivo. enviar-push (service_role) notifica eventos críticos al tenant.';
