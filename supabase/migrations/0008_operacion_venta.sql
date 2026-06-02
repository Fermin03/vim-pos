-- 0008 — Operación de venta (tickets, items, pagos, descuentos, promos). Fuente: 1C.1.
-- ============================================================================
-- Referencias externas (deben existir previamente, NO se redefinen aquí):
--   tenants                                              (0002)
--   sucursales, cajas                                    (0003)
--   turnos                                               (0005)
--   auditoria_eventos                                    (0006)
--   autorizaciones_pin                                   (1A §7.3)
--   productos, categorias, opciones_modificador,
--     grupos_modificadores, areas_cocina                 (0007)
--   promociones, clientes, direcciones_cliente,
--     marcas_virtuales                                   (0007)
--   auth.users                                           (Supabase Auth)
--   Enums: modificador_naturaleza, promocion_tipo,
--          promocion_alcance                             (0007)
--   Funciones helper de 0001-0007 (NO se redefinen):
--     calcular_dia_contable(), generar_folio(),
--     set_updated_at(), descontar_inventario_por_venta()
-- ============================================================================
-- NOTA sobre el "FIX EXCLUDE": el documento fuente 1C.1 NO usa en ningún punto
-- el patrón EXCLUDE ( ... WITH IS NOT DISTINCT FROM ). La idempotencia de sync
-- offline ya está expresada como índices únicos parciales
--   UNIQUE (tenant_id, client_id_local) WHERE client_id_local IS NOT NULL,
-- que es exactamente la forma corregida que se pedía garantizar. Por tanto no
-- hubo ningún EXCLUDE que reemplazar; se transcribe tal cual.
-- ============================================================================

-- ============================================================================
-- §3.1 — Enums de tickets
-- ============================================================================

-- Estado fiscal del ticket (§1.3 del /core)
CREATE TYPE ticket_estado_fiscal AS ENUM (
  'BORRADOR',     -- recién creado, sin items todavía (se descarta solo si no llega a ABIERTO en X minutos)
  'ABIERTO',      -- tiene al menos un item, no cobrado, modificable
  'PAGADO',       -- cobrado completamente, ya no se modifica
  'FACTURADO',    -- CFDI emitido (post-MVP)
  'CANCELADO'     -- anulado con motivo (cancelaciones se modelan completamente en 1C.2)
);

-- Estado de cocina del ticket (§20 del /core; los estados de delivery propio
-- EN_RUTA y ENTREGADO_DOMICILIO se agregan vía ALTER TYPE en Parte 1C.2)
CREATE TYPE ticket_estado_cocina AS ENUM (
  'SIN_ENVIAR',   -- existe el ticket pero la comanda no se ha mandado a cocina
  'EN_COCINA',    -- comanda impresa, cocina está preparando
  'LISTO',        -- cocina marcó como terminado
  'ENTREGADO'     -- el cliente recibió su pedido
);

-- Modo de servicio del ticket (§6 del /core)
CREATE TYPE modo_servicio AS ENUM (
  'COMER_AQUI',
  'PARA_LLEVAR',
  'DRIVE_THRU',
  'DELIVERY_PROPIO',
  'APP_RAPPI',
  'APP_UBEREATS',
  'APP_DIDI',
  'APP_IFOOD',
  'APP_OTRO',
  'MESA',
  'BARRA',
  'EVENTO_PRIVADO'
);

-- Origen de creación del ticket (sync offline vs en línea)
CREATE TYPE ticket_origen AS ENUM (
  'POS_ONLINE',       -- creado con conectividad, escrito directo a Postgres
  'POS_OFFLINE',      -- creado offline, sincronizado después desde Dexie.js
  'API_EXTERNA',      -- futuro: ingesta de Rappi/Uber por API (Dark Kitchen Fase 5)
  'IMPORTADO'         -- migración inicial desde otro POS
);

-- ============================================================================
-- §5.1 — Enums de pagos
-- ============================================================================

-- Método de pago (§17.1 del /core)
CREATE TYPE metodo_pago AS ENUM (
  'EFECTIVO',
  'TARJETA_CREDITO',
  'TARJETA_DEBITO',
  'TRANSFERENCIA',           -- SPEI
  'VALES_DESPENSA',          -- Sodexo, Edenred, etc.
  'CUPON',                   -- cupón canjeado como medio de pago
  'CUENTA_INTERNA',          -- staff, cuenta de la casa
  'APP_RAPPI',
  'APP_UBEREATS',
  'APP_DIDI',
  'APP_IFOOD',
  'APP_OTRO',
  'PAGO_AL_RECIBIR',         -- pendiente hasta que regrese repartidor (delivery propio)
  'OTRO'
);

-- Estado del pago
CREATE TYPE pago_estado AS ENUM (
  'PENDIENTE',               -- registrado pero no aplicado (ej. delivery pago al recibir)
  'APLICADO',                -- entró efectivo a caja o se procesó tarjeta
  'CONCILIADO',              -- apps externas: liquidación llegó y se concilió
  'CANCELADO'                -- reverso por cancelación de ticket
);

-- ============================================================================
-- §6.1 — Enums de descuentos manuales
-- ============================================================================

-- Tipo de descuento manual aplicado al ticket (§14.2)
CREATE TYPE descuento_manual_tipo AS ENUM (
  'PORCENTAJE',           -- N% sobre subtotal o ítem
  'MONTO_FIJO',           -- $X sobre subtotal o ítem
  'CORTESIA_TOTAL',       -- 100% off — ítem o ticket regalado
  'OVERRIDE_PRECIO'       -- ajuste del precio del producto al vuelo (precio nuevo)
);

-- Motivo del descuento manual (§14.3)
CREATE TYPE descuento_manual_motivo AS ENUM (
  'CLIENTE_FRECUENTE',
  'INCONVENIENCIA_OPERATIVA',
  'CORTESIA_INVITADO',
  'PERSONAL_STAFF',
  'PRODUCTO_DEFECTO_LEVE',
  'OTRO'
);

-- ============================================================================
-- §3.2 — Tabla tickets
-- ============================================================================

CREATE TABLE tickets (
  -- ===== Identidad =====
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  caja_id             uuid NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,

  -- Folio interno único (D11; §1.3.bis del /core). Asignado por trigger al pasar de BORRADOR→ABIERTO.
  -- Formato 'K-2026-001043'. Inmutable una vez asignado.
  folio_completo      varchar(50) NULL,
  folio_consecutivo   bigint NULL,

  -- Día contable inmutable (D7; §25.3 del /core). Asignado por trigger en INSERT.
  dia_contable        date NOT NULL,

  -- ===== Clasificación operativa =====
  modo_servicio       modo_servicio NOT NULL,
  marca_virtual_id    uuid NULL REFERENCES marcas_virtuales(id),  -- DK (D25)

  -- Cliente y delivery
  cliente_id          uuid NULL REFERENCES clientes(id),
  direccion_entrega_id uuid NULL REFERENCES direcciones_cliente(id),

  -- Apps externas (D44; §23 del /core)
  folio_externo_app   varchar(100) NULL,    -- ej. 'R-A4F92B' (Rappi), 'UE-12345' (Uber)
  -- 'app_externa_modo' no necesita columna extra: se deriva de modo_servicio cuando es APP_*

  -- Pedidos en espera (D45; §12 del /core)
  etiqueta_espera     varchar(100) NULL,    -- 'Cliente camisa azul', 'Mesa 1 todavía pensando'
  en_espera           boolean NOT NULL DEFAULT false,
  fecha_puesto_en_espera timestamptz NULL,

  -- ===== Estados (D36) =====
  estado_fiscal       ticket_estado_fiscal NOT NULL DEFAULT 'BORRADOR',
  estado_cocina       ticket_estado_cocina NOT NULL DEFAULT 'SIN_ENVIAR',

  -- ===== Notas (D46; §11 del /core) =====
  nota_general        text NULL,
  nota_imprime_en_comanda boolean NOT NULL DEFAULT true,
  nota_imprime_en_ticket  boolean NOT NULL DEFAULT false,

  -- ===== Totales (D42) — mantenidos por recalcular_totales_ticket() =====
  -- Convención: todo en MXN, IVA segregado, snapshot exacto en cada cambio.
  subtotal_mxn            numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_mxn >= 0),
  descuentos_manuales_mxn numeric(12,2) NOT NULL DEFAULT 0 CHECK (descuentos_manuales_mxn >= 0),
  promociones_mxn         numeric(12,2) NOT NULL DEFAULT 0 CHECK (promociones_mxn >= 0),
  iva_mxn                 numeric(12,2) NOT NULL DEFAULT 0 CHECK (iva_mxn >= 0),
  propina_mxn             numeric(12,2) NOT NULL DEFAULT 0 CHECK (propina_mxn >= 0),  -- Fase 2
  total_mxn               numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_mxn >= 0),

  -- Información de pago (consolidada desde tabla pagos)
  monto_pagado_mxn        numeric(12,2) NOT NULL DEFAULT 0 CHECK (monto_pagado_mxn >= 0),
  cambio_mxn              numeric(12,2) NOT NULL DEFAULT 0 CHECK (cambio_mxn >= 0),
  -- Pendiente como columna generada (siempre coherente con total - pagado)
  monto_pendiente_mxn     numeric(12,2) GENERATED ALWAYS AS (total_mxn - monto_pagado_mxn) STORED,

  -- ===== Comanda (impresión a cocina) =====
  comanda_impresa_at      timestamptz NULL,                       -- primera impresión
  comanda_reimpresa_count integer NOT NULL DEFAULT 0,             -- reimpresiones del cajero
  envio_cocina_automatico boolean NOT NULL DEFAULT true,          -- política configurable

  -- ===== Ciclo de vida (timestamps) =====
  fecha_apertura          timestamptz NOT NULL DEFAULT now(),
  fecha_primer_item       timestamptz NULL,                       -- cuando pasó BORRADOR→ABIERTO
  fecha_envio_cocina      timestamptz NULL,                       -- cuando estado_cocina pasó a EN_COCINA
  fecha_pago              timestamptz NULL,                       -- cuando estado_fiscal pasó a PAGADO
  fecha_listo             timestamptz NULL,                       -- cuando estado_cocina pasó a LISTO
  fecha_entrega           timestamptz NULL,                       -- cuando estado_cocina pasó a ENTREGADO

  -- ===== Atribución de usuarios =====
  usuario_apertura_id     uuid NULL REFERENCES auth.users(id),
  usuario_cierre_id       uuid NULL REFERENCES auth.users(id),    -- quien procesó el pago final
  usuario_entrega_id      uuid NULL REFERENCES auth.users(id),    -- quien marcó entregado

  -- ===== Sync offline (D40) =====
  client_id_local         varchar(64) NULL,                       -- idempotencia
  origen_creacion         ticket_origen NOT NULL DEFAULT 'POS_ONLINE',
  sincronizado_at         timestamptz NULL,                       -- cuando llegó al servidor desde offline

  -- ===== Comunes (Parte 1A §2.5) =====
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES auth.users(id),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES auth.users(id),
  deleted_at              timestamptz NULL,
  deleted_by              uuid REFERENCES auth.users(id),

  -- ===== Constraints =====

  -- El folio se exige una vez salido de BORRADOR
  CONSTRAINT folio_obligatorio_post_borrador CHECK (
    (estado_fiscal = 'BORRADOR' AND folio_completo IS NULL)
    OR (estado_fiscal <> 'BORRADOR' AND folio_completo IS NOT NULL)
  ),

  -- Folio único por sucursal (no global, porque el formato lo identifica)
  -- Nombre específico para no colisionar con el de 0005 (índices son globales en Postgres)
  CONSTRAINT ticket_folio_unico_por_sucursal UNIQUE (sucursal_id, folio_completo),

  -- Si tiene direccion_entrega_id, debe tener cliente_id también
  CONSTRAINT direccion_requiere_cliente CHECK (
    direccion_entrega_id IS NULL OR cliente_id IS NOT NULL
  ),

  -- Fechas coherentes
  CONSTRAINT fecha_pago_implica_apertura CHECK (
    fecha_pago IS NULL OR fecha_pago >= fecha_apertura
  ),
  CONSTRAINT fecha_entrega_implica_pago_o_listo CHECK (
    fecha_entrega IS NULL OR fecha_listo IS NOT NULL OR fecha_pago IS NOT NULL
  ),

  -- Si está en espera, debe tener etiqueta_espera
  CONSTRAINT espera_requiere_etiqueta CHECK (
    en_espera = false OR etiqueta_espera IS NOT NULL
  )
);

-- ===== Índices de filtro frecuente =====
CREATE INDEX idx_tickets_tenant_dia ON tickets(tenant_id, dia_contable DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_sucursal_dia ON tickets(sucursal_id, dia_contable DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_turno ON tickets(turno_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_caja_estado ON tickets(caja_id, estado_fiscal)
  WHERE deleted_at IS NULL;

-- Tickets activos del cajero (vista "Pedidos en curso")
CREATE INDEX idx_tickets_activos ON tickets(caja_id, fecha_apertura DESC)
  WHERE deleted_at IS NULL
    AND estado_fiscal IN ('BORRADOR', 'ABIERTO')
    AND en_espera = false;

-- Pedidos en espera (vista §12)
CREATE INDEX idx_tickets_en_espera ON tickets(caja_id, fecha_puesto_en_espera DESC)
  WHERE deleted_at IS NULL
    AND en_espera = true;

-- Búsqueda por cliente (CRM)
CREATE INDEX idx_tickets_cliente ON tickets(cliente_id, fecha_apertura DESC)
  WHERE cliente_id IS NOT NULL AND deleted_at IS NULL;

-- Pedidos en cocina (vista del rol Personal)
CREATE INDEX idx_tickets_cocina_activos ON tickets(sucursal_id, fecha_envio_cocina)
  WHERE deleted_at IS NULL
    AND estado_cocina IN ('EN_COCINA', 'LISTO')
    AND estado_fiscal <> 'CANCELADO';

-- Folio
CREATE UNIQUE INDEX idx_tickets_folio ON tickets(sucursal_id, folio_completo)
  WHERE folio_completo IS NOT NULL;

-- Apps externas (búsqueda por folio externo para conciliación)
CREATE INDEX idx_tickets_folio_externo ON tickets(tenant_id, folio_externo_app)
  WHERE folio_externo_app IS NOT NULL AND deleted_at IS NULL;

-- Marca virtual (DK)
CREATE INDEX idx_tickets_marca_virtual ON tickets(marca_virtual_id, fecha_apertura DESC)
  WHERE marca_virtual_id IS NOT NULL AND deleted_at IS NULL;

-- Sync offline: idempotencia
CREATE UNIQUE INDEX idx_tickets_client_id_local ON tickets(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

-- Tickets pendientes de cobro (pago al recibir, delivery)
CREATE INDEX idx_tickets_pendientes_cobro ON tickets(sucursal_id, fecha_apertura)
  WHERE deleted_at IS NULL
    AND estado_fiscal = 'ABIERTO'
    AND modo_servicio = 'DELIVERY_PROPIO';

COMMENT ON TABLE tickets IS 'Documento de venta. §1.3 del /core. Snapshot defensivo se hace en ticket_items (D34).';
COMMENT ON COLUMN tickets.dia_contable IS 'Inmutable post-creación (D7). Calculado por trigger usando calcular_dia_contable() del tenant.';
COMMENT ON COLUMN tickets.folio_completo IS 'Folio único por sucursal/año (D11). Asignado al transicionar BORRADOR→ABIERTO. §1.3.bis del /core.';
COMMENT ON COLUMN tickets.monto_pendiente_mxn IS 'Generada: total_mxn - monto_pagado_mxn. Permite filtrar pagos parciales eficientemente.';
COMMENT ON COLUMN tickets.client_id_local IS 'ID generado por el cliente offline (Dexie.js). Permite idempotencia al sincronizar (D40).';
COMMENT ON COLUMN tickets.estado_cocina IS 'Plano paralelo al estado_fiscal (D36, §20). Avanza independientemente.';

-- ============================================================================
-- §3.3 — Triggers en tickets
-- ============================================================================

-- 3.3.1 ASIGNAR dia_contable AL INSERT (igual que turnos en Parte 1A §8.8)
CREATE OR REPLACE FUNCTION trg_ticket_dia_contable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.dia_contable := calcular_dia_contable(NEW.tenant_id, NEW.fecha_apertura);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_dia_contable_insert
  BEFORE INSERT ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_dia_contable();

-- 3.3.2 PROTEGER dia_contable y folio_completo POST-INSERT (D7)
CREATE OR REPLACE FUNCTION trg_ticket_proteger_inmutables() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.dia_contable IS NOT NULL AND NEW.dia_contable <> OLD.dia_contable THEN
      RAISE EXCEPTION 'dia_contable es inmutable post-creación (D7, §25.3)';
    END IF;
    IF OLD.folio_completo IS NOT NULL AND NEW.folio_completo IS DISTINCT FROM OLD.folio_completo THEN
      RAISE EXCEPTION 'folio_completo es inmutable una vez asignado (§1.3.bis)';
    END IF;
    IF OLD.folio_consecutivo IS NOT NULL AND NEW.folio_consecutivo IS DISTINCT FROM OLD.folio_consecutivo THEN
      RAISE EXCEPTION 'folio_consecutivo es inmutable una vez asignado';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_proteger_inmutables
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_proteger_inmutables();

-- 3.3.3 ASIGNAR folio AL PASAR DE BORRADOR a ABIERTO
CREATE OR REPLACE FUNCTION trg_ticket_asignar_folio() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_folio_row record;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.estado_fiscal = 'BORRADOR'
     AND NEW.estado_fiscal = 'ABIERTO'
     AND NEW.folio_completo IS NULL THEN

    SELECT folio_completo, consecutivo INTO v_folio_row
    FROM generar_folio(NEW.sucursal_id, 'TICKET', NULL);

    NEW.folio_completo := v_folio_row.folio_completo;
    NEW.folio_consecutivo := v_folio_row.consecutivo;
    NEW.fecha_primer_item := COALESCE(NEW.fecha_primer_item, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_asignar_folio
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_asignar_folio();

-- 3.3.4 VALIDAR TRANSICIÓN DE estado_fiscal (§1.3)
CREATE OR REPLACE FUNCTION trg_ticket_validar_estado_fiscal() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado_fiscal IS DISTINCT FROM NEW.estado_fiscal THEN
    -- Transiciones válidas:
    --   BORRADOR  → ABIERTO | CANCELADO
    --   ABIERTO   → PAGADO  | CANCELADO
    --   PAGADO    → FACTURADO | CANCELADO
    --   FACTURADO → CANCELADO (requiere sustitución CFDI, manejado en 1C.2)
    --   CANCELADO → (terminal, no más transiciones)
    IF NOT (
      (OLD.estado_fiscal = 'BORRADOR'  AND NEW.estado_fiscal IN ('ABIERTO', 'CANCELADO'))
      OR (OLD.estado_fiscal = 'ABIERTO'   AND NEW.estado_fiscal IN ('PAGADO', 'CANCELADO'))
      OR (OLD.estado_fiscal = 'PAGADO'    AND NEW.estado_fiscal IN ('FACTURADO', 'CANCELADO'))
      OR (OLD.estado_fiscal = 'FACTURADO' AND NEW.estado_fiscal = 'CANCELADO')
    ) THEN
      RAISE EXCEPTION 'Transición de estado_fiscal no permitida: % → %', OLD.estado_fiscal, NEW.estado_fiscal;
    END IF;

    -- Cuando pasa a PAGADO, fecha_pago debe quedar fijada
    IF NEW.estado_fiscal = 'PAGADO' AND NEW.fecha_pago IS NULL THEN
      NEW.fecha_pago := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_validar_estado_fiscal
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_validar_estado_fiscal();

-- 3.3.5 VALIDAR TRANSICIÓN DE estado_cocina (§20.3)
CREATE OR REPLACE FUNCTION trg_ticket_validar_estado_cocina() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado_cocina IS DISTINCT FROM NEW.estado_cocina THEN
    -- Transiciones válidas (avance hacia adelante):
    --   SIN_ENVIAR → EN_COCINA
    --   EN_COCINA  → LISTO
    --   LISTO      → ENTREGADO
    -- Las transiciones reversas (corrección de errores) requieren PIN de admin
    -- y se hacen vía función dedicada que pasa por aquí desactivando temporalmente
    -- la validación con SET LOCAL session_replication_role = 'replica'.
    IF NOT (
      (OLD.estado_cocina = 'SIN_ENVIAR' AND NEW.estado_cocina = 'EN_COCINA')
      OR (OLD.estado_cocina = 'EN_COCINA'  AND NEW.estado_cocina = 'LISTO')
      OR (OLD.estado_cocina = 'LISTO'      AND NEW.estado_cocina = 'ENTREGADO')
    ) THEN
      RAISE EXCEPTION 'Transición de estado_cocina no permitida sin autorización: % → %', OLD.estado_cocina, NEW.estado_cocina
        USING HINT = 'Reversas requieren función transicionar_estado_cocina_con_autorizacion()';
    END IF;

    -- Timestamps por transición
    IF NEW.estado_cocina = 'EN_COCINA' AND NEW.fecha_envio_cocina IS NULL THEN
      NEW.fecha_envio_cocina := now();
    ELSIF NEW.estado_cocina = 'LISTO' AND NEW.fecha_listo IS NULL THEN
      NEW.fecha_listo := now();
    ELSIF NEW.estado_cocina = 'ENTREGADO' AND NEW.fecha_entrega IS NULL THEN
      NEW.fecha_entrega := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_validar_estado_cocina
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_validar_estado_cocina();

-- 3.3.6 DESCONTAR INVENTARIO AL PAGAR (invoca función de Parte 1B §9.6)
CREATE OR REPLACE FUNCTION trg_ticket_descontar_inventario_al_pagar() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Cuando estado_fiscal pasa a PAGADO, descontar insumos
  IF TG_OP = 'UPDATE'
     AND OLD.estado_fiscal <> 'PAGADO'
     AND NEW.estado_fiscal = 'PAGADO' THEN
    -- La función ya valida internamente si el módulo de inventario está activo
    PERFORM descontar_inventario_por_venta(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_descontar_inventario
  AFTER UPDATE OF estado_fiscal ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_descontar_inventario_al_pagar();

-- 3.3.7 AUTO-AVANZAR estado_cocina AL PAGAR (política configurable, §19.4)
-- Si configuracion_tenant.envio_cocina_al_cobrar = true (default), al pagar
-- se manda automáticamente la comanda a cocina.
CREATE OR REPLACE FUNCTION trg_ticket_auto_enviar_cocina_al_pagar() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_politica_envio boolean;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.estado_fiscal <> 'PAGADO'
     AND NEW.estado_fiscal = 'PAGADO'
     AND NEW.estado_cocina = 'SIN_ENVIAR'
     AND NEW.envio_cocina_automatico = true THEN
    -- Avanzar a EN_COCINA. Esto disparará trg_tickets_validar_estado_cocina
    -- que asignará fecha_envio_cocina.
    NEW.estado_cocina := 'EN_COCINA';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_auto_enviar_cocina
  BEFORE UPDATE OF estado_fiscal ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_auto_enviar_cocina_al_pagar();

-- 3.3.8 set_updated_at
CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3.3.9 AUDITORÍA de cambios de estado fiscal críticos
CREATE OR REPLACE FUNCTION trg_ticket_audit_estado() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado_fiscal IS DISTINCT FROM NEW.estado_fiscal THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, caja_id, turno_id,
      usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload, dia_contable
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id,
      NEW.updated_by, 'VENTA', 'ticket.estado_fiscal.cambio',
      'ticket', NEW.id,
      jsonb_build_object(
        'estado_anterior', OLD.estado_fiscal,
        'estado_nuevo', NEW.estado_fiscal,
        'folio', NEW.folio_completo,
        'total_mxn', NEW.total_mxn
      ),
      NEW.dia_contable
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_audit_estado
  AFTER UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_audit_estado();

-- ============================================================================
-- §4.1 — Tabla ticket_items
-- ============================================================================

CREATE TABLE ticket_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  ticket_id           uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,

  -- FK blanda al catálogo: nullable porque el producto puede soft-deletearse
  producto_id         uuid NULL REFERENCES productos(id),

  -- ===== Cantidad y orden =====
  cantidad            numeric(12,3) NOT NULL CHECK (cantidad > 0),
  orden_visualizacion integer NOT NULL DEFAULT 0,

  -- ===== Snapshot defensivo del producto (D34) =====
  producto_nombre_snapshot       varchar(150) NOT NULL,
  producto_sku_snapshot          varchar(50) NULL,
  precio_unitario_snapshot       numeric(12,2) NOT NULL CHECK (precio_unitario_snapshot >= 0),
  tasa_iva_snapshot              numeric(5,2)  NOT NULL CHECK (tasa_iva_snapshot >= 0 AND tasa_iva_snapshot <= 100),
  iva_incluido_en_precio_snapshot boolean      NOT NULL,
  clave_sat_snapshot             varchar(20) NULL,
  unidad_sat_snapshot            varchar(10) NULL,
  -- Categoría: solo el nombre (FK no necesaria para snapshot)
  categoria_nombre_snapshot      varchar(100) NULL,
  -- Modos de servicio aplicables (para auditar conflictos en reportes)
  modos_servicio_snapshot        text[] NULL,
  -- Área de cocina (para reportes de carga de estaciones)
  area_cocina_nombre_snapshot    varchar(100) NULL,

  -- ===== Override de precio (cuando admin permite cambiar precio en línea) =====
  precio_override                boolean NOT NULL DEFAULT false,
  precio_unitario_original_snapshot numeric(12,2) NULL,           -- el de catálogo antes del override
  autorizacion_pin_override_id   uuid NULL REFERENCES autorizaciones_pin(id),

  -- ===== Notas =====
  nota_cocina         text NULL,                                  -- "bien doradito", "sin cebolla"

  -- ===== Cálculo del item (mantenido por trigger) =====
  -- subtotal_bruto = cantidad * precio_unitario_snapshot
  -- ya considera el caso "IVA incluido" o "IVA por afuera" en recalcular_totales_ticket()
  subtotal_bruto_mxn       numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_bruto_mxn >= 0),
  monto_modificadores_mxn  numeric(12,2) NOT NULL DEFAULT 0 CHECK (monto_modificadores_mxn >= 0),
  descuento_item_mxn       numeric(12,2) NOT NULL DEFAULT 0 CHECK (descuento_item_mxn >= 0),
  promocion_item_mxn       numeric(12,2) NOT NULL DEFAULT 0 CHECK (promocion_item_mxn >= 0),
  iva_item_mxn             numeric(12,2) NOT NULL DEFAULT 0 CHECK (iva_item_mxn >= 0),
  total_item_mxn           numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_item_mxn >= 0),

  -- ===== Cancelación individual del item (§16 del /core, edición pre-cobro) =====
  cancelado           boolean NOT NULL DEFAULT false,
  motivo_cancelacion  text NULL,
  usuario_cancelo_id  uuid NULL REFERENCES auth.users(id),
  autorizacion_cancelacion_id uuid NULL REFERENCES autorizaciones_pin(id),
  cancelado_at        timestamptz NULL,

  -- ===== Sync offline =====
  client_id_local     varchar(64) NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),

  CONSTRAINT precio_override_coherente CHECK (
    (precio_override = false AND precio_unitario_original_snapshot IS NULL AND autorizacion_pin_override_id IS NULL)
    OR (precio_override = true AND precio_unitario_original_snapshot IS NOT NULL AND autorizacion_pin_override_id IS NOT NULL)
  ),
  CONSTRAINT cancelacion_coherente CHECK (
    (cancelado = false AND cancelado_at IS NULL AND motivo_cancelacion IS NULL)
    OR (cancelado = true AND cancelado_at IS NOT NULL AND motivo_cancelacion IS NOT NULL)
  )
);

CREATE INDEX idx_ticket_items_ticket ON ticket_items(ticket_id)
  WHERE cancelado = false;
CREATE INDEX idx_ticket_items_producto ON ticket_items(producto_id)
  WHERE producto_id IS NOT NULL;
CREATE INDEX idx_ticket_items_tenant ON ticket_items(tenant_id);
CREATE UNIQUE INDEX idx_ticket_items_client_id_local ON ticket_items(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE ticket_items IS 'Líneas de venta con snapshot defensivo del producto (D34). Resistente a soft delete y cambios de precio del catálogo.';
COMMENT ON COLUMN ticket_items.cancelado IS 'Cancelación individual pre-cobro (§16). NO confundir con tickets.estado_fiscal = CANCELADO.';
COMMENT ON COLUMN ticket_items.precio_override IS 'TRUE si admin/supervisor cambió el precio en línea. Requiere autorización registrada en autorizacion_pin_override_id.';

-- ============================================================================
-- §4.2 — Tabla ticket_item_modificadores
-- ============================================================================

CREATE TABLE ticket_item_modificadores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  ticket_item_id      uuid NOT NULL REFERENCES ticket_items(id) ON DELETE CASCADE,

  -- FKs blandas al catálogo (nullable por soft delete)
  opcion_modificador_id uuid NULL REFERENCES opciones_modificador(id),
  grupo_id              uuid NULL REFERENCES grupos_modificadores(id),

  -- ===== Snapshot del modificador (D47) =====
  grupo_nombre_snapshot      varchar(100) NOT NULL,        -- 'Término de cocción'
  opcion_nombre_snapshot     varchar(100) NOT NULL,        -- 'Tres cuartos'
  precio_extra_snapshot      numeric(12,2) NOT NULL DEFAULT 0 CHECK (precio_extra_snapshot >= 0),
  -- naturaleza es esencial para descontar_inventario_por_venta() de 1B §9.6
  naturaleza_snapshot        modificador_naturaleza NOT NULL,  -- enum de Parte 1B: EXTRA, SUSTITUCION, OBSERVACION

  -- ===== Cantidad del modificador (ej. "extra queso x2") =====
  cantidad            integer NOT NULL DEFAULT 1 CHECK (cantidad >= 1),
  monto_total_mxn     numeric(12,2) NOT NULL DEFAULT 0 CHECK (monto_total_mxn >= 0),

  -- ===== Sync offline =====
  client_id_local     varchar(64) NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tim_ticket_item ON ticket_item_modificadores(ticket_item_id);
CREATE INDEX idx_tim_opcion ON ticket_item_modificadores(opcion_modificador_id)
  WHERE opcion_modificador_id IS NOT NULL;
CREATE INDEX idx_tim_tenant ON ticket_item_modificadores(tenant_id);
CREATE UNIQUE INDEX idx_tim_client_id_local ON ticket_item_modificadores(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE ticket_item_modificadores IS 'Modificadores aplicados a un ticket_item con snapshot completo (D47). naturaleza_snapshot crítica para descuento de inventario.';

-- ============================================================================
-- §4.3 — Triggers en ticket_items y ticket_item_modificadores
-- ============================================================================

-- 4.3.1 AL INSERT/UPDATE/DELETE en items o modificadores, recalcular totales del ticket
CREATE OR REPLACE FUNCTION trg_item_recalc_totales() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_id uuid;
BEGIN
  -- Determinar el ticket_id afectado
  IF TG_OP = 'DELETE' THEN
    v_ticket_id := OLD.ticket_id;
  ELSE
    v_ticket_id := NEW.ticket_id;
  END IF;

  -- Recalcular totales del ticket
  PERFORM recalcular_totales_ticket(v_ticket_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_ticket_items_recalc
  AFTER INSERT OR UPDATE OR DELETE ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION trg_item_recalc_totales();

-- Para modificadores: trigger similar pero recalcula vía el item
CREATE OR REPLACE FUNCTION trg_modif_recalc_totales() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_id uuid;
  v_ticket_item_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ticket_item_id := OLD.ticket_item_id;
  ELSE
    v_ticket_item_id := NEW.ticket_item_id;
  END IF;

  SELECT ticket_id INTO v_ticket_id FROM ticket_items WHERE id = v_ticket_item_id;

  IF v_ticket_id IS NOT NULL THEN
    PERFORM recalcular_totales_ticket(v_ticket_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_ticket_item_modif_recalc
  AFTER INSERT OR UPDATE OR DELETE ON ticket_item_modificadores
  FOR EACH ROW EXECUTE FUNCTION trg_modif_recalc_totales();

-- 4.3.2 AL INSERT del primer item, pasar ticket de BORRADOR a ABIERTO
-- (la asignación de folio se dispara automáticamente vía trg_tickets_asignar_folio)
CREATE OR REPLACE FUNCTION trg_ticket_item_promover_borrador() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_estado ticket_estado_fiscal;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT estado_fiscal INTO v_estado FROM tickets WHERE id = NEW.ticket_id;

    IF v_estado = 'BORRADOR' THEN
      UPDATE tickets
      SET estado_fiscal = 'ABIERTO'
      WHERE id = NEW.ticket_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ticket_items_promover_borrador
  AFTER INSERT ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_item_promover_borrador();

-- 4.3.3 set_updated_at
CREATE TRIGGER trg_ticket_items_updated_at
  BEFORE UPDATE ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tim_updated_at
  BEFORE UPDATE ON ticket_item_modificadores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- §5.2 — Tabla pagos
-- ============================================================================

CREATE TABLE pagos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  caja_id             uuid NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,
  ticket_id           uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,

  -- Día contable (denormalizado para reportes; debe coincidir con tickets.dia_contable)
  dia_contable        date NOT NULL,

  -- ===== Método y monto =====
  metodo_pago         metodo_pago NOT NULL,
  monto_mxn           numeric(12,2) NOT NULL CHECK (monto_mxn > 0),

  -- Cuando el método es EFECTIVO y el cliente entrega de más:
  monto_recibido_mxn  numeric(12,2) NULL CHECK (monto_recibido_mxn IS NULL OR monto_recibido_mxn >= monto_mxn),
  cambio_mxn          numeric(12,2) NOT NULL DEFAULT 0 CHECK (cambio_mxn >= 0),

  -- ===== Referencias por método (§17.1) =====
  referencia          varchar(150) NULL,              -- últimos 4 dígitos tarjeta, ref SPEI, folio vale, código cupón
  terminal_aprobacion varchar(50) NULL,               -- código de autorización terminal bancaria
  folio_externo       varchar(100) NULL,              -- folio app externa cuando metodo es APP_*

  -- ===== Pago al recibir (delivery propio) =====
  es_pago_al_recibir  boolean NOT NULL DEFAULT false,
  metodo_real         metodo_pago NULL,               -- cuando el repartidor regresa, qué se cobró realmente
  monto_real_mxn      numeric(12,2) NULL,             -- monto real cobrado (puede diferir en caso edge)

  -- ===== Conciliación (apps externas) =====
  estado              pago_estado NOT NULL DEFAULT 'APLICADO',
  conciliado_at       timestamptz NULL,
  conciliado_por_id   uuid NULL REFERENCES auth.users(id),

  -- ===== Atribución =====
  usuario_id          uuid NOT NULL REFERENCES auth.users(id),  -- quien procesó el pago
  fecha_pago          timestamptz NOT NULL DEFAULT now(),

  -- ===== Nota libre =====
  nota                text NULL,

  -- ===== Sync offline =====
  client_id_local     varchar(64) NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,
  deleted_by          uuid REFERENCES auth.users(id),

  -- Constraints
  CONSTRAINT cambio_solo_efectivo CHECK (
    cambio_mxn = 0 OR metodo_pago = 'EFECTIVO'
  ),
  CONSTRAINT pago_al_recibir_coherente CHECK (
    es_pago_al_recibir = false
    OR (es_pago_al_recibir = true AND metodo_pago = 'PAGO_AL_RECIBIR')
  ),
  CONSTRAINT conciliacion_coherente CHECK (
    (estado <> 'CONCILIADO' AND conciliado_at IS NULL)
    OR (estado = 'CONCILIADO' AND conciliado_at IS NOT NULL)
  )
);

CREATE INDEX idx_pagos_ticket ON pagos(ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pagos_turno_metodo ON pagos(turno_id, metodo_pago) WHERE deleted_at IS NULL;
CREATE INDEX idx_pagos_dia_metodo ON pagos(tenant_id, dia_contable, metodo_pago) WHERE deleted_at IS NULL;
CREATE INDEX idx_pagos_pendientes ON pagos(sucursal_id, fecha_pago)
  WHERE deleted_at IS NULL AND estado = 'PENDIENTE';
CREATE INDEX idx_pagos_apps_no_conciliados ON pagos(tenant_id, fecha_pago)
  WHERE deleted_at IS NULL
    AND metodo_pago IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI', 'APP_IFOOD', 'APP_OTRO')
    AND estado = 'APLICADO';
CREATE UNIQUE INDEX idx_pagos_client_id_local ON pagos(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE pagos IS 'Pagos del ticket. 1:N con tickets (D35). Soporta pago dividido (§17.3) y pago al recibir (delivery propio).';
COMMENT ON COLUMN pagos.dia_contable IS 'Denormalizado desde tickets para reportes por día. El trigger lo sincroniza al crear.';
COMMENT ON COLUMN pagos.es_pago_al_recibir IS 'TRUE para delivery propio cuando el cobro lo hace el repartidor. metodo_real se llena al regresar.';

-- ============================================================================
-- §5.3 — Triggers en pagos
-- ============================================================================

-- 5.3.1 Asignar dia_contable y validar coherencia con el ticket
CREATE OR REPLACE FUNCTION trg_pago_dia_contable() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_dia date;
  v_ticket_tenant uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT dia_contable, tenant_id INTO v_ticket_dia, v_ticket_tenant
    FROM tickets WHERE id = NEW.ticket_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ticket % no existe', NEW.ticket_id;
    END IF;
    IF v_ticket_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'Inconsistencia: pago.tenant_id (%) <> ticket.tenant_id (%)', NEW.tenant_id, v_ticket_tenant;
    END IF;

    NEW.dia_contable := v_ticket_dia;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pagos_dia_contable
  BEFORE INSERT ON pagos
  FOR EACH ROW EXECUTE FUNCTION trg_pago_dia_contable();

-- 5.3.2 Proteger dia_contable inmutable
CREATE OR REPLACE FUNCTION trg_pago_proteger_dia() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.dia_contable <> NEW.dia_contable THEN
    RAISE EXCEPTION 'pagos.dia_contable es inmutable (D7)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pagos_proteger_dia
  BEFORE UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION trg_pago_proteger_dia();

-- 5.3.3 Recalcular totales del ticket al insertar/actualizar/eliminar pago
CREATE OR REPLACE FUNCTION trg_pago_recalc_totales() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ticket_id := OLD.ticket_id;
  ELSE
    v_ticket_id := NEW.ticket_id;
  END IF;

  PERFORM recalcular_totales_ticket(v_ticket_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_pagos_recalc
  AFTER INSERT OR UPDATE OR DELETE ON pagos
  FOR EACH ROW EXECUTE FUNCTION trg_pago_recalc_totales();

-- 5.3.4 set_updated_at
CREATE TRIGGER trg_pagos_updated_at
  BEFORE UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5.3.5 Generar movimiento_caja cuando es pago en efectivo APLICADO
-- (refleja §17.5 del /core: efectivo entra a caja al cobrar)
CREATE OR REPLACE FUNCTION trg_pago_generar_movimiento_caja() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Solo para EFECTIVO en estado APLICADO (no para PENDIENTE de delivery)
  IF TG_OP = 'INSERT'
     AND NEW.metodo_pago = 'EFECTIVO'
     AND NEW.estado = 'APLICADO' THEN
    -- Insertar entrada en movimientos_caja como VENTA_EFECTIVO
    -- (la tabla existe en Parte 1A §6.4; se documentó tipo_movimiento, esta
    -- tipificación VENTA_EFECTIVO está implícita en el corte; aquí registramos
    -- el lado de caja como un movimiento informativo no transaccional)
    -- NOTA: si Parte 1A no incluyó VENTA_EFECTIVO en el enum, ese tipo se agrega
    -- vía ALTER TYPE en la migración correspondiente; aquí asumimos su existencia.
    -- Si no se quiere expandir el enum, el corte cuenta venta_efectivo via la
    -- query SUM(pagos WHERE metodo=EFECTIVO) sin necesidad de fila en movimientos_caja.
    -- Decisión documentada en §11.
    NULL;  -- en MVP, el corte calcula efectivo via JOIN pagos; no insertamos movimientos
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger NO se activa por default en MVP. Se documenta para activación futura
-- si se decide reflejar pagos como movimientos formales. Queda como decisión §11.

-- 5.3.6 Audit del pago
CREATE OR REPLACE FUNCTION trg_pago_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, caja_id, turno_id,
      usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload, dia_contable
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id,
      NEW.usuario_id, 'COBRO', 'pago.aplicado',
      'pago', NEW.id,
      jsonb_build_object(
        'ticket_id', NEW.ticket_id,
        'metodo_pago', NEW.metodo_pago,
        'monto_mxn', NEW.monto_mxn,
        'es_pago_al_recibir', NEW.es_pago_al_recibir,
        'referencia', NEW.referencia
      ),
      NEW.dia_contable
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pagos_audit
  AFTER INSERT ON pagos
  FOR EACH ROW EXECUTE FUNCTION trg_pago_audit();

-- ============================================================================
-- §6.2 — Tabla ticket_descuentos_manuales
-- ============================================================================

CREATE TABLE ticket_descuentos_manuales (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  ticket_id           uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,

  -- NULL = se aplica al ticket completo. Si tiene valor, aplica solo a ese item.
  ticket_item_id      uuid NULL REFERENCES ticket_items(id) ON DELETE CASCADE,

  -- ===== Tipo y valor =====
  tipo                descuento_manual_tipo NOT NULL,
  valor_porcentaje    numeric(5,2) NULL CHECK (valor_porcentaje IS NULL OR (valor_porcentaje > 0 AND valor_porcentaje <= 100)),
  valor_monto_mxn     numeric(12,2) NULL CHECK (valor_monto_mxn IS NULL OR valor_monto_mxn > 0),
  precio_override_mxn numeric(12,2) NULL CHECK (precio_override_mxn IS NULL OR precio_override_mxn >= 0),

  -- Monto efectivamente descontado (calculado al aplicar)
  monto_descontado_mxn numeric(12,2) NOT NULL CHECK (monto_descontado_mxn >= 0),

  -- ===== Motivo (obligatorio §14.3) =====
  motivo_categoria    descuento_manual_motivo NOT NULL,
  motivo_texto        text NULL,             -- obligatorio si motivo_categoria = 'OTRO'

  -- ===== Autorización por PIN (D41, §14.1) =====
  autorizacion_pin_id uuid NOT NULL REFERENCES autorizaciones_pin(id),
  usuario_solicitante_id uuid NOT NULL REFERENCES auth.users(id),
  usuario_autorizo_id    uuid NOT NULL REFERENCES auth.users(id),

  aplicado_at         timestamptz NOT NULL DEFAULT now(),

  -- ===== Reverso (rara vez se usa, pero permitido) =====
  reversado           boolean NOT NULL DEFAULT false,
  reversado_at        timestamptz NULL,
  reversado_por_id    uuid NULL REFERENCES auth.users(id),
  motivo_reverso      text NULL,

  -- ===== Sync offline =====
  client_id_local     varchar(64) NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Constraints de coherencia tipo↔valor
  CONSTRAINT valor_consistente_descuento CHECK (
    (tipo = 'PORCENTAJE'      AND valor_porcentaje IS NOT NULL AND valor_monto_mxn IS NULL AND precio_override_mxn IS NULL)
    OR (tipo = 'MONTO_FIJO'   AND valor_monto_mxn IS NOT NULL AND valor_porcentaje IS NULL AND precio_override_mxn IS NULL)
    OR (tipo = 'CORTESIA_TOTAL' AND valor_porcentaje IS NULL AND valor_monto_mxn IS NULL AND precio_override_mxn IS NULL)
    OR (tipo = 'OVERRIDE_PRECIO' AND precio_override_mxn IS NOT NULL AND ticket_item_id IS NOT NULL)
  ),
  -- OVERRIDE_PRECIO solo aplica a ítem específico, no al ticket completo
  CONSTRAINT override_requiere_item CHECK (
    tipo <> 'OVERRIDE_PRECIO' OR ticket_item_id IS NOT NULL
  ),
  -- Motivo OTRO requiere texto
  CONSTRAINT motivo_otro_requiere_texto CHECK (
    motivo_categoria <> 'OTRO' OR motivo_texto IS NOT NULL
  ),
  CONSTRAINT reverso_coherente CHECK (
    (reversado = false AND reversado_at IS NULL)
    OR (reversado = true AND reversado_at IS NOT NULL AND motivo_reverso IS NOT NULL)
  )
);

CREATE INDEX idx_descmanual_ticket ON ticket_descuentos_manuales(ticket_id) WHERE reversado = false;
CREATE INDEX idx_descmanual_item ON ticket_descuentos_manuales(ticket_item_id) WHERE ticket_item_id IS NOT NULL AND reversado = false;
CREATE INDEX idx_descmanual_autorizo ON ticket_descuentos_manuales(usuario_autorizo_id, aplicado_at DESC);
CREATE INDEX idx_descmanual_tenant_fecha ON ticket_descuentos_manuales(tenant_id, aplicado_at DESC);
CREATE UNIQUE INDEX idx_descmanual_client_id_local ON ticket_descuentos_manuales(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE ticket_descuentos_manuales IS 'Descuentos manuales aplicados a tickets/items. SIEMPRE con autorización PIN (D41, §14.1).';
COMMENT ON COLUMN ticket_descuentos_manuales.autorizacion_pin_id IS 'FK obligatoria a autorizaciones_pin de Parte 1A. Sin PIN no hay descuento manual.';

-- ============================================================================
-- §6.3 — Triggers en ticket_descuentos_manuales
-- ============================================================================

-- Recalcular totales del ticket al aplicar/reversar descuento
CREATE OR REPLACE FUNCTION trg_descmanual_recalc() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ticket_id := OLD.ticket_id;
  ELSE
    v_ticket_id := NEW.ticket_id;
  END IF;

  PERFORM recalcular_totales_ticket(v_ticket_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE TRIGGER trg_descmanual_recalc
  AFTER INSERT OR UPDATE OR DELETE ON ticket_descuentos_manuales
  FOR EACH ROW EXECUTE FUNCTION trg_descmanual_recalc();

CREATE TRIGGER trg_descmanual_updated_at
  BEFORE UPDATE ON ticket_descuentos_manuales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auditoría
CREATE OR REPLACE FUNCTION trg_descmanual_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_eventos (
      tenant_id, usuario_id, usuario_autorizo_id,
      categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.usuario_solicitante_id, NEW.usuario_autorizo_id,
      'DESCUENTO', 'descuento_manual.aplicado',
      'ticket', NEW.ticket_id,
      jsonb_build_object(
        'tipo', NEW.tipo,
        'monto_descontado_mxn', NEW.monto_descontado_mxn,
        'motivo_categoria', NEW.motivo_categoria,
        'motivo_texto', NEW.motivo_texto,
        'ticket_item_id', NEW.ticket_item_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_descmanual_audit
  AFTER INSERT ON ticket_descuentos_manuales
  FOR EACH ROW EXECUTE FUNCTION trg_descmanual_audit();

-- ============================================================================
-- §7.1 — Tabla ticket_promociones_aplicadas
-- ============================================================================

CREATE TABLE ticket_promociones_aplicadas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  ticket_id           uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  promocion_id        uuid NOT NULL REFERENCES promociones(id),

  -- ===== Snapshot de la promoción (resistente a edición/borrado de promociones) =====
  promocion_nombre_snapshot       varchar(150) NOT NULL,
  promocion_tipo_snapshot         promocion_tipo NOT NULL,         -- enum de Parte 1B §6.1
  promocion_alcance_snapshot      promocion_alcance NOT NULL,      -- enum de Parte 1B §6.1
  -- Valor que rigió la aplicación
  valor_porcentaje_snapshot       numeric(5,2) NULL,
  valor_monto_snapshot            numeric(12,2) NULL,
  precio_especial_snapshot        numeric(12,2) NULL,
  precio_combo_snapshot           numeric(12,2) NULL,

  -- ===== Monto efectivamente descontado =====
  monto_descontado_mxn            numeric(12,2) NOT NULL CHECK (monto_descontado_mxn >= 0),

  -- Items afectados (referencia denormalizada para reportes rápidos)
  -- Cada uuid es un ticket_items.id. Vacío para promociones aplicadas al ticket completo.
  items_afectados                 uuid[] NOT NULL DEFAULT '{}',

  -- ===== Captura del momento de evaluación =====
  cumple_condiciones_snapshot     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- ej: {"horario": true, "monto_minimo": true, "modo_servicio": "PARA_LLEVAR"}

  -- ===== Cancelación manual de la promoción (§14.7 — cliente la rechaza) =====
  cancelada_por_cajero            boolean NOT NULL DEFAULT false,
  motivo_cancelacion              text NULL,
  usuario_que_cancelo_id          uuid NULL REFERENCES auth.users(id),
  cancelada_at                    timestamptz NULL,

  -- ===== Cliente asociado (para reportes CRM) =====
  cliente_id          uuid NULL REFERENCES clientes(id),

  aplicado_at         timestamptz NOT NULL DEFAULT now(),

  -- ===== Sync offline =====
  client_id_local     varchar(64) NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cancelacion_promo_coherente CHECK (
    (cancelada_por_cajero = false AND cancelada_at IS NULL)
    OR (cancelada_por_cajero = true AND cancelada_at IS NOT NULL AND motivo_cancelacion IS NOT NULL)
  )
);

CREATE INDEX idx_promo_apl_ticket ON ticket_promociones_aplicadas(ticket_id)
  WHERE cancelada_por_cajero = false;
CREATE INDEX idx_promo_apl_promocion ON ticket_promociones_aplicadas(promocion_id, aplicado_at DESC);
CREATE INDEX idx_promo_apl_cliente ON ticket_promociones_aplicadas(cliente_id, aplicado_at DESC)
  WHERE cliente_id IS NOT NULL;
CREATE INDEX idx_promo_apl_tenant_fecha ON ticket_promociones_aplicadas(tenant_id, aplicado_at DESC);
CREATE UNIQUE INDEX idx_promo_apl_client_id_local ON ticket_promociones_aplicadas(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE ticket_promociones_aplicadas IS 'Promociones automáticas aplicadas a tickets. Snapshot defensivo (D41). NO requieren PIN.';
COMMENT ON COLUMN ticket_promociones_aplicadas.cumple_condiciones_snapshot IS 'Snapshot del resultado de evaluar las condiciones jsonb de la promoción. Útil para auditoría.';

-- ============================================================================
-- §7.2 — Triggers en ticket_promociones_aplicadas
-- ============================================================================

-- Recalcular totales del ticket al aplicar/cancelar promoción
CREATE OR REPLACE FUNCTION trg_promo_apl_recalc() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ticket_id := OLD.ticket_id;
  ELSE
    v_ticket_id := NEW.ticket_id;
  END IF;

  PERFORM recalcular_totales_ticket(v_ticket_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE TRIGGER trg_promo_apl_recalc
  AFTER INSERT OR UPDATE OR DELETE ON ticket_promociones_aplicadas
  FOR EACH ROW EXECUTE FUNCTION trg_promo_apl_recalc();

-- Incrementar usos_actuales en la promoción al aplicar; decrementar al cancelar
CREATE OR REPLACE FUNCTION trg_promo_apl_actualizar_uso() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE promociones SET usos_actuales = usos_actuales + 1 WHERE id = NEW.promocion_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE promociones SET usos_actuales = GREATEST(0, usos_actuales - 1) WHERE id = OLD.promocion_id;
  ELSIF TG_OP = 'UPDATE'
        AND OLD.cancelada_por_cajero = false
        AND NEW.cancelada_por_cajero = true THEN
    UPDATE promociones SET usos_actuales = GREATEST(0, usos_actuales - 1) WHERE id = NEW.promocion_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_promo_apl_uso
  AFTER INSERT OR UPDATE OR DELETE ON ticket_promociones_aplicadas
  FOR EACH ROW EXECUTE FUNCTION trg_promo_apl_actualizar_uso();

CREATE TRIGGER trg_promo_apl_updated_at
  BEFORE UPDATE ON ticket_promociones_aplicadas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auditoría
CREATE OR REPLACE FUNCTION trg_promo_apl_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_eventos (
      tenant_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.created_by, 'DESCUENTO', 'promocion.aplicada',
      'ticket', NEW.ticket_id,
      jsonb_build_object(
        'promocion_id', NEW.promocion_id,
        'promocion_nombre', NEW.promocion_nombre_snapshot,
        'monto_descontado_mxn', NEW.monto_descontado_mxn
      )
    );
  ELSIF TG_OP = 'UPDATE'
        AND OLD.cancelada_por_cajero = false
        AND NEW.cancelada_por_cajero = true THEN
    INSERT INTO auditoria_eventos (
      tenant_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.usuario_que_cancelo_id, 'DESCUENTO', 'promocion.cancelada_por_cajero',
      'ticket', NEW.ticket_id,
      jsonb_build_object(
        'promocion_id', NEW.promocion_id,
        'motivo', NEW.motivo_cancelacion
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_promo_apl_audit
  AFTER INSERT OR UPDATE ON ticket_promociones_aplicadas
  FOR EACH ROW EXECUTE FUNCTION trg_promo_apl_audit();

-- ============================================================================
-- §8 — Funciones helper y de negocio
-- ============================================================================

-- §8.1 recalcular_totales_ticket(ticket_id)
-- Punto único de verdad para los totales del ticket (D42). Idempotente.
CREATE OR REPLACE FUNCTION recalcular_totales_ticket(p_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_subtotal_bruto          numeric(12,2) := 0;
  v_modificadores           numeric(12,2) := 0;
  v_descuentos_manuales     numeric(12,2) := 0;
  v_promociones             numeric(12,2) := 0;
  v_iva                     numeric(12,2) := 0;
  v_subtotal_final          numeric(12,2) := 0;
  v_total                   numeric(12,2) := 0;
  v_monto_pagado            numeric(12,2) := 0;
  v_cambio                  numeric(12,2) := 0;
  v_item                    record;
  v_item_bruto              numeric(12,2);
  v_item_modif              numeric(12,2);
  v_item_desc               numeric(12,2);
  v_item_promo              numeric(12,2);
  v_item_neto               numeric(12,2);
  v_item_iva                numeric(12,2);
  v_item_total              numeric(12,2);
BEGIN
  -- Iterar items no cancelados y calcular su subtotal e IVA
  FOR v_item IN
    SELECT
      ti.id,
      ti.cantidad,
      ti.precio_unitario_snapshot,
      ti.tasa_iva_snapshot,
      ti.iva_incluido_en_precio_snapshot,
      COALESCE(SUM(tim.monto_total_mxn), 0) AS monto_modif
    FROM ticket_items ti
    LEFT JOIN ticket_item_modificadores tim ON tim.ticket_item_id = ti.id
    WHERE ti.ticket_id = p_ticket_id
      AND ti.cancelado = false
    GROUP BY ti.id, ti.cantidad, ti.precio_unitario_snapshot,
             ti.tasa_iva_snapshot, ti.iva_incluido_en_precio_snapshot
  LOOP
    -- Bruto del ítem: precio * cantidad + modificadores
    v_item_bruto := (v_item.cantidad * v_item.precio_unitario_snapshot);
    v_item_modif := v_item.monto_modif;

    -- Descuentos manuales aplicables a este item (los del ticket completo se distribuyen abajo)
    SELECT COALESCE(SUM(monto_descontado_mxn), 0)
    INTO v_item_desc
    FROM ticket_descuentos_manuales
    WHERE ticket_item_id = v_item.id
      AND reversado = false;

    -- Promociones aplicables a este item (las del ticket completo se distribuyen abajo)
    SELECT COALESCE(SUM(monto_descontado_mxn), 0)
    INTO v_item_promo
    FROM ticket_promociones_aplicadas
    WHERE ticket_id = p_ticket_id
      AND cancelada_por_cajero = false
      AND v_item.id = ANY(items_afectados);

    -- Neto del ítem (después de descuentos a nivel item, no a nivel ticket)
    v_item_neto := (v_item_bruto + v_item_modif) - v_item_desc - v_item_promo;
    IF v_item_neto < 0 THEN v_item_neto := 0; END IF;

    -- IVA del ítem según política iva_incluido
    IF v_item.iva_incluido_en_precio_snapshot THEN
      -- El precio ya trae IVA: subtotal_sin_iva = neto / (1 + tasa/100), iva = neto - subtotal
      v_item_iva := ROUND(v_item_neto - (v_item_neto / (1 + v_item.tasa_iva_snapshot/100)), 2);
      v_item_total := v_item_neto;
    ELSE
      -- IVA por afuera: subtotal_sin_iva = neto, iva = neto * tasa/100, total = neto + iva
      v_item_iva := ROUND(v_item_neto * v_item.tasa_iva_snapshot/100, 2);
      v_item_total := v_item_neto + v_item_iva;
    END IF;

    -- Persistir el cálculo en ticket_items
    UPDATE ticket_items
    SET subtotal_bruto_mxn      = v_item_bruto,
        monto_modificadores_mxn = v_item_modif,
        descuento_item_mxn      = v_item_desc,
        promocion_item_mxn      = v_item_promo,
        iva_item_mxn            = v_item_iva,
        total_item_mxn          = v_item_total
    WHERE id = v_item.id;

    -- Acumular al ticket
    v_subtotal_bruto      := v_subtotal_bruto + v_item_bruto;
    v_modificadores       := v_modificadores  + v_item_modif;
    v_descuentos_manuales := v_descuentos_manuales + v_item_desc;
    v_promociones         := v_promociones    + v_item_promo;
    v_iva                 := v_iva            + v_item_iva;
    v_total               := v_total          + v_item_total;
  END LOOP;

  -- Descuentos manuales a nivel ticket (sin ticket_item_id) — se restan del total
  SELECT COALESCE(SUM(monto_descontado_mxn), 0)
  INTO v_item_desc
  FROM ticket_descuentos_manuales
  WHERE ticket_id = p_ticket_id
    AND ticket_item_id IS NULL
    AND reversado = false;
  v_descuentos_manuales := v_descuentos_manuales + v_item_desc;
  v_total := v_total - v_item_desc;
  IF v_total < 0 THEN v_total := 0; END IF;

  -- Promociones a nivel ticket (items_afectados vacío y alcance TICKET_COMPLETO)
  SELECT COALESCE(SUM(monto_descontado_mxn), 0)
  INTO v_item_promo
  FROM ticket_promociones_aplicadas
  WHERE ticket_id = p_ticket_id
    AND cancelada_por_cajero = false
    AND promocion_alcance_snapshot = 'TICKET_COMPLETO';
  v_promociones := v_promociones + v_item_promo;
  v_total := v_total - v_item_promo;
  IF v_total < 0 THEN v_total := 0; END IF;

  -- Subtotal final (sin IVA) — útil para reportes
  v_subtotal_final := v_total - v_iva;
  IF v_subtotal_final < 0 THEN v_subtotal_final := 0; END IF;

  -- Pagos
  SELECT
    COALESCE(SUM(monto_mxn) FILTER (WHERE estado IN ('APLICADO', 'CONCILIADO')), 0),
    COALESCE(SUM(cambio_mxn) FILTER (WHERE estado IN ('APLICADO', 'CONCILIADO')), 0)
  INTO v_monto_pagado, v_cambio
  FROM pagos
  WHERE ticket_id = p_ticket_id
    AND deleted_at IS NULL;

  -- Persistir totales en el ticket
  UPDATE tickets
  SET subtotal_mxn            = v_subtotal_final,
      descuentos_manuales_mxn = v_descuentos_manuales,
      promociones_mxn         = v_promociones,
      iva_mxn                 = v_iva,
      total_mxn               = v_total,
      monto_pagado_mxn        = v_monto_pagado,
      cambio_mxn              = v_cambio,
      updated_at              = now()
  WHERE id = p_ticket_id;
END;
$$;

COMMENT ON FUNCTION recalcular_totales_ticket IS 'Punto único de verdad para totales del ticket (D42). Idempotente. Invocada por triggers AFTER en items, pagos, descuentos, promos.';

-- §8.2 abrir_ticket(...)
CREATE OR REPLACE FUNCTION abrir_ticket(
  p_sucursal_id    uuid,
  p_caja_id        uuid,
  p_turno_id       uuid,
  p_modo_servicio  modo_servicio,
  p_cliente_id     uuid DEFAULT NULL,
  p_marca_virtual_id uuid DEFAULT NULL,
  p_client_id_local varchar DEFAULT NULL,
  p_usuario_id     uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id uuid;
  v_ticket_id uuid;
BEGIN
  -- Validar turno abierto y obtener tenant_id
  SELECT t.tenant_id INTO v_tenant_id
  FROM turnos t
  WHERE t.id = p_turno_id
    AND t.sucursal_id = p_sucursal_id
    AND t.caja_id = p_caja_id
    AND t.estado = 'ABIERTO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno % no está abierto o no corresponde a la sucursal/caja indicada', p_turno_id;
  END IF;

  -- Idempotencia: si ya existe ticket con este client_id_local, devolver el existente
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_ticket_id
    FROM tickets
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;

    IF FOUND THEN
      RETURN v_ticket_id;
    END IF;
  END IF;

  -- Crear ticket en BORRADOR
  INSERT INTO tickets (
    tenant_id, sucursal_id, caja_id, turno_id,
    modo_servicio, cliente_id, marca_virtual_id,
    estado_fiscal, estado_cocina,
    client_id_local, origen_creacion,
    usuario_apertura_id, created_by
  ) VALUES (
    v_tenant_id, p_sucursal_id, p_caja_id, p_turno_id,
    p_modo_servicio, p_cliente_id, p_marca_virtual_id,
    'BORRADOR', 'SIN_ENVIAR',
    p_client_id_local, 'POS_ONLINE',
    COALESCE(p_usuario_id, auth.uid()), COALESCE(p_usuario_id, auth.uid())
  )
  RETURNING id INTO v_ticket_id;

  RETURN v_ticket_id;
END;
$$;

COMMENT ON FUNCTION abrir_ticket IS 'Crea un ticket en BORRADOR. Idempotente vía client_id_local. El folio se asigna al primer item.';

-- §8.3 agregar_item_a_ticket(...)
CREATE OR REPLACE FUNCTION agregar_item_a_ticket(
  p_ticket_id      uuid,
  p_producto_id    uuid,
  p_cantidad       numeric(12,3),
  p_nota_cocina    text DEFAULT NULL,
  p_modificadores  jsonb DEFAULT '[]'::jsonb,
  -- estructura esperada del jsonb:
  -- [
  --   { "opcion_modificador_id": "uuid", "cantidad": 1 },
  --   { "opcion_modificador_id": "uuid", "cantidad": 2 }
  -- ]
  p_client_id_local varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id     uuid;
  v_ticket_estado ticket_estado_fiscal;
  v_producto      record;
  v_item_id       uuid;
  v_modif         jsonb;
  v_opcion        record;
  v_next_orden    integer;
BEGIN
  -- Validar ticket y obtener contexto
  SELECT tenant_id, estado_fiscal INTO v_tenant_id, v_ticket_estado
  FROM tickets WHERE id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;
  IF v_ticket_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'Solo se pueden agregar items a tickets BORRADOR o ABIERTO (estado actual: %)', v_ticket_estado;
  END IF;

  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_item_id
    FROM ticket_items
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_item_id; END IF;
  END IF;

  -- Obtener snapshot del producto
  SELECT p.id, p.nombre, p.sku, p.precio_base_mxn, p.tasa_iva,
         p.iva_incluido_en_precio, p.clave_sat, p.unidad_sat,
         p.modos_servicio_aplicables,
         c.nombre AS categoria_nombre,
         ac.nombre AS area_cocina_nombre
  INTO v_producto
  FROM productos p
  LEFT JOIN categorias c ON c.id = p.categoria_id
  LEFT JOIN areas_cocina ac ON ac.id = p.area_cocina_id
  WHERE p.id = p_producto_id
    AND p.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no existe o está eliminado', p_producto_id;
  END IF;

  -- Calcular siguiente orden_visualizacion
  SELECT COALESCE(MAX(orden_visualizacion), 0) + 1
  INTO v_next_orden
  FROM ticket_items
  WHERE ticket_id = p_ticket_id;

  -- Insertar item con snapshot
  INSERT INTO ticket_items (
    tenant_id, ticket_id, producto_id, cantidad, orden_visualizacion,
    producto_nombre_snapshot, producto_sku_snapshot,
    precio_unitario_snapshot, tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
    clave_sat_snapshot, unidad_sat_snapshot,
    categoria_nombre_snapshot, modos_servicio_snapshot, area_cocina_nombre_snapshot,
    nota_cocina, client_id_local, created_by
  ) VALUES (
    v_tenant_id, p_ticket_id, v_producto.id, p_cantidad, v_next_orden,
    v_producto.nombre, v_producto.sku,
    v_producto.precio_base_mxn, v_producto.tasa_iva, v_producto.iva_incluido_en_precio,
    v_producto.clave_sat, v_producto.unidad_sat,
    v_producto.categoria_nombre, v_producto.modos_servicio_aplicables, v_producto.area_cocina_nombre,
    p_nota_cocina, p_client_id_local, auth.uid()
  ) RETURNING id INTO v_item_id;

  -- Procesar modificadores
  IF p_modificadores IS NOT NULL AND jsonb_array_length(p_modificadores) > 0 THEN
    FOR v_modif IN SELECT * FROM jsonb_array_elements(p_modificadores)
    LOOP
      SELECT om.id, om.nombre, om.precio_extra,
             gm.id AS grupo_id, gm.nombre AS grupo_nombre, gm.naturaleza
      INTO v_opcion
      FROM opciones_modificador om
      JOIN grupos_modificadores gm ON gm.id = om.grupo_id
      WHERE om.id = (v_modif->>'opcion_modificador_id')::uuid
        AND om.deleted_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Opción de modificador % no existe', v_modif->>'opcion_modificador_id';
      END IF;

      INSERT INTO ticket_item_modificadores (
        tenant_id, ticket_item_id,
        opcion_modificador_id, grupo_id,
        grupo_nombre_snapshot, opcion_nombre_snapshot,
        precio_extra_snapshot, naturaleza_snapshot,
        cantidad, monto_total_mxn,
        created_by
      ) VALUES (
        v_tenant_id, v_item_id,
        v_opcion.id, v_opcion.grupo_id,
        v_opcion.grupo_nombre, v_opcion.nombre,
        v_opcion.precio_extra, v_opcion.naturaleza,
        COALESCE((v_modif->>'cantidad')::integer, 1),
        v_opcion.precio_extra * COALESCE((v_modif->>'cantidad')::integer, 1) * p_cantidad,
        auth.uid()
      );
    END LOOP;
  END IF;

  -- recalcular_totales_ticket() ya fue invocada por los triggers de items y modificadores

  RETURN v_item_id;
END;
$$;

COMMENT ON FUNCTION agregar_item_a_ticket IS 'Inserta un item con snapshot completo del producto y sus modificadores. Idempotente vía client_id_local.';

-- §8.4 aplicar_descuento_manual(...)
CREATE OR REPLACE FUNCTION aplicar_descuento_manual(
  p_ticket_id        uuid,
  p_ticket_item_id   uuid,                       -- NULL = aplica al ticket completo
  p_tipo             descuento_manual_tipo,
  p_valor            numeric(12,2),              -- porcentaje, monto fijo, o precio override
  p_motivo_categoria descuento_manual_motivo,
  p_motivo_texto     text,                       -- obligatorio si motivo=OTRO
  p_autorizacion_pin_id uuid,                    -- pre-obtenida del flujo de PIN
  p_usuario_solicitante_id uuid,
  p_usuario_autorizo_id uuid,
  p_client_id_local  varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id        uuid;
  v_descuento_id     uuid;
  v_monto_descontado numeric(12,2);
  v_base             numeric(12,2);
  v_porc             numeric(5,2);
  v_monto            numeric(12,2);
  v_precio_over      numeric(12,2);
  v_item             record;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;

  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_descuento_id FROM ticket_descuentos_manuales
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_descuento_id; END IF;
  END IF;

  -- Calcular monto descontado según tipo
  IF p_tipo = 'PORCENTAJE' THEN
    v_porc := p_valor;
    -- Base de cálculo depende del alcance
    IF p_ticket_item_id IS NULL THEN
      SELECT subtotal_mxn + iva_mxn - promociones_mxn INTO v_base FROM tickets WHERE id = p_ticket_id;
    ELSE
      SELECT total_item_mxn INTO v_base FROM ticket_items WHERE id = p_ticket_item_id;
    END IF;
    v_monto_descontado := ROUND(v_base * v_porc / 100, 2);

  ELSIF p_tipo = 'MONTO_FIJO' THEN
    v_monto := p_valor;
    v_monto_descontado := v_monto;

  ELSIF p_tipo = 'CORTESIA_TOTAL' THEN
    IF p_ticket_item_id IS NULL THEN
      SELECT total_mxn INTO v_monto_descontado FROM tickets WHERE id = p_ticket_id;
    ELSE
      SELECT total_item_mxn INTO v_monto_descontado FROM ticket_items WHERE id = p_ticket_item_id;
    END IF;

  ELSIF p_tipo = 'OVERRIDE_PRECIO' THEN
    -- Para OVERRIDE_PRECIO: marcamos el ítem con precio_override y calculamos el delta
    v_precio_over := p_valor;
    SELECT * INTO v_item FROM ticket_items WHERE id = p_ticket_item_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ticket_item % no existe', p_ticket_item_id; END IF;
    v_monto_descontado := GREATEST(0, (v_item.precio_unitario_snapshot - v_precio_over) * v_item.cantidad);

    -- Actualizar el ítem con override
    UPDATE ticket_items
    SET precio_override = true,
        precio_unitario_original_snapshot = precio_unitario_snapshot,
        autorizacion_pin_override_id = p_autorizacion_pin_id,
        precio_unitario_snapshot = v_precio_over
    WHERE id = p_ticket_item_id;
  END IF;

  -- Insertar registro del descuento
  INSERT INTO ticket_descuentos_manuales (
    tenant_id, ticket_id, ticket_item_id,
    tipo, valor_porcentaje, valor_monto_mxn, precio_override_mxn,
    monto_descontado_mxn,
    motivo_categoria, motivo_texto,
    autorizacion_pin_id,
    usuario_solicitante_id, usuario_autorizo_id,
    client_id_local, created_by
  ) VALUES (
    v_tenant_id, p_ticket_id, p_ticket_item_id,
    p_tipo,
    CASE WHEN p_tipo = 'PORCENTAJE'      THEN p_valor ELSE NULL END,
    CASE WHEN p_tipo = 'MONTO_FIJO'      THEN p_valor ELSE NULL END,
    CASE WHEN p_tipo = 'OVERRIDE_PRECIO' THEN p_valor ELSE NULL END,
    v_monto_descontado,
    p_motivo_categoria, p_motivo_texto,
    p_autorizacion_pin_id,
    p_usuario_solicitante_id, p_usuario_autorizo_id,
    p_client_id_local, p_usuario_solicitante_id
  ) RETURNING id INTO v_descuento_id;

  RETURN v_descuento_id;
END;
$$;

COMMENT ON FUNCTION aplicar_descuento_manual IS 'Aplica un descuento manual al ticket o ítem. Asume que ya existe la autorización_pin (la app debe validar el PIN antes de invocar).';

-- §8.5 evaluar_promociones_aplicables(ticket_id) — esqueleto
CREATE OR REPLACE FUNCTION evaluar_promociones_aplicables(p_ticket_id uuid)
RETURNS TABLE (
  promocion_id          uuid,
  nombre                varchar(150),
  tipo                  promocion_tipo,
  alcance               promocion_alcance,
  monto_descuento_estimado_mxn numeric(12,2),
  condiciones           jsonb,
  prioridad             integer
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_tenant_id   uuid;
  v_sucursal_id uuid;
  v_modo        modo_servicio;
  v_cliente_id  uuid;
  v_subtotal    numeric(12,2);
  v_ahora       timestamptz := now();
BEGIN
  SELECT t.tenant_id, t.sucursal_id, t.modo_servicio, t.cliente_id,
         t.subtotal_mxn + t.iva_mxn
  INTO v_tenant_id, v_sucursal_id, v_modo, v_cliente_id, v_subtotal
  FROM tickets t
  WHERE t.id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;

  -- Retornar promociones que cumplen FILTROS BÁSICOS evaluables en SQL.
  -- La evaluación detallada de condiciones jsonb se hace en la capa de servicios.
  RETURN QUERY
  SELECT
    p.id,
    p.nombre,
    p.tipo,
    p.alcance,
    -- Estimación rápida del descuento (la app recalcula exactamente al aplicar)
    CASE
      WHEN p.tipo = 'PORCENTAJE'     THEN ROUND(v_subtotal * p.valor_porcentaje / 100, 2)
      WHEN p.tipo = 'MONTO_FIJO'     THEN p.valor_monto_mxn
      WHEN p.tipo = 'CORTESIA_TOTAL' THEN v_subtotal
      ELSE 0
    END AS monto_descuento_estimado_mxn,
    p.condiciones,
    p.prioridad
  FROM promociones p
  WHERE p.tenant_id = v_tenant_id
    AND p.estado = 'ACTIVA'
    AND p.deleted_at IS NULL
    AND p.fecha_inicio <= v_ahora
    AND (p.fecha_fin IS NULL OR p.fecha_fin >= v_ahora)
    AND (p.max_usos_total IS NULL OR p.usos_actuales < p.max_usos_total)
    AND (
      -- Filtro de sucursal si la condición existe en jsonb
      NOT (p.condiciones ? 'sucursales_aplicables')
      OR v_sucursal_id::text = ANY(
        SELECT jsonb_array_elements_text(p.condiciones->'sucursales_aplicables')
      )
    )
    AND (
      -- Filtro de modo de servicio
      NOT (p.condiciones ? 'modos_servicio_permitidos')
      OR v_modo::text = ANY(
        SELECT jsonb_array_elements_text(p.condiciones->'modos_servicio_permitidos')
      )
    )
    AND (
      -- Filtro de monto mínimo
      NOT (p.condiciones ? 'monto_ticket')
      OR (p.condiciones->'monto_ticket'->>'minimo_mxn') IS NULL
      OR v_subtotal >= (p.condiciones->'monto_ticket'->>'minimo_mxn')::numeric
    )
    AND (
      -- Filtro requiere_cliente_identificado
      p.requiere_cliente_identificado = false
      OR v_cliente_id IS NOT NULL
    )
  ORDER BY p.prioridad DESC, p.valor_porcentaje DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION evaluar_promociones_aplicables IS 'Devuelve promociones que cumplen filtros básicos en SQL. La app evalúa horarios, días de semana y cupones (más complejo) en JS y llama aplicar_promocion() para confirmar.';

-- §8.6 aplicar_pago(...)
CREATE OR REPLACE FUNCTION aplicar_pago(
  p_ticket_id       uuid,
  p_metodo_pago     metodo_pago,
  p_monto_mxn       numeric(12,2),
  p_monto_recibido_mxn numeric(12,2) DEFAULT NULL,    -- solo efectivo
  p_referencia      varchar DEFAULT NULL,
  p_terminal_aprobacion varchar DEFAULT NULL,
  p_folio_externo   varchar DEFAULT NULL,
  p_es_pago_al_recibir boolean DEFAULT false,
  p_nota            text DEFAULT NULL,
  p_client_id_local varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket       record;
  v_pago_id      uuid;
  v_cambio       numeric(12,2) := 0;
  v_pagado_actual numeric(12,2);
  v_estado_pago  pago_estado;
BEGIN
  -- Obtener ticket
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;
  IF v_ticket.estado_fiscal NOT IN ('ABIERTO', 'BORRADOR') THEN
    RAISE EXCEPTION 'No se puede aplicar pago a un ticket en estado %', v_ticket.estado_fiscal;
  END IF;

  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_pago_id FROM pagos
    WHERE tenant_id = v_ticket.tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_pago_id; END IF;
  END IF;

  -- Validar suma de pagos no exceda total (D42 — protege contra cobros dobles)
  v_pagado_actual := v_ticket.monto_pagado_mxn;
  IF NOT p_es_pago_al_recibir AND v_pagado_actual + p_monto_mxn > v_ticket.total_mxn + 0.01 THEN
    RAISE EXCEPTION 'El pago de % excede el total pendiente del ticket (total: %, pagado: %)',
      p_monto_mxn, v_ticket.total_mxn, v_pagado_actual;
  END IF;

  -- Calcular cambio si efectivo
  IF p_metodo_pago = 'EFECTIVO' AND p_monto_recibido_mxn IS NOT NULL THEN
    v_cambio := GREATEST(0, p_monto_recibido_mxn - p_monto_mxn);
  END IF;

  -- Estado del pago
  v_estado_pago := CASE
    WHEN p_es_pago_al_recibir THEN 'PENDIENTE'
    WHEN p_metodo_pago IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI', 'APP_IFOOD', 'APP_OTRO') THEN 'APLICADO'
    ELSE 'APLICADO'
  END;

  -- Insertar pago
  INSERT INTO pagos (
    tenant_id, sucursal_id, caja_id, turno_id, ticket_id,
    metodo_pago, monto_mxn, monto_recibido_mxn, cambio_mxn,
    referencia, terminal_aprobacion, folio_externo,
    es_pago_al_recibir, estado,
    usuario_id, nota, client_id_local, created_by
  ) VALUES (
    v_ticket.tenant_id, v_ticket.sucursal_id, v_ticket.caja_id, v_ticket.turno_id, p_ticket_id,
    p_metodo_pago, p_monto_mxn, p_monto_recibido_mxn, v_cambio,
    p_referencia, p_terminal_aprobacion, p_folio_externo,
    p_es_pago_al_recibir, v_estado_pago,
    auth.uid(), p_nota, p_client_id_local, auth.uid()
  ) RETURNING id INTO v_pago_id;

  -- recalcular_totales_ticket() ya fue invocada por trigger

  -- Si el ticket queda completamente pagado, transicionar a PAGADO
  PERFORM cerrar_ticket_si_pagado(p_ticket_id);

  RETURN v_pago_id;
END;
$$;

COMMENT ON FUNCTION aplicar_pago IS 'Aplica un pago al ticket. Si los pagos suman el total, transiciona automáticamente a PAGADO.';

-- §8.7 cerrar_ticket_si_pagado(ticket_id) — interna
CREATE OR REPLACE FUNCTION cerrar_ticket_si_pagado(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket record;
BEGIN
  SELECT id, estado_fiscal, total_mxn, monto_pagado_mxn, monto_pendiente_mxn
  INTO v_ticket
  FROM tickets WHERE id = p_ticket_id;

  IF v_ticket.estado_fiscal = 'ABIERTO'
     AND v_ticket.total_mxn > 0
     AND v_ticket.monto_pendiente_mxn <= 0.01 THEN  -- tolerancia de redondeo
    UPDATE tickets
    SET estado_fiscal = 'PAGADO',
        fecha_pago = now(),
        usuario_cierre_id = auth.uid()
    WHERE id = p_ticket_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- §8.8 cancelar_item_ticket(...)
CREATE OR REPLACE FUNCTION cancelar_item_ticket(
  p_ticket_item_id  uuid,
  p_motivo          text,
  p_autorizacion_pin_id uuid DEFAULT NULL          -- requerido si el ticket ya está EN_COCINA
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_item    record;
  v_ticket  record;
BEGIN
  SELECT ti.*, t.estado_fiscal, t.estado_cocina, t.tenant_id AS t_tenant
  INTO v_item
  FROM ticket_items ti
  JOIN tickets t ON t.id = ti.ticket_id
  WHERE ti.id = p_ticket_item_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_item % no existe', p_ticket_item_id; END IF;
  IF v_item.cancelado THEN
    RAISE EXCEPTION 'Item ya está cancelado';
  END IF;
  IF v_item.estado_fiscal = 'PAGADO' THEN
    RAISE EXCEPTION 'No se puede cancelar items de ticket PAGADO. Usar flujo de devolución (1C.2)';
  END IF;

  -- Si la comanda ya está en cocina, requiere PIN (§16.3)
  IF v_item.estado_cocina IN ('EN_COCINA', 'LISTO') AND p_autorizacion_pin_id IS NULL THEN
    RAISE EXCEPTION 'Cancelar item con comanda en cocina requiere autorización_pin_id';
  END IF;

  UPDATE ticket_items
  SET cancelado = true,
      motivo_cancelacion = p_motivo,
      usuario_cancelo_id = auth.uid(),
      autorizacion_cancelacion_id = p_autorizacion_pin_id,
      cancelado_at = now()
  WHERE id = p_ticket_item_id;

  -- recalcular_totales_ticket() invocada por trigger
END;
$$;

COMMENT ON FUNCTION cancelar_item_ticket IS 'Cancela un ítem individual sin cancelar el ticket. Si la comanda ya está en cocina, requiere PIN (§16.3).';

-- §8.9 poner_ticket_en_espera(ticket_id, etiqueta) y retomar_ticket(ticket_id)
CREATE OR REPLACE FUNCTION poner_ticket_en_espera(
  p_ticket_id  uuid,
  p_etiqueta   varchar
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_estado ticket_estado_fiscal;
BEGIN
  SELECT estado_fiscal INTO v_estado FROM tickets WHERE id = p_ticket_id;
  IF v_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'Solo se pueden poner en espera tickets BORRADOR o ABIERTO';
  END IF;

  UPDATE tickets
  SET en_espera = true,
      etiqueta_espera = p_etiqueta,
      fecha_puesto_en_espera = now()
  WHERE id = p_ticket_id;
END;
$$;

CREATE OR REPLACE FUNCTION retomar_ticket(p_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tickets
  SET en_espera = false,
      fecha_puesto_en_espera = NULL
  WHERE id = p_ticket_id;
END;
$$;

-- §8.10 marcar_pedido_listo(ticket_id) y marcar_pedido_entregado(ticket_id)
CREATE OR REPLACE FUNCTION marcar_pedido_listo(p_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tickets
  SET estado_cocina = 'LISTO'
  WHERE id = p_ticket_id
    AND estado_cocina = 'EN_COCINA';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se puede marcar como LISTO: el ticket no está en EN_COCINA';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION marcar_pedido_entregado(p_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tickets
  SET estado_cocina = 'ENTREGADO',
      usuario_entrega_id = auth.uid()
  WHERE id = p_ticket_id
    AND estado_cocina = 'LISTO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se puede marcar como ENTREGADO: el ticket no está en LISTO';
  END IF;
END;
$$;

-- §8.11 transicionar_estado_cocina_con_autorizacion(...) — reversa con PIN
CREATE OR REPLACE FUNCTION transicionar_estado_cocina_con_autorizacion(
  p_ticket_id        uuid,
  p_estado_destino   ticket_estado_cocina,
  p_autorizacion_pin_id uuid,
  p_motivo           text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- permite saltar el trigger trg_tickets_validar_estado_cocina
SET search_path = public, pg_temp   -- CN-001: search_path fijo (anti escalada en SECURITY DEFINER, CWE-426)
AS $$
DECLARE
  v_estado_anterior ticket_estado_cocina;
  v_tenant_id       uuid;
BEGIN
  SELECT estado_cocina, tenant_id INTO v_estado_anterior, v_tenant_id
  FROM tickets WHERE id = p_ticket_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;

  -- Desactivar trigger validador para esta transacción
  SET LOCAL session_replication_role = 'replica';

  UPDATE tickets
  SET estado_cocina = p_estado_destino,
      updated_by = auth.uid()
  WHERE id = p_ticket_id;

  -- Reactivar trigger
  SET LOCAL session_replication_role = 'origin';

  -- Auditoría explícita del salto autorizado
  INSERT INTO auditoria_eventos (
    tenant_id, usuario_id, usuario_autorizo_id,
    categoria, evento_codigo, entidad_tipo, entidad_id, payload
  ) VALUES (
    v_tenant_id, auth.uid(),
    (SELECT usuario_autorizo_id FROM autorizaciones_pin WHERE id = p_autorizacion_pin_id),
    'COCINA', 'estado_cocina.reversa_autorizada',
    'ticket', p_ticket_id,
    jsonb_build_object(
      'estado_anterior', v_estado_anterior,
      'estado_nuevo', p_estado_destino,
      'motivo', p_motivo,
      'autorizacion_pin_id', p_autorizacion_pin_id
    )
  );
END;
$$;

COMMENT ON FUNCTION transicionar_estado_cocina_con_autorizacion IS 'Reversa de estado_cocina con autorización PIN. SECURITY DEFINER + session_replication_role para saltar trigger validador.';

-- ============================================================================
-- §9 — RLS consolidada
-- ============================================================================

-- ====== tickets ======
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tickets_select ON tickets
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY tickets_insert ON tickets
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tickets_update ON tickets
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- No se permite DELETE — usar soft delete.

-- ====== ticket_items ======
ALTER TABLE ticket_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_items_select ON ticket_items
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY ticket_items_insert ON ticket_items
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY ticket_items_update ON ticket_items
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY ticket_items_delete ON ticket_items
  FOR DELETE
  USING (
    tenant_id = current_tenant_id()
    AND ticket_id IN (
      SELECT id FROM tickets WHERE estado_fiscal = 'BORRADOR'
    )
  );
-- Solo se pueden DELETE items de tickets en BORRADOR (todavía no tienen folio).
-- Items de tickets ABIERTO se cancelan, no se borran.

-- ====== ticket_item_modificadores ======
ALTER TABLE ticket_item_modificadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY tim_select ON ticket_item_modificadores
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY tim_insert ON ticket_item_modificadores
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tim_update ON ticket_item_modificadores
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tim_delete ON ticket_item_modificadores
  FOR DELETE
  USING (
    tenant_id = current_tenant_id()
    AND ticket_item_id IN (
      SELECT ti.id FROM ticket_items ti
      JOIN tickets t ON t.id = ti.ticket_id
      WHERE t.estado_fiscal = 'BORRADOR'
    )
  );

-- ====== pagos ======
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY pagos_select ON pagos
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY pagos_insert ON pagos
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY pagos_update ON pagos
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- DELETE prohibido para pagos. Reverso es soft delete vía UPDATE deleted_at
-- y/o cancelación del ticket completo (1C.2).

-- ====== ticket_descuentos_manuales ======
ALTER TABLE ticket_descuentos_manuales ENABLE ROW LEVEL SECURITY;

CREATE POLICY descmanual_select ON ticket_descuentos_manuales
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY descmanual_insert ON ticket_descuentos_manuales
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY descmanual_update ON ticket_descuentos_manuales
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- No DELETE — reverso vía flag 'reversado'.

-- ====== ticket_promociones_aplicadas ======
ALTER TABLE ticket_promociones_aplicadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY promoapl_select ON ticket_promociones_aplicadas
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY promoapl_insert ON ticket_promociones_aplicadas
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY promoapl_update ON ticket_promociones_aplicadas
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY promoapl_delete ON ticket_promociones_aplicadas
  FOR DELETE
  USING (
    tenant_id = current_tenant_id()
    AND ticket_id IN (
      SELECT id FROM tickets WHERE estado_fiscal IN ('BORRADOR', 'ABIERTO')
    )
  );
-- Promos pueden eliminarse físicamente solo si el ticket no se ha pagado.
-- Para tickets pagados se marca cancelada_por_cajero = true.
