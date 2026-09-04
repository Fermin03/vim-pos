-- 0099 — Compras con proveedores y recetas con pantalla (ADR 0012, spec 2026-09-03).
--
-- Supera D26 (proveedor como texto libre) y D31 (compras solo como movimientos). Aditiva:
-- tablas nuevas + columnas nullable en movimientos_inventario y receta_componentes + trigger que
-- recalcula el costo de recetas cuando el costo del insumo se edita a mano + RPC guardar_receta.
-- Las funciones de venta/cancelación/devolución NO cambian: siguen leyendo
-- receta_componentes.cantidad en la unidad del insumo.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
CREATE TYPE compra_origen AS ENUM ('MANUAL', 'XML');
CREATE TYPE compra_estado AS ENUM ('CONFIRMADA', 'ANULADA');

-- ---------------------------------------------------------------------------
-- 2. proveedores
-- ---------------------------------------------------------------------------
CREATE TABLE proveedores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  nombre        varchar(200) NOT NULL,
  rfc           varchar(13) NULL,
  telefono      varchar(30) NULL,
  email         varchar(200) NULL,
  notas         text NULL,
  activo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz NULL,
  deleted_by    uuid NULL REFERENCES auth.users(id),
  CONSTRAINT proveedor_rfc_formato CHECK (rfc IS NULL OR rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$')
);
CREATE INDEX idx_proveedores_tenant ON proveedores(tenant_id);
CREATE UNIQUE INDEX idx_proveedores_rfc_unico ON proveedores(tenant_id, rfc)
  WHERE rfc IS NOT NULL AND deleted_at IS NULL;
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY proveedores_tenant ON proveedores FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE TRIGGER trg_proveedores_updated_at BEFORE UPDATE ON proveedores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE proveedores IS 'Catálogo de proveedores por negocio (ADR 0012, supera D26).';

-- ---------------------------------------------------------------------------
-- 3. compras (documento) + compra_lineas
-- ---------------------------------------------------------------------------
CREATE TABLE compras (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id           uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  proveedor_id          uuid NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  folio_completo        varchar(50) NULL,
  folio_consecutivo     bigint NULL,
  fecha                 date NOT NULL,
  referencia_documento  varchar(100) NULL,
  cfdi_uuid             uuid NULL,
  origen                compra_origen NOT NULL DEFAULT 'MANUAL',
  subtotal_mxn          numeric(12,2) NOT NULL CHECK (subtotal_mxn >= 0),
  iva_mxn               numeric(12,2) NOT NULL CHECK (iva_mxn >= 0),
  total_mxn             numeric(12,2) NOT NULL CHECK (total_mxn >= 0),
  notas                 text NULL,
  estado                compra_estado NOT NULL DEFAULT 'CONFIRMADA',
  usuario_id            uuid NOT NULL REFERENCES auth.users(id),
  dia_contable          date NOT NULL,
  anulada_at            timestamptz NULL,
  anulada_por           uuid NULL REFERENCES auth.users(id),
  motivo_anulacion      text NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compra_total_cuadra CHECK (total_mxn = subtotal_mxn + iva_mxn)
);
CREATE INDEX idx_compras_tenant ON compras(tenant_id);
CREATE INDEX idx_compras_tenant_fecha ON compras(tenant_id, fecha DESC);
CREATE INDEX idx_compras_proveedor ON compras(proveedor_id);
CREATE UNIQUE INDEX idx_compras_cfdi_uuid ON compras(tenant_id, cfdi_uuid) WHERE cfdi_uuid IS NOT NULL;
CREATE UNIQUE INDEX idx_compras_folio ON compras(sucursal_id, folio_completo) WHERE folio_completo IS NOT NULL;
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
CREATE POLICY compras_tenant ON compras FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE TRIGGER trg_compras_updated_at BEFORE UPDATE ON compras
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE compras IS 'Compra recibida a un proveedor. Cada línea genera un ENTRADA_COMPRA (ADR 0012, supera D31).';

CREATE OR REPLACE FUNCTION trg_compra_folio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_folio record;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.folio_completo IS NULL THEN
    SELECT folio_completo, consecutivo INTO v_folio FROM generar_folio(NEW.sucursal_id, 'COMPRA', NULL);
    NEW.folio_completo := v_folio.folio_completo;
    NEW.folio_consecutivo := v_folio.consecutivo;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_compras_folio BEFORE INSERT ON compras
  FOR EACH ROW EXECUTE FUNCTION trg_compra_folio();

CREATE TABLE compra_lineas (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  compra_id               uuid NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  insumo_id               uuid NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  descripcion_origen      varchar(500) NULL,
  cantidad_capturada      numeric(14,3) NOT NULL CHECK (cantidad_capturada > 0),
  unidad_capturada_id     uuid NOT NULL REFERENCES unidades_medida(id) ON DELETE RESTRICT,
  cantidad                numeric(14,3) NOT NULL CHECK (cantidad > 0),
  costo_unitario_mxn      numeric(14,6) NOT NULL CHECK (costo_unitario_mxn >= 0),
  importe_mxn             numeric(12,2) NOT NULL CHECK (importe_mxn >= 0),
  movimiento_id           uuid NULL REFERENCES movimientos_inventario(id) ON DELETE SET NULL,
  movimiento_reversa_id   uuid NULL REFERENCES movimientos_inventario(id) ON DELETE SET NULL,
  orden                   integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_compra_lineas_tenant ON compra_lineas(tenant_id);
CREATE INDEX idx_compra_lineas_compra ON compra_lineas(compra_id);
CREATE INDEX idx_compra_lineas_insumo ON compra_lineas(insumo_id);
ALTER TABLE compra_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY compra_lineas_tenant ON compra_lineas FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
COMMENT ON COLUMN compra_lineas.cantidad IS 'Ya en la unidad del insumo. cantidad_capturada/unidad_capturada_id es como se tecleó o vino en el XML.';

-- ---------------------------------------------------------------------------
-- 4. proveedor_insumo_alias — memoria de emparejamiento XML → insumo
-- ---------------------------------------------------------------------------
CREATE TABLE proveedor_insumo_alias (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  proveedor_id        uuid NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  clave_origen        varchar(120) NOT NULL,
  descripcion_origen  varchar(500) NULL,
  insumo_id           uuid NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  unidad_id           uuid NOT NULL REFERENCES unidades_medida(id) ON DELETE RESTRICT,
  factor              numeric(20,10) NOT NULL CHECK (factor > 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alias_unico UNIQUE (proveedor_id, clave_origen)
);
CREATE INDEX idx_alias_tenant ON proveedor_insumo_alias(tenant_id);
ALTER TABLE proveedor_insumo_alias ENABLE ROW LEVEL SECURITY;
CREATE POLICY alias_tenant ON proveedor_insumo_alias FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE TRIGGER trg_alias_updated_at BEFORE UPDATE ON proveedor_insumo_alias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON COLUMN proveedor_insumo_alias.factor IS 'Unidades del insumo por una unidad del proveedor. CAJA 12 PZ → 12.';

-- ---------------------------------------------------------------------------
-- 5. Columnas nuevas en tablas existentes
-- ---------------------------------------------------------------------------
ALTER TABLE movimientos_inventario ADD COLUMN compra_id uuid NULL REFERENCES compras(id) ON DELETE SET NULL;
CREATE INDEX idx_movimientos_compra ON movimientos_inventario(compra_id) WHERE compra_id IS NOT NULL;

ALTER TABLE receta_componentes
  ADD COLUMN cantidad_capturada numeric(14,3) NULL CHECK (cantidad_capturada IS NULL OR cantidad_capturada > 0),
  ADD COLUMN unidad_capturada_id uuid NULL REFERENCES unidades_medida(id) ON DELETE SET NULL;
COMMENT ON COLUMN receta_componentes.cantidad_capturada IS 'Solo para mostrar. NULL = capturada en la unidad del insumo. La cantidad operativa sigue en `cantidad`.';

-- ---------------------------------------------------------------------------
-- 6. Trigger: editar costo del insumo a mano recalcula recetas (hueco conocido)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_insumo_costo_recalcula_recetas() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.costo_unitario_mxn IS DISTINCT FROM OLD.costo_unitario_mxn THEN
    PERFORM recalcular_costo_recetas(NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_insumos_costo_recetas AFTER UPDATE OF costo_unitario_mxn ON insumos
  FOR EACH ROW EXECUTE FUNCTION trg_insumo_costo_recalcula_recetas();

-- ---------------------------------------------------------------------------
-- 7. guardar_receta — upsert de cabecera + reemplazo de componentes en una transacción
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guardar_receta(
  p_producto_id uuid,
  p_activa      boolean,
  p_notas       text,
  p_componentes jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_tenant   uuid := current_tenant_id();
  v_usuario  uuid := auth.uid();
  v_receta   uuid;
  v_n        int;
  v_distintos int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sesión sin negocio'; END IF;
  IF NOT EXISTS (SELECT 1 FROM productos WHERE id = p_producto_id AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'El producto no existe o no es de tu negocio';
  END IF;

  v_n := COALESCE(jsonb_array_length(p_componentes), 0);
  IF p_activa AND v_n = 0 THEN
    RAISE EXCEPTION 'Una receta activa necesita al menos un insumo';
  END IF;
  SELECT count(DISTINCT c->>'insumo_id') INTO v_distintos FROM jsonb_array_elements(p_componentes) c;
  IF v_distintos <> v_n THEN RAISE EXCEPTION 'Hay insumos repetidos en la receta'; END IF;

  SELECT id INTO v_receta FROM recetas WHERE producto_id = p_producto_id AND tenant_id = v_tenant;
  IF v_receta IS NULL THEN
    INSERT INTO recetas (tenant_id, producto_id, activa, notas_preparacion, created_by, updated_by)
    VALUES (v_tenant, p_producto_id, p_activa, p_notas, v_usuario, v_usuario)
    RETURNING id INTO v_receta;
  ELSE
    UPDATE recetas
       SET activa = p_activa, notas_preparacion = p_notas, version = version + 1,
           updated_by = v_usuario, updated_at = now()
     WHERE id = v_receta;
  END IF;

  DELETE FROM receta_componentes WHERE receta_id = v_receta;
  INSERT INTO receta_componentes (tenant_id, receta_id, insumo_id, cantidad, cantidad_capturada,
                                  unidad_capturada_id, es_critico, notas, orden_visualizacion)
  SELECT v_tenant, v_receta, (c->>'insumo_id')::uuid, (c->>'cantidad')::numeric,
         NULLIF(c->>'cantidad_capturada','')::numeric, NULLIF(c->>'unidad_capturada_id','')::uuid,
         COALESCE((c->>'es_critico')::boolean, true), NULLIF(c->>'notas',''),
         COALESCE((c->>'orden')::int, 0)
  FROM jsonb_array_elements(p_componentes) c;

  -- Si quedó sin componentes el trigger no dispara: dejar el costo en 0.
  IF v_n = 0 THEN UPDATE recetas SET costo_total_mxn = 0 WHERE id = v_receta; END IF;

  RETURN v_receta;
END $$;
COMMENT ON FUNCTION guardar_receta IS 'Upsert de receta 1:1 con producto + reemplazo de componentes. Cantidades ya en la unidad del insumo (el panel convierte). Spec 2026-09-03 §4.3.';
