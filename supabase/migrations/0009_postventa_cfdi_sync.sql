-- 0009 — Post-venta (devoluciones, cancelaciones, CFDI, delivery, conciliación, comanda, sync). Fuente: 1C.2.

-- =====================================================================
-- §3. Estados de cocina extendidos para delivery (ALTER TYPE + ALTERs base)
-- NOTA: ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción que
-- después consuma el valor. En Supabase cada archivo de migración corre en su
-- propia transacción; estos ADD VALUE usan IF NOT EXISTS para ser idempotentes.
-- =====================================================================

-- Extender enum estado_cocina con valores de delivery (D43)
ALTER TYPE ticket_estado_cocina ADD VALUE IF NOT EXISTS 'EN_RUTA' BEFORE 'ENTREGADO';
ALTER TYPE ticket_estado_cocina ADD VALUE IF NOT EXISTS 'ENTREGADO_DOMICILIO' AFTER 'EN_RUTA';

-- Cambiar el CHECK de pagos.monto_mxn para permitir negativos (devoluciones)
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_monto_mxn_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_monto_mxn_check CHECK (monto_mxn <> 0);

-- Agregar tipos de documento nuevos al ENUM tipo_documento (si existe como ENUM)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_documento_folio') THEN
    ALTER TYPE tipo_documento_folio ADD VALUE IF NOT EXISTS 'DEVOLUCION';
    ALTER TYPE tipo_documento_folio ADD VALUE IF NOT EXISTS 'CANCELACION';
    ALTER TYPE tipo_documento_folio ADD VALUE IF NOT EXISTS 'NOTA_CREDITO_CFDI';
  END IF;
END;
$$;

-- Reemplazar la función trg_ticket_validar_estado_cocina() de 1C.1 §3.3.5
CREATE OR REPLACE FUNCTION trg_ticket_validar_estado_cocina() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado_cocina IS DISTINCT FROM NEW.estado_cocina THEN
    -- Transiciones válidas (avance hacia adelante con delivery):
    --   SIN_ENVIAR → EN_COCINA
    --   EN_COCINA  → LISTO
    --   LISTO      → ENTREGADO
    --   LISTO      → EN_RUTA               (delivery propio o app, salió de cocina)
    --   LISTO      → ENTREGADO_DOMICILIO   (app externa que recogió directo)
    --   EN_RUTA    → ENTREGADO_DOMICILIO   (delivery propio confirmó entrega)
    IF NOT (
      (OLD.estado_cocina = 'SIN_ENVIAR' AND NEW.estado_cocina = 'EN_COCINA')
      OR (OLD.estado_cocina = 'EN_COCINA'  AND NEW.estado_cocina = 'LISTO')
      OR (OLD.estado_cocina = 'LISTO'      AND NEW.estado_cocina IN ('ENTREGADO', 'EN_RUTA', 'ENTREGADO_DOMICILIO'))
      OR (OLD.estado_cocina = 'EN_RUTA'    AND NEW.estado_cocina = 'ENTREGADO_DOMICILIO')
    ) THEN
      RAISE EXCEPTION 'Transición de estado_cocina no permitida sin autorización: % → %', OLD.estado_cocina, NEW.estado_cocina
        USING HINT = 'Reversas requieren función transicionar_estado_cocina_con_autorizacion()';
    END IF;

    -- Timestamps por transición
    IF NEW.estado_cocina = 'EN_COCINA' AND NEW.fecha_envio_cocina IS NULL THEN
      NEW.fecha_envio_cocina := now();
    ELSIF NEW.estado_cocina = 'LISTO' AND NEW.fecha_listo IS NULL THEN
      NEW.fecha_listo := now();
    ELSIF NEW.estado_cocina IN ('ENTREGADO', 'ENTREGADO_DOMICILIO') AND NEW.fecha_entrega IS NULL THEN
      NEW.fecha_entrega := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- §4. Esquema: Devoluciones
-- =====================================================================

-- §4.1 Enums asociados

-- Motivo de la devolución (§15.2)
CREATE TYPE devolucion_motivo AS ENUM (
  'PRODUCTO_DEFECTUOSO',
  'PRODUCTO_INCORRECTO',          -- se entregó algo distinto a lo pedido
  'CLIENTE_NO_SATISFECHO',
  'ERROR_COBRO',                  -- se cobró de más, error del cajero
  'TIEMPO_EXCEDIDO',              -- tomó demasiado, cliente se fue
  'CANCELACION_PEDIDO',           -- cliente canceló antes de salir
  'PROBLEMA_DELIVERY',            -- no se pudo entregar
  'OTRO'
);

-- Medio de devolución del dinero (§15.4)
CREATE TYPE devolucion_medio AS ENUM (
  'EFECTIVO',                     -- se entrega billete del cajón
  'MISMO_METODO_PAGO',            -- se reversa la tarjeta / transferencia
  'VALE_PROXIMA_COMPRA',          -- crédito interno
  'CORTESIA_SIN_REEMBOLSO',       -- no se devuelve dinero, queda como gesto
  'NOTA_CREDITO_CFDI'             -- factura de nota de crédito
);

-- Alcance de la devolución
CREATE TYPE devolucion_alcance AS ENUM (
  'TOTAL',                        -- todo el ticket
  'PARCIAL'                       -- solo algunos items
);

-- §4.2 Tabla devoluciones
CREATE TABLE devoluciones (
  -- ===== Identidad =====
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  caja_id             uuid NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,

  -- Folio propio (vía generar_folio con tipo_documento='DEVOLUCION')
  folio_completo      varchar(50) NOT NULL,
  folio_consecutivo   bigint NOT NULL,

  -- Día contable inmutable, calculado en el momento de la devolución (NO del ticket original)
  dia_contable        date NOT NULL,

  -- ===== Ticket original =====
  ticket_original_id  uuid NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  ticket_folio_snapshot varchar(50) NOT NULL,        -- copia del folio del ticket original
  ticket_dia_contable_snapshot date NOT NULL,

  -- ===== Alcance y motivo =====
  alcance             devolucion_alcance NOT NULL,
  motivo              devolucion_motivo NOT NULL,
  motivo_texto        text NULL,                     -- obligatorio si motivo = OTRO

  -- ===== Monto devuelto =====
  total_devuelto_mxn      numeric(12,2) NOT NULL CHECK (total_devuelto_mxn >= 0),
  -- Desglose para reportes
  subtotal_devuelto_mxn   numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_devuelto_mxn >= 0),
  iva_devuelto_mxn        numeric(12,2) NOT NULL DEFAULT 0 CHECK (iva_devuelto_mxn >= 0),

  -- ===== Medio de devolución =====
  medio_devolucion    devolucion_medio NOT NULL,

  -- ===== Autorización (siempre con PIN superior) =====
  autorizacion_pin_id uuid NOT NULL REFERENCES autorizaciones_pin(id),
  usuario_solicitante_id uuid NOT NULL REFERENCES auth.users(id),  -- típicamente cajero
  usuario_autorizo_id    uuid NOT NULL REFERENCES auth.users(id),  -- típicamente supervisor

  -- ===== Inventario =====
  reversar_inventario   boolean NOT NULL DEFAULT true,
  -- En PRODUCTO_DEFECTUOSO típicamente FALSE (el producto está malo, no vuelve al stock)
  -- En CANCELACION_PEDIDO sin preparar típicamente TRUE
  inventario_reversado_at timestamptz NULL,           -- cuando efectivamente se aplicó el reverso

  -- ===== Cliente (CRM) =====
  cliente_id          uuid NULL REFERENCES clientes(id),

  -- ===== Vinculación con CFDI nota de crédito (cuando aplique) =====
  cfdi_nota_credito_id  uuid NULL,        -- se llena al emitir la NC. FK pospuesta hasta §6 abajo.

  -- ===== Ciclo de vida =====
  estado              varchar(20) NOT NULL DEFAULT 'CONFIRMADA',
                                  -- BORRADOR (pre-confirmación), CONFIRMADA, CANCELADA (rara)
  fecha_devolucion    timestamptz NOT NULL DEFAULT now(),

  -- ===== Notas =====
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

  CONSTRAINT folio_unico_devolucion UNIQUE (sucursal_id, folio_completo),
  CONSTRAINT motivo_otro_devolucion_requiere_texto CHECK (
    motivo <> 'OTRO' OR motivo_texto IS NOT NULL
  ),
  CONSTRAINT estado_devolucion_valido CHECK (
    estado IN ('BORRADOR', 'CONFIRMADA', 'CANCELADA')
  ),
  CONSTRAINT total_devuelto_coherente CHECK (
    total_devuelto_mxn = subtotal_devuelto_mxn + iva_devuelto_mxn
  )
);

CREATE INDEX idx_devoluciones_ticket_original ON devoluciones(ticket_original_id);
CREATE INDEX idx_devoluciones_sucursal_dia ON devoluciones(sucursal_id, dia_contable DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_devoluciones_turno ON devoluciones(turno_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_devoluciones_cliente ON devoluciones(cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX idx_devoluciones_motivo ON devoluciones(tenant_id, motivo, dia_contable DESC);
CREATE UNIQUE INDEX idx_devoluciones_client_id_local ON devoluciones(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE devoluciones IS 'Documento de devolución total o parcial (D37). Folio propio, dia_contable propio.';
COMMENT ON COLUMN devoluciones.ticket_dia_contable_snapshot IS 'Día contable original del ticket. Crítico cuando devolución ocurre días después y se necesita reportar contra el día de la venta.';
COMMENT ON COLUMN devoluciones.reversar_inventario IS 'TRUE si el producto vuelve al stock. FALSE si está defectuoso/desperdiciado.';

-- §4.3 Tabla devolucion_items
CREATE TABLE devolucion_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  devolucion_id       uuid NOT NULL REFERENCES devoluciones(id) ON DELETE CASCADE,

  -- Item original (referencia obligatoria para reverso de inventario)
  ticket_item_id_original uuid NOT NULL REFERENCES ticket_items(id) ON DELETE RESTRICT,

  -- ===== Snapshot del item devuelto =====
  producto_id            uuid NULL REFERENCES productos(id),
  producto_nombre_snapshot varchar(150) NOT NULL,
  producto_sku_snapshot  varchar(50) NULL,

  -- Cantidad devuelta (puede ser parcial: si el item original eran 3 hamburguesas, devuelvo 1)
  cantidad_original      numeric(12,3) NOT NULL CHECK (cantidad_original > 0),
  cantidad_devuelta      numeric(12,3) NOT NULL CHECK (cantidad_devuelta > 0),

  -- ===== Snapshot de precio (para reportes) =====
  precio_unitario_snapshot      numeric(12,2) NOT NULL,
  tasa_iva_snapshot             numeric(5,2) NOT NULL,
  iva_incluido_en_precio_snapshot boolean NOT NULL,

  -- ===== Monto devuelto por este item =====
  subtotal_devuelto_mxn  numeric(12,2) NOT NULL CHECK (subtotal_devuelto_mxn >= 0),
  iva_devuelto_mxn       numeric(12,2) NOT NULL CHECK (iva_devuelto_mxn >= 0),
  total_devuelto_mxn     numeric(12,2) NOT NULL CHECK (total_devuelto_mxn >= 0),

  -- ===== Inventario =====
  reversar_inventario_item boolean NOT NULL DEFAULT true,
  -- Por defecto hereda de devoluciones.reversar_inventario, pero permitimos overrride
  -- por item (ej. de un ticket de 5 items, 4 vuelven al stock y 1 está dañado).

  -- ===== Motivo específico del item (opcional, override del motivo de la devolución) =====
  motivo_item          devolucion_motivo NULL,
  nota_item            text NULL,

  -- ===== Comunes =====
  client_id_local      varchar(64) NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES auth.users(id),

  CONSTRAINT cantidad_devuelta_no_excede CHECK (
    cantidad_devuelta <= cantidad_original
  ),
  CONSTRAINT total_devolucion_item_coherente CHECK (
    total_devuelto_mxn = subtotal_devuelto_mxn + iva_devuelto_mxn
  )
);

CREATE INDEX idx_devitems_devolucion ON devolucion_items(devolucion_id);
CREATE INDEX idx_devitems_ticket_item ON devolucion_items(ticket_item_id_original);
CREATE INDEX idx_devitems_producto ON devolucion_items(producto_id) WHERE producto_id IS NOT NULL;
CREATE UNIQUE INDEX idx_devitems_client_id_local ON devolucion_items(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE devolucion_items IS 'Líneas devueltas con referencia al ticket_item original. Permite parcial.';

-- §4.4 Triggers en devoluciones y devolucion_items

-- 4.4.1 Día contable y folio al INSERT
CREATE OR REPLACE FUNCTION trg_devolucion_dia_folio() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_folio_row record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Día contable de la devolución (NO del ticket original)
    NEW.dia_contable := calcular_dia_contable(NEW.tenant_id, NEW.fecha_devolucion);

    -- Folio si no viene asignado
    IF NEW.folio_completo IS NULL THEN
      SELECT folio_completo, consecutivo INTO v_folio_row
      FROM generar_folio(NEW.sucursal_id, 'DEVOLUCION', NULL);
      NEW.folio_completo := v_folio_row.folio_completo;
      NEW.folio_consecutivo := v_folio_row.consecutivo;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_devoluciones_dia_folio
  BEFORE INSERT ON devoluciones
  FOR EACH ROW EXECUTE FUNCTION trg_devolucion_dia_folio();

-- 4.4.2 Proteger inmutables
CREATE OR REPLACE FUNCTION trg_devolucion_proteger() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.dia_contable <> NEW.dia_contable THEN
      RAISE EXCEPTION 'devoluciones.dia_contable es inmutable';
    END IF;
    IF OLD.folio_completo <> NEW.folio_completo THEN
      RAISE EXCEPTION 'devoluciones.folio_completo es inmutable';
    END IF;
    IF OLD.ticket_original_id <> NEW.ticket_original_id THEN
      RAISE EXCEPTION 'devoluciones.ticket_original_id es inmutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_devoluciones_proteger
  BEFORE UPDATE ON devoluciones
  FOR EACH ROW EXECUTE FUNCTION trg_devolucion_proteger();

-- 4.4.3 set_updated_at
CREATE TRIGGER trg_devoluciones_updated_at
  BEFORE UPDATE ON devoluciones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4.4.4 Reversar inventario al CONFIRMAR la devolución
-- (la lógica completa de reverso vive en función reversar_inventario_por_devolucion()
-- definida en §11. Aquí solo invoca.)
CREATE OR REPLACE FUNCTION trg_devolucion_inventario() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Solo cuando pasa a CONFIRMADA y el flag reversar_inventario está en true
  IF TG_OP = 'UPDATE'
     AND OLD.estado <> 'CONFIRMADA'
     AND NEW.estado = 'CONFIRMADA'
     AND NEW.reversar_inventario = true
     AND NEW.inventario_reversado_at IS NULL THEN
    PERFORM reversar_inventario_por_devolucion(NEW.id);
    -- La función llena inventario_reversado_at internamente
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_devoluciones_inventario
  AFTER UPDATE ON devoluciones
  FOR EACH ROW EXECUTE FUNCTION trg_devolucion_inventario();

-- 4.4.5 Generar movimiento de pago negativo al CONFIRMAR (cuando medio=EFECTIVO)
-- y movimiento_caja de DEVOLUCION_EFECTIVO (que ya existe en Parte 1A §6.4 como tipo).
CREATE OR REPLACE FUNCTION trg_devolucion_pago_efectivo() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.estado <> 'CONFIRMADA'
     AND NEW.estado = 'CONFIRMADA'
     AND NEW.medio_devolucion = 'EFECTIVO' THEN
    -- Insertar movimiento_caja de DEVOLUCION_EFECTIVO
    INSERT INTO movimientos_caja (
      tenant_id, sucursal_id, caja_id, turno_id,
      tipo_movimiento, monto_mxn, referencia_documento_tipo, referencia_documento_id,
      motivo, usuario_id, created_by
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id,
      'DEVOLUCION_EFECTIVO', NEW.total_devuelto_mxn, 'devolucion', NEW.id,
      'Devolución folio ' || NEW.folio_completo, NEW.usuario_solicitante_id, NEW.usuario_solicitante_id
    );

    -- Insertar pago negativo en pagos para mantener coherencia de monto_pagado_mxn del ticket
    -- (NO actualiza el ticket original a estado ABIERTO; el ticket queda PAGADO con pago neto reducido)
    INSERT INTO pagos (
      tenant_id, sucursal_id, caja_id, turno_id, ticket_id,
      metodo_pago, monto_mxn, estado,
      referencia, usuario_id, nota, created_by
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id, NEW.ticket_original_id,
      'EFECTIVO', -NEW.total_devuelto_mxn, 'APLICADO',
      'Devolución ' || NEW.folio_completo, NEW.usuario_solicitante_id,
      'Reverso por devolución ' || NEW.motivo::text, NEW.usuario_solicitante_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_devoluciones_pago_efectivo
  AFTER UPDATE ON devoluciones
  FOR EACH ROW EXECUTE FUNCTION trg_devolucion_pago_efectivo();

-- 4.4.6 Auditoría
CREATE OR REPLACE FUNCTION trg_devolucion_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, caja_id, turno_id,
      usuario_id, usuario_autorizo_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload, dia_contable
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id,
      NEW.usuario_solicitante_id, NEW.usuario_autorizo_id,
      'DEVOLUCION', 'devolucion.creada',
      'devolucion', NEW.id,
      jsonb_build_object(
        'folio', NEW.folio_completo,
        'ticket_original_folio', NEW.ticket_folio_snapshot,
        'alcance', NEW.alcance,
        'motivo', NEW.motivo,
        'medio', NEW.medio_devolucion,
        'total_mxn', NEW.total_devuelto_mxn,
        'reversar_inventario', NEW.reversar_inventario
      ),
      NEW.dia_contable
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_devoluciones_audit
  AFTER INSERT ON devoluciones
  FOR EACH ROW EXECUTE FUNCTION trg_devolucion_audit();

-- =====================================================================
-- §5. Esquema: Cancelaciones de tickets pagados
-- =====================================================================

-- §5.1 Enums asociados

-- Motivo de cancelación (§13.5)
CREATE TYPE cancelacion_motivo AS ENUM (
  'ERROR_COBRO',                  -- el cajero se equivocó
  'CLIENTE_DESISTIO',             -- pagó y se arrepintió antes de recibir
  'PROBLEMA_OPERATIVO',           -- no se podía cumplir el pedido (insumo agotado)
  'COBRO_DUPLICADO',              -- error técnico, se cobró dos veces el mismo ticket
  'FRAUDE_DETECTADO',
  'PRUEBA_OPERATIVA',             -- ticket de prueba que olvidaron marcar
  'OTRO'
);

-- §5.2 Tabla cancelaciones_ticket
CREATE TABLE cancelaciones_ticket (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  caja_id             uuid NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  turno_id            uuid NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,

  -- Folio propio (vía generar_folio con tipo_documento='CANCELACION')
  folio_completo      varchar(50) NOT NULL,
  folio_consecutivo   bigint NOT NULL,

  -- Día contable de la cancelación (NO del ticket)
  dia_contable        date NOT NULL,

  -- ===== Ticket cancelado =====
  ticket_id           uuid NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  ticket_folio_snapshot varchar(50) NOT NULL,
  ticket_dia_contable_snapshot date NOT NULL,
  ticket_total_snapshot numeric(12,2) NOT NULL,
  ticket_estado_fiscal_previo ticket_estado_fiscal NOT NULL,
  ticket_estado_cocina_previo ticket_estado_cocina NOT NULL,

  -- ===== Motivo =====
  motivo              cancelacion_motivo NOT NULL,
  motivo_texto        text NULL,                     -- obligatorio si motivo=OTRO

  -- ===== Autorización (siempre con PIN de admin) =====
  autorizacion_pin_id uuid NOT NULL REFERENCES autorizaciones_pin(id),
  usuario_solicitante_id uuid NOT NULL REFERENCES auth.users(id),
  usuario_autorizo_id    uuid NOT NULL REFERENCES auth.users(id),

  -- ===== Manejo del dinero =====
  -- Cuando un ticket PAGADO se cancela, el dinero cobrado debe regresar.
  -- En la práctica esto se modela como devolución total automática creada por la función
  -- cancelar_ticket_pagado(). Esta columna referencia esa devolución cuando existe.
  devolucion_id       uuid NULL REFERENCES devoluciones(id),

  -- ===== Manejo de inventario =====
  reversar_inventario boolean NOT NULL DEFAULT true,
  inventario_reversado_at timestamptz NULL,

  -- ===== Manejo de CFDI =====
  cancelar_cfdi_sat   boolean NOT NULL DEFAULT true,        -- si el ticket ya estaba FACTURADO
  cfdi_cancelado_at   timestamptz NULL,                     -- cuando el PAC confirmó cancelación

  -- ===== Ciclo de vida =====
  fecha_cancelacion   timestamptz NOT NULL DEFAULT now(),

  -- ===== Notas =====
  nota                text NULL,

  -- ===== Sync offline =====
  client_id_local     varchar(64) NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),

  CONSTRAINT folio_unico_cancelacion UNIQUE (sucursal_id, folio_completo),
  CONSTRAINT motivo_otro_cancelacion_requiere_texto CHECK (
    motivo <> 'OTRO' OR motivo_texto IS NOT NULL
  )
);

-- Un ticket solo puede tener UNA cancelación activa
CREATE UNIQUE INDEX idx_cancelaciones_ticket_unico ON cancelaciones_ticket(ticket_id);

CREATE INDEX idx_cancelaciones_sucursal_dia ON cancelaciones_ticket(sucursal_id, dia_contable DESC);
CREATE INDEX idx_cancelaciones_motivo ON cancelaciones_ticket(tenant_id, motivo, dia_contable DESC);
CREATE INDEX idx_cancelaciones_usuario_autorizo ON cancelaciones_ticket(usuario_autorizo_id, fecha_cancelacion DESC);
CREATE UNIQUE INDEX idx_cancelaciones_client_id_local ON cancelaciones_ticket(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE cancelaciones_ticket IS 'Bitácora de cancelaciones de tickets PAGADOS o FACTURADOS (D38). Folio y dia_contable propios. Una sola por ticket.';
COMMENT ON COLUMN cancelaciones_ticket.devolucion_id IS 'Si el ticket estaba PAGADO, la cancelación genera una devolución total automáticamente. Esta FK la vincula.';
COMMENT ON COLUMN cancelaciones_ticket.cancelar_cfdi_sat IS 'TRUE si se debe iniciar el flujo de cancelación ante SAT (cuando el ticket estaba FACTURADO).';

-- §5.3 Triggers en cancelaciones_ticket

-- 5.3.1 Día contable y folio
CREATE OR REPLACE FUNCTION trg_cancelacion_dia_folio() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_folio_row record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.dia_contable := calcular_dia_contable(NEW.tenant_id, NEW.fecha_cancelacion);

    IF NEW.folio_completo IS NULL THEN
      SELECT folio_completo, consecutivo INTO v_folio_row
      FROM generar_folio(NEW.sucursal_id, 'CANCELACION', NULL);
      NEW.folio_completo := v_folio_row.folio_completo;
      NEW.folio_consecutivo := v_folio_row.consecutivo;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cancelaciones_dia_folio
  BEFORE INSERT ON cancelaciones_ticket
  FOR EACH ROW EXECUTE FUNCTION trg_cancelacion_dia_folio();

-- 5.3.2 Marcar ticket como CANCELADO al insertar cancelación
CREATE OR REPLACE FUNCTION trg_cancelacion_marcar_ticket() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER       -- saltar trigger de validación de transición
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Permitir la transición a CANCELADO desde cualquier estado fiscal (excepto ya CANCELADO)
    SET LOCAL session_replication_role = 'replica';
    UPDATE tickets
    SET estado_fiscal = 'CANCELADO',
        updated_by = NEW.usuario_solicitante_id
    WHERE id = NEW.ticket_id
      AND estado_fiscal <> 'CANCELADO';
    SET LOCAL session_replication_role = 'origin';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cancelaciones_marcar_ticket
  AFTER INSERT ON cancelaciones_ticket
  FOR EACH ROW EXECUTE FUNCTION trg_cancelacion_marcar_ticket();

-- 5.3.3 Reverso de inventario (sólo si la venta había descontado)
CREATE OR REPLACE FUNCTION trg_cancelacion_inventario() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     AND NEW.reversar_inventario = true
     AND NEW.ticket_estado_fiscal_previo IN ('PAGADO', 'FACTURADO') THEN
    -- Solo se descontó inventario si el ticket estaba PAGADO o FACTURADO.
    -- Si estaba ABIERTO o BORRADOR, no hay inventario que reversar.
    PERFORM reversar_inventario_por_cancelacion(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cancelaciones_inventario
  AFTER INSERT ON cancelaciones_ticket
  FOR EACH ROW EXECUTE FUNCTION trg_cancelacion_inventario();

-- 5.3.4 Auditoría (siempre crítica)
CREATE OR REPLACE FUNCTION trg_cancelacion_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, caja_id, turno_id,
      usuario_id, usuario_autorizo_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload, dia_contable
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id,
      NEW.usuario_solicitante_id, NEW.usuario_autorizo_id,
      'CANCELACION', 'ticket.cancelado',
      'cancelacion_ticket', NEW.id,
      jsonb_build_object(
        'folio_cancelacion', NEW.folio_completo,
        'ticket_folio', NEW.ticket_folio_snapshot,
        'ticket_total_snapshot', NEW.ticket_total_snapshot,
        'motivo', NEW.motivo,
        'motivo_texto', NEW.motivo_texto,
        'estado_fiscal_previo', NEW.ticket_estado_fiscal_previo,
        'estado_cocina_previo', NEW.ticket_estado_cocina_previo,
        'cancelar_cfdi_sat', NEW.cancelar_cfdi_sat
      ),
      NEW.dia_contable
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cancelaciones_audit
  AFTER INSERT ON cancelaciones_ticket
  FOR EACH ROW EXECUTE FUNCTION trg_cancelacion_audit();

-- 5.3.5 set_updated_at
CREATE TRIGGER trg_cancelaciones_updated_at
  BEFORE UPDATE ON cancelaciones_ticket
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5.3.6 Proteger inmutables
CREATE OR REPLACE FUNCTION trg_cancelacion_proteger() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.dia_contable <> NEW.dia_contable THEN
      RAISE EXCEPTION 'cancelaciones_ticket.dia_contable es inmutable';
    END IF;
    IF OLD.folio_completo <> NEW.folio_completo THEN
      RAISE EXCEPTION 'cancelaciones_ticket.folio_completo es inmutable';
    END IF;
    IF OLD.ticket_id <> NEW.ticket_id THEN
      RAISE EXCEPTION 'cancelaciones_ticket.ticket_id es inmutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cancelaciones_proteger
  BEFORE UPDATE ON cancelaciones_ticket
  FOR EACH ROW EXECUTE FUNCTION trg_cancelacion_proteger();

-- =====================================================================
-- §6. Esquema: CFDI 4.0
-- =====================================================================

-- §6.1 Enums asociados

-- Estado del CFDI ante SAT
CREATE TYPE cfdi_estado_sat AS ENUM (
  'BORRADOR',                     -- generado pero no enviado a timbrado
  'EN_PROCESO_TIMBRADO',          -- enviado al PAC, esperando respuesta
  'TIMBRADO',                     -- recibido sello y UUID del SAT
  'ERROR_TIMBRADO',               -- el PAC devolvió error (datos inválidos, RFC mal, etc.)
  'EN_PROCESO_CANCELACION',       -- solicitud de cancelación enviada al SAT
  'CANCELADO',                    -- SAT confirmó cancelación
  'CANCELACION_RECHAZADA',        -- SAT no permitió cancelar
  'VIGENTE_SUSTITUIDO'            -- se sustituyó por un nuevo CFDI (relación 04)
);

-- Tipo de comprobante CFDI (catálogo del SAT)
CREATE TYPE cfdi_tipo_comprobante AS ENUM (
  'INGRESO',                      -- factura de venta normal (tipo I)
  'EGRESO',                       -- nota de crédito (tipo E)
  'TRASLADO',                     -- carta porte (fuera de alcance, queda en enum por completitud)
  'PAGO'                          -- complemento de pagos (post-MVP)
);

-- PAC (Proveedor Autorizado de Certificación)
CREATE TYPE cfdi_proveedor_pac AS ENUM (
  'FACTURAPI',
  'SOLUCIONFACTIBLE',
  'FINKOK',
  'EDICOM',
  'PRODIGIA',
  'OTRO'
);

-- Tipo de evento SAT (timbrado, cancelación, sustitución)
CREATE TYPE cfdi_sat_evento AS ENUM (
  'TIMBRADO_SOLICITADO',
  'TIMBRADO_CONFIRMADO',
  'TIMBRADO_ERROR',
  'CANCELACION_SOLICITADA',
  'CANCELACION_CONFIRMADA',
  'CANCELACION_RECHAZADA',
  'SUSTITUCION_GENERADA',
  'ACUSE_DESCARGADO'
);

-- §6.2 Tabla tickets_cfdi
CREATE TABLE tickets_cfdi (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  -- 1:1 opcional con el ticket
  ticket_id           uuid NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,

  -- ===== Identidad fiscal =====
  tipo_comprobante    cfdi_tipo_comprobante NOT NULL DEFAULT 'INGRESO',

  -- UUID timbrado por el SAT (lo devuelve el PAC al timbrar)
  uuid_fiscal         varchar(40) NULL,                       -- formato: 8-4-4-4-12
  serie               varchar(20) NULL,                       -- ej. 'A', 'F'
  folio_fiscal        varchar(50) NULL,                       -- el folio interno del CFDI (puede ser distinto al folio del ticket)
  fecha_timbrado      timestamptz NULL,                       -- cuando se timbró efectivamente
  fecha_emision       timestamptz NULL,                       -- la que aparece en el XML

  -- ===== Datos del receptor (snapshot, vienen del cliente o se piden al cajero) =====
  receptor_rfc        varchar(13) NULL,                       -- 'XAXX010101000' para genérico público en general
  receptor_razon_social varchar(250) NULL,
  receptor_uso_cfdi   varchar(5) NULL,                        -- catálogo SAT (G03, P01, etc.)
  receptor_codigo_postal varchar(10) NULL,
  receptor_regimen_fiscal varchar(10) NULL,                   -- catálogo SAT (601, 612, etc.)
  receptor_email      varchar(255) NULL,

  -- ===== Datos del emisor (snapshot, vienen del tenant/sucursal en el momento) =====
  emisor_rfc          varchar(13) NOT NULL,
  emisor_razon_social varchar(250) NOT NULL,
  emisor_regimen_fiscal varchar(10) NOT NULL,
  emisor_lugar_expedicion varchar(10) NOT NULL,               -- CP del establecimiento

  -- ===== Totales del CFDI (snapshot del ticket en el momento de timbrado) =====
  subtotal_mxn        numeric(12,2) NOT NULL,
  descuento_mxn       numeric(12,2) NOT NULL DEFAULT 0,
  iva_mxn             numeric(12,2) NOT NULL DEFAULT 0,
  total_mxn           numeric(12,2) NOT NULL,
  metodo_pago_sat     varchar(5) NOT NULL,                    -- 'PUE' (pago una sola exhibición) o 'PPD' (pago en parcialidades / diferido)
  forma_pago_sat      varchar(5) NOT NULL,                    -- catálogo: '01' efectivo, '04' tarjeta crédito, '28' tarjeta débito, '03' transferencia, etc.

  -- ===== Storage =====
  xml_storage_path    varchar(500) NULL,                      -- path en Supabase Storage bucket 'cfdi'
  pdf_storage_path    varchar(500) NULL,                      -- representación impresa
  acuse_xml_storage_path varchar(500) NULL,                   -- acuse del PAC

  -- ===== Estado fiscal =====
  estado_sat          cfdi_estado_sat NOT NULL DEFAULT 'BORRADOR',

  -- ===== Proveedor PAC =====
  pac_proveedor       cfdi_proveedor_pac NOT NULL,
  pac_referencia      varchar(100) NULL,                      -- ID del proveedor para rastreo
  pac_costo_centavos  integer NULL,                           -- costo del timbrado (ej. 80 = $0.80 MXN)

  -- ===== Sustitución / relación =====
  cfdi_sustituye_id   uuid NULL REFERENCES tickets_cfdi(id),  -- si este CFDI sustituye a otro (relación 04 del SAT)
  -- (El CFDI original es VIGENTE_SUSTITUIDO. El sustituto debe vincular aquí.)

  -- ===== Nota de crédito (cuando tipo_comprobante=EGRESO) =====
  devolucion_id       uuid NULL REFERENCES devoluciones(id),
  -- (Si este es una NC, apunta a la devolución que la motivó.)

  -- ===== Ciclo de vida =====
  intentos_timbrado   integer NOT NULL DEFAULT 0,
  ultimo_error_pac    text NULL,
  ultimo_intento_at   timestamptz NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),

  CONSTRAINT cfdi_timbrado_coherente CHECK (
    (estado_sat IN ('BORRADOR', 'EN_PROCESO_TIMBRADO', 'ERROR_TIMBRADO')
     AND uuid_fiscal IS NULL AND fecha_timbrado IS NULL)
    OR
    (estado_sat IN ('TIMBRADO', 'EN_PROCESO_CANCELACION', 'CANCELADO', 'CANCELACION_RECHAZADA', 'VIGENTE_SUSTITUIDO')
     AND uuid_fiscal IS NOT NULL AND fecha_timbrado IS NOT NULL)
  ),
  CONSTRAINT nc_requiere_devolucion CHECK (
    tipo_comprobante <> 'EGRESO' OR devolucion_id IS NOT NULL
  )
);

-- Un ticket solo puede tener UN CFDI de INGRESO vigente (no cancelado, no sustituido)
CREATE UNIQUE INDEX idx_tickets_cfdi_ingreso_vigente ON tickets_cfdi(ticket_id)
  WHERE tipo_comprobante = 'INGRESO'
    AND estado_sat IN ('TIMBRADO', 'EN_PROCESO_CANCELACION');

CREATE INDEX idx_tickets_cfdi_ticket ON tickets_cfdi(ticket_id);
CREATE INDEX idx_tickets_cfdi_estado ON tickets_cfdi(tenant_id, estado_sat);
CREATE INDEX idx_tickets_cfdi_uuid_fiscal ON tickets_cfdi(uuid_fiscal) WHERE uuid_fiscal IS NOT NULL;
CREATE INDEX idx_tickets_cfdi_devolucion ON tickets_cfdi(devolucion_id) WHERE devolucion_id IS NOT NULL;

COMMENT ON TABLE tickets_cfdi IS 'Metadata fiscal del CFDI 4.0. XML en Supabase Storage bucket privado (D39).';
COMMENT ON COLUMN tickets_cfdi.xml_storage_path IS 'Path en bucket: cfdi/<tenant_id>/<año>/<mes>/<uuid_fiscal>.xml';
COMMENT ON COLUMN tickets_cfdi.cfdi_sustituye_id IS 'Cuando se sustituye un CFDI cancelado (relación 04 del SAT), aquí va el ID del CFDI original.';

-- §6.3 Completar la FK de devoluciones.cfdi_nota_credito_id (tickets_cfdi ya existe)
ALTER TABLE devoluciones
  ADD CONSTRAINT fk_devoluciones_cfdi_nota_credito
  FOREIGN KEY (cfdi_nota_credito_id) REFERENCES tickets_cfdi(id);

CREATE INDEX idx_devoluciones_cfdi_nc ON devoluciones(cfdi_nota_credito_id)
  WHERE cfdi_nota_credito_id IS NOT NULL;

-- §6.4 Tabla cfdi_sat_movimientos
CREATE TABLE cfdi_sat_movimientos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  cfdi_id             uuid NOT NULL REFERENCES tickets_cfdi(id) ON DELETE RESTRICT,

  evento              cfdi_sat_evento NOT NULL,

  -- ===== Detalles del evento =====
  pac_proveedor       cfdi_proveedor_pac NOT NULL,
  pac_codigo_respuesta varchar(20) NULL,             -- código que devolvió el PAC
  pac_mensaje         text NULL,                     -- mensaje del PAC, puede ser un error
  sat_codigo          varchar(20) NULL,              -- código del SAT (ej. 'CFDI40103')
  sat_mensaje         text NULL,

  -- ===== Payloads =====
  request_payload     jsonb NULL,                    -- lo que se le envió al PAC
  response_payload    jsonb NULL,                    -- lo que respondió

  -- ===== Adjuntos =====
  acuse_storage_path  varchar(500) NULL,             -- acuse XML descargado, si aplica

  -- ===== Atribución =====
  usuario_id          uuid NULL REFERENCES auth.users(id),
  fecha_evento        timestamptz NOT NULL DEFAULT now(),

  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_cfdi_sat_mov_cfdi ON cfdi_sat_movimientos(cfdi_id, fecha_evento DESC);
CREATE INDEX idx_cfdi_sat_mov_evento ON cfdi_sat_movimientos(tenant_id, evento, fecha_evento DESC);
CREATE INDEX idx_cfdi_sat_mov_errores ON cfdi_sat_movimientos(tenant_id, fecha_evento DESC)
  WHERE evento IN ('TIMBRADO_ERROR', 'CANCELACION_RECHAZADA');

COMMENT ON TABLE cfdi_sat_movimientos IS 'Bitácora de eventos SAT/PAC para cada CFDI. Crítica para soporte y auditoría fiscal.';

-- §6.5 Triggers en tickets_cfdi

-- 6.5.1 set_updated_at
CREATE TRIGGER trg_tickets_cfdi_updated_at
  BEFORE UPDATE ON tickets_cfdi
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6.5.2 Cambiar estado_fiscal del ticket al TIMBRAR
CREATE OR REPLACE FUNCTION trg_cfdi_marcar_ticket_facturado() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.estado_sat NOT IN ('TIMBRADO', 'CANCELADO', 'VIGENTE_SUSTITUIDO')
     AND NEW.estado_sat = 'TIMBRADO'
     AND NEW.tipo_comprobante = 'INGRESO' THEN
    UPDATE tickets
    SET estado_fiscal = 'FACTURADO',
        updated_by = NEW.updated_by
    WHERE id = NEW.ticket_id
      AND estado_fiscal = 'PAGADO';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cfdi_marcar_facturado
  AFTER UPDATE ON tickets_cfdi
  FOR EACH ROW EXECUTE FUNCTION trg_cfdi_marcar_ticket_facturado();

-- 6.5.3 Audit de cambios de estado del CFDI
CREATE OR REPLACE FUNCTION trg_cfdi_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado_sat IS DISTINCT FROM NEW.estado_sat THEN
    INSERT INTO auditoria_eventos (
      tenant_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.updated_by, 'FISCAL', 'cfdi.estado.cambio',
      'cfdi', NEW.id,
      jsonb_build_object(
        'estado_anterior', OLD.estado_sat,
        'estado_nuevo', NEW.estado_sat,
        'uuid_fiscal', NEW.uuid_fiscal,
        'ticket_id', NEW.ticket_id,
        'pac', NEW.pac_proveedor
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_cfdi_audit
  AFTER UPDATE ON tickets_cfdi
  FOR EACH ROW EXECUTE FUNCTION trg_cfdi_audit();

-- =====================================================================
-- §7. Esquema: Delivery propio
-- =====================================================================

-- §7.1 Enums asociados

-- Estado del ciclo de delivery (propio, no de apps)
CREATE TYPE delivery_estado AS ENUM (
  'ASIGNADO',                     -- repartidor seleccionado, aún no sale
  'EN_RUTA',                      -- salió de la sucursal
  'EN_DESTINO',                   -- llegó al cliente (opcional, no todos lo capturan)
  'ENTREGADO',                    -- cliente recibió y se confirmó
  'NO_ENTREGADO',                 -- no se pudo entregar (cliente no estaba, mal dirección, etc.)
  'EN_REGRESO',                   -- repartidor de vuelta a la sucursal
  'LIQUIDADO',                    -- repartidor regresó, entregó dinero/comprobantes, ciclo cerrado
  'CANCELADO'                     -- raro: se canceló antes de salir o durante
);

-- Motivo de no entrega (cuando aplique)
CREATE TYPE delivery_no_entrega_motivo AS ENUM (
  'CLIENTE_AUSENTE',
  'DIRECCION_INCORRECTA',
  'CLIENTE_RECHAZO',
  'ACCIDENTE_INCIDENTE',
  'ZONA_INSEGURA',
  'OTRO'
);

-- §7.2 Tabla delivery_asignaciones
CREATE TABLE delivery_asignaciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,

  -- 1:1 con ticket (cuando modo_servicio=DELIVERY_PROPIO)
  ticket_id           uuid NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,

  -- ===== Repartidor =====
  repartidor_id       uuid NOT NULL REFERENCES auth.users(id),
  -- (El usuario debe tener rol 'repartidor' en usuarios_acceso de Parte 1A.
  -- Validación a nivel de aplicación, no constraint, para no acoplar a usuarios_acceso.)

  -- ===== Estado y timestamps =====
  estado              delivery_estado NOT NULL DEFAULT 'ASIGNADO',

  fecha_asignacion    timestamptz NOT NULL DEFAULT now(),
  fecha_salida        timestamptz NULL,                       -- pasó a EN_RUTA
  fecha_destino       timestamptz NULL,                       -- pasó a EN_DESTINO (opcional)
  fecha_entrega       timestamptz NULL,                       -- pasó a ENTREGADO
  fecha_no_entrega    timestamptz NULL,                       -- pasó a NO_ENTREGADO
  fecha_regreso       timestamptz NULL,                       -- pasó a EN_REGRESO
  fecha_liquidacion   timestamptz NULL,                       -- pasó a LIQUIDADO

  -- ===== Información de no entrega =====
  no_entrega_motivo   delivery_no_entrega_motivo NULL,
  no_entrega_nota     text NULL,

  -- ===== Geo (opcional, cuando hay app móvil del repartidor con GPS) =====
  destino_lat         numeric(10,7) NULL,
  destino_lng         numeric(10,7) NULL,
  distancia_km_estimada numeric(6,2) NULL,
  distancia_km_real   numeric(6,2) NULL,

  -- ===== Liquidación financiera =====
  -- Cuando es pago al recibir, el repartidor regresa con efectivo/comprobantes.
  -- Aquí se registra qué dijo traer.
  monto_a_liquidar_mxn   numeric(12,2) NOT NULL DEFAULT 0 CHECK (monto_a_liquidar_mxn >= 0),
  monto_efectivo_entregado_mxn numeric(12,2) NULL,            -- declarado por el repartidor
  monto_tarjeta_aprobado_mxn numeric(12,2) NULL,              -- comprobantes de terminal móvil
  diferencia_mxn      numeric(12,2) NULL,                     -- (esperado - entregado), trigger lo calcula

  liquidado_por_id    uuid NULL REFERENCES auth.users(id),    -- quién recibió la liquidación
  liquidacion_nota    text NULL,

  -- ===== Propina al repartidor =====
  propina_repartidor_mxn numeric(12,2) NOT NULL DEFAULT 0 CHECK (propina_repartidor_mxn >= 0),

  -- ===== Tiempos de promesa (para reportes de cumplimiento) =====
  tiempo_promesa_minutos integer NULL,                        -- ej. 30 min prometidos al cliente
  tiempo_real_minutos    integer NULL,                        -- trigger calcula al ENTREGADO

  -- ===== Sync offline =====
  client_id_local     varchar(64) NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),

  CONSTRAINT no_entrega_requiere_motivo CHECK (
    estado <> 'NO_ENTREGADO' OR no_entrega_motivo IS NOT NULL
  ),
  CONSTRAINT liquidacion_requiere_quien_recibio CHECK (
    estado <> 'LIQUIDADO' OR liquidado_por_id IS NOT NULL
  )
);

-- Una sola asignación activa por ticket
CREATE UNIQUE INDEX idx_delivery_ticket_unico ON delivery_asignaciones(ticket_id);

CREATE INDEX idx_delivery_repartidor_estado ON delivery_asignaciones(repartidor_id, estado);
CREATE INDEX idx_delivery_sucursal_fecha ON delivery_asignaciones(sucursal_id, fecha_asignacion DESC);
CREATE INDEX idx_delivery_activos ON delivery_asignaciones(sucursal_id, fecha_asignacion DESC)
  WHERE estado IN ('ASIGNADO', 'EN_RUTA', 'EN_DESTINO');
CREATE INDEX idx_delivery_no_liquidados ON delivery_asignaciones(repartidor_id, fecha_regreso)
  WHERE estado = 'EN_REGRESO';
CREATE UNIQUE INDEX idx_delivery_client_id_local ON delivery_asignaciones(tenant_id, client_id_local)
  WHERE client_id_local IS NOT NULL;

COMMENT ON TABLE delivery_asignaciones IS 'Ciclo de delivery propio (D43). 1:1 opcional con tickets de modo_servicio=DELIVERY_PROPIO.';
COMMENT ON COLUMN delivery_asignaciones.diferencia_mxn IS 'Liquidación: monto_a_liquidar - (efectivo + tarjeta entregados). Negativo = falta dinero, positivo = sobra.';

-- §7.3 Triggers en delivery_asignaciones

-- 7.3.1 set_updated_at
CREATE TRIGGER trg_delivery_updated_at
  BEFORE UPDATE ON delivery_asignaciones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7.3.2 Calcular diferencia y tiempo_real al actualizar estados
CREATE OR REPLACE FUNCTION trg_delivery_calcular() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Calcular diferencia cuando se llena la liquidación
  IF NEW.monto_efectivo_entregado_mxn IS NOT NULL OR NEW.monto_tarjeta_aprobado_mxn IS NOT NULL THEN
    NEW.diferencia_mxn := NEW.monto_a_liquidar_mxn
      - COALESCE(NEW.monto_efectivo_entregado_mxn, 0)
      - COALESCE(NEW.monto_tarjeta_aprobado_mxn, 0);
  END IF;

  -- Calcular tiempo real cuando se marca como ENTREGADO
  IF NEW.fecha_entrega IS NOT NULL AND NEW.fecha_salida IS NOT NULL AND NEW.tiempo_real_minutos IS NULL THEN
    NEW.tiempo_real_minutos := EXTRACT(EPOCH FROM (NEW.fecha_entrega - NEW.fecha_salida)) / 60;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_delivery_calcular
  BEFORE UPDATE ON delivery_asignaciones
  FOR EACH ROW EXECUTE FUNCTION trg_delivery_calcular();

-- 7.3.3 Sincronizar estado_cocina del ticket con el ciclo de delivery
CREATE OR REPLACE FUNCTION trg_delivery_sync_ticket() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    -- Permitir la transición del ticket aunque venga "fuera de orden"
    SET LOCAL session_replication_role = 'replica';

    IF NEW.estado = 'EN_RUTA' THEN
      UPDATE tickets
      SET estado_cocina = 'EN_RUTA',
          fecha_entrega = NULL,
          updated_by = NEW.updated_by
      WHERE id = NEW.ticket_id
        AND estado_cocina NOT IN ('EN_RUTA', 'ENTREGADO_DOMICILIO', 'ENTREGADO');

    ELSIF NEW.estado = 'ENTREGADO' THEN
      UPDATE tickets
      SET estado_cocina = 'ENTREGADO_DOMICILIO',
          fecha_entrega = NEW.fecha_entrega,
          usuario_entrega_id = NEW.repartidor_id,
          updated_by = NEW.updated_by
      WHERE id = NEW.ticket_id
        AND estado_cocina <> 'ENTREGADO_DOMICILIO';
    END IF;

    SET LOCAL session_replication_role = 'origin';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_delivery_sync_ticket
  AFTER UPDATE ON delivery_asignaciones
  FOR EACH ROW EXECUTE FUNCTION trg_delivery_sync_ticket();

-- 7.3.4 Audit
CREATE OR REPLACE FUNCTION trg_delivery_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.created_by, 'DELIVERY', 'delivery.asignado',
      'delivery', NEW.id,
      jsonb_build_object(
        'ticket_id', NEW.ticket_id,
        'repartidor_id', NEW.repartidor_id,
        'monto_a_liquidar_mxn', NEW.monto_a_liquidar_mxn
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.updated_by, 'DELIVERY', 'delivery.estado.cambio',
      'delivery', NEW.id,
      jsonb_build_object(
        'estado_anterior', OLD.estado,
        'estado_nuevo', NEW.estado,
        'ticket_id', NEW.ticket_id,
        'repartidor_id', NEW.repartidor_id,
        'diferencia_mxn', NEW.diferencia_mxn
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_delivery_audit
  AFTER INSERT OR UPDATE ON delivery_asignaciones
  FOR EACH ROW EXECUTE FUNCTION trg_delivery_audit();

-- =====================================================================
-- §8. Esquema: Conciliación de apps externas
-- =====================================================================

-- §8.1 Tabla apps_liquidaciones
CREATE TABLE apps_liquidaciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NULL REFERENCES sucursales(id),    -- NULL si la liquidación es a nivel tenant

  -- ===== Identificación de la liquidación =====
  app_externa         modo_servicio NOT NULL,                 -- APP_RAPPI, APP_UBEREATS, APP_DIDI, APP_IFOOD, APP_OTRO
  -- (Reutilizamos el enum modo_servicio. Constraint asegura que sea uno de APP_*.)
  folio_liquidacion_app varchar(100) NOT NULL,               -- el folio que la app puso en su reporte
  periodo_inicio      date NOT NULL,
  periodo_fin         date NOT NULL,

  -- ===== Montos del reporte de la app =====
  total_ventas_brutas_mxn   numeric(12,2) NOT NULL,           -- lo que la app reporta haber vendido
  total_comisiones_mxn      numeric(12,2) NOT NULL DEFAULT 0, -- comisión cobrada por la app
  total_iva_comisiones_mxn  numeric(12,2) NOT NULL DEFAULT 0,
  total_propinas_mxn        numeric(12,2) NOT NULL DEFAULT 0, -- propinas que la app retuvo
  total_ajustes_mxn         numeric(12,2) NOT NULL DEFAULT 0, -- reembolsos, ajustes manuales
  total_liquidado_mxn       numeric(12,2) NOT NULL,           -- lo que la app efectivamente depositó

  -- ===== Conciliación con POS =====
  total_pos_mxn       numeric(12,2) NULL,                     -- lo que el POS tiene registrado para el período (calculado)
  diferencia_mxn      numeric(12,2) NULL,                     -- total_pos - total_ventas_brutas (calculado)
  porcentaje_match    numeric(5,2) NULL,                      -- % de tickets POS que se encontraron en la liquidación

  -- ===== Ingesta =====
  archivo_storage_path varchar(500) NULL,                     -- CSV/Excel subido en Supabase Storage
  ingesta_metodo      varchar(20) NOT NULL DEFAULT 'MANUAL',  -- 'MANUAL', 'API' (Fase 5)
  ingesta_at          timestamptz NOT NULL DEFAULT now(),
  ingesta_por_id      uuid REFERENCES auth.users(id),

  -- ===== Estado =====
  estado              varchar(20) NOT NULL DEFAULT 'PENDIENTE',
                                  -- PENDIENTE, EN_PROCESO, CONCILIADA, CONCILIADA_CON_DIFERENCIAS

  conciliado_at       timestamptz NULL,
  conciliado_por_id   uuid NULL REFERENCES auth.users(id),

  -- ===== Notas =====
  nota                text NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),

  CONSTRAINT app_externa_valida CHECK (
    app_externa IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI', 'APP_IFOOD', 'APP_OTRO')
  ),
  CONSTRAINT estado_liquidacion_valido CHECK (
    estado IN ('PENDIENTE', 'EN_PROCESO', 'CONCILIADA', 'CONCILIADA_CON_DIFERENCIAS')
  ),
  CONSTRAINT periodo_coherente CHECK (periodo_fin >= periodo_inicio),
  CONSTRAINT folio_unico_por_app UNIQUE (tenant_id, app_externa, folio_liquidacion_app)
);

CREATE INDEX idx_apps_liq_tenant_periodo ON apps_liquidaciones(tenant_id, app_externa, periodo_fin DESC);
CREATE INDEX idx_apps_liq_estado ON apps_liquidaciones(tenant_id, estado) WHERE estado <> 'CONCILIADA';

COMMENT ON TABLE apps_liquidaciones IS 'Reportes de liquidación de apps externas. Ingestados manualmente en MVP (CSV/Excel).';

-- §8.2 Tabla apps_liquidacion_items
CREATE TABLE apps_liquidacion_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  liquidacion_id      uuid NOT NULL REFERENCES apps_liquidaciones(id) ON DELETE CASCADE,

  -- ===== Datos del ticket según la app =====
  folio_externo_app   varchar(100) NOT NULL,
  fecha_orden_app     timestamptz NULL,
  monto_venta_mxn     numeric(12,2) NOT NULL,
  monto_comision_mxn  numeric(12,2) NOT NULL DEFAULT 0,
  monto_propina_mxn   numeric(12,2) NOT NULL DEFAULT 0,
  monto_neto_mxn      numeric(12,2) NOT NULL,                 -- lo que la app pagó al restaurante por este ticket

  -- ===== Match con POS =====
  ticket_id_match     uuid NULL REFERENCES tickets(id),       -- NULL si no se encontró ticket POS correspondiente
  match_metodo        varchar(20) NULL,                       -- 'FOLIO_EXATO', 'MONTO_FECHA', 'MANUAL', NULL=no_match
  match_at            timestamptz NULL,
  match_por_id        uuid NULL REFERENCES auth.users(id),

  -- ===== Diferencias detectadas =====
  monto_diferencia_mxn numeric(12,2) NULL,                    -- (monto_venta_app - tickets.total_mxn) si hay match
  notas_match         text NULL,

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_apps_liq_items_liquidacion ON apps_liquidacion_items(liquidacion_id);
CREATE INDEX idx_apps_liq_items_folio ON apps_liquidacion_items(tenant_id, folio_externo_app);
CREATE INDEX idx_apps_liq_items_ticket_match ON apps_liquidacion_items(ticket_id_match)
  WHERE ticket_id_match IS NOT NULL;
CREATE INDEX idx_apps_liq_items_sin_match ON apps_liquidacion_items(liquidacion_id)
  WHERE ticket_id_match IS NULL;

COMMENT ON TABLE apps_liquidacion_items IS 'Detalle por ticket dentro de una liquidación de app externa. Permite match con tickets POS.';

-- §8.3 Vista consolidada: vw_ventas_apps_externas
CREATE OR REPLACE VIEW vw_ventas_apps_externas AS
SELECT
  t.id                  AS ticket_id,
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  t.folio_completo      AS folio_pos,
  t.folio_externo_app   AS folio_app,
  t.modo_servicio       AS app_externa,
  t.total_mxn           AS total_pos_mxn,
  p.monto_mxn           AS pago_registrado_pos_mxn,
  ali.monto_venta_mxn   AS monto_segun_liquidacion_app,
  ali.monto_neto_mxn    AS monto_neto_liquidado_app,
  ali.monto_comision_mxn AS comision_app,
  ali.monto_diferencia_mxn AS diferencia_pos_vs_app,
  CASE
    WHEN ali.id IS NULL THEN 'NO_LIQUIDADO_TODAVIA'
    WHEN ali.ticket_id_match IS NULL THEN 'EN_LIQUIDACION_SIN_MATCH'
    WHEN ABS(COALESCE(ali.monto_diferencia_mxn, 0)) < 0.50 THEN 'CONCILIADO_OK'
    ELSE 'CONCILIADO_CON_DIFERENCIA'
  END AS estado_conciliacion,
  ali.liquidacion_id,
  liq.folio_liquidacion_app,
  liq.periodo_inicio,
  liq.periodo_fin
FROM tickets t
LEFT JOIN pagos p
  ON p.ticket_id = t.id
  AND p.metodo_pago IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI', 'APP_IFOOD', 'APP_OTRO')
  AND p.deleted_at IS NULL
LEFT JOIN apps_liquidacion_items ali
  ON ali.ticket_id_match = t.id
LEFT JOIN apps_liquidaciones liq
  ON liq.id = ali.liquidacion_id
WHERE t.modo_servicio IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI', 'APP_IFOOD', 'APP_OTRO')
  AND t.deleted_at IS NULL
  AND t.estado_fiscal <> 'CANCELADO';

COMMENT ON VIEW vw_ventas_apps_externas IS 'Vista de conciliación: tickets POS vs liquidaciones de apps. Útil para reportes y alertas.';

-- §8.4 Triggers en apps_liquidaciones
CREATE TRIGGER trg_apps_liq_updated_at
  BEFORE UPDATE ON apps_liquidaciones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_apps_liq_items_unused_trigger
  -- (placeholder por simetría; no se requiere set_updated_at en items por ahora)
  BEFORE UPDATE ON apps_liquidacion_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- §9. Esquema: Mecánica de comanda
-- =====================================================================

-- §9.1 Enums asociados

-- Tipo de evento de impresión
CREATE TYPE comanda_evento_tipo AS ENUM (
  'IMPRESION_INICIAL',            -- primera vez que sale la comanda
  'REIMPRESION_CAJERO',           -- el cajero la pidió de nuevo
  'REIMPRESION_AUTOMATICA',       -- el sistema reintentó tras fallo de impresora
  'REIMPRESION_AREA',             -- impresora de un área que estaba caída se recuperó
  'ANULACION_COMANDA'             -- comanda enviada a "cancela este pedido en cocina"
);

-- Resultado de la impresión
CREATE TYPE comanda_resultado AS ENUM (
  'OK',
  'IMPRESORA_OFFLINE',
  'IMPRESORA_SIN_PAPEL',
  'ERROR_DESCONOCIDO',
  'CANCELADO_POR_USUARIO'
);

-- §9.2 Tabla comanda_impresiones
CREATE TABLE comanda_impresiones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  ticket_id           uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,

  -- ===== Área y dispositivo =====
  area_cocina_id      uuid NOT NULL REFERENCES areas_cocina(id),
  area_cocina_nombre_snapshot varchar(100) NOT NULL,          -- snapshot por si el área se renombra
  impresora_identificador varchar(100) NULL,                  -- nombre o IP/path de la impresora física

  -- ===== Evento =====
  evento_tipo         comanda_evento_tipo NOT NULL,
  resultado           comanda_resultado NOT NULL DEFAULT 'OK',
  error_detalle       text NULL,                              -- detalle del error si falló

  -- ===== Items incluidos (snapshot del estado del ticket al momento de imprimir) =====
  items_incluidos_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- estructura: [{"ticket_item_id":"uuid","cantidad":2,"nombre":"...","modificadores":[...]}]

  -- ===== Reimpresión: razón y autorización =====
  razon_reimpresion   text NULL,                              -- obligatoria si evento_tipo=REIMPRESION_CAJERO
  autorizacion_pin_id uuid NULL REFERENCES autorizaciones_pin(id),
  -- PIN obligatorio cuando se reimprime una comanda ya impresa (anti-fraude).

  -- ===== Atribución =====
  usuario_id          uuid NOT NULL REFERENCES auth.users(id),
  fecha_impresion     timestamptz NOT NULL DEFAULT now(),

  -- ===== Comunes =====
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),

  CONSTRAINT reimpresion_cajero_requiere_razon_y_pin CHECK (
    evento_tipo <> 'REIMPRESION_CAJERO'
    OR (razon_reimpresion IS NOT NULL AND autorizacion_pin_id IS NOT NULL)
  )
);

CREATE INDEX idx_comanda_imp_ticket ON comanda_impresiones(ticket_id, fecha_impresion);
CREATE INDEX idx_comanda_imp_area ON comanda_impresiones(area_cocina_id, fecha_impresion DESC);
CREATE INDEX idx_comanda_imp_evento ON comanda_impresiones(tenant_id, evento_tipo, fecha_impresion DESC);
CREATE INDEX idx_comanda_imp_errores ON comanda_impresiones(sucursal_id, fecha_impresion DESC)
  WHERE resultado <> 'OK';
CREATE INDEX idx_comanda_imp_reimpresiones_cajero ON comanda_impresiones(usuario_id, fecha_impresion DESC)
  WHERE evento_tipo = 'REIMPRESION_CAJERO';

COMMENT ON TABLE comanda_impresiones IS 'Bitácora de cada impresión de comanda por área. Reimpresiones cajero requieren PIN y razón.';

-- §9.3 Triggers en comanda_impresiones

-- 9.3.1 Actualizar contadores en el ticket
CREATE OR REPLACE FUNCTION trg_comanda_imp_actualizar_ticket() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.resultado = 'OK' THEN
    IF NEW.evento_tipo = 'IMPRESION_INICIAL' THEN
      UPDATE tickets
      SET comanda_impresa_at = COALESCE(comanda_impresa_at, NEW.fecha_impresion)
      WHERE id = NEW.ticket_id;
    ELSIF NEW.evento_tipo = 'REIMPRESION_CAJERO' THEN
      UPDATE tickets
      SET comanda_reimpresa_count = comanda_reimpresa_count + 1
      WHERE id = NEW.ticket_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_comanda_imp_actualizar_ticket
  AFTER INSERT ON comanda_impresiones
  FOR EACH ROW EXECUTE FUNCTION trg_comanda_imp_actualizar_ticket();

-- 9.3.2 Audit para reimpresiones del cajero (siempre, por anti-fraude)
CREATE OR REPLACE FUNCTION trg_comanda_imp_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.evento_tipo = 'REIMPRESION_CAJERO' THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.usuario_id, 'COCINA', 'comanda.reimpresa_cajero',
      'ticket', NEW.ticket_id,
      jsonb_build_object(
        'comanda_impresion_id', NEW.id,
        'area_cocina', NEW.area_cocina_nombre_snapshot,
        'razon', NEW.razon_reimpresion,
        'autorizacion_pin_id', NEW.autorizacion_pin_id,
        'resultado', NEW.resultado
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_comanda_imp_audit
  AFTER INSERT ON comanda_impresiones
  FOR EACH ROW EXECUTE FUNCTION trg_comanda_imp_audit();

-- =====================================================================
-- §10. Sync offline completo
-- =====================================================================

-- §10.2 Tabla sync_eventos
CREATE TABLE sync_eventos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NULL REFERENCES sucursales(id),
  caja_id             uuid NULL REFERENCES cajas(id),
  usuario_id          uuid NULL REFERENCES auth.users(id),

  -- ===== Identificación del dispositivo cliente =====
  dispositivo_id      varchar(100) NOT NULL,                  -- identificador único del dispositivo (UUID local o hardware)
  dispositivo_descripcion varchar(255) NULL,                  -- "Tableta Caja 1 Knock-Out Centro"

  -- ===== Resumen del batch =====
  operaciones_total       integer NOT NULL CHECK (operaciones_total >= 0),
  operaciones_exitosas    integer NOT NULL DEFAULT 0,
  operaciones_idempotentes integer NOT NULL DEFAULT 0,        -- ya existían, devolvió fila existente
  operaciones_conflicto   integer NOT NULL DEFAULT 0,
  operaciones_error       integer NOT NULL DEFAULT 0,

  -- ===== Ventana temporal de las operaciones del batch =====
  fecha_operacion_min timestamptz NULL,                       -- la más antigua de las operaciones
  fecha_operacion_max timestamptz NULL,                       -- la más reciente

  -- ===== Procesamiento =====
  fecha_recepcion     timestamptz NOT NULL DEFAULT now(),
  fecha_procesado_inicio timestamptz NULL,
  fecha_procesado_fin    timestamptz NULL,
  duracion_ms         integer NULL,

  -- ===== Payload =====
  request_summary     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- ej: {"tablas": {"tickets": 3, "pagos": 4, "ticket_items": 12}}
  response_summary    jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_eventos_tenant_fecha ON sync_eventos(tenant_id, fecha_recepcion DESC);
CREATE INDEX idx_sync_eventos_dispositivo ON sync_eventos(dispositivo_id, fecha_recepcion DESC);
CREATE INDEX idx_sync_eventos_con_conflictos ON sync_eventos(tenant_id, fecha_recepcion DESC)
  WHERE operaciones_conflicto > 0 OR operaciones_error > 0;

COMMENT ON TABLE sync_eventos IS 'Bitácora de batches de sync offline recibidos por el servidor.';

-- §10.3 Tabla sync_conflictos
CREATE TYPE sync_conflicto_tipo AS ENUM (
  'TURNO_CERRADO_SERVIDOR',       -- intentó crear ticket en turno que ya cerró en servidor
  'PRODUCTO_ELIMINADO',           -- producto fue soft-deleted antes del sync
  'CAMBIO_PRECIO_DETECTADO',      -- el precio en server difiere significativamente del snapshot offline
  'TICKET_YA_PAGADO_SERVIDOR',    -- intentó modificar un ticket que ya está PAGADO en servidor
  'TICKET_YA_CANCELADO_SERVIDOR',
  'FOLIO_DUPLICADO_INESPERADO',
  'INVENTARIO_INSUFICIENTE',      -- al sincronizar, no había stock (informa, no bloquea por default)
  'AUTORIZACION_INVALIDA',        -- PIN ya no es válido (admin cambió contraseña)
  'CLIENT_ID_LOCAL_REUSADO',      -- el mismo client_id_local con datos distintos
  'ENTIDAD_REFERENCIA_NO_EXISTE', -- FK rota (ej. cliente referenciado no existe en server)
  'OTRO'
);

CREATE TYPE sync_conflicto_resolucion AS ENUM (
  'PENDIENTE',
  'RESUELTO_AUTOMATICO',          -- el servidor aplicó regla de resolución (ej. last-write-wins)
  'RESUELTO_OPERADOR',            -- un humano lo resolvió desde la UI de conflictos
  'DESCARTADO'                    -- se decidió no aplicar la operación
);

CREATE TABLE sync_conflictos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sync_evento_id      uuid NOT NULL REFERENCES sync_eventos(id) ON DELETE CASCADE,

  -- ===== Identificación de la operación conflictiva =====
  tipo_conflicto      sync_conflicto_tipo NOT NULL,
  entidad_tipo        varchar(50) NOT NULL,                   -- 'tickets', 'pagos', 'ticket_items', etc.
  entidad_id_local    uuid NOT NULL,                          -- el UUID que generó el cliente offline
  client_id_local     varchar(64) NULL,
  entidad_id_servidor uuid NULL,                              -- si se logró ubicar la fila correspondiente en server

  -- ===== Detalle =====
  payload_intentado   jsonb NOT NULL,                         -- lo que el cliente envió
  payload_servidor    jsonb NULL,                             -- estado del servidor al detectar conflicto
  diferencia_detectada jsonb NULL,                            -- campos que difieren

  -- ===== Resolución =====
  resolucion          sync_conflicto_resolucion NOT NULL DEFAULT 'PENDIENTE',
  resolucion_regla_aplicada varchar(100) NULL,                -- ej. 'last_write_wins', 'rechazo_ticket_pagado'
  resuelto_at         timestamptz NULL,
  resuelto_por_id     uuid NULL REFERENCES auth.users(id),
  resolucion_nota     text NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_sync_conflictos_evento ON sync_conflictos(sync_evento_id);
CREATE INDEX idx_sync_conflictos_pendientes ON sync_conflictos(tenant_id, created_at DESC)
  WHERE resolucion = 'PENDIENTE';
CREATE INDEX idx_sync_conflictos_tipo ON sync_conflictos(tenant_id, tipo_conflicto, created_at DESC);
CREATE INDEX idx_sync_conflictos_entidad ON sync_conflictos(entidad_tipo, entidad_id_local);

COMMENT ON TABLE sync_conflictos IS 'Conflictos detectados al procesar batches de sync offline. La UI los lista para resolución manual.';

-- §10.5 Función sync_procesar_push(operaciones jsonb)
CREATE OR REPLACE FUNCTION sync_procesar_push(
  p_dispositivo_id varchar,
  p_dispositivo_descripcion varchar,
  p_operaciones jsonb               -- array de operaciones
  -- Estructura esperada de cada operación:
  -- {
  --   "tabla": "tickets" | "ticket_items" | "pagos" | ...,
  --   "operacion": "INSERT" | "UPDATE",
  --   "entidad_id_local": "uuid",
  --   "client_id_local": "...",
  --   "payload": {...campos...},
  --   "fecha_operacion": "2026-05-21T14:30:00Z"
  -- }
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id        uuid := current_tenant_id();
  v_evento_id        uuid;
  v_op               jsonb;
  v_op_tabla         text;
  v_op_tipo          text;
  v_op_entidad_local uuid;
  v_op_client_local  varchar;
  v_op_payload       jsonb;
  v_op_fecha         timestamptz;
  v_resultado        jsonb := '[]'::jsonb;
  v_total            integer := jsonb_array_length(p_operaciones);
  v_exitosas         integer := 0;
  v_idempotentes     integer := 0;
  v_conflictos       integer := 0;
  v_errores          integer := 0;
  v_inicio           timestamptz := clock_timestamp();
  v_op_resultado     jsonb;
BEGIN
  -- Crear registro de sync_evento
  INSERT INTO sync_eventos (
    tenant_id, dispositivo_id, dispositivo_descripcion,
    usuario_id, operaciones_total,
    fecha_procesado_inicio, request_summary
  ) VALUES (
    v_tenant_id, p_dispositivo_id, p_dispositivo_descripcion,
    auth.uid(), v_total,
    v_inicio, jsonb_build_object('total', v_total)
  ) RETURNING id INTO v_evento_id;

  -- Procesar cada operación
  FOR v_op IN SELECT * FROM jsonb_array_elements(p_operaciones)
  LOOP
    v_op_tabla         := v_op->>'tabla';
    v_op_tipo          := v_op->>'operacion';
    v_op_entidad_local := (v_op->>'entidad_id_local')::uuid;
    v_op_client_local  := v_op->>'client_id_local';
    v_op_payload       := v_op->'payload';
    v_op_fecha         := (v_op->>'fecha_operacion')::timestamptz;

    -- Cada operación en su propia sub-transacción (savepoint)
    BEGIN
      v_op_resultado := sync_aplicar_operacion(
        v_evento_id,
        v_op_tabla, v_op_tipo,
        v_op_entidad_local, v_op_client_local,
        v_op_payload, v_op_fecha
      );

      -- Contabilizar
      IF v_op_resultado->>'estado' = 'EXITO' THEN
        v_exitosas := v_exitosas + 1;
      ELSIF v_op_resultado->>'estado' = 'IDEMPOTENTE' THEN
        v_idempotentes := v_idempotentes + 1;
      ELSIF v_op_resultado->>'estado' = 'CONFLICTO' THEN
        v_conflictos := v_conflictos + 1;
      ELSE
        v_errores := v_errores + 1;
      END IF;

      v_resultado := v_resultado || jsonb_build_array(v_op_resultado);

    EXCEPTION WHEN OTHERS THEN
      -- Cualquier excepción no controlada se registra como error de operación
      v_errores := v_errores + 1;
      v_resultado := v_resultado || jsonb_build_array(jsonb_build_object(
        'entidad_id_local', v_op_entidad_local,
        'tabla', v_op_tabla,
        'estado', 'ERROR',
        'mensaje', SQLERRM
      ));
    END;
  END LOOP;

  -- Actualizar el evento con totales
  UPDATE sync_eventos
  SET operaciones_exitosas    = v_exitosas,
      operaciones_idempotentes = v_idempotentes,
      operaciones_conflicto   = v_conflictos,
      operaciones_error       = v_errores,
      fecha_procesado_fin     = clock_timestamp(),
      duracion_ms             = EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_inicio))::integer,
      response_summary        = jsonb_build_object(
        'exitosas', v_exitosas,
        'idempotentes', v_idempotentes,
        'conflictos', v_conflictos,
        'errores', v_errores
      )
  WHERE id = v_evento_id;

  RETURN jsonb_build_object(
    'sync_evento_id', v_evento_id,
    'totales', jsonb_build_object(
      'total', v_total,
      'exitosas', v_exitosas,
      'idempotentes', v_idempotentes,
      'conflictos', v_conflictos,
      'errores', v_errores
    ),
    'operaciones', v_resultado
  );
END;
$$;

COMMENT ON FUNCTION sync_procesar_push IS 'Procesa batch de operaciones de sync offline. Cada operación se aplica en su propio savepoint para que errores no aborten el batch.';

-- §10.6 Función sync_aplicar_operacion(...) — el motor
CREATE OR REPLACE FUNCTION sync_aplicar_operacion(
  p_sync_evento_id    uuid,
  p_tabla             text,
  p_operacion         text,
  p_entidad_id_local  uuid,
  p_client_id_local   varchar,
  p_payload           jsonb,
  p_fecha_operacion   timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id        uuid := current_tenant_id();
  v_existing_id      uuid;
  v_ticket           record;
  v_conflicto_id     uuid;
  v_resultado_id     uuid;
BEGIN
  -- ===== Caso TICKETS =====
  IF p_tabla = 'tickets' THEN
    IF p_operacion = 'INSERT' THEN
      -- R1: Idempotencia por client_id_local
      IF p_client_id_local IS NOT NULL THEN
        SELECT id INTO v_existing_id
        FROM tickets WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
        IF FOUND THEN
          RETURN jsonb_build_object(
            'entidad_id_local', p_entidad_id_local,
            'entidad_id_servidor', v_existing_id,
            'tabla', 'tickets',
            'estado', 'IDEMPOTENTE',
            'regla', 'R1_idempotencia_client_id_local'
          );
        END IF;
      END IF;

      -- R2: Turno cerrado en servidor
      IF EXISTS (
        SELECT 1 FROM turnos
        WHERE id = (p_payload->>'turno_id')::uuid
          AND estado = 'CERRADO'
      ) THEN
        INSERT INTO sync_conflictos (
          tenant_id, sync_evento_id, tipo_conflicto,
          entidad_tipo, entidad_id_local, client_id_local,
          payload_intentado
        ) VALUES (
          v_tenant_id, p_sync_evento_id, 'TURNO_CERRADO_SERVIDOR',
          'tickets', p_entidad_id_local, p_client_id_local,
          p_payload
        ) RETURNING id INTO v_conflicto_id;

        RETURN jsonb_build_object(
          'entidad_id_local', p_entidad_id_local,
          'tabla', 'tickets',
          'estado', 'CONFLICTO',
          'sync_conflicto_id', v_conflicto_id,
          'regla', 'R2_turno_cerrado'
        );
      END IF;

      -- R10: Aplicar (INSERT normal). Forzamos el id al UUID del cliente para mantener
      -- las referencias de items/pagos/etc. que ya vienen apuntando a él.
      INSERT INTO tickets (
        id, tenant_id, sucursal_id, caja_id, turno_id,
        modo_servicio, cliente_id, marca_virtual_id,
        direccion_entrega_id, folio_externo_app,
        etiqueta_espera, en_espera,
        estado_fiscal, estado_cocina,
        nota_general, nota_imprime_en_comanda, nota_imprime_en_ticket,
        fecha_apertura, fecha_primer_item,
        usuario_apertura_id,
        client_id_local, origen_creacion, sincronizado_at,
        created_by
      )
      SELECT
        p_entidad_id_local, v_tenant_id,
        (p_payload->>'sucursal_id')::uuid,
        (p_payload->>'caja_id')::uuid,
        (p_payload->>'turno_id')::uuid,
        (p_payload->>'modo_servicio')::modo_servicio,
        NULLIF(p_payload->>'cliente_id', '')::uuid,
        NULLIF(p_payload->>'marca_virtual_id', '')::uuid,
        NULLIF(p_payload->>'direccion_entrega_id', '')::uuid,
        p_payload->>'folio_externo_app',
        p_payload->>'etiqueta_espera',
        COALESCE((p_payload->>'en_espera')::boolean, false),
        COALESCE((p_payload->>'estado_fiscal')::ticket_estado_fiscal, 'BORRADOR'),
        COALESCE((p_payload->>'estado_cocina')::ticket_estado_cocina, 'SIN_ENVIAR'),
        p_payload->>'nota_general',
        COALESCE((p_payload->>'nota_imprime_en_comanda')::boolean, true),
        COALESCE((p_payload->>'nota_imprime_en_ticket')::boolean, false),
        COALESCE((p_payload->>'fecha_apertura')::timestamptz, p_fecha_operacion),
        NULLIF(p_payload->>'fecha_primer_item', '')::timestamptz,
        NULLIF(p_payload->>'usuario_apertura_id', '')::uuid,
        p_client_id_local,
        'POS_OFFLINE',
        now(),
        NULLIF(p_payload->>'created_by', '')::uuid
      RETURNING id INTO v_resultado_id;

      RETURN jsonb_build_object(
        'entidad_id_local', p_entidad_id_local,
        'entidad_id_servidor', v_resultado_id,
        'tabla', 'tickets',
        'estado', 'EXITO',
        'regla', 'R10_aplicado'
      );

    ELSIF p_operacion = 'UPDATE' THEN
      -- R3: Si está PAGADO o CANCELADO, rechazar UPDATE
      SELECT * INTO v_ticket FROM tickets WHERE id = p_entidad_id_local;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'entidad_id_local', p_entidad_id_local,
          'tabla', 'tickets',
          'estado', 'ERROR',
          'mensaje', 'Ticket no existe en servidor para UPDATE'
        );
      END IF;

      IF v_ticket.estado_fiscal IN ('PAGADO', 'FACTURADO', 'CANCELADO') THEN
        -- Solo permitir updates muy limitados (notas, comanda)
        IF p_payload ? 'estado_fiscal' OR p_payload ? 'total_mxn' THEN
          INSERT INTO sync_conflictos (
            tenant_id, sync_evento_id, tipo_conflicto,
            entidad_tipo, entidad_id_local, entidad_id_servidor,
            payload_intentado, payload_servidor
          ) VALUES (
            v_tenant_id, p_sync_evento_id,
            CASE v_ticket.estado_fiscal
              WHEN 'CANCELADO' THEN 'TICKET_YA_CANCELADO_SERVIDOR'::sync_conflicto_tipo
              ELSE 'TICKET_YA_PAGADO_SERVIDOR'::sync_conflicto_tipo
            END,
            'tickets', p_entidad_id_local, p_entidad_id_local,
            p_payload, to_jsonb(v_ticket)
          ) RETURNING id INTO v_conflicto_id;

          RETURN jsonb_build_object(
            'entidad_id_local', p_entidad_id_local,
            'tabla', 'tickets',
            'estado', 'CONFLICTO',
            'sync_conflicto_id', v_conflicto_id,
            'regla', 'R3_ticket_pagado_o_cancelado'
          );
        END IF;
      END IF;

      -- R5: Last-write-wins para campos no críticos
      IF v_ticket.updated_at > p_fecha_operacion THEN
        RETURN jsonb_build_object(
          'entidad_id_local', p_entidad_id_local,
          'tabla', 'tickets',
          'estado', 'IDEMPOTENTE',
          'regla', 'R5_last_write_wins_server_mas_reciente'
        );
      END IF;

      -- Aplicar UPDATE de campos seguros
      UPDATE tickets
      SET nota_general = COALESCE(p_payload->>'nota_general', nota_general),
          etiqueta_espera = COALESCE(p_payload->>'etiqueta_espera', etiqueta_espera),
          en_espera = COALESCE((p_payload->>'en_espera')::boolean, en_espera),
          comanda_reimpresa_count = COALESCE((p_payload->>'comanda_reimpresa_count')::integer, comanda_reimpresa_count),
          updated_by = NULLIF(p_payload->>'updated_by', '')::uuid
      WHERE id = p_entidad_id_local;

      RETURN jsonb_build_object(
        'entidad_id_local', p_entidad_id_local,
        'tabla', 'tickets',
        'estado', 'EXITO',
        'regla', 'R10_update_aplicado'
      );
    END IF;

  -- ===== Caso TICKET_ITEMS =====
  ELSIF p_tabla = 'ticket_items' THEN
    IF p_operacion = 'INSERT' THEN
      -- Idempotencia
      IF p_client_id_local IS NOT NULL THEN
        SELECT id INTO v_existing_id
        FROM ticket_items WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
        IF FOUND THEN
          RETURN jsonb_build_object(
            'entidad_id_local', p_entidad_id_local,
            'entidad_id_servidor', v_existing_id,
            'tabla', 'ticket_items',
            'estado', 'IDEMPOTENTE',
            'regla', 'R1_idempotencia_client_id_local'
          );
        END IF;
      END IF;

      -- R4: Si el ticket está PAGADO/CANCELADO en server, rechazar INSERT de items
      SELECT estado_fiscal INTO v_ticket
      FROM tickets WHERE id = (p_payload->>'ticket_id')::uuid;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'entidad_id_local', p_entidad_id_local,
          'tabla', 'ticket_items',
          'estado', 'ERROR',
          'mensaje', 'Ticket padre no existe en server'
        );
      END IF;

      IF v_ticket.estado_fiscal IN ('PAGADO', 'FACTURADO', 'CANCELADO') THEN
        INSERT INTO sync_conflictos (
          tenant_id, sync_evento_id, tipo_conflicto,
          entidad_tipo, entidad_id_local, client_id_local,
          payload_intentado
        ) VALUES (
          v_tenant_id, p_sync_evento_id, 'TICKET_YA_PAGADO_SERVIDOR',
          'ticket_items', p_entidad_id_local, p_client_id_local, p_payload
        ) RETURNING id INTO v_conflicto_id;

        RETURN jsonb_build_object(
          'entidad_id_local', p_entidad_id_local,
          'tabla', 'ticket_items',
          'estado', 'CONFLICTO',
          'sync_conflicto_id', v_conflicto_id,
          'regla', 'R4_ticket_pagado_no_acepta_items'
        );
      END IF;

      -- R10: aplicar INSERT con snapshot
      INSERT INTO ticket_items (
        id, tenant_id, ticket_id, producto_id,
        cantidad, orden_visualizacion,
        producto_nombre_snapshot, producto_sku_snapshot,
        precio_unitario_snapshot, tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
        clave_sat_snapshot, unidad_sat_snapshot,
        categoria_nombre_snapshot, area_cocina_nombre_snapshot,
        nota_cocina, client_id_local, created_by
      )
      SELECT
        p_entidad_id_local, v_tenant_id,
        (p_payload->>'ticket_id')::uuid,
        NULLIF(p_payload->>'producto_id', '')::uuid,
        (p_payload->>'cantidad')::numeric,
        COALESCE((p_payload->>'orden_visualizacion')::integer, 0),
        p_payload->>'producto_nombre_snapshot',
        p_payload->>'producto_sku_snapshot',
        (p_payload->>'precio_unitario_snapshot')::numeric,
        (p_payload->>'tasa_iva_snapshot')::numeric,
        (p_payload->>'iva_incluido_en_precio_snapshot')::boolean,
        p_payload->>'clave_sat_snapshot',
        p_payload->>'unidad_sat_snapshot',
        p_payload->>'categoria_nombre_snapshot',
        p_payload->>'area_cocina_nombre_snapshot',
        p_payload->>'nota_cocina',
        p_client_id_local,
        NULLIF(p_payload->>'created_by', '')::uuid
      RETURNING id INTO v_resultado_id;

      RETURN jsonb_build_object(
        'entidad_id_local', p_entidad_id_local,
        'entidad_id_servidor', v_resultado_id,
        'tabla', 'ticket_items',
        'estado', 'EXITO',
        'regla', 'R10_aplicado'
      );
    END IF;

  -- ===== Caso PAGOS =====
  ELSIF p_tabla = 'pagos' THEN
    IF p_operacion = 'INSERT' THEN
      -- Idempotencia
      IF p_client_id_local IS NOT NULL THEN
        SELECT id INTO v_existing_id
        FROM pagos WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
        IF FOUND THEN
          RETURN jsonb_build_object(
            'entidad_id_local', p_entidad_id_local,
            'entidad_id_servidor', v_existing_id,
            'tabla', 'pagos',
            'estado', 'IDEMPOTENTE',
            'regla', 'R1_idempotencia_client_id_local'
          );
        END IF;
      END IF;

      -- R3: Si el ticket está CANCELADO en server, rechazar
      SELECT estado_fiscal INTO v_ticket
      FROM tickets WHERE id = (p_payload->>'ticket_id')::uuid;

      IF v_ticket.estado_fiscal = 'CANCELADO' THEN
        INSERT INTO sync_conflictos (
          tenant_id, sync_evento_id, tipo_conflicto,
          entidad_tipo, entidad_id_local, client_id_local,
          payload_intentado
        ) VALUES (
          v_tenant_id, p_sync_evento_id, 'TICKET_YA_CANCELADO_SERVIDOR',
          'pagos', p_entidad_id_local, p_client_id_local, p_payload
        ) RETURNING id INTO v_conflicto_id;

        RETURN jsonb_build_object(
          'entidad_id_local', p_entidad_id_local,
          'tabla', 'pagos',
          'estado', 'CONFLICTO',
          'sync_conflicto_id', v_conflicto_id,
          'regla', 'R3_ticket_cancelado'
        );
      END IF;

      -- Si el ticket ya estaba PAGADO antes del sync (otro cajero cobró), conflicto
      IF v_ticket.estado_fiscal IN ('PAGADO', 'FACTURADO') THEN
        -- Aquí hay matiz: si el monto del pago offline + lo que ya está pagado supera el total, conflicto.
        -- En MVP, simplemente conflictamos para revisión manual.
        INSERT INTO sync_conflictos (
          tenant_id, sync_evento_id, tipo_conflicto,
          entidad_tipo, entidad_id_local, client_id_local,
          payload_intentado, payload_servidor
        ) VALUES (
          v_tenant_id, p_sync_evento_id, 'TICKET_YA_PAGADO_SERVIDOR',
          'pagos', p_entidad_id_local, p_client_id_local,
          p_payload, jsonb_build_object('estado_fiscal', v_ticket.estado_fiscal)
        ) RETURNING id INTO v_conflicto_id;

        RETURN jsonb_build_object(
          'entidad_id_local', p_entidad_id_local,
          'tabla', 'pagos',
          'estado', 'CONFLICTO',
          'sync_conflicto_id', v_conflicto_id,
          'regla', 'R3_ticket_ya_pagado'
        );
      END IF;

      -- R10: aplicar pago
      INSERT INTO pagos (
        id, tenant_id, sucursal_id, caja_id, turno_id, ticket_id,
        metodo_pago, monto_mxn, monto_recibido_mxn, cambio_mxn,
        referencia, terminal_aprobacion, folio_externo,
        es_pago_al_recibir, estado,
        usuario_id, fecha_pago, nota,
        client_id_local, created_by
      )
      SELECT
        p_entidad_id_local, v_tenant_id,
        (p_payload->>'sucursal_id')::uuid,
        (p_payload->>'caja_id')::uuid,
        (p_payload->>'turno_id')::uuid,
        (p_payload->>'ticket_id')::uuid,
        (p_payload->>'metodo_pago')::metodo_pago,
        (p_payload->>'monto_mxn')::numeric,
        NULLIF(p_payload->>'monto_recibido_mxn', '')::numeric,
        COALESCE((p_payload->>'cambio_mxn')::numeric, 0),
        p_payload->>'referencia',
        p_payload->>'terminal_aprobacion',
        p_payload->>'folio_externo',
        COALESCE((p_payload->>'es_pago_al_recibir')::boolean, false),
        COALESCE((p_payload->>'estado')::pago_estado, 'APLICADO'),
        (p_payload->>'usuario_id')::uuid,
        COALESCE((p_payload->>'fecha_pago')::timestamptz, p_fecha_operacion),
        p_payload->>'nota',
        p_client_id_local,
        (p_payload->>'usuario_id')::uuid
      RETURNING id INTO v_resultado_id;

      RETURN jsonb_build_object(
        'entidad_id_local', p_entidad_id_local,
        'entidad_id_servidor', v_resultado_id,
        'tabla', 'pagos',
        'estado', 'EXITO',
        'regla', 'R10_aplicado'
      );
    END IF;

  -- ===== Caso default: tabla no soportada =====
  ELSE
    RETURN jsonb_build_object(
      'entidad_id_local', p_entidad_id_local,
      'tabla', p_tabla,
      'estado', 'ERROR',
      'mensaje', format('Tabla "%s" no soportada por sync_aplicar_operacion en MVP', p_tabla)
    );
  END IF;

  -- Si llegamos aquí, operación no manejada
  RETURN jsonb_build_object(
    'entidad_id_local', p_entidad_id_local,
    'tabla', p_tabla,
    'estado', 'ERROR',
    'mensaje', format('Operación "%s" no soportada para tabla "%s"', p_operacion, p_tabla)
  );
END;
$$;

COMMENT ON FUNCTION sync_aplicar_operacion IS 'Motor de aplicación de operaciones de sync. Implementa reglas R1-R10. En MVP cubre tickets, ticket_items, pagos. Extensiones aditivas para devoluciones/cancelaciones/delivery vía migraciones posteriores.';

-- §10.7 Operaciones de catálogo: pull, no push
CREATE OR REPLACE FUNCTION sync_obtener_catalogo(
  p_desde_timestamp timestamptz DEFAULT NULL    -- pull incremental
) RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_tenant_id uuid := current_tenant_id();
  v_resultado jsonb := '{}'::jsonb;
BEGIN
  -- Productos
  v_resultado := jsonb_set(v_resultado, '{productos}',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(p))
      FROM productos p
      WHERE p.tenant_id = v_tenant_id
        AND (p_desde_timestamp IS NULL OR p.updated_at > p_desde_timestamp)
    ), '[]'::jsonb)
  );

  -- Categorías
  v_resultado := jsonb_set(v_resultado, '{categorias}',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(c))
      FROM categorias c
      WHERE c.tenant_id = v_tenant_id
        AND (p_desde_timestamp IS NULL OR c.updated_at > p_desde_timestamp)
    ), '[]'::jsonb)
  );

  -- Grupos de modificadores y opciones
  v_resultado := jsonb_set(v_resultado, '{grupos_modificadores}',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(g))
      FROM grupos_modificadores g
      WHERE g.tenant_id = v_tenant_id
        AND (p_desde_timestamp IS NULL OR g.updated_at > p_desde_timestamp)
    ), '[]'::jsonb)
  );

  v_resultado := jsonb_set(v_resultado, '{opciones_modificador}',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(o))
      FROM opciones_modificador o
      WHERE o.tenant_id = v_tenant_id
        AND (p_desde_timestamp IS NULL OR o.updated_at > p_desde_timestamp)
    ), '[]'::jsonb)
  );

  -- Clientes (limitado a últimos 1000 para no inflar el catálogo)
  v_resultado := jsonb_set(v_resultado, '{clientes}',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(c))
      FROM (
        SELECT * FROM clientes
        WHERE tenant_id = v_tenant_id
          AND (p_desde_timestamp IS NULL OR updated_at > p_desde_timestamp)
        ORDER BY updated_at DESC
        LIMIT 1000
      ) c
    ), '[]'::jsonb)
  );

  -- Promociones activas
  v_resultado := jsonb_set(v_resultado, '{promociones}',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(p))
      FROM promociones p
      WHERE p.tenant_id = v_tenant_id
        AND p.estado = 'ACTIVA'
        AND (p_desde_timestamp IS NULL OR p.updated_at > p_desde_timestamp)
    ), '[]'::jsonb)
  );

  -- Marcas virtuales (DK)
  v_resultado := jsonb_set(v_resultado, '{marcas_virtuales}',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(m))
      FROM marcas_virtuales m
      WHERE m.tenant_id = v_tenant_id
        AND (p_desde_timestamp IS NULL OR m.updated_at > p_desde_timestamp)
    ), '[]'::jsonb)
  );

  RETURN jsonb_set(v_resultado, '{timestamp_servidor}', to_jsonb(now()));
END;
$$;

COMMENT ON FUNCTION sync_obtener_catalogo IS 'Devuelve el catálogo completo o el delta desde p_desde_timestamp. Pull-only. El cliente offline no modifica catálogo.';

-- =====================================================================
-- §11. Funciones helper y triggers consolidadas
-- =====================================================================

-- §11.1 Inventario: reverso por devolución
CREATE OR REPLACE FUNCTION reversar_inventario_por_devolucion(
  p_devolucion_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_devolucion devoluciones%ROWTYPE;
  v_item       record;
BEGIN
  SELECT * INTO v_devolucion FROM devoluciones WHERE id = p_devolucion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devolución % no existe', p_devolucion_id;
  END IF;

  IF v_devolucion.inventario_reversado_at IS NOT NULL THEN
    -- Ya se reversó, idempotencia
    RETURN;
  END IF;

  -- Reversar cada item: aplicar movimiento contrario de la venta original
  FOR v_item IN
    SELECT di.*, ti.producto_id AS ti_producto_id
    FROM devolucion_items di
    JOIN ticket_items ti ON ti.id = di.ticket_item_id_original
    WHERE di.devolucion_id = p_devolucion_id
      AND di.reversar_inventario_item = true
      AND di.producto_id IS NOT NULL
  LOOP
    -- Insertar movimientos de entrada al stock por la cantidad devuelta
    -- (la lógica de receta/ingredientes la maneja descontar_inventario_por_venta() invertida;
    -- aquí llamamos una función espejo conceptual)
    PERFORM aplicar_movimiento_inventario(
      p_tenant_id              := v_devolucion.tenant_id,
      p_sucursal_id            := v_devolucion.sucursal_id,
      p_producto_id            := v_item.ti_producto_id,
      p_cantidad               := v_item.cantidad_devuelta,    -- positiva = entrada
      p_tipo_movimiento        := 'DEVOLUCION_VENTA',
      p_origen_referencia_tipo := 'devolucion',
      p_origen_referencia_id   := p_devolucion_id,
      p_motivo                 := 'Devolución folio ' || v_devolucion.folio_completo
    );
  END LOOP;

  UPDATE devoluciones
  SET inventario_reversado_at = now()
  WHERE id = p_devolucion_id;
END;
$$;

COMMENT ON FUNCTION reversar_inventario_por_devolucion IS 'Reversa inventario por cada item devuelto. Idempotente vía inventario_reversado_at.';

-- §11.2 Inventario: reverso por cancelación
CREATE OR REPLACE FUNCTION reversar_inventario_por_cancelacion(
  p_cancelacion_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_cancelacion cancelaciones_ticket%ROWTYPE;
  v_item        record;
BEGIN
  SELECT * INTO v_cancelacion FROM cancelaciones_ticket WHERE id = p_cancelacion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancelación % no existe', p_cancelacion_id;
  END IF;

  IF v_cancelacion.inventario_reversado_at IS NOT NULL THEN
    RETURN;     -- idempotencia
  END IF;

  -- Reversar TODOS los items del ticket cancelado (los no cancelados previamente)
  FOR v_item IN
    SELECT ti.*
    FROM ticket_items ti
    WHERE ti.ticket_id = v_cancelacion.ticket_id
      AND ti.cancelado = false
      AND ti.producto_id IS NOT NULL
  LOOP
    PERFORM aplicar_movimiento_inventario(
      p_tenant_id              := v_cancelacion.tenant_id,
      p_sucursal_id            := v_cancelacion.sucursal_id,
      p_producto_id            := v_item.producto_id,
      p_cantidad               := v_item.cantidad,            -- positiva = entrada
      p_tipo_movimiento        := 'CANCELACION_VENTA',
      p_origen_referencia_tipo := 'cancelacion_ticket',
      p_origen_referencia_id   := p_cancelacion_id,
      p_motivo                 := 'Cancelación ticket folio ' || v_cancelacion.ticket_folio_snapshot
    );
  END LOOP;

  UPDATE cancelaciones_ticket
  SET inventario_reversado_at = now()
  WHERE id = p_cancelacion_id;
END;
$$;

-- §11.3 Crear devolución (entrada principal)
CREATE OR REPLACE FUNCTION crear_devolucion(
  p_ticket_original_id uuid,
  p_caja_id            uuid,
  p_turno_id           uuid,
  p_alcance            devolucion_alcance,
  p_motivo             devolucion_motivo,
  p_motivo_texto       text,
  p_medio_devolucion   devolucion_medio,
  p_autorizacion_pin_id uuid,
  p_usuario_solicitante_id uuid,
  p_usuario_autorizo_id    uuid,
  p_items              jsonb,                  -- [{ticket_item_id, cantidad_devuelta, reversar_inventario_item}]
  p_reversar_inventario boolean DEFAULT true,
  p_cliente_id         uuid DEFAULT NULL,
  p_nota               text DEFAULT NULL,
  p_client_id_local    varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id     uuid := current_tenant_id();
  v_ticket        tickets%ROWTYPE;
  v_devolucion_id uuid;
  v_item_input    jsonb;
  v_ti            ticket_items%ROWTYPE;
  v_subtotal      numeric(12,2) := 0;
  v_iva           numeric(12,2) := 0;
  v_cantidad_dev  numeric(12,3);
  v_subtotal_item numeric(12,2);
  v_iva_item      numeric(12,2);
  v_total_item    numeric(12,2);
BEGIN
  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_devolucion_id
    FROM devoluciones
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN
      RETURN v_devolucion_id;
    END IF;
  END IF;

  -- Validar ticket
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_original_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_original_id;
  END IF;

  IF v_ticket.estado_fiscal NOT IN ('PAGADO', 'FACTURADO') THEN
    RAISE EXCEPTION 'Solo se pueden devolver tickets PAGADOS o FACTURADOS, no %', v_ticket.estado_fiscal;
  END IF;

  -- Insertar devolución (BORRADOR inicial)
  INSERT INTO devoluciones (
    tenant_id, sucursal_id, caja_id, turno_id,
    ticket_original_id, ticket_folio_snapshot, ticket_dia_contable_snapshot,
    alcance, motivo, motivo_texto, medio_devolucion,
    total_devuelto_mxn, subtotal_devuelto_mxn, iva_devuelto_mxn,
    autorizacion_pin_id, usuario_solicitante_id, usuario_autorizo_id,
    reversar_inventario, cliente_id, nota, client_id_local,
    estado, created_by
  ) VALUES (
    v_tenant_id, v_ticket.sucursal_id, p_caja_id, p_turno_id,
    p_ticket_original_id, v_ticket.folio_completo, v_ticket.dia_contable,
    p_alcance, p_motivo, p_motivo_texto, p_medio_devolucion,
    0, 0, 0,                          -- se calculan abajo
    p_autorizacion_pin_id, p_usuario_solicitante_id, p_usuario_autorizo_id,
    p_reversar_inventario, p_cliente_id, p_nota, p_client_id_local,
    'BORRADOR', p_usuario_solicitante_id
  ) RETURNING id INTO v_devolucion_id;

  -- Insertar items y calcular totales
  FOR v_item_input IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_ti FROM ticket_items
    WHERE id = (v_item_input->>'ticket_item_id')::uuid
      AND ticket_id = p_ticket_original_id
      AND cancelado = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item % no encontrado en ticket original', v_item_input->>'ticket_item_id';
    END IF;

    v_cantidad_dev := (v_item_input->>'cantidad_devuelta')::numeric;

    IF v_cantidad_dev <= 0 OR v_cantidad_dev > v_ti.cantidad THEN
      RAISE EXCEPTION 'Cantidad devuelta % inválida para item % (max %)',
        v_cantidad_dev, v_ti.id, v_ti.cantidad;
    END IF;

    -- Calcular proporcional al subtotal/iva del item
    v_subtotal_item := ROUND(v_ti.subtotal_bruto_mxn * v_cantidad_dev / v_ti.cantidad, 2);
    v_iva_item      := ROUND(v_ti.iva_item_mxn * v_cantidad_dev / v_ti.cantidad, 2);
    v_total_item    := v_subtotal_item + v_iva_item;

    INSERT INTO devolucion_items (
      tenant_id, devolucion_id, ticket_item_id_original,
      producto_id, producto_nombre_snapshot, producto_sku_snapshot,
      cantidad_original, cantidad_devuelta,
      precio_unitario_snapshot, tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
      subtotal_devuelto_mxn, iva_devuelto_mxn, total_devuelto_mxn,
      reversar_inventario_item, created_by
    ) VALUES (
      v_tenant_id, v_devolucion_id, v_ti.id,
      v_ti.producto_id, v_ti.producto_nombre_snapshot, v_ti.producto_sku_snapshot,
      v_ti.cantidad, v_cantidad_dev,
      v_ti.precio_unitario_snapshot, v_ti.tasa_iva_snapshot, v_ti.iva_incluido_en_precio_snapshot,
      v_subtotal_item, v_iva_item, v_total_item,
      COALESCE((v_item_input->>'reversar_inventario_item')::boolean, p_reversar_inventario),
      p_usuario_solicitante_id
    );

    v_subtotal := v_subtotal + v_subtotal_item;
    v_iva      := v_iva + v_iva_item;
  END LOOP;

  -- Actualizar totales de la devolución
  UPDATE devoluciones
  SET subtotal_devuelto_mxn = v_subtotal,
      iva_devuelto_mxn      = v_iva,
      total_devuelto_mxn    = v_subtotal + v_iva,
      updated_by            = p_usuario_solicitante_id
  WHERE id = v_devolucion_id;

  RETURN v_devolucion_id;
END;
$$;

COMMENT ON FUNCTION crear_devolucion IS 'Crea una devolución en estado BORRADOR. Llamar confirmar_devolucion() para finalizarla y disparar reverso de inventario + pago efectivo.';

-- §11.4 Confirmar devolución
CREATE OR REPLACE FUNCTION confirmar_devolucion(
  p_devolucion_id uuid,
  p_usuario_id    uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_devolucion devoluciones%ROWTYPE;
BEGIN
  SELECT * INTO v_devolucion FROM devoluciones WHERE id = p_devolucion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devolución % no existe', p_devolucion_id;
  END IF;

  IF v_devolucion.estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo devoluciones en BORRADOR se pueden confirmar (estado actual: %)', v_devolucion.estado;
  END IF;

  UPDATE devoluciones
  SET estado     = 'CONFIRMADA',
      updated_by = p_usuario_id
  WHERE id = p_devolucion_id;
  -- Los triggers trg_devolucion_inventario y trg_devolucion_pago_efectivo disparan
  -- automáticamente al cambiar a CONFIRMADA.
END;
$$;

-- §11.5 Cancelar ticket pagado
CREATE OR REPLACE FUNCTION cancelar_ticket_pagado(
  p_ticket_id              uuid,
  p_caja_id                uuid,
  p_turno_id               uuid,
  p_motivo                 cancelacion_motivo,
  p_motivo_texto           text,
  p_autorizacion_pin_id    uuid,
  p_usuario_solicitante_id uuid,
  p_usuario_autorizo_id    uuid,
  p_reversar_inventario    boolean DEFAULT true,
  p_cancelar_cfdi_sat      boolean DEFAULT true,
  p_devolver_dinero        boolean DEFAULT true,
  p_medio_devolucion       devolucion_medio DEFAULT 'EFECTIVO',
  p_nota                   text DEFAULT NULL,
  p_client_id_local        varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id      uuid := current_tenant_id();
  v_ticket         tickets%ROWTYPE;
  v_cancelacion_id uuid;
  v_devolucion_id  uuid;
  v_items_jsonb    jsonb;
BEGIN
  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_cancelacion_id
    FROM cancelaciones_ticket
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN
      RETURN v_cancelacion_id;
    END IF;
  END IF;

  -- Validar ticket
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;

  IF v_ticket.estado_fiscal = 'CANCELADO' THEN
    RAISE EXCEPTION 'Ticket ya está CANCELADO';
  END IF;

  -- Si hay que devolver dinero (ticket estaba PAGADO/FACTURADO), crear devolución total
  IF p_devolver_dinero AND v_ticket.estado_fiscal IN ('PAGADO', 'FACTURADO') THEN
    -- Construir items_jsonb con todos los items del ticket (cantidad completa)
    SELECT jsonb_agg(jsonb_build_object(
      'ticket_item_id', ti.id,
      'cantidad_devuelta', ti.cantidad,
      'reversar_inventario_item', p_reversar_inventario
    ))
    INTO v_items_jsonb
    FROM ticket_items ti
    WHERE ti.ticket_id = p_ticket_id AND ti.cancelado = false;

    v_devolucion_id := crear_devolucion(
      p_ticket_original_id      := p_ticket_id,
      p_caja_id                 := p_caja_id,
      p_turno_id                := p_turno_id,
      p_alcance                 := 'TOTAL',
      p_motivo                  := 'CANCELACION_PEDIDO',
      p_motivo_texto            := 'Cancelación de ticket: ' || p_motivo::text,
      p_medio_devolucion        := p_medio_devolucion,
      p_autorizacion_pin_id     := p_autorizacion_pin_id,
      p_usuario_solicitante_id  := p_usuario_solicitante_id,
      p_usuario_autorizo_id     := p_usuario_autorizo_id,
      p_items                   := v_items_jsonb,
      p_reversar_inventario     := p_reversar_inventario,
      p_cliente_id              := v_ticket.cliente_id,
      p_nota                    := 'Auto-generada por cancelación de ticket',
      p_client_id_local         := CASE WHEN p_client_id_local IS NOT NULL THEN p_client_id_local || '-DEV' ELSE NULL END
    );

    PERFORM confirmar_devolucion(v_devolucion_id, p_usuario_solicitante_id);
  END IF;

  -- Insertar cancelación (triggers harán el resto)
  INSERT INTO cancelaciones_ticket (
    tenant_id, sucursal_id, caja_id, turno_id,
    ticket_id, ticket_folio_snapshot, ticket_dia_contable_snapshot,
    ticket_total_snapshot, ticket_estado_fiscal_previo, ticket_estado_cocina_previo,
    motivo, motivo_texto,
    autorizacion_pin_id, usuario_solicitante_id, usuario_autorizo_id,
    devolucion_id, reversar_inventario, cancelar_cfdi_sat,
    nota, client_id_local, created_by
  ) VALUES (
    v_tenant_id, v_ticket.sucursal_id, p_caja_id, p_turno_id,
    p_ticket_id, v_ticket.folio_completo, v_ticket.dia_contable,
    v_ticket.total_mxn, v_ticket.estado_fiscal, v_ticket.estado_cocina,
    p_motivo, p_motivo_texto,
    p_autorizacion_pin_id, p_usuario_solicitante_id, p_usuario_autorizo_id,
    v_devolucion_id, p_reversar_inventario, p_cancelar_cfdi_sat,
    p_nota, p_client_id_local, p_usuario_solicitante_id
  ) RETURNING id INTO v_cancelacion_id;

  RETURN v_cancelacion_id;
END;
$$;

COMMENT ON FUNCTION cancelar_ticket_pagado IS 'Cancela un ticket PAGADO/FACTURADO. Crea devolución total automáticamente cuando p_devolver_dinero=true. Triggers marcan ticket CANCELADO y reversan inventario.';

-- §11.6 CFDI: crear borrador
CREATE OR REPLACE FUNCTION cfdi_crear_borrador(
  p_ticket_id              uuid,
  p_tipo_comprobante       cfdi_tipo_comprobante,
  p_receptor_rfc           varchar,
  p_receptor_razon_social  varchar,
  p_receptor_uso_cfdi      varchar,
  p_receptor_codigo_postal varchar,
  p_receptor_regimen_fiscal varchar,
  p_receptor_email         varchar,
  p_emisor_rfc             varchar,
  p_emisor_razon_social    varchar,
  p_emisor_regimen_fiscal  varchar,
  p_emisor_lugar_expedicion varchar,
  p_metodo_pago_sat        varchar,            -- 'PUE' o 'PPD'
  p_forma_pago_sat         varchar,            -- catálogo SAT: '01', '04', '28', '03', etc.
  p_pac_proveedor          cfdi_proveedor_pac,
  p_devolucion_id          uuid DEFAULT NULL,
  p_cfdi_sustituye_id      uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id uuid := current_tenant_id();
  v_ticket    tickets%ROWTYPE;
  v_cfdi_id   uuid;
BEGIN
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;

  IF p_tipo_comprobante = 'INGRESO' AND v_ticket.estado_fiscal <> 'PAGADO' THEN
    RAISE EXCEPTION 'Solo tickets PAGADOS se pueden facturar (estado actual: %)', v_ticket.estado_fiscal;
  END IF;

  IF p_tipo_comprobante = 'EGRESO' AND p_devolucion_id IS NULL THEN
    RAISE EXCEPTION 'Nota de crédito requiere devolucion_id';
  END IF;

  INSERT INTO tickets_cfdi (
    tenant_id, ticket_id, tipo_comprobante,
    receptor_rfc, receptor_razon_social, receptor_uso_cfdi,
    receptor_codigo_postal, receptor_regimen_fiscal, receptor_email,
    emisor_rfc, emisor_razon_social, emisor_regimen_fiscal, emisor_lugar_expedicion,
    subtotal_mxn, descuento_mxn, iva_mxn, total_mxn,
    metodo_pago_sat, forma_pago_sat,
    estado_sat, pac_proveedor,
    cfdi_sustituye_id, devolucion_id,
    created_by, updated_by
  ) VALUES (
    v_tenant_id, p_ticket_id, p_tipo_comprobante,
    p_receptor_rfc, p_receptor_razon_social, p_receptor_uso_cfdi,
    p_receptor_codigo_postal, p_receptor_regimen_fiscal, p_receptor_email,
    p_emisor_rfc, p_emisor_razon_social, p_emisor_regimen_fiscal, p_emisor_lugar_expedicion,
    v_ticket.subtotal_mxn,
    v_ticket.descuentos_manuales_mxn + v_ticket.promociones_mxn,
    v_ticket.iva_mxn,
    v_ticket.total_mxn,
    p_metodo_pago_sat, p_forma_pago_sat,
    'BORRADOR', p_pac_proveedor,
    p_cfdi_sustituye_id, p_devolucion_id,
    auth.uid(), auth.uid()
  ) RETURNING id INTO v_cfdi_id;

  RETURN v_cfdi_id;
END;
$$;

-- §11.7 CFDI: marcar timbrado
CREATE OR REPLACE FUNCTION cfdi_marcar_timbrado(
  p_cfdi_id          uuid,
  p_uuid_fiscal      varchar,
  p_serie            varchar,
  p_folio_fiscal     varchar,
  p_fecha_timbrado   timestamptz,
  p_fecha_emision    timestamptz,
  p_xml_storage_path varchar,
  p_pdf_storage_path varchar,
  p_pac_referencia   varchar,
  p_pac_costo_centavos integer,
  p_request_payload  jsonb,
  p_response_payload jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_cfdi tickets_cfdi%ROWTYPE;
BEGIN
  SELECT * INTO v_cfdi FROM tickets_cfdi WHERE id = p_cfdi_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CFDI % no existe', p_cfdi_id;
  END IF;

  UPDATE tickets_cfdi
  SET uuid_fiscal        = p_uuid_fiscal,
      serie              = p_serie,
      folio_fiscal       = p_folio_fiscal,
      fecha_timbrado     = p_fecha_timbrado,
      fecha_emision      = p_fecha_emision,
      xml_storage_path   = p_xml_storage_path,
      pdf_storage_path   = p_pdf_storage_path,
      estado_sat         = 'TIMBRADO',
      pac_referencia     = p_pac_referencia,
      pac_costo_centavos = p_pac_costo_centavos,
      intentos_timbrado  = intentos_timbrado + 1,
      ultimo_intento_at  = now(),
      ultimo_error_pac   = NULL,
      updated_by         = auth.uid()
  WHERE id = p_cfdi_id;

  -- Registrar movimiento SAT
  INSERT INTO cfdi_sat_movimientos (
    tenant_id, cfdi_id, evento, pac_proveedor,
    pac_codigo_respuesta, pac_mensaje,
    request_payload, response_payload,
    usuario_id, created_by
  ) VALUES (
    v_cfdi.tenant_id, p_cfdi_id, 'TIMBRADO_CONFIRMADO', v_cfdi.pac_proveedor,
    '200', 'Timbrado exitoso',
    p_request_payload, p_response_payload,
    auth.uid(), auth.uid()
  );
END;
$$;

-- §11.8 CFDI: marcar error de timbrado
CREATE OR REPLACE FUNCTION cfdi_marcar_error(
  p_cfdi_id            uuid,
  p_codigo_error       varchar,
  p_mensaje_error      text,
  p_request_payload    jsonb,
  p_response_payload   jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_cfdi tickets_cfdi%ROWTYPE;
BEGIN
  SELECT * INTO v_cfdi FROM tickets_cfdi WHERE id = p_cfdi_id;

  UPDATE tickets_cfdi
  SET estado_sat        = 'ERROR_TIMBRADO',
      intentos_timbrado = intentos_timbrado + 1,
      ultimo_intento_at = now(),
      ultimo_error_pac  = format('%s: %s', p_codigo_error, p_mensaje_error),
      updated_by        = auth.uid()
  WHERE id = p_cfdi_id;

  INSERT INTO cfdi_sat_movimientos (
    tenant_id, cfdi_id, evento, pac_proveedor,
    pac_codigo_respuesta, pac_mensaje,
    request_payload, response_payload,
    usuario_id, created_by
  ) VALUES (
    v_cfdi.tenant_id, p_cfdi_id, 'TIMBRADO_ERROR', v_cfdi.pac_proveedor,
    p_codigo_error, p_mensaje_error,
    p_request_payload, p_response_payload,
    auth.uid(), auth.uid()
  );
END;
$$;

-- §11.9 CFDI: marcar cancelado en SAT
CREATE OR REPLACE FUNCTION cfdi_marcar_cancelado_sat(
  p_cfdi_id          uuid,
  p_acuse_storage_path varchar,
  p_response_payload jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_cfdi tickets_cfdi%ROWTYPE;
BEGIN
  SELECT * INTO v_cfdi FROM tickets_cfdi WHERE id = p_cfdi_id;

  UPDATE tickets_cfdi
  SET estado_sat = 'CANCELADO',
      updated_by = auth.uid()
  WHERE id = p_cfdi_id;

  INSERT INTO cfdi_sat_movimientos (
    tenant_id, cfdi_id, evento, pac_proveedor,
    acuse_storage_path, response_payload,
    usuario_id, created_by
  ) VALUES (
    v_cfdi.tenant_id, p_cfdi_id, 'CANCELACION_CONFIRMADA', v_cfdi.pac_proveedor,
    p_acuse_storage_path, p_response_payload,
    auth.uid(), auth.uid()
  );
END;
$$;

-- §11.10 Delivery: asignar repartidor
CREATE OR REPLACE FUNCTION asignar_delivery(
  p_ticket_id              uuid,
  p_repartidor_id          uuid,
  p_monto_a_liquidar_mxn   numeric,
  p_tiempo_promesa_minutos integer DEFAULT NULL,
  p_destino_lat            numeric DEFAULT NULL,
  p_destino_lng            numeric DEFAULT NULL,
  p_distancia_km_estimada  numeric DEFAULT NULL,
  p_client_id_local        varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id    uuid := current_tenant_id();
  v_ticket       tickets%ROWTYPE;
  v_existing_id  uuid;
  v_asignacion_id uuid;
BEGIN
  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM delivery_asignaciones
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;

  IF v_ticket.modo_servicio <> 'DELIVERY_PROPIO' THEN
    RAISE EXCEPTION 'Solo tickets de modo_servicio=DELIVERY_PROPIO permiten asignación (actual: %)', v_ticket.modo_servicio;
  END IF;

  -- Una sola asignación por ticket (UNIQUE INDEX idx_delivery_ticket_unico)
  INSERT INTO delivery_asignaciones (
    tenant_id, sucursal_id, ticket_id, repartidor_id,
    estado, monto_a_liquidar_mxn,
    tiempo_promesa_minutos, destino_lat, destino_lng, distancia_km_estimada,
    client_id_local, created_by, updated_by
  ) VALUES (
    v_tenant_id, v_ticket.sucursal_id, p_ticket_id, p_repartidor_id,
    'ASIGNADO', p_monto_a_liquidar_mxn,
    p_tiempo_promesa_minutos, p_destino_lat, p_destino_lng, p_distancia_km_estimada,
    p_client_id_local, auth.uid(), auth.uid()
  ) RETURNING id INTO v_asignacion_id;

  RETURN v_asignacion_id;
END;
$$;

-- §11.11 Delivery: confirmar salida
CREATE OR REPLACE FUNCTION confirmar_salida_delivery(
  p_asignacion_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE delivery_asignaciones
  SET estado       = 'EN_RUTA',
      fecha_salida = now(),
      updated_by   = auth.uid()
  WHERE id = p_asignacion_id
    AND estado = 'ASIGNADO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asignación % no encontrada o no en estado ASIGNADO', p_asignacion_id;
  END IF;
END;
$$;

-- §11.12 Delivery: confirmar entrega
CREATE OR REPLACE FUNCTION confirmar_entrega_delivery(
  p_asignacion_id uuid,
  p_propina_repartidor_mxn numeric DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE delivery_asignaciones
  SET estado                = 'ENTREGADO',
      fecha_entrega         = now(),
      propina_repartidor_mxn = p_propina_repartidor_mxn,
      updated_by            = auth.uid()
  WHERE id = p_asignacion_id
    AND estado IN ('EN_RUTA', 'EN_DESTINO');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asignación % no encontrada o no en estado EN_RUTA/EN_DESTINO', p_asignacion_id;
  END IF;
END;
$$;

-- §11.13 Delivery: registrar no-entrega
CREATE OR REPLACE FUNCTION registrar_no_entrega_delivery(
  p_asignacion_id uuid,
  p_motivo        delivery_no_entrega_motivo,
  p_nota          text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE delivery_asignaciones
  SET estado            = 'NO_ENTREGADO',
      fecha_no_entrega  = now(),
      no_entrega_motivo = p_motivo,
      no_entrega_nota   = p_nota,
      updated_by        = auth.uid()
  WHERE id = p_asignacion_id
    AND estado IN ('EN_RUTA', 'EN_DESTINO');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asignación % no encontrada o no en estado EN_RUTA/EN_DESTINO', p_asignacion_id;
  END IF;
END;
$$;

-- §11.14 Delivery: liquidar
CREATE OR REPLACE FUNCTION liquidar_delivery(
  p_asignacion_id            uuid,
  p_monto_efectivo_mxn       numeric,
  p_monto_tarjeta_mxn        numeric,
  p_liquidado_por_id         uuid,
  p_liquidacion_nota         text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_asignacion delivery_asignaciones%ROWTYPE;
  v_diferencia numeric;
BEGIN
  SELECT * INTO v_asignacion FROM delivery_asignaciones WHERE id = p_asignacion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asignación % no existe', p_asignacion_id;
  END IF;

  IF v_asignacion.estado NOT IN ('ENTREGADO', 'NO_ENTREGADO', 'EN_REGRESO') THEN
    RAISE EXCEPTION 'Asignación debe estar ENTREGADO/NO_ENTREGADO/EN_REGRESO para liquidar (actual: %)', v_asignacion.estado;
  END IF;

  v_diferencia := v_asignacion.monto_a_liquidar_mxn
    - COALESCE(p_monto_efectivo_mxn, 0)
    - COALESCE(p_monto_tarjeta_mxn, 0);

  UPDATE delivery_asignaciones
  SET estado                       = 'LIQUIDADO',
      monto_efectivo_entregado_mxn = p_monto_efectivo_mxn,
      monto_tarjeta_aprobado_mxn   = p_monto_tarjeta_mxn,
      diferencia_mxn               = v_diferencia,
      liquidado_por_id             = p_liquidado_por_id,
      liquidacion_nota             = p_liquidacion_nota,
      fecha_liquidacion            = now(),
      updated_by                   = p_liquidado_por_id
  WHERE id = p_asignacion_id;

  RETURN jsonb_build_object(
    'asignacion_id', p_asignacion_id,
    'monto_esperado', v_asignacion.monto_a_liquidar_mxn,
    'monto_recibido', COALESCE(p_monto_efectivo_mxn, 0) + COALESCE(p_monto_tarjeta_mxn, 0),
    'diferencia', v_diferencia,
    'estado', CASE
      WHEN v_diferencia = 0 THEN 'EXACTO'
      WHEN v_diferencia > 0 THEN 'FALTANTE'
      ELSE 'SOBRANTE'
    END
  );
END;
$$;

-- §11.15 Comanda: imprimir inicial
CREATE OR REPLACE FUNCTION imprimir_comanda(
  p_ticket_id           uuid,
  p_area_cocina_id      uuid,
  p_impresora_identificador varchar,
  p_items_incluidos     jsonb,
  p_evento_tipo         comanda_evento_tipo,
  p_resultado           comanda_resultado,
  p_error_detalle       text DEFAULT NULL,
  p_razon_reimpresion   text DEFAULT NULL,
  p_autorizacion_pin_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id       uuid := current_tenant_id();
  v_ticket          tickets%ROWTYPE;
  v_area_nombre     varchar;
  v_impresion_id    uuid;
BEGIN
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;

  SELECT nombre INTO v_area_nombre FROM areas_cocina WHERE id = p_area_cocina_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Área de cocina % no existe', p_area_cocina_id;
  END IF;

  -- Validación específica: REIMPRESION_CAJERO requiere PIN y razón
  IF p_evento_tipo = 'REIMPRESION_CAJERO' THEN
    IF p_autorizacion_pin_id IS NULL THEN
      RAISE EXCEPTION 'Reimpresión por cajero requiere autorizacion_pin_id';
    END IF;
    IF p_razon_reimpresion IS NULL OR length(trim(p_razon_reimpresion)) = 0 THEN
      RAISE EXCEPTION 'Reimpresión por cajero requiere razon_reimpresion';
    END IF;
  END IF;

  INSERT INTO comanda_impresiones (
    tenant_id, sucursal_id, ticket_id,
    area_cocina_id, area_cocina_nombre_snapshot, impresora_identificador,
    evento_tipo, resultado, error_detalle,
    items_incluidos_snapshot,
    razon_reimpresion, autorizacion_pin_id,
    usuario_id, created_by
  ) VALUES (
    v_tenant_id, v_ticket.sucursal_id, p_ticket_id,
    p_area_cocina_id, v_area_nombre, p_impresora_identificador,
    p_evento_tipo, p_resultado, p_error_detalle,
    p_items_incluidos,
    p_razon_reimpresion, p_autorizacion_pin_id,
    auth.uid(), auth.uid()
  ) RETURNING id INTO v_impresion_id;

  RETURN v_impresion_id;
END;
$$;

COMMENT ON FUNCTION imprimir_comanda IS 'Registra impresión o reimpresión de comanda. REIMPRESION_CAJERO valida PIN y razón.';

-- §11.16 Sync: resolver conflicto manualmente
CREATE OR REPLACE FUNCTION sync_resolver_conflicto(
  p_conflicto_id uuid,
  p_resolucion   sync_conflicto_resolucion,
  p_nota         text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_resolucion NOT IN ('RESUELTO_OPERADOR', 'DESCARTADO') THEN
    RAISE EXCEPTION 'Resolución debe ser RESUELTO_OPERADOR o DESCARTADO';
  END IF;

  UPDATE sync_conflictos
  SET resolucion       = p_resolucion,
      resuelto_at      = now(),
      resuelto_por_id  = auth.uid(),
      resolucion_nota  = p_nota
  WHERE id = p_conflicto_id
    AND resolucion = 'PENDIENTE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conflicto % no existe o ya fue resuelto', p_conflicto_id;
  END IF;
END;
$$;

-- =====================================================================
-- §12. RLS consolidada
-- =====================================================================

-- ====== devoluciones ======
ALTER TABLE devoluciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY devoluciones_select ON devoluciones
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY devoluciones_insert ON devoluciones
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY devoluciones_update ON devoluciones
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- DELETE prohibido (soft delete via deleted_at).

-- ====== devolucion_items ======
ALTER TABLE devolucion_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY devolucion_items_select ON devolucion_items
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY devolucion_items_insert ON devolucion_items
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY devolucion_items_delete ON devolucion_items
  FOR DELETE
  USING (
    tenant_id = current_tenant_id()
    AND devolucion_id IN (
      SELECT id FROM devoluciones WHERE estado = 'BORRADOR'
    )
  );
-- Solo se pueden DELETE items de devoluciones en BORRADOR.

-- ====== cancelaciones_ticket ======
ALTER TABLE cancelaciones_ticket ENABLE ROW LEVEL SECURITY;

CREATE POLICY cancelaciones_select ON cancelaciones_ticket
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY cancelaciones_insert ON cancelaciones_ticket
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY cancelaciones_update ON cancelaciones_ticket
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- DELETE prohibido (las cancelaciones nunca se borran, son evidencia).

-- ====== tickets_cfdi ======
ALTER TABLE tickets_cfdi ENABLE ROW LEVEL SECURITY;

CREATE POLICY cfdi_select ON tickets_cfdi
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY cfdi_insert ON tickets_cfdi
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY cfdi_update ON tickets_cfdi
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- DELETE prohibido.

-- ====== cfdi_sat_movimientos ======
ALTER TABLE cfdi_sat_movimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY cfdi_sat_mov_select ON cfdi_sat_movimientos
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY cfdi_sat_mov_insert ON cfdi_sat_movimientos
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

-- UPDATE/DELETE prohibidos: la bitácora SAT es append-only.

-- ====== delivery_asignaciones ======
ALTER TABLE delivery_asignaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_select ON delivery_asignaciones
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY delivery_insert ON delivery_asignaciones
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY delivery_update ON delivery_asignaciones
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- DELETE prohibido.

-- ====== apps_liquidaciones ======
ALTER TABLE apps_liquidaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY apps_liq_select ON apps_liquidaciones
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY apps_liq_insert ON apps_liquidaciones
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY apps_liq_update ON apps_liquidaciones
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY apps_liq_delete ON apps_liquidaciones
  FOR DELETE
  USING (
    tenant_id = current_tenant_id()
    AND estado = 'PENDIENTE'
  );
-- Solo liquidaciones PENDIENTES (mal ingestadas) se pueden borrar.

-- ====== apps_liquidacion_items ======
ALTER TABLE apps_liquidacion_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY apps_liq_items_select ON apps_liquidacion_items
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY apps_liq_items_insert ON apps_liquidacion_items
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY apps_liq_items_update ON apps_liquidacion_items
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY apps_liq_items_delete ON apps_liquidacion_items
  FOR DELETE
  USING (
    tenant_id = current_tenant_id()
    AND liquidacion_id IN (
      SELECT id FROM apps_liquidaciones WHERE estado = 'PENDIENTE'
    )
  );

-- ====== comanda_impresiones ======
ALTER TABLE comanda_impresiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY comanda_imp_select ON comanda_impresiones
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY comanda_imp_insert ON comanda_impresiones
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

-- UPDATE/DELETE prohibidos: bitácora append-only.

-- ====== sync_eventos ======
ALTER TABLE sync_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_eventos_select ON sync_eventos
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY sync_eventos_insert ON sync_eventos
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY sync_eventos_update ON sync_eventos
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ====== sync_conflictos ======
ALTER TABLE sync_conflictos ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_conflictos_select ON sync_conflictos
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY sync_conflictos_insert ON sync_conflictos
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY sync_conflictos_update ON sync_conflictos
  FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- §12.3 Bucket de Supabase Storage: cfdi
-- El XML del CFDI se guarda en bucket privado 'cfdi' con políticas de acceso por tenant.
-- (Bash o SQL administrativo, fuera de migración: configurar el bucket)
-- supabase storage create-bucket cfdi --public=false

-- Policy de Storage (ejecutar en Supabase Studio o vía SQL):
CREATE POLICY "cfdi_read_own_tenant" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'cfdi'
    AND (storage.foldername(name))[1] = current_tenant_id()::text
  );

CREATE POLICY "cfdi_write_own_tenant" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'cfdi'
    AND (storage.foldername(name))[1] = current_tenant_id()::text
  );

-- Estructura de paths esperada:
--   cfdi/<tenant_id>/<año>/<mes>/<uuid_fiscal>.xml
--   cfdi/<tenant_id>/<año>/<mes>/<uuid_fiscal>.pdf
--   cfdi/<tenant_id>/<año>/<mes>/acuses/<uuid_fiscal>_cancelacion.xml
