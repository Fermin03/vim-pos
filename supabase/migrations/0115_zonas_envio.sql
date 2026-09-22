-- ============================================================================
-- 0115 — Zonas de envío: el domicilio se cobra según dónde vive el cliente.
--
-- POR QUÉ UN RENGLÓN DEL TICKET Y NO UNA COLUMNA DE tickets
--
-- La tentación es copiar `propina_mxn`: una columna más y a otra cosa. No se puede. Los totales
-- del ticket salen SOLO de ticket_items (recalcular_totales_ticket, 0008 §8.1), y el armador de
-- conceptos del CFDI valida que la suma de los renglones dé exactamente tickets.total_mxn — y
-- truena a propósito si no (ConceptosIncoherentes, _shared/pac/conceptos.ts). Un cargo por fuera
-- de los renglones produciría tickets que no se pueden facturar.
--
-- Como renglón, en cambio, no hay que tocar nada: totales, ticket impreso, CFDI, factura global,
-- reportes y sync ya saben qué hacer con un renglón.
-- ============================================================================

CREATE TABLE IF NOT EXISTS zonas_envio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  nombre      varchar(60) NOT NULL,
  costo_mxn   numeric(12,2) NOT NULL DEFAULT 0 CHECK (costo_mxn >= 0),
  orden       integer NOT NULL DEFAULT 0,
  activa      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL
);

COMMENT ON TABLE zonas_envio IS 'Zonas de reparto por sucursal con su cargo de envío. El cargo entra al ticket como renglón (cargo_tipo=ENVIO), nunca como columna.';

-- Por sucursal y no por tenant: las colonias de León no le sirven a una sucursal de otra ciudad.
-- Se comparan sin distinguir mayúsculas ni espacios de sobra, que es como se capturan de verdad.
CREATE UNIQUE INDEX IF NOT EXISTS zona_envio_nombre_uq
  ON zonas_envio (sucursal_id, lower(btrim(nombre))) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_zonas_envio_sucursal
  ON zonas_envio (sucursal_id) WHERE deleted_at IS NULL AND activa;

ALTER TABLE zonas_envio ENABLE ROW LEVEL SECURITY;

-- Explícito y no por default privileges (0065): esos solo aplican si la tabla la crea el mismo rol
-- que los definió, y una tabla sin privilegio falla con "permission denied" antes del RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON zonas_envio TO authenticated, service_role;

DO $$ BEGIN
  CREATE POLICY zonas_envio_select ON zonas_envio
    FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY zonas_envio_insert ON zonas_envio
    FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY zonas_envio_update ON zonas_envio
    FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY zonas_envio_delete ON zonas_envio
    FOR DELETE USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TRIGGER trg_zonas_envio_updated_at
  BEFORE UPDATE ON zonas_envio
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- La zona se recuerda en la dirección (para que salga sola la próxima vez) y se congela en el
-- ticket (para poder agrupar ventas por zona sin parsear el nombre del renglón).
ALTER TABLE direcciones_cliente ADD COLUMN IF NOT EXISTS zona_envio_id uuid NULL REFERENCES zonas_envio(id);
ALTER TABLE tickets             ADD COLUMN IF NOT EXISTS zona_envio_id uuid NULL REFERENCES zonas_envio(id);

-- Marca del renglón. Hace falta explícita: producto_id YA es nulo para los renglones cuyo producto
-- se borró del catálogo (FK blanda, 0008:547), así que "sin producto" no significa "es un cargo".
ALTER TABLE ticket_items ADD COLUMN IF NOT EXISTS cargo_tipo varchar(20) NULL;

DO $$ BEGIN
  ALTER TABLE ticket_items ADD CONSTRAINT ticket_items_cargo_tipo_chk CHECK (cargo_tipo IN ('ENVIO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN ticket_items.cargo_tipo IS 'NULL = renglón de producto. ENVIO = cargo de envío: no va a cocina, no consume inventario, no es un producto vendido.';

-- La garantía va en la base, no en que el código se acuerde.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_envio_unico
  ON ticket_items (ticket_id) WHERE cargo_tipo = 'ENVIO' AND cancelado = false;

-- ============================================================================
-- fijar_envio_ticket(ticket, zona) — punto único por el que entra y sale el cargo.
--
-- Idempotente: llamarla dos veces con la misma zona deja el mismo renglón. Con otra zona, lo
-- reprecia. Con NULL, lo borra.
--
-- BORRA en lugar de cancelar a propósito: un cargo retirado antes de cobrar no es una venta
-- cancelada y no tiene por qué aparecer en los reportes de cancelaciones. El trigger
-- AFTER INSERT OR UPDATE OR DELETE de ticket_items (0008:696) recalcula los totales solo.
-- ============================================================================
CREATE OR REPLACE FUNCTION fijar_envio_ticket(p_ticket_id uuid, p_zona_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant     uuid;
  v_sucursal   uuid;
  v_modo       modo_servicio;
  v_estado     ticket_estado_fiscal;
  v_zona       record;
  v_item       uuid;
  v_tasa       numeric(5,2);
  v_incluido   boolean;
  v_orden      integer;
BEGIN
  SELECT tenant_id, sucursal_id, modo_servicio, estado_fiscal
    INTO v_tenant, v_sucursal, v_modo, v_estado
  FROM tickets WHERE id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;
  IF v_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'El envío solo se puede fijar en tickets BORRADOR o ABIERTO (estado actual: %)', v_estado;
  END IF;
  IF v_modo <> 'DELIVERY_PROPIO' THEN
    RAISE EXCEPTION 'El cargo de envío solo aplica a domicilio propio (modo actual: %)', v_modo;
  END IF;

  SELECT id INTO v_item
  FROM ticket_items
  WHERE ticket_id = p_ticket_id AND cargo_tipo = 'ENVIO' AND cancelado = false;

  -- Quitar el envío
  IF p_zona_id IS NULL THEN
    IF v_item IS NOT NULL THEN DELETE FROM ticket_items WHERE id = v_item; END IF;
    UPDATE tickets SET zona_envio_id = NULL, updated_at = now() WHERE id = p_ticket_id;
    RETURN NULL;
  END IF;

  SELECT z.id, z.nombre, z.costo_mxn INTO v_zona
  FROM zonas_envio z
  WHERE z.id = p_zona_id
    AND z.tenant_id = v_tenant
    AND z.sucursal_id = v_sucursal
    AND z.activa = true
    AND z.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zona de envío % no existe, está inactiva o no es de esta sucursal', p_zona_id;
  END IF;

  -- La política fiscal del envío es la del ticket, no una constante: un negocio que factura con
  -- IVA por afuera tendría si no un envío incoherente con su propia comida.
  SELECT tasa_iva_snapshot, iva_incluido_en_precio_snapshot
    INTO v_tasa, v_incluido
  FROM ticket_items
  WHERE ticket_id = p_ticket_id AND cargo_tipo IS NULL AND cancelado = false
  ORDER BY orden_visualizacion
  LIMIT 1;

  IF NOT FOUND THEN
    v_tasa := 16.00;
    v_incluido := true;
  END IF;

  IF v_item IS NOT NULL THEN
    UPDATE ticket_items
       SET producto_nombre_snapshot = 'Envío · ' || v_zona.nombre,
           precio_unitario_snapshot = v_zona.costo_mxn,
           tasa_iva_snapshot = v_tasa,
           iva_incluido_en_precio_snapshot = v_incluido,
           updated_at = now()
     WHERE id = v_item;
  ELSE
    SELECT COALESCE(MAX(orden_visualizacion), 0) + 1 INTO v_orden
    FROM ticket_items WHERE ticket_id = p_ticket_id;

    INSERT INTO ticket_items (
      tenant_id, ticket_id, producto_id, cargo_tipo, cantidad, orden_visualizacion,
      producto_nombre_snapshot, precio_unitario_snapshot,
      tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
      clave_sat_snapshot, unidad_sat_snapshot, created_by
    ) VALUES (
      v_tenant, p_ticket_id, NULL, 'ENVIO', 1, v_orden,
      'Envío · ' || v_zona.nombre, v_zona.costo_mxn,
      v_tasa, v_incluido,
      NULL, NULL, auth.uid()
    ) RETURNING id INTO v_item;
  END IF;

  UPDATE tickets SET zona_envio_id = v_zona.id, updated_at = now() WHERE id = p_ticket_id;
  RETURN v_item;
END;
$$;

COMMENT ON FUNCTION fijar_envio_ticket IS 'Fija (o quita, con zona NULL) el renglón de envío de un ticket de domicilio. Idempotente. Los totales los recalcula el trigger de ticket_items.';

GRANT EXECUTE ON FUNCTION fijar_envio_ticket(uuid, uuid) TO authenticated, service_role;
