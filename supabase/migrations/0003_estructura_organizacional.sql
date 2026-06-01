-- 0003 — Estructura organizacional (sucursales, cajas, config). Fuente: 1A §4, §8.4.
-- ============================================================================
-- Orden de dependencias: sucursales → cajas → configuracion_tenant →
--   configuracion_sucursal → contadores_folio → generar_folio().
-- Referencias a tablas de otras migraciones:
--   - tenants  → 0002 (todas las tablas de esta sección)
--   - auth.users (created_by/updated_by) → provisto por Supabase Auth
-- NO se redefinen current_tenant_id() ni set_updated_at() (existen en 0001).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 4.1 Tabla sucursales
-- ---------------------------------------------------------------------------
CREATE TABLE sucursales (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  -- Identidad
  codigo              varchar(10) NOT NULL,             -- 'K', 'KC', 'KN', 'CG1' — usado en folio (§1.3.bis)
  nombre              varchar(150) NOT NULL,            -- 'León Centro'
  descripcion         text NULL,

  -- Ubicación
  direccion_calle     varchar(255) NULL,
  direccion_numero    varchar(20) NULL,
  direccion_colonia   varchar(150) NULL,
  ciudad              varchar(100) NULL,
  estado_geo          varchar(50) NULL,                 -- 'Guanajuato'
  codigo_postal       varchar(5) NULL,
  pais                varchar(50) NOT NULL DEFAULT 'México',
  geo_lat             numeric(9,6) NULL,
  geo_lng             numeric(9,6) NULL,

  -- Operación
  telefono            varchar(20) NULL,
  email_contacto      citext NULL,
  horario_apertura    time NULL,
  horario_cierre      time NULL,

  -- Overrides de configuración global del tenant (NULL = hereda del tenant)
  hora_cierre_dia_contable time NULL,
  timezone            varchar(50) NULL,

  -- Estado
  activa              boolean NOT NULL DEFAULT true,
  fecha_apertura      date NULL,
  fecha_cierre        date NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,

  CONSTRAINT codigo_sucursal_unico_por_tenant UNIQUE (tenant_id, codigo)
);

CREATE INDEX idx_sucursales_tenant ON sucursales(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sucursales_activas ON sucursales(tenant_id, activa) WHERE deleted_at IS NULL;

COMMENT ON COLUMN sucursales.codigo IS 'Código corto único por tenant. Aparece en folio de ticket: [codigo]-[año]-[consecutivo]. Ej: K-2026-001043';
COMMENT ON COLUMN sucursales.hora_cierre_dia_contable IS 'Si NULL, hereda del tenant. Permite que una sucursal tenga horario distinto.';

CREATE TRIGGER trg_sucursales_updated_at
  BEFORE UPDATE ON sucursales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4.2 Tabla cajas
-- ---------------------------------------------------------------------------
CREATE TABLE cajas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,

  -- Identidad
  numero              integer NOT NULL,                 -- 1, 2, 3...
  nombre              varchar(100) NOT NULL,            -- 'Caja 01', 'Caja Barra'
  descripcion         text NULL,

  -- Vinculación a dispositivo (opcional, para tracking)
  identificador_dispositivo varchar(255) NULL,          -- fingerprint del navegador/tablet
  ultima_ip           inet NULL,
  ultima_conexion     timestamptz NULL,

  -- Configuración de impresora asignada (FK opcional a una tabla impresoras en Parte 1C)
  -- Por ahora se guarda la dirección de manera flexible
  impresora_config    jsonb NULL,
  -- Estructura ejemplo:
  -- { "tipo": "ethernet", "ip": "192.168.1.50", "puerto": 9100 }
  -- { "tipo": "bluetooth_ble", "device_id": "AA:BB:CC:DD:EE:FF" }

  -- Estado
  activa              boolean NOT NULL DEFAULT true,
  bloqueada           boolean NOT NULL DEFAULT false,   -- bloqueada por cierre pendiente (§1.2)
  bloqueo_motivo      text NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,

  CONSTRAINT numero_caja_unico_por_sucursal UNIQUE (sucursal_id, numero)
);

CREATE INDEX idx_cajas_sucursal ON cajas(sucursal_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cajas_tenant ON cajas(tenant_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN cajas.bloqueada IS 'TRUE cuando hay un cierre PENDIENTE_VALIDACION (§1.2). No permite abrir nuevo turno hasta que admin valide.';
COMMENT ON COLUMN cajas.impresora_config IS 'JSON flexible. La capa /services interpreta. Soporta ethernet (Knock-Out actual) y BLE.';

CREATE TRIGGER trg_cajas_updated_at
  BEFORE UPDATE ON cajas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4.3 Tabla configuracion_tenant
-- ---------------------------------------------------------------------------
CREATE TABLE configuracion_tenant (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,

  -- §28.2 Configuración de operación general

  -- Modos de servicio activos para este tenant (subset del catálogo §6.1)
  -- Array de strings: ['PARA_LLEVAR', 'COMER_AQUI', 'DOMICILIO_PROPIO', ...]
  modos_servicio_activos      text[] NOT NULL DEFAULT '{PARA_LLEVAR}',
  modo_servicio_default       varchar(50) NOT NULL DEFAULT 'PARA_LLEVAR',

  -- Captura de fondo de caja
  fondo_modo_captura          varchar(20) NOT NULL DEFAULT 'DENOMINACION'
    CHECK (fondo_modo_captura IN ('DENOMINACION', 'TOTAL')),
  fondo_estandar_mxn          numeric(10,2) NULL,        -- pre-llenado al abrir turno
  fondo_minimo_mxn            numeric(10,2) NOT NULL DEFAULT 0.01,

  -- Umbrales y políticas
  umbral_sangria_sin_pin_mxn  numeric(10,2) NOT NULL DEFAULT 0,  -- default: todas requieren PIN
  alerta_reincidencia_cierres integer NOT NULL DEFAULT 3,         -- N cierres con diferencia
  alerta_reincidencia_dias    integer NOT NULL DEFAULT 14,        -- en M días

  -- Política de cobro
  politica_cobro_cocina       varchar(20) NOT NULL DEFAULT 'COBRO_PRIMERO'
    CHECK (politica_cobro_cocina IN ('COBRO_PRIMERO', 'COCINA_PRIMERO', 'HIBRIDO_POR_MODO')),

  -- Política de redondeo
  redondeo_efectivo_activo    boolean NOT NULL DEFAULT false,

  -- Propinas
  propina_sugerida_activa     boolean NOT NULL DEFAULT false,
  propina_porcentajes         numeric(5,2)[] NOT NULL DEFAULT '{10.00, 15.00, 20.00}',
  propina_permite_otro_monto  boolean NOT NULL DEFAULT true,

  -- Notas / formato de ticket
  mostrar_nota_producto_ticket boolean NOT NULL DEFAULT true,
  pie_ticket                  text NULL,                 -- texto adicional al pie del ticket

  -- Reimpresión
  reimpresion_ticket_requiere_pin boolean NOT NULL DEFAULT false,
  reimpresion_comanda_requiere_pin boolean NOT NULL DEFAULT true,

  -- Tiempo de alerta para pedidos en espera abandonados (minutos)
  alerta_pedidos_espera_min   integer NOT NULL DEFAULT 30,

  -- Módulos activables (cache del estado actual; fuente de verdad: feature flags + addons)
  modulo_inventario_activo    boolean NOT NULL DEFAULT false,
  modulo_crm_avanzado_activo  boolean NOT NULL DEFAULT false,
  modulo_cfdi_activo          boolean NOT NULL DEFAULT false,
  modulo_delivery_propio_activo boolean NOT NULL DEFAULT false,
  modulo_apps_externas_activo boolean NOT NULL DEFAULT false,
  modulo_display_cliente_activo boolean NOT NULL DEFAULT false,

  -- §28.1 Configuración fiscal (datos sensibles)
  -- CSD se almacena ENCRIPTADO con pgp_sym_encrypt (no en MVP; estructura preparada)
  pac_proveedor               varchar(50) NULL,         -- 'Facturama'
  pac_credenciales_encrypted  bytea NULL,               -- pgp_sym_encrypt(...)
  csd_archivo_encrypted       bytea NULL,
  csd_password_encrypted      bytea NULL,
  cfdi_serie_default          varchar(25) NULL,
  cfdi_folio_inicial          integer NULL,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_config_tenant ON configuracion_tenant(tenant_id);

COMMENT ON TABLE configuracion_tenant IS 'Una fila por tenant. Configuración operativa global del negocio. §28 del /core.';
COMMENT ON COLUMN configuracion_tenant.modos_servicio_activos IS 'Array de strings. Catálogo completo definido en §6.1 del /core.';
COMMENT ON COLUMN configuracion_tenant.pac_credenciales_encrypted IS 'Encriptado con pgp_sym_encrypt. Llave maestra fuera de la BD (variable de entorno).';

CREATE TRIGGER trg_config_tenant_updated_at
  BEFORE UPDATE ON configuracion_tenant
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4.4 Tabla configuracion_sucursal
-- ---------------------------------------------------------------------------
CREATE TABLE configuracion_sucursal (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id                 uuid NOT NULL UNIQUE REFERENCES sucursales(id) ON DELETE CASCADE,

  -- Cualquier campo NULL = hereda de configuracion_tenant
  modos_servicio_activos      text[] NULL,
  modo_servicio_default       varchar(50) NULL,
  fondo_modo_captura          varchar(20) NULL,
  fondo_estandar_mxn          numeric(10,2) NULL,
  politica_cobro_cocina       varchar(20) NULL,
  pie_ticket                  text NULL,

  -- Notas operativas específicas
  notas_internas              text NULL,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_config_sucursal ON configuracion_sucursal(sucursal_id);

COMMENT ON TABLE configuracion_sucursal IS 'Overrides por sucursal (§28.8). Cualquier campo NULL hereda de configuracion_tenant.';

CREATE TRIGGER trg_config_sucursal_updated_at
  BEFORE UPDATE ON configuracion_sucursal
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4.5 Tabla contadores_folio
-- ---------------------------------------------------------------------------
CREATE TABLE contadores_folio (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  anio                integer NOT NULL CHECK (anio >= 2025 AND anio <= 2100),
  tipo_documento      varchar(20) NOT NULL DEFAULT 'TICKET',  -- TICKET | SANGRIA | DEPOSITO | NOTA_CREDITO
  ultimo_consecutivo  bigint NOT NULL DEFAULT 0 CHECK (ultimo_consecutivo >= 0),

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contador_unico UNIQUE (sucursal_id, anio, tipo_documento)
);

CREATE INDEX idx_contadores_lookup ON contadores_folio(sucursal_id, anio, tipo_documento);

COMMENT ON TABLE contadores_folio IS 'Secuencia eterna por sucursal y tipo de documento. NUNCA se reinicia. §1.3.bis del /core.';

CREATE TRIGGER trg_contadores_folio_updated_at
  BEFORE UPDATE ON contadores_folio
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4.6 RLS y políticas
-- ---------------------------------------------------------------------------
-- Sucursales: lectura/escritura del tenant
ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;
CREATE POLICY sucursales_tenant ON sucursales FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE cajas ENABLE ROW LEVEL SECURITY;
CREATE POLICY cajas_tenant ON cajas FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE configuracion_tenant ENABLE ROW LEVEL SECURITY;
CREATE POLICY config_tenant ON configuracion_tenant FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE configuracion_sucursal ENABLE ROW LEVEL SECURITY;
CREATE POLICY config_sucursal ON configuracion_sucursal FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE contadores_folio ENABLE ROW LEVEL SECURITY;
CREATE POLICY contadores_tenant ON contadores_folio FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ---------------------------------------------------------------------------
-- 8.4 Función generar_folio(sucursal_id) — depende de contadores_folio/sucursales
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generar_folio(
  p_sucursal_id uuid,
  p_tipo_documento varchar DEFAULT 'TICKET',
  p_anio integer DEFAULT NULL
) RETURNS TABLE (
  folio_completo varchar,
  consecutivo bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id     uuid;
  v_codigo_suc    varchar(10);
  v_anio          integer;
  v_consecutivo   bigint;
BEGIN
  -- Obtener tenant_id y código de sucursal
  SELECT s.tenant_id, s.codigo
  INTO v_tenant_id, v_codigo_suc
  FROM sucursales s
  WHERE s.id = p_sucursal_id AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sucursal % no existe o está eliminada', p_sucursal_id;
  END IF;

  v_anio := COALESCE(p_anio, EXTRACT(YEAR FROM now())::integer);

  -- Upsert atómico del contador
  INSERT INTO contadores_folio (tenant_id, sucursal_id, anio, tipo_documento, ultimo_consecutivo)
  VALUES (v_tenant_id, p_sucursal_id, v_anio, p_tipo_documento, 1)
  ON CONFLICT (sucursal_id, anio, tipo_documento)
  DO UPDATE SET
    ultimo_consecutivo = contadores_folio.ultimo_consecutivo + 1,
    updated_at = now()
  RETURNING ultimo_consecutivo INTO v_consecutivo;

  -- Componer folio: 'K-2026-001043'
  RETURN QUERY SELECT
    (v_codigo_suc || '-' || v_anio || '-' || LPAD(v_consecutivo::text, 6, '0'))::varchar AS folio_completo,
    v_consecutivo AS consecutivo;
END;
$$;

COMMENT ON FUNCTION generar_folio IS 'Folio atómico por sucursal/año/tipo. Formato: [codigo]-[anio]-[NNNNNN]. §1.3.bis del /core.';
