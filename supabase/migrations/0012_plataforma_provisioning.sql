-- 0012 — Plataforma: provisioning (crear_tenant_con_owner), onboarding, super_admin_accesos. Fuente: doc 12.

-- ============================================================
-- §5. Tabla tenant_onboarding_estado (+ enum onboarding_fase + RLS)
-- ============================================================

CREATE TYPE onboarding_fase AS ENUM (
  'INVITADO',          -- creado, esperando que el dueño active
  'EN_CONFIGURACION',  -- dueño activó, recorriendo el wizard (doc 10 fases 1-8)
  'GO_LIVE',           -- configuración completa, operando
  'ABANDONADO'         -- no activó en plazo / decidió no continuar
);

CREATE TABLE tenant_onboarding_estado (
  tenant_id           uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  fase                onboarding_fase NOT NULL DEFAULT 'INVITADO',

  -- Progreso fino dentro del wizard (doc 10): 0 = invitado, 1-8 = fases, 9 = go-live
  fase_wizard         integer NOT NULL DEFAULT 0 CHECK (fase_wizard BETWEEN 0 AND 9),

  -- Hitos
  fecha_invitacion    timestamptz NOT NULL DEFAULT now(),
  fecha_activacion    timestamptz NULL,        -- cuando el dueño definió pwd+PIN
  fecha_go_live       timestamptz NULL,

  -- Recordatorios
  recordatorios_enviados integer NOT NULL DEFAULT 0,
  ultimo_recordatorio    timestamptz NULL,

  notas_internas      text NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_onboarding_fase ON tenant_onboarding_estado(fase);
CREATE INDEX idx_onboarding_pendientes ON tenant_onboarding_estado(fecha_invitacion)
  WHERE fase IN ('INVITADO', 'EN_CONFIGURACION');

COMMENT ON TABLE tenant_onboarding_estado IS
  'Progreso de configuración inicial del tenant. Ortogonal al estado comercial (tenants.estado). Doc 12 §5.';

-- RLS: el tenant lee su propio progreso; VIM lo gestiona vía service_role
ALTER TABLE tenant_onboarding_estado ENABLE ROW LEVEL SECURITY;
CREATE POLICY onboarding_select_tenant ON tenant_onboarding_estado FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Trigger updated_at — usa set_updated_at() definido en 0001.
CREATE TRIGGER trg_tenant_onboarding_estado_updated_at
  BEFORE UPDATE ON tenant_onboarding_estado
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- §9.2 Tabla super_admin_accesos (impersonación auditada)
-- ============================================================

CREATE TABLE super_admin_accesos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id  uuid NOT NULL,                    -- quién de VIM
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  accion          varchar(50) NOT NULL,             -- 'IMPERSONAR', 'AJUSTE_FOLIOS', 'CAMBIO_PLAN', etc.
  motivo          text NOT NULL,                     -- obligatorio: por qué
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address      inet NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_super_admin_tenant ON super_admin_accesos(tenant_id, created_at DESC);

COMMENT ON TABLE super_admin_accesos IS
  'Bitácora de toda acción de VIM sobre un tenant. Impersonación exige motivo. Doc 12 §9.2.';

-- ============================================================
-- §4. Función crear_tenant_con_owner()
-- ============================================================

CREATE OR REPLACE FUNCTION crear_tenant_con_owner(
  p_owner_user_id   uuid,            -- ya creado vía Auth Admin API
  p_codigo          varchar,         -- slug: 'knockout'
  p_nombre_comercial varchar,
  p_nombre_owner    varchar,
  p_telefono_owner  varchar,
  p_vertical        vertical_tipo,
  p_plan_codigo     varchar,         -- 'QS', 'FT', ...
  p_estado          tenant_estado DEFAULT 'TRIAL',   -- 'INTERNO' para Knock-Out, 'ACTIVO' vía Stripe
  p_notas_internas  text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp   -- CN-001: search_path fijo (anti escalada en SECURITY DEFINER, CWE-426)
AS $$
DECLARE
  v_tenant_id   uuid;
  v_plan        planes%ROWTYPE;
  v_rol_dueno   uuid;
  v_periodo     date := date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City'))::date;
BEGIN
  -- Plan vigente y rol DUENO del sistema
  SELECT * INTO v_plan FROM planes WHERE codigo = p_plan_codigo AND activo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan % no existe o inactivo', p_plan_codigo; END IF;

  SELECT id INTO v_rol_dueno FROM roles WHERE codigo = 'DUENO' AND es_sistema = true;

  -- 1) Tenant
  INSERT INTO tenants (codigo, nombre_comercial, estado, vertical_principal,
                       plan_actual_id, usuario_dueno_id)
  VALUES (p_codigo, p_nombre_comercial, p_estado, p_vertical,
          v_plan.id, p_owner_user_id)
  RETURNING id INTO v_tenant_id;

  -- 2) Perfil del dueño (1:1 con auth.users)
  INSERT INTO usuarios_perfil (id, nombre, telefono, estado)
  VALUES (p_owner_user_id, p_nombre_owner, p_telefono_owner, 'ACTIVO')
  ON CONFLICT (id) DO NOTHING;

  -- 3) Acceso del dueño: rol DUENO, todas las sucursales (sucursal_id NULL)
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id)
  VALUES (p_owner_user_id, v_tenant_id, NULL, v_rol_dueno);

  -- 4) Saldo de folios: base mensual del plan (D96)
  INSERT INTO tenant_folios_saldo (tenant_id, folios_base_mensuales,
                                   folios_base_consumidos, periodo_actual, saldo_paquetes)
  VALUES (v_tenant_id, COALESCE(v_plan.timbres_cfdi_mensuales, 0), 0, v_periodo, 0);

  -- 5) Estado de onboarding (fase inicial)
  INSERT INTO tenant_onboarding_estado (tenant_id, fase, notas_internas)
  VALUES (v_tenant_id, 'INVITADO', p_notas_internas);

  -- 6) Auditoría
  INSERT INTO auditoria_eventos (tenant_id, categoria, evento_codigo, entidad_tipo, entidad_id, payload)
  VALUES (v_tenant_id, 'SISTEMA', 'tenant.creado', 'tenant', v_tenant_id,
          jsonb_build_object('plan', p_plan_codigo, 'vertical', p_vertical, 'estado', p_estado));

  RETURN v_tenant_id;
END;
$$;

COMMENT ON FUNCTION crear_tenant_con_owner IS
  'Provisiona un tenant completo a partir de un auth.users ya creado. Atómico. Solo service_role. Doc 12 §4.';

REVOKE EXECUTE ON FUNCTION crear_tenant_con_owner FROM authenticated, anon, public;
