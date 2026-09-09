-- 0110 — Combos (ADR 0015, spec 2026-09-08-combos-design.md).
--
-- §1 Catálogo: el combo es un producto (es_combo) con slots (combo_grupos) y opciones
--    (combo_opciones). Un slot puede apuntar a una categoría entera.
-- §2 Ticket: padre e hijos en ticket_items, RPC agregar_combo_a_ticket, cascada al cancelar.
-- §3 Vistas de ventas, pull y catalogo_version.

-- ── §1.1 productos.es_combo ──────────────────────────────────────────────────
ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_combo boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN productos.es_combo IS 'true = producto padre de un combo: precio base = "hacerlo combo"; sin receta ni área de cocina; se vende con agregar_combo_a_ticket.';

-- ── §1.2 combo_grupos (los slots) ────────────────────────────────────────────
CREATE TYPE combo_modo_precio AS ENUM ('DELTA', 'SUMA_PRECIO_PRODUCTO');

CREATE TABLE combo_grupos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  combo_producto_id    uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  nombre               text NOT NULL,
  orden_visualizacion  integer NOT NULL DEFAULT 0,
  minimo_selecciones   integer NOT NULL DEFAULT 1 CHECK (minimo_selecciones >= 0),
  maximo_selecciones   integer NOT NULL DEFAULT 1,
  modo_precio          combo_modo_precio NOT NULL DEFAULT 'DELTA',
  categoria_id         uuid NULL REFERENCES categorias(id) ON DELETE SET NULL,
  activo               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL,
  CONSTRAINT combo_grupos_rango CHECK (maximo_selecciones >= minimo_selecciones)
);
CREATE INDEX idx_combo_grupos_combo ON combo_grupos(combo_producto_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_combo_grupos_tenant ON combo_grupos(tenant_id);
CREATE INDEX idx_combo_grupos_version ON combo_grupos(tenant_id, updated_at DESC);
COMMENT ON TABLE combo_grupos IS 'Slots de un combo (Hamburguesa, Acompañamiento, Bebida). SUMA_PRECIO_PRODUCTO suma el precio a la carta del producto elegido; DELTA solo el delta de la opción. categoria_id = todos los productos activos de esa categoría son opción.';

ALTER TABLE combo_grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY combo_grupos_tenant ON combo_grupos FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE TRIGGER trg_combo_grupos_updated_at
  BEFORE UPDATE ON combo_grupos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── §1.3 combo_opciones ──────────────────────────────────────────────────────
CREATE TABLE combo_opciones (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  grupo_id             uuid NOT NULL REFERENCES combo_grupos(id) ON DELETE CASCADE,
  producto_id          uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  precio_delta_mxn     numeric(12,2) NOT NULL DEFAULT 0,
  es_default           boolean NOT NULL DEFAULT false,
  orden_visualizacion  integer NOT NULL DEFAULT 0,
  activa               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL,
  -- La unicidad es dura a propósito: un índice parcial (que excluyera deleted_at) no puede ser
  -- árbitro de ON CONFLICT en PostgREST. Re-agregar una opción borrada pasa por el upsert del
  -- admin (onConflict: "grupo_id,producto_id"), que limpia deleted_at en el mismo payload.
  CONSTRAINT combo_opcion_unica UNIQUE (grupo_id, producto_id)
);
CREATE UNIQUE INDEX idx_combo_opciones_default ON combo_opciones(grupo_id) WHERE es_default = true AND deleted_at IS NULL;
CREATE INDEX idx_combo_opciones_grupo ON combo_opciones(grupo_id);
CREATE INDEX idx_combo_opciones_tenant ON combo_opciones(tenant_id);
CREATE INDEX idx_combo_opciones_version ON combo_opciones(tenant_id, updated_at DESC);
COMMENT ON TABLE combo_opciones IS 'Opción explícita de un slot: delta de precio y default. En un slot por categoría, una fila con activa=false EXCLUYE al producto.';

ALTER TABLE combo_opciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY combo_opciones_tenant ON combo_opciones FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE TRIGGER trg_combo_opciones_updated_at
  BEFORE UPDATE ON combo_opciones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Un combo no puede ser opción de otro combo (sin anidamiento, spec §2).
CREATE OR REPLACE FUNCTION combo_opciones_no_combo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND es_combo) THEN
    RAISE EXCEPTION 'Un combo no puede ser opción de otro combo';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_combo_opciones_no_combo
  BEFORE INSERT OR UPDATE OF producto_id ON combo_opciones
  FOR EACH ROW EXECUTE FUNCTION combo_opciones_no_combo();

-- El otro camino al anidamiento: marcar como combo un producto que YA es opción de un slot.
-- Sin esto la prohibición de arriba solo cubre la mitad, y el catálogo puede quedar en un estado
-- que la caja rechazaría al vender.
CREATE OR REPLACE FUNCTION productos_no_combo_si_es_opcion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.es_combo AND EXISTS (
    SELECT 1 FROM combo_opciones WHERE producto_id = NEW.id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El producto "%" es opción de un combo: no puede convertirse en combo', NEW.nombre;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_productos_no_combo_si_es_opcion
  BEFORE UPDATE OF es_combo ON productos
  FOR EACH ROW WHEN (NEW.es_combo AND NOT OLD.es_combo)
  EXECUTE FUNCTION productos_no_combo_si_es_opcion();

-- ── §1.4 Interruptor del aviso "¿Lo hacemos combo?" ──────────────────────────
ALTER TABLE configuracion_tenant ADD COLUMN IF NOT EXISTS combo_upsell_activo boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN configuracion_tenant.combo_upsell_activo IS 'La caja ofrece "¿Lo hacemos combo?" al agregar suelto un producto que es principal de un combo.';
