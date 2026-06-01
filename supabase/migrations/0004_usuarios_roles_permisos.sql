-- 0004 — Usuarios, roles y permisos. Fuente: 1A §5, §8.6.
-- Orden de dependencias: enums → usuarios_perfil (auth.users) → roles, subtipos_personal (tenants)
--   → permisos → rol_permisos → overrides_permisos → usuarios_acceso (roles+subtipos) → pin_intentos
--   → RLS (§5.10) → trigger de auditoría de PIN (§8.6).
-- Referencias externas: tenants (0002), sucursales/cajas (0003), auth.users, vertical_tipo (0002),
--   auditoria_eventos (migración de §7). Helpers current_tenant_id()/set_updated_at() viven en 0001.

-- ============================================================================
-- 5.1 Enums asociados
-- ============================================================================

-- Tipos de acceso (operativo vs administrativo)
CREATE TYPE tipo_acceso AS ENUM (
  'PIN_OPERATIVO',     -- caja: PIN 4-6 dígitos
  'WEB_ADMIN'          -- panel admin: usuario + contraseña + 2FA opcional
);

-- Estado del usuario en el sistema
CREATE TYPE usuario_estado AS ENUM (
  'ACTIVO',
  'BLOQUEADO_TEMP',    -- 3 PINs fallidos = 5 min de bloqueo
  'BLOQUEADO_ADMIN',   -- bloqueo permanente hasta acción de admin
  'DESACTIVADO'        -- usuario dado de baja
);

-- ============================================================================
-- 5.2 Tabla usuarios_perfil
-- ============================================================================

CREATE TABLE usuarios_perfil (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Datos personales
  nombre          varchar(100) NOT NULL,
  apellido_paterno varchar(100) NULL,
  apellido_materno varchar(100) NULL,
  telefono        varchar(20) NULL,
  foto_url        text NULL,

  -- PIN operativo (4-6 dígitos, hasheado)
  pin_hash        text NULL,                            -- bcrypt vía pgcrypto

  -- Estado
  estado          usuario_estado NOT NULL DEFAULT 'ACTIVO',
  bloqueado_hasta timestamptz NULL,                     -- bloqueo temporal por 3 PINs fallidos
  intentos_pin_fallidos integer NOT NULL DEFAULT 0 CHECK (intentos_pin_fallidos >= 0),

  -- Última actividad
  fecha_ultimo_login_pin  timestamptz NULL,
  fecha_ultimo_login_web  timestamptz NULL,

  -- Auditoría
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz NULL,

  CONSTRAINT pin_intentos_max CHECK (intentos_pin_fallidos <= 10)
);

CREATE INDEX idx_usuarios_estado ON usuarios_perfil(estado) WHERE deleted_at IS NULL;

COMMENT ON TABLE usuarios_perfil IS 'Datos VIM POS del usuario. Una fila 1:1 con auth.users.';
COMMENT ON COLUMN usuarios_perfil.pin_hash IS 'bcrypt hash del PIN. NUNCA en texto plano. Verificación con crypt(input, pin_hash).';

CREATE TRIGGER trg_usuarios_perfil_updated_at
  BEFORE UPDATE ON usuarios_perfil
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 5.3 Tabla roles
-- ============================================================================

CREATE TABLE roles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NULL REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL para roles del sistema
  codigo          varchar(50) NOT NULL,                  -- 'DUENO', 'ADMIN', 'SUPERVISOR', 'CAJERO', 'PERSONAL'
  nombre          varchar(100) NOT NULL,                 -- 'Dueño', 'Administrador', etc.
  descripcion     text NULL,

  es_sistema      boolean NOT NULL DEFAULT false,        -- roles base = true (inalterables)
  jerarquia       integer NOT NULL,                      -- 1=Personal, 2=Cajero, 3=Supervisor, 4=Admin, 5=Dueño
  activo          boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Códigos del sistema (tenant_id NULL) únicos globalmente; roles custom únicos por tenant.
-- (Reemplaza el EXCLUDE ... IS NOT DISTINCT FROM del doc 1A §5.3, que no es SQL válido.)
CREATE UNIQUE INDEX rol_codigo_sistema_uq ON roles (codigo) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX rol_codigo_tenant_uq  ON roles (tenant_id, codigo) WHERE tenant_id IS NOT NULL;

CREATE INDEX idx_roles_tenant ON roles(tenant_id) WHERE activo = true;
CREATE INDEX idx_roles_sistema ON roles(es_sistema) WHERE es_sistema = true;

COMMENT ON TABLE roles IS '5 roles base (es_sistema=true, tenant_id=NULL) + roles custom por tenant. §2.1 del /core.';
COMMENT ON COLUMN roles.jerarquia IS 'Nivel jerárquico. Un PIN solo autoriza acciones que requieren jerarquía <= la suya.';

CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 5.4 Tabla subtipos_personal
-- ============================================================================

CREATE TABLE subtipos_personal (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NULL REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = sugerencia del sistema
  codigo          varchar(50) NOT NULL,                  -- 'COCINERO', 'MESERO', 'REPARTIDOR', etc.
  nombre          varchar(100) NOT NULL,
  descripcion     text NULL,

  -- Verticales donde aplica (sirve para UI: solo mostrar relevantes según vertical del tenant)
  verticales_aplicables vertical_tipo[] NOT NULL DEFAULT '{}',

  -- Capacidades del subtipo (qué pantallas/acciones tiene acceso)
  -- Estructura JSON flexible. Ejemplo:
  -- { "ver_cola_cocina": true, "marcar_listo": true, "recibir_delivery": false }
  capacidades     jsonb NOT NULL DEFAULT '{}'::jsonb,

  es_sistema      boolean NOT NULL DEFAULT false,
  activo          boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Códigos del sistema (tenant_id NULL) únicos globalmente; custom únicos por tenant.
-- (Reemplaza el EXCLUDE ... IS NOT DISTINCT FROM del doc 1A §5.4.)
CREATE UNIQUE INDEX subtipo_codigo_sistema_uq ON subtipos_personal (codigo) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX subtipo_codigo_tenant_uq  ON subtipos_personal (tenant_id, codigo) WHERE tenant_id IS NOT NULL;

CREATE INDEX idx_subtipos_tenant ON subtipos_personal(tenant_id) WHERE activo = true;

COMMENT ON TABLE subtipos_personal IS 'Subtipos del rol Personal. 9 sugeridos del sistema (cocinero, mesero, etc.) + custom por tenant. §30 del /core.';

CREATE TRIGGER trg_subtipos_personal_updated_at
  BEFORE UPDATE ON subtipos_personal
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 5.5 Tabla permisos
-- ============================================================================

CREATE TABLE permisos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          varchar(100) NOT NULL UNIQUE,         -- 'caja.abrir_turno', 'venta.cancelar_pagado'
  nombre          varchar(150) NOT NULL,
  descripcion     text NULL,
  categoria       varchar(50) NOT NULL,                 -- 'caja', 'venta', 'descuento', 'config', 'reporte'

  -- ¿Este permiso puede ser autorizado vía PIN superior si el usuario no lo tiene?
  permite_autorizacion_pin boolean NOT NULL DEFAULT false,

  -- Jerarquía mínima que puede autorizar via PIN (solo si permite_autorizacion_pin = true)
  jerarquia_minima_pin integer NULL CHECK (jerarquia_minima_pin BETWEEN 1 AND 5),

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_permisos_categoria ON permisos(categoria);

COMMENT ON TABLE permisos IS 'Catálogo de permisos. Lectura pública para todos los usuarios autenticados.';

-- ============================================================================
-- 5.6 Tabla rol_permisos
-- ============================================================================

CREATE TABLE rol_permisos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rol_id          uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id      uuid NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,

  -- TRUE = tiene el permiso; FALSE = puede pedirlo vía PIN superior si permite_autorizacion_pin
  concedido       boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rol_permiso_unico UNIQUE (rol_id, permiso_id)
);

CREATE INDEX idx_rol_permisos_rol ON rol_permisos(rol_id);

COMMENT ON TABLE rol_permisos IS 'Matriz base permiso-rol. Para roles del sistema (es_sistema=true), es la matriz oficial del /core.';

-- ============================================================================
-- 5.7 Tabla overrides_permisos
-- ============================================================================

CREATE TABLE overrides_permisos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rol_id          uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id      uuid NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,

  -- Si concedido es distinto del valor base, este override aplica
  concedido       boolean NOT NULL,

  motivo          text NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),

  CONSTRAINT override_unico UNIQUE (tenant_id, rol_id, permiso_id)
);

CREATE INDEX idx_overrides_lookup ON overrides_permisos(tenant_id, rol_id);

-- ============================================================================
-- 5.8 Tabla usuarios_acceso
-- ============================================================================

CREATE TABLE usuarios_acceso (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Sucursal específica o NULL = todas las sucursales del tenant
  sucursal_id     uuid NULL REFERENCES sucursales(id) ON DELETE CASCADE,

  -- Rol con el que opera en este tenant/sucursal
  rol_id          uuid NOT NULL REFERENCES roles(id),

  -- Si el rol es 'PERSONAL', cuál subtipo
  subtipo_personal_id uuid NULL REFERENCES subtipos_personal(id),

  -- Vigencia (NULL = sin vencimiento)
  fecha_inicio    date NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin       date NULL,

  activo          boolean NOT NULL DEFAULT true,

  -- Notas (motivo de asignación, etc.)
  notas           text NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id)
);

-- Un usuario no puede tener 2 accesos activos al mismo tenant+sucursal+rol.
-- sucursal_id NULL = acceso a "todas las sucursales"; se trata como valor → dos índices parciales.
-- (Reemplaza el EXCLUDE ... IS NOT DISTINCT FROM del doc 1A §5.8.)
CREATE UNIQUE INDEX acceso_unico_con_suc ON usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id)
  WHERE activo = true AND sucursal_id IS NOT NULL;
CREATE UNIQUE INDEX acceso_unico_sin_suc ON usuarios_acceso (usuario_id, tenant_id, rol_id)
  WHERE activo = true AND sucursal_id IS NULL;

CREATE INDEX idx_acceso_usuario ON usuarios_acceso(usuario_id) WHERE activo = true;
CREATE INDEX idx_acceso_tenant ON usuarios_acceso(tenant_id) WHERE activo = true;
CREATE INDEX idx_acceso_sucursal ON usuarios_acceso(sucursal_id) WHERE activo = true;

COMMENT ON TABLE usuarios_acceso IS 'Quién puede operar dónde con qué rol. Un usuario puede tener múltiples filas (varias sucursales, varios tenants).';
COMMENT ON COLUMN usuarios_acceso.sucursal_id IS 'NULL = acceso a TODAS las sucursales del tenant. Usado típicamente para dueño/admin.';

CREATE TRIGGER trg_usuarios_acceso_updated_at
  BEFORE UPDATE ON usuarios_acceso
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 5.9 Tabla pin_intentos
-- ============================================================================

CREATE TABLE pin_intentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NULL REFERENCES tenants(id),       -- NULL si todavía no se identificó el usuario
  usuario_id      uuid NULL REFERENCES auth.users(id),    -- NULL si el PIN no matcheó nadie
  caja_id         uuid NULL REFERENCES cajas(id),

  exitoso         boolean NOT NULL,
  motivo_fallo    varchar(50) NULL,                       -- 'PIN_INCORRECTO', 'USUARIO_BLOQUEADO', 'USUARIO_INEXISTENTE'

  ip_address      inet NULL,
  user_agent      text NULL,

  fecha_intento   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pin_intentos_usuario_fecha ON pin_intentos(usuario_id, fecha_intento DESC);
CREATE INDEX idx_pin_intentos_caja_fecha ON pin_intentos(caja_id, fecha_intento DESC);
CREATE INDEX idx_pin_intentos_fallidos_recientes
  ON pin_intentos(usuario_id, fecha_intento DESC)
  WHERE exitoso = false;

COMMENT ON TABLE pin_intentos IS 'Bitácora de intentos de PIN. Política: 3 fallidos = bloqueo 5 min; 6 fallidos = bloqueo admin (§3.3).';

-- ============================================================================
-- 5.10 RLS y políticas
-- ============================================================================

-- usuarios_perfil: usuario puede leer/editar su propio perfil; admin del tenant lee los de su tenant
ALTER TABLE usuarios_perfil ENABLE ROW LEVEL SECURITY;

CREATE POLICY usuarios_perfil_propio ON usuarios_perfil FOR SELECT
  USING (id = auth.uid());

CREATE POLICY usuarios_perfil_mismo_tenant ON usuarios_perfil FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios_acceso ua
      WHERE ua.usuario_id = usuarios_perfil.id
        AND ua.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
        AND ua.activo = true
    )
  );

CREATE POLICY usuarios_perfil_update_propio ON usuarios_perfil FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- roles: lectura pública para roles del sistema; del tenant para roles custom
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_sistema ON roles FOR SELECT
  USING (es_sistema = true OR tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- subtipos_personal: igual que roles
ALTER TABLE subtipos_personal ENABLE ROW LEVEL SECURITY;
CREATE POLICY subtipos_lectura ON subtipos_personal FOR SELECT
  USING (es_sistema = true OR tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- permisos: lectura pública (catálogo del sistema)
ALTER TABLE permisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY permisos_publico ON permisos FOR SELECT USING (true);

-- rol_permisos: lectura pública (matriz base es pública)
ALTER TABLE rol_permisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY rol_permisos_publico ON rol_permisos FOR SELECT USING (true);

-- overrides_permisos: solo del tenant
ALTER TABLE overrides_permisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY overrides_tenant ON overrides_permisos FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- usuarios_acceso: usuario ve sus propios accesos; admin del tenant ve todos los del tenant
ALTER TABLE usuarios_acceso ENABLE ROW LEVEL SECURITY;
CREATE POLICY acceso_propio ON usuarios_acceso FOR SELECT
  USING (usuario_id = auth.uid());

CREATE POLICY acceso_tenant ON usuarios_acceso FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- pin_intentos: solo lectura para admin del tenant (auditoría)
ALTER TABLE pin_intentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pin_intentos_tenant ON pin_intentos FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- INSERT permitido solo desde service_role (vía función segura, no directo)

-- ============================================================================
-- 8.6 Trigger: validar/auditar PIN al hashear (aplica a usuarios_perfil)
-- ============================================================================
-- Nota: el hasheo se hace en aplicación (Edge Function / backend) con bcrypt.
-- La BD recibe el hash ya calculado; aquí solo se registra auditoría del cambio.

CREATE OR REPLACE FUNCTION trg_audit_pin_cambio() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.pin_hash IS DISTINCT FROM NEW.pin_hash)
     OR (TG_OP = 'INSERT' AND NEW.pin_hash IS NOT NULL) THEN

    INSERT INTO auditoria_eventos (
      tenant_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    )
    SELECT
      ua.tenant_id,
      NEW.id,
      'AUTENTICACION',
      'usuario.pin_modificado',
      'usuario',
      NEW.id,
      jsonb_build_object(
        'operacion', TG_OP,
        'es_creacion', TG_OP = 'INSERT'
      )
    FROM usuarios_acceso ua
    WHERE ua.usuario_id = NEW.id AND ua.activo = true
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_usuarios_pin_audit
  AFTER INSERT OR UPDATE ON usuarios_perfil
  FOR EACH ROW EXECUTE FUNCTION trg_audit_pin_cambio();
