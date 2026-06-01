-- 0005 — Turnos, caja y arqueos. Fuente: 1A §6, §8.7, §8.8.
-- ============================================================================
-- Referencias externas (deben existir previamente):
--   tenants            (0002)
--   sucursales, cajas  (0003)
--   auth.users         (Supabase Auth)
-- Helpers reutilizados (NO se redefinen aquí): set_updated_at() (0001),
--   calcular_dia_contable() (migración previa).
-- Orden: enums → turnos → tablas dependientes → RLS → triggers updated_at →
--   triggers §8.7 (transiciones) y §8.8 (dia_contable).
-- ============================================================================

-- ---------- §6.1 Enums asociados ----------

-- Estado del turno (§1.2 del /core)
CREATE TYPE turno_estado AS ENUM (
  'ABIERTO',
  'PENDIENTE_VALIDACION',     -- cerrado con diferencia, esperando PIN admin
  'CERRADO'
);

-- Modo de captura del fondo de caja
CREATE TYPE fondo_modo_captura AS ENUM (
  'DENOMINACION',              -- captura por billete/moneda (default)
  'TOTAL'                      -- captura solo monto total
);

-- Tipo de movimiento de caja (§1.4 del /core)
CREATE TYPE movimiento_tipo AS ENUM (
  'FONDO_APERTURA',
  'INYECCION_FONDO',           -- inyectar efectivo al fondo a media jornada (P-097)
  'SANGRIA',                   -- retiro de efectivo (P-098)
  'DEPOSITO',                  -- depósito bancario / salida de efectivo a banco (P-099)
  'PAGO_PROVEEDOR',            -- pago a proveedor desde la caja (P-100)
  'DEVOLUCION_EFECTIVO',       -- pago de devolución en efectivo
  'AJUSTE_POSITIVO',           -- ajuste manual + (admin)
  'AJUSTE_NEGATIVO'            -- ajuste manual - (admin)
);

-- Decisión del admin al validar un cierre con diferencia (§24.2 paso 6)
CREATE TYPE admin_decision_cierre AS ENUM (
  'ACEPTAR_DIFERENCIA',        -- merma del negocio
  'PENDIENTE_EXTERNA',         -- queda registrada, resolución externa
  'PENDIENTE_INVESTIGACION'    -- caja sigue bloqueada
);

-- ---------- §6.2 Tabla turnos ----------

CREATE TABLE turnos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  caja_id             uuid NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,

  -- Identificación humano-legible: '2026-05-17-C01-01'
  -- (fecha apertura + caja + correlativo del día)
  codigo_turno        varchar(50) NOT NULL,

  -- Día contable al que pertenecen las ventas del turno (D7, §25.3)
  dia_contable        date NOT NULL,

  -- Estado y fechas
  estado              turno_estado NOT NULL DEFAULT 'ABIERTO',
  fecha_apertura      timestamptz NOT NULL DEFAULT now(),
  fecha_cierre        timestamptz NULL,
  fecha_validacion    timestamptz NULL,                  -- cuando admin validó (si aplicó)

  -- Usuario responsable de apertura
  usuario_apertura_id uuid NOT NULL REFERENCES auth.users(id),

  -- Usuario que cerró el turno (puede ser distinto al de apertura si hubo cambio de cajero)
  usuario_cierre_id   uuid NULL REFERENCES auth.users(id),

  -- Admin que validó (si turno cerró con diferencia)
  usuario_validacion_id uuid NULL REFERENCES auth.users(id),

  -- Fondo de apertura
  fondo_inicial_mxn   numeric(12,2) NOT NULL CHECK (fondo_inicial_mxn >= 0),
  fondo_modo          fondo_modo_captura NOT NULL DEFAULT 'DENOMINACION',

  -- Resumen de cierre (snapshot calculado al cerrar)
  efectivo_esperado_mxn numeric(12,2) NULL,
  efectivo_contado_mxn  numeric(12,2) NULL,
  diferencia_mxn        numeric(12,2) NULL,              -- contado - esperado; negativo = faltante

  -- Justificación del cajero si hay diferencia (§24.2 paso 4)
  diferencia_justificacion text NULL,
  diferencia_descripcion text NULL,

  -- Decisión del admin (si aplica)
  admin_decision      admin_decision_cierre NULL,
  admin_notas         text NULL,

  -- Notas libres
  notas_apertura      text NULL,
  notas_cierre        text NULL,

  -- Auditoría
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT codigo_turno_unico UNIQUE (sucursal_id, codigo_turno),
  CONSTRAINT cierre_consistencia CHECK (
    (estado = 'ABIERTO' AND fecha_cierre IS NULL)
    OR (estado IN ('PENDIENTE_VALIDACION', 'CERRADO') AND fecha_cierre IS NOT NULL)
  )
);

-- Solo puede haber UN turno ABIERTO o PENDIENTE_VALIDACION por caja
CREATE UNIQUE INDEX idx_turno_unico_activo_por_caja
  ON turnos(caja_id)
  WHERE estado IN ('ABIERTO', 'PENDIENTE_VALIDACION');

CREATE INDEX idx_turnos_tenant_dia ON turnos(tenant_id, dia_contable);
CREATE INDEX idx_turnos_sucursal_dia ON turnos(sucursal_id, dia_contable);
CREATE INDEX idx_turnos_caja_estado ON turnos(caja_id, estado);
CREATE INDEX idx_turnos_usuario_apertura ON turnos(usuario_apertura_id, fecha_apertura DESC);

COMMENT ON TABLE turnos IS 'Sesión de trabajo de una caja. §7 (apertura), §24 (cierre) del /core.';
COMMENT ON COLUMN turnos.dia_contable IS 'Día al que pertenecen las ventas. Inmutable (D7). §25.3.';
COMMENT ON COLUMN turnos.diferencia_mxn IS 'contado - esperado. Negativo = faltante, positivo = sobrante.';

-- ---------- §6.3 Tabla turno_cajero_historial ----------

CREATE TABLE turno_cajero_historial (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  usuario_id          uuid NOT NULL REFERENCES auth.users(id),

  fecha_inicio        timestamptz NOT NULL,
  fecha_fin           timestamptz NULL,                  -- NULL = está operando ahora

  -- ¿Hubo conteo parcial al hacer cambio? (§8.2 paso 2)
  hizo_conteo_parcial boolean NOT NULL DEFAULT false,
  corte_parcial_id    uuid NULL,                          -- FK a cortes_parciales (FK se agrega después)

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT periodo_valido CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE INDEX idx_turno_cajero_turno ON turno_cajero_historial(turno_id, fecha_inicio);
CREATE INDEX idx_turno_cajero_usuario ON turno_cajero_historial(usuario_id, fecha_inicio DESC);

-- Solo puede haber un cajero "activo" (sin fecha_fin) por turno
CREATE UNIQUE INDEX idx_turno_cajero_activo
  ON turno_cajero_historial(turno_id)
  WHERE fecha_fin IS NULL;

COMMENT ON TABLE turno_cajero_historial IS 'Quién operó la caja durante el turno. §8 cambio de cajero sin cierre.';

-- ---------- §6.4 Tabla cortes_parciales ----------

CREATE TABLE cortes_parciales (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  usuario_id          uuid NOT NULL REFERENCES auth.users(id),

  fecha               timestamptz NOT NULL DEFAULT now(),

  -- Snapshot de venta del cajero saliente
  ventas_efectivo_mxn   numeric(12,2) NOT NULL DEFAULT 0,
  ventas_tarjeta_mxn    numeric(12,2) NOT NULL DEFAULT 0,
  ventas_transferencia_mxn numeric(12,2) NOT NULL DEFAULT 0,
  ventas_vales_mxn      numeric(12,2) NOT NULL DEFAULT 0,
  tickets_count         integer NOT NULL DEFAULT 0,

  -- Conteo de efectivo
  efectivo_esperado_mxn numeric(12,2) NOT NULL,
  efectivo_contado_mxn  numeric(12,2) NOT NULL,
  diferencia_mxn        numeric(12,2) NOT NULL,           -- contado - esperado

  notas                 text NULL,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cortes_parciales_turno ON cortes_parciales(turno_id);

-- FK back-reference desde turno_cajero_historial
ALTER TABLE turno_cajero_historial
  ADD CONSTRAINT fk_corte_parcial
  FOREIGN KEY (corte_parcial_id) REFERENCES cortes_parciales(id);

COMMENT ON TABLE cortes_parciales IS 'Conteo parcial al cambiar de cajero (§8.2). No cierra turno.';

-- ---------- §6.5 Tabla denominaciones_fondo ----------

CREATE TABLE denominaciones_fondo (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,

  denominacion_mxn    numeric(8,2) NOT NULL,             -- 1000.00, 500.00, ..., 0.50
  tipo                varchar(10) NOT NULL CHECK (tipo IN ('BILLETE', 'MONEDA')),
  cantidad            integer NOT NULL CHECK (cantidad >= 0),
  subtotal_mxn        numeric(12,2) GENERATED ALWAYS AS (denominacion_mxn * cantidad) STORED,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT denominacion_unica_por_turno UNIQUE (turno_id, denominacion_mxn)
);

CREATE INDEX idx_denom_fondo_turno ON denominaciones_fondo(turno_id);

-- ---------- §6.6 Tabla movimientos_caja ----------

CREATE TABLE movimientos_caja (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id),
  caja_id             uuid NOT NULL REFERENCES cajas(id),
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,

  -- Folio humano-legible: 'SAN-2026-0142' (sangría), 'DEP-2026-0089' (depósito)
  folio               varchar(50) NOT NULL,

  -- Tipo y signo
  tipo                movimiento_tipo NOT NULL,
  monto_mxn           numeric(12,2) NOT NULL CHECK (monto_mxn > 0),
  -- Si afecta el efectivo de la caja: signo se infiere del tipo (SANGRIA = resta)

  -- Día contable (inherita del turno al crear)
  dia_contable        date NOT NULL,
  fecha               timestamptz NOT NULL DEFAULT now(),

  -- Quién y por qué
  usuario_solicitante_id uuid NOT NULL REFERENCES auth.users(id),
  usuario_autorizo_id    uuid NULL REFERENCES auth.users(id),  -- NULL para FONDO_APERTURA
  autorizacion_pin_id    uuid NULL,                             -- FK a autorizaciones_pin (lazy)

  motivo              varchar(100) NOT NULL,             -- 'Pago a proveedor', 'Refuerzo de fondo', etc.
  descripcion         text NULL,

  -- Comprobante impreso
  comprobante_impreso boolean NOT NULL DEFAULT false,
  fecha_impresion     timestamptz NULL,

  -- Si fue retiro hacia otra caja o sucursal, vínculo opcional
  caja_destino_id     uuid NULL REFERENCES cajas(id),

  -- Cancelación (solo admin puede)
  cancelado           boolean NOT NULL DEFAULT false,
  cancelado_por       uuid NULL REFERENCES auth.users(id),
  fecha_cancelacion   timestamptz NULL,
  motivo_cancelacion  text NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT folio_unico_por_sucursal UNIQUE (sucursal_id, folio)
);

CREATE INDEX idx_movs_turno ON movimientos_caja(turno_id);
CREATE INDEX idx_movs_dia_contable ON movimientos_caja(sucursal_id, dia_contable);
CREATE INDEX idx_movs_tipo ON movimientos_caja(tenant_id, tipo, fecha DESC);
CREATE INDEX idx_movs_no_cancelados ON movimientos_caja(turno_id) WHERE cancelado = false;

COMMENT ON TABLE movimientos_caja IS 'Todos los movimientos de efectivo del turno. §9 sangrías, §10 depósitos.';
COMMENT ON COLUMN movimientos_caja.motivo IS 'Categoría seleccionada de la lista (§9.2 paso 1). Texto libre permitido bajo "Otro".';

-- ---------- §6.7 Tabla denominaciones_conteo ----------

CREATE TABLE denominaciones_conteo (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,

  -- Tipo: cierre final o corte parcial
  tipo_conteo         varchar(20) NOT NULL CHECK (tipo_conteo IN ('CIERRE', 'CORTE_PARCIAL')),
  corte_parcial_id    uuid NULL REFERENCES cortes_parciales(id) ON DELETE CASCADE,

  denominacion_mxn    numeric(8,2) NOT NULL,
  tipo                varchar(10) NOT NULL CHECK (tipo IN ('BILLETE', 'MONEDA')),
  cantidad            integer NOT NULL CHECK (cantidad >= 0),
  subtotal_mxn        numeric(12,2) GENERATED ALWAYS AS (denominacion_mxn * cantidad) STORED,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT denom_conteo_unica UNIQUE (turno_id, tipo_conteo, corte_parcial_id, denominacion_mxn)
);

CREATE INDEX idx_denom_conteo_turno ON denominaciones_conteo(turno_id, tipo_conteo);

-- ---------- §6.8 Tabla cierres_dia ----------

CREATE TABLE cierres_dia (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  dia_contable        date NOT NULL,

  -- Ejecución
  ejecutado_automatico boolean NOT NULL DEFAULT true,    -- true = corrió a las 3:00 AM
  fecha_ejecucion     timestamptz NOT NULL DEFAULT now(),
  ejecutado_por_id    uuid NULL REFERENCES auth.users(id),  -- NULL si automático

  -- Resumen consolidado (snapshot)
  turnos_count        integer NOT NULL DEFAULT 0,
  ventas_brutas_mxn   numeric(14,2) NOT NULL DEFAULT 0,
  descuentos_mxn      numeric(14,2) NOT NULL DEFAULT 0,
  devoluciones_mxn    numeric(14,2) NOT NULL DEFAULT 0,
  ventas_netas_mxn    numeric(14,2) NOT NULL DEFAULT 0,

  ventas_efectivo_mxn      numeric(14,2) NOT NULL DEFAULT 0,
  ventas_tarjeta_mxn       numeric(14,2) NOT NULL DEFAULT 0,
  ventas_transferencia_mxn numeric(14,2) NOT NULL DEFAULT 0,
  ventas_vales_mxn         numeric(14,2) NOT NULL DEFAULT 0,
  ventas_apps_externas_mxn numeric(14,2) NOT NULL DEFAULT 0,

  tickets_cobrados    integer NOT NULL DEFAULT 0,
  tickets_cancelados  integer NOT NULL DEFAULT 0,
  ticket_promedio_mxn numeric(12,2) NULL,

  -- Datos completos para análisis posterior (top productos, hora pico, etc.)
  payload_detalle     jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Estado
  finalizado          boolean NOT NULL DEFAULT true,     -- false si algún turno quedó abierto
  observaciones       text NULL,

  -- Facturación global (Fase Final, cuando módulo CFDI esté activo)
  cfdi_global_emitido boolean NOT NULL DEFAULT false,
  cfdi_global_uuid    uuid NULL,                         -- UUID que devuelve el PAC

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cierre_unico_por_sucursal_dia UNIQUE (sucursal_id, dia_contable)
);

CREATE INDEX idx_cierres_dia_tenant ON cierres_dia(tenant_id, dia_contable DESC);
CREATE INDEX idx_cierres_dia_sucursal ON cierres_dia(sucursal_id, dia_contable DESC);

COMMENT ON TABLE cierres_dia IS 'Z global por sucursal por día contable. §25 del /core.';
COMMENT ON COLUMN cierres_dia.payload_detalle IS 'Datos adicionales (top productos, mix de modos, etc.) sin proliferar columnas.';

-- ---------- §6.9 RLS y políticas ----------

ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
CREATE POLICY turnos_tenant ON turnos FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE turno_cajero_historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY turno_cajero_tenant ON turno_cajero_historial FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE cortes_parciales ENABLE ROW LEVEL SECURITY;
CREATE POLICY cortes_tenant ON cortes_parciales FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE denominaciones_fondo ENABLE ROW LEVEL SECURITY;
CREATE POLICY denom_fondo_tenant ON denominaciones_fondo FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE denominaciones_conteo ENABLE ROW LEVEL SECURITY;
CREATE POLICY denom_conteo_tenant ON denominaciones_conteo FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;
CREATE POLICY movs_tenant ON movimientos_caja FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE cierres_dia ENABLE ROW LEVEL SECURITY;
CREATE POLICY cierres_tenant ON cierres_dia FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ---------- Triggers updated_at (set_updated_at() de 0001) ----------
-- Única tabla de este bloque con columna updated_at: turnos.
CREATE TRIGGER trg_turnos_updated_at
  BEFORE UPDATE ON turnos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- §8.7 Trigger: validar transiciones de estado de turno ----------

CREATE OR REPLACE FUNCTION trg_validar_transicion_turno() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    -- Transiciones válidas:
    --   ABIERTO → PENDIENTE_VALIDACION (cierre con diferencia)
    --   ABIERTO → CERRADO (cierre sin diferencia)
    --   PENDIENTE_VALIDACION → CERRADO (admin valida)
    IF NOT (
      (OLD.estado = 'ABIERTO' AND NEW.estado IN ('PENDIENTE_VALIDACION', 'CERRADO'))
      OR (OLD.estado = 'PENDIENTE_VALIDACION' AND NEW.estado = 'CERRADO')
    ) THEN
      RAISE EXCEPTION 'Transición de turno no permitida: % → %', OLD.estado, NEW.estado;
    END IF;
  END IF;

  -- Si pasa a CERRADO, fecha_cierre obligatoria
  IF NEW.estado IN ('PENDIENTE_VALIDACION', 'CERRADO') AND NEW.fecha_cierre IS NULL THEN
    RAISE EXCEPTION 'fecha_cierre es obligatoria al cerrar turno';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_turnos_validar_estado
  BEFORE UPDATE ON turnos
  FOR EACH ROW EXECUTE FUNCTION trg_validar_transicion_turno();

-- ---------- §8.8 Trigger: asignar dia_contable al crear turno ----------

CREATE OR REPLACE FUNCTION trg_turno_dia_contable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Solo se asigna en INSERT, NUNCA se modifica en UPDATE (D7)
  IF TG_OP = 'INSERT' THEN
    NEW.dia_contable := calcular_dia_contable(NEW.tenant_id, NEW.fecha_apertura);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_turnos_dia_contable
  BEFORE INSERT ON turnos
  FOR EACH ROW EXECUTE FUNCTION trg_turno_dia_contable();

-- Trigger explícito para BLOQUEAR cambios a dia_contable post-creación
CREATE OR REPLACE FUNCTION trg_proteger_dia_contable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.dia_contable IS DISTINCT FROM NEW.dia_contable THEN
    RAISE EXCEPTION 'dia_contable es inmutable una vez creado el turno (D7, §25.3)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_turnos_proteger_dia_contable
  BEFORE UPDATE ON turnos
  FOR EACH ROW EXECUTE FUNCTION trg_proteger_dia_contable();
