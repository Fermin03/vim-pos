-- 0006 — Auditoría + hook JWT + verificar_pin_login. Fuente: 1A §7, 1F §3 y §5.4.

-- ============================================================
-- 1A §7.1 — Enums asociados
-- ============================================================

-- Categorías de eventos de auditoría (agrupación para filtros)
CREATE TYPE evento_categoria AS ENUM (
  'AUTENTICACION',     -- login, logout, PIN
  'TURNO',             -- apertura, cierre, validación
  'CAJA',              -- sangrías, depósitos
  'VENTA',             -- creación, modificación, cancelación
  'COBRO',             -- pago, devolución
  'DESCUENTO',         -- aplicación manual o automática
  'COCINA',            -- estado_cocina, reimpresión
  'CONFIGURACION',     -- cambios de configuración del negocio
  'CATALOGO',          -- alta/baja/modificación de productos
  'USUARIOS',          -- alta/baja/cambio de rol
  'SISTEMA',           -- errores, reintentos, sync
  'OTRO'
);

-- ============================================================
-- 1A §7.2 — Tabla auditoria_eventos
-- ============================================================

CREATE TABLE auditoria_eventos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  -- Contexto operativo
  sucursal_id         uuid NULL REFERENCES sucursales(id),
  caja_id             uuid NULL REFERENCES cajas(id),
  turno_id            uuid NULL REFERENCES turnos(id),

  -- Quién
  usuario_id          uuid NULL REFERENCES auth.users(id),    -- NULL para eventos del sistema
  usuario_autorizo_id uuid NULL REFERENCES auth.users(id),    -- si hubo PIN superior

  -- Qué
  categoria           evento_categoria NOT NULL,
  evento_codigo       varchar(100) NOT NULL,                  -- 'turno.abrir', 'venta.cancelar_pagada'
  entidad_tipo        varchar(50) NULL,                       -- 'turno', 'ticket', 'producto'
  entidad_id          uuid NULL,                              -- id de la entidad afectada

  -- Detalle estructurado (payload flexible)
  -- Estructura sugerida:
  -- {
  --   "antes": { ...estado previo... },
  --   "despues": { ...estado nuevo... },
  --   "motivo": "...",
  --   "monto_mxn": 245.00,
  --   "metadata": { ... }
  -- }
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Información técnica
  ip_address          inet NULL,
  user_agent          text NULL,

  -- Cuándo
  fecha               timestamptz NOT NULL DEFAULT now(),
  dia_contable        date NULL                                -- inherita del turno cuando aplica
);

CREATE INDEX idx_auditoria_tenant_fecha ON auditoria_eventos(tenant_id, fecha DESC);
CREATE INDEX idx_auditoria_categoria ON auditoria_eventos(tenant_id, categoria, fecha DESC);
CREATE INDEX idx_auditoria_usuario ON auditoria_eventos(usuario_id, fecha DESC);
CREATE INDEX idx_auditoria_entidad ON auditoria_eventos(entidad_tipo, entidad_id);
CREATE INDEX idx_auditoria_turno ON auditoria_eventos(turno_id) WHERE turno_id IS NOT NULL;
CREATE INDEX idx_auditoria_dia_contable ON auditoria_eventos(tenant_id, dia_contable) WHERE dia_contable IS NOT NULL;

-- Índice GIN sobre payload para queries jsonb (cuando se requiera buscar por campos del payload)
CREATE INDEX idx_auditoria_payload ON auditoria_eventos USING GIN (payload);

COMMENT ON TABLE auditoria_eventos IS 'Bitácora universal de eventos. Tabla append-only: las filas NUNCA se modifican ni se borran. §27 del /core.';
COMMENT ON COLUMN auditoria_eventos.payload IS 'JSON estructurado. Convención: { antes, despues, motivo, metadata }. Indexado con GIN.';

-- ============================================================
-- 1A §7.3 — Tabla autorizaciones_pin
-- ============================================================

CREATE TABLE autorizaciones_pin (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NULL REFERENCES sucursales(id),
  caja_id             uuid NULL REFERENCES cajas(id),
  turno_id            uuid NULL REFERENCES turnos(id),

  -- Quién operaba (cajero)
  usuario_solicitante_id uuid NOT NULL REFERENCES auth.users(id),

  -- Quién autorizó (supervisor/admin via PIN)
  usuario_autorizo_id    uuid NOT NULL REFERENCES auth.users(id),

  -- Qué se autorizó
  accion              varchar(100) NOT NULL,             -- 'cancelar_ticket_pagado', 'sangria', 'descuento_manual'
  permiso_codigo      varchar(100) NULL REFERENCES permisos(codigo),
  entidad_tipo        varchar(50) NULL,
  entidad_id          uuid NULL,

  -- Monto cuando aplica
  monto_mxn           numeric(12,2) NULL,

  -- Motivo capturado (obligatorio en el modal §2.3)
  motivo              text NOT NULL,

  fecha               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_autorizaciones_tenant_fecha ON autorizaciones_pin(tenant_id, fecha DESC);
CREATE INDEX idx_autorizaciones_autorizo ON autorizaciones_pin(usuario_autorizo_id, fecha DESC);
CREATE INDEX idx_autorizaciones_solicitante ON autorizaciones_pin(usuario_solicitante_id, fecha DESC);
CREATE INDEX idx_autorizaciones_accion ON autorizaciones_pin(tenant_id, accion, fecha DESC);

-- FK back-reference desde movimientos_caja
ALTER TABLE movimientos_caja
  ADD CONSTRAINT fk_autorizacion_pin
  FOREIGN KEY (autorizacion_pin_id) REFERENCES autorizaciones_pin(id);

COMMENT ON TABLE autorizaciones_pin IS 'Registro de autorizaciones por PIN superior. §2.3 del /core.';

-- ============================================================
-- 1A §7.4 — Tabla sesiones_login
-- ============================================================

CREATE TABLE sesiones_login (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  usuario_id          uuid NOT NULL REFERENCES auth.users(id),

  tipo_acceso         tipo_acceso NOT NULL,

  -- Contexto (solo aplica para PIN operativo)
  sucursal_id         uuid NULL REFERENCES sucursales(id),
  caja_id             uuid NULL REFERENCES cajas(id),

  fecha_login         timestamptz NOT NULL DEFAULT now(),
  fecha_logout        timestamptz NULL,
  motivo_logout       varchar(50) NULL,                  -- 'MANUAL', 'CAMBIO_CAJERO', 'INACTIVIDAD', 'BLOQUEO'

  ip_address          inet NULL,
  user_agent          text NULL,

  duracion_minutos    integer GENERATED ALWAYS AS (
    CASE
      WHEN fecha_logout IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (fecha_logout - fecha_login))::integer / 60
    END
  ) STORED
);

CREATE INDEX idx_sesiones_usuario_fecha ON sesiones_login(usuario_id, fecha_login DESC);
CREATE INDEX idx_sesiones_tenant_fecha ON sesiones_login(tenant_id, fecha_login DESC);
CREATE INDEX idx_sesiones_caja ON sesiones_login(caja_id, fecha_login DESC) WHERE caja_id IS NOT NULL;
CREATE INDEX idx_sesiones_abiertas ON sesiones_login(usuario_id) WHERE fecha_logout IS NULL;

COMMENT ON TABLE sesiones_login IS 'Histórico de sesiones. PIN operativo (caja) y web admin son distinguibles via tipo_acceso.';

-- ============================================================
-- 1A §7.5 — RLS y políticas
-- ============================================================

-- auditoria_eventos: lectura por tenant; INSERT permitido a todos los usuarios autenticados del tenant
ALTER TABLE auditoria_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY auditoria_select_tenant ON auditoria_eventos FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY auditoria_insert_tenant ON auditoria_eventos FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
-- NO UPDATE, NO DELETE — tabla append-only (D8, §27.1)

ALTER TABLE autorizaciones_pin ENABLE ROW LEVEL SECURITY;
CREATE POLICY autorizaciones_tenant ON autorizaciones_pin FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE sesiones_login ENABLE ROW LEVEL SECURITY;
CREATE POLICY sesiones_propias ON sesiones_login FOR SELECT
  USING (usuario_id = auth.uid());
CREATE POLICY sesiones_tenant_admin ON sesiones_login FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ============================================================
-- 1F §3.1 — Custom Access Token Hook
-- Inyecta tenant_id y tipo_identidad en el JWT de cada usuario.
-- Lo invoca GoTrue (rol supabase_auth_admin) en cada emisión/refresh.
-- ============================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_user_id    uuid := (event ->> 'user_id')::uuid;
  v_claims     jsonb := event -> 'claims';
  v_tenant_id  uuid;
  v_tipo       text;
BEGIN
  -- Resolver el único acceso activo del usuario (D67: un tenant por cuenta).
  -- Si tuviera varios (no debería en MVP), gana el más reciente sin sucursal
  -- específica, o el más reciente a secas.
  SELECT ua.tenant_id,
         CASE
           WHEN r.codigo = 'DISPOSITIVO' THEN 'DISPOSITIVO'
           WHEN r.codigo IN ('DUENO','ADMIN') THEN 'ADMIN_WEB'
           ELSE 'EMPLEADO'
         END
    INTO v_tenant_id, v_tipo
    FROM usuarios_acceso ua
    JOIN roles r ON r.id = ua.rol_id
   WHERE ua.usuario_id = v_user_id
     AND ua.activo = true
     AND (ua.fecha_fin IS NULL OR ua.fecha_fin >= CURRENT_DATE)
   ORDER BY (ua.sucursal_id IS NULL) DESC, ua.created_at DESC
   LIMIT 1;

  -- Si el usuario no tiene acceso activo, se emite token SIN tenant_id.
  -- El RLS lo dejará sin ver nada (comportamiento seguro por defecto).
  IF v_tenant_id IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
    v_claims := jsonb_set(v_claims, '{tipo_identidad}', to_jsonb(v_tipo));
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Hook de GoTrue. Inyecta tenant_id y tipo_identidad en el JWT. Parte 1F §3.';

-- ============================================================
-- 1F §3.2 — Permisos del hook
-- ============================================================

-- Permitir que GoTrue ejecute el hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- GoTrue necesita leer usuarios_acceso y roles para resolver el tenant
GRANT SELECT ON public.usuarios_acceso TO supabase_auth_admin;
GRANT SELECT ON public.roles TO supabase_auth_admin;

-- El hook lee estas tablas saltándose RLS porque supabase_auth_admin es
-- un rol privilegiado; aun así limitamos a SELECT.

-- ============================================================
-- 1F §5.4 — Función SQL verificar_pin_login
-- ============================================================
CREATE OR REPLACE FUNCTION verificar_pin_login(
  p_usuario_id uuid,
  p_pin        text,
  p_caja_id    uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_perfil    usuarios_perfil%ROWTYPE;
  v_sucursal  uuid;
  v_tenant    uuid;
  v_acceso_ok boolean;
BEGIN
  SELECT * INTO v_perfil FROM usuarios_perfil WHERE id = p_usuario_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    INSERT INTO pin_intentos(usuario_id, caja_id, exitoso, motivo_fallo)
    VALUES (p_usuario_id, p_caja_id, false, 'USUARIO_INEXISTENTE');
    RETURN jsonb_build_object('ok', false, 'motivo', 'PIN_INCORRECTO');
  END IF;

  -- Bloqueos
  IF v_perfil.estado IN ('BLOQUEADO_ADMIN','DESACTIVADO') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'USUARIO_BLOQUEADO');
  END IF;
  IF v_perfil.bloqueado_hasta IS NOT NULL AND v_perfil.bloqueado_hasta > now() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'USUARIO_BLOQUEADO',
                              'bloqueado_hasta', v_perfil.bloqueado_hasta);
  END IF;

  -- Verificación del PIN (bcrypt vía pgcrypto)
  IF v_perfil.pin_hash IS NULL OR crypt(p_pin, v_perfil.pin_hash) <> v_perfil.pin_hash THEN
    UPDATE usuarios_perfil
       SET intentos_pin_fallidos = intentos_pin_fallidos + 1,
           bloqueado_hasta = CASE
             WHEN intentos_pin_fallidos + 1 >= 6 THEN NULL
             WHEN intentos_pin_fallidos + 1 >= 3 THEN now() + interval '5 minutes'
             ELSE bloqueado_hasta END,
           estado = CASE WHEN intentos_pin_fallidos + 1 >= 6
                         THEN 'BLOQUEADO_ADMIN'::usuario_estado ELSE estado END
     WHERE id = p_usuario_id;
    INSERT INTO pin_intentos(usuario_id, caja_id, exitoso, motivo_fallo)
    VALUES (p_usuario_id, p_caja_id, false, 'PIN_INCORRECTO');
    RETURN jsonb_build_object('ok', false, 'motivo', 'PIN_INCORRECTO',
                              'intentos_restantes', GREATEST(0, 3 - (v_perfil.intentos_pin_fallidos + 1)));
  END IF;

  -- Resolver sucursal de la caja y validar acceso
  SELECT sucursal_id INTO v_sucursal FROM cajas WHERE id = p_caja_id;
  SELECT ua.tenant_id,
         bool_or(ua.sucursal_id IS NULL OR ua.sucursal_id = v_sucursal)
    INTO v_tenant, v_acceso_ok
    FROM usuarios_acceso ua
   WHERE ua.usuario_id = p_usuario_id AND ua.activo = true
     AND (ua.fecha_fin IS NULL OR ua.fecha_fin >= CURRENT_DATE)
   GROUP BY ua.tenant_id;

  IF NOT COALESCE(v_acceso_ok, false) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SIN_ACCESO_SUCURSAL');
  END IF;

  -- Éxito: resetear contador, registrar, devolver datos
  UPDATE usuarios_perfil
     SET intentos_pin_fallidos = 0, bloqueado_hasta = NULL,
         fecha_ultimo_login_pin = now()
   WHERE id = p_usuario_id;
  INSERT INTO pin_intentos(tenant_id, usuario_id, caja_id, exitoso)
  VALUES (v_tenant, p_usuario_id, p_caja_id, true);

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', v_tenant,
    'nombre', v_perfil.nombre,
    'ttl_segundos', 12 * 3600
  );
END;
$$;

COMMENT ON FUNCTION verificar_pin_login IS
  'Verifica PIN, aplica política anti-fuerza-bruta y devuelve datos para acuñar JWT. Parte 1F §5.4. Solo invocable con service_role desde la Edge Function pin-login.';

-- Nadie del lado cliente puede invocarla directamente
REVOKE EXECUTE ON FUNCTION verificar_pin_login FROM authenticated, anon, public;
