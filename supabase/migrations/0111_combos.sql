-- 0111 — Combos (ADR 0015, spec 2026-09-08-combos-design.md).
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

-- ── §2.1 ticket_items: padre e hijos ─────────────────────────────────────────
ALTER TABLE ticket_items
  ADD COLUMN IF NOT EXISTS parent_item_id uuid NULL REFERENCES ticket_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS combo_rol text NULL CHECK (combo_rol IN ('PADRE', 'HIJO')),
  ADD COLUMN IF NOT EXISTS precio_asignado_mxn numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS combo_grupo_nombre_snapshot text NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_items_parent ON ticket_items(parent_item_id) WHERE parent_item_id IS NOT NULL;
COMMENT ON COLUMN ticket_items.combo_rol IS 'PADRE = renglón del combo (cobra); HIJO = componente (precio 0, cocina, inventario). NULL = renglón normal.';
COMMENT ON COLUMN ticket_items.precio_asignado_mxn IS 'Solo hijos: parte del precio del combo que le toca, proporcional a su precio a la carta. Informativo, para reportes.';

-- agregar_combo_a_ticket guarda el precio de catálogo del hijo (antes de ponerlo en 0) en
-- precio_unitario_original_snapshot para que reportes/UI puedan mostrarlo. precio_override_coherente
-- (0008) exigía que ese campo solo se llenara junto con un override manual autorizado por PIN
-- (precio_override=true + autorizacion_pin_override_id); un hijo de combo no es eso, así que se
-- amplía el CHECK con un tercer caso en vez de reusar la semántica de override.
ALTER TABLE ticket_items DROP CONSTRAINT IF EXISTS precio_override_coherente;
ALTER TABLE ticket_items ADD CONSTRAINT precio_override_coherente CHECK (
  (precio_override = false AND precio_unitario_original_snapshot IS NULL AND autorizacion_pin_override_id IS NULL)
  OR (precio_override = true AND precio_unitario_original_snapshot IS NOT NULL AND autorizacion_pin_override_id IS NOT NULL)
  OR (combo_rol = 'HIJO' AND precio_override = false AND autorizacion_pin_override_id IS NULL)
);

-- ── §2.2 agregar_item_a_ticket rechaza combos (mismo cuerpo que 0016 + la comprobación) ──
CREATE OR REPLACE FUNCTION agregar_item_a_ticket(
  p_ticket_id      uuid,
  p_producto_id    uuid,
  p_cantidad       numeric(12,3),
  p_nota_cocina    text DEFAULT NULL,
  p_modificadores  jsonb DEFAULT '[]'::jsonb,
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
  SELECT tenant_id, estado_fiscal INTO v_tenant_id, v_ticket_estado
  FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;
  IF v_ticket_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'Solo se pueden agregar items a tickets BORRADOR o ABIERTO (estado actual: %)', v_ticket_estado;
  END IF;

  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_item_id
    FROM ticket_items
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_item_id; END IF;
  END IF;

  SELECT p.id, p.nombre, p.codigo_interno AS sku, p.precio_base_mxn, p.tasa_iva,
         p.iva_incluido_en_precio, p.clave_sat, p.unidad_sat,
         p.modos_servicio_disponibles AS modos_servicio_aplicables,
         p.es_combo,
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
  -- 0111: un combo sin hijos sería un renglón que cobra y no cocina. Tiene su propia RPC.
  IF v_producto.es_combo THEN
    RAISE EXCEPTION 'El producto "%" es un combo: usa agregar_combo_a_ticket', v_producto.nombre;
  END IF;

  SELECT COALESCE(MAX(orden_visualizacion), 0) + 1
  INTO v_next_orden
  FROM ticket_items
  WHERE ticket_id = p_ticket_id;

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

  IF p_modificadores IS NOT NULL AND jsonb_array_length(p_modificadores) > 0 THEN
    FOR v_modif IN SELECT * FROM jsonb_array_elements(p_modificadores)
    LOOP
      SELECT om.id, om.nombre, om.precio_extra_mxn AS precio_extra,
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
        tenant_id, ticket_item_id, opcion_modificador_id, grupo_id,
        grupo_nombre_snapshot, opcion_nombre_snapshot,
        precio_extra_snapshot, naturaleza_snapshot,
        cantidad, monto_total_mxn, created_by
      ) VALUES (
        v_tenant_id, v_item_id, v_opcion.id, v_opcion.grupo_id,
        v_opcion.grupo_nombre, v_opcion.nombre,
        v_opcion.precio_extra, v_opcion.naturaleza,
        COALESCE((v_modif->>'cantidad')::integer, 1),
        v_opcion.precio_extra * COALESCE((v_modif->>'cantidad')::integer, 1) * p_cantidad,
        auth.uid()
      );
    END LOOP;
  END IF;

  RETURN v_item_id;
END;
$$;

-- ── §2.3 agregar_combo_a_ticket ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION agregar_combo_a_ticket(
  p_ticket_id         uuid,
  p_combo_producto_id uuid,
  p_cantidad          numeric(12,3) DEFAULT 1,
  p_componentes       jsonb DEFAULT '[]'::jsonb,
  p_modificadores     jsonb DEFAULT '[]'::jsonb,
  p_nota_cocina       text DEFAULT NULL,
  p_client_id_local   varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id   uuid;
  v_estado      ticket_estado_fiscal;
  v_combo       record;
  v_grupo       record;
  v_prod        record;
  v_opcion      record;
  v_comp        jsonb;
  v_n           numeric;
  v_delta       numeric(12,2);
  v_precio      numeric(12,2);
  v_carta       numeric(12,2) := 0;
  v_carta_hijo  numeric(12,2);
  v_total_padre numeric(12,2);
  v_acum        numeric(12,2) := 0;
  v_asignado    numeric(12,2);
  v_padre_id    uuid;
  v_hijo_id     uuid;
  v_i           integer := 0;
  v_n_comp      integer;
  v_next_orden  integer;
  v_cat_nombre  text;
  v_hijo_parent_id uuid;
  v_hijo_combo_rol text;
BEGIN
  SELECT tenant_id, estado_fiscal INTO v_tenant_id, v_estado FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;
  IF v_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'Solo se pueden agregar combos a tickets BORRADOR o ABIERTO (estado actual: %)', v_estado;
  END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_padre_id FROM ticket_items WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_padre_id; END IF;
  END IF;

  SELECT p.id, p.nombre, p.codigo_interno, p.precio_base_mxn, p.tasa_iva, p.iva_incluido_en_precio,
         p.clave_sat, p.unidad_sat, p.modos_servicio_disponibles, p.estado, p.agotado_manual, p.agotado_automatico,
         c.nombre AS categoria_nombre
    INTO v_combo
    FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id
   WHERE p.id = p_combo_producto_id AND p.tenant_id = v_tenant_id AND p.deleted_at IS NULL AND p.es_combo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'El producto % no es un combo de este negocio', p_combo_producto_id; END IF;
  IF v_combo.estado <> 'ACTIVO' OR v_combo.agotado_manual OR v_combo.agotado_automatico THEN
    RAISE EXCEPTION 'El combo "%" no está disponible', v_combo.nombre;
  END IF;

  v_precio := v_combo.precio_base_mxn;

  -- 1) Cada slot activo cumple mínimo y máximo (contando cantidades)
  FOR v_grupo IN
    SELECT id, nombre, minimo_selecciones, maximo_selecciones FROM combo_grupos
     WHERE combo_producto_id = v_combo.id AND activo = true AND deleted_at IS NULL
  LOOP
    SELECT COALESCE(SUM(COALESCE((c->>'cantidad')::numeric, 1)), 0) INTO v_n
      FROM jsonb_array_elements(p_componentes) c WHERE (c->>'grupo_id')::uuid = v_grupo.id;
    IF v_n < v_grupo.minimo_selecciones OR v_n > v_grupo.maximo_selecciones THEN
      RAISE EXCEPTION 'El slot "%" requiere entre % y % selecciones (recibió %)',
        v_grupo.nombre, v_grupo.minimo_selecciones, v_grupo.maximo_selecciones, v_n;
    END IF;
  END LOOP;

  -- 2) Cada componente es opción válida de su slot; se acumula el precio (spec §4.3 y §4.5 paso 4)
  FOR v_comp IN SELECT * FROM jsonb_array_elements(p_componentes) LOOP
    SELECT g.id, g.nombre, g.modo_precio, g.categoria_id INTO v_grupo FROM combo_grupos g
     WHERE g.id = (v_comp->>'grupo_id')::uuid AND g.combo_producto_id = v_combo.id
       AND g.activo = true AND g.deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'El grupo % no pertenece al combo', v_comp->>'grupo_id'; END IF;

    SELECT p.id, p.nombre, p.precio_base_mxn, p.estado, p.agotado_manual, p.agotado_automatico,
           p.es_combo, p.categoria_id, p.visible_en_pos
      INTO v_prod FROM productos p
     WHERE p.id = (v_comp->>'producto_id')::uuid AND p.tenant_id = v_tenant_id AND p.deleted_at IS NULL;
    IF NOT FOUND OR v_prod.es_combo THEN
      RAISE EXCEPTION 'El producto % no es válido como componente', v_comp->>'producto_id';
    END IF;
    IF v_prod.estado <> 'ACTIVO' OR v_prod.agotado_manual OR v_prod.agotado_automatico THEN
      RAISE EXCEPTION 'El producto "%" está agotado o pausado', v_prod.nombre;
    END IF;

    SELECT o.precio_delta_mxn, o.activa INTO v_opcion FROM combo_opciones o
     WHERE o.grupo_id = v_grupo.id AND o.producto_id = v_prod.id AND o.deleted_at IS NULL;
    IF FOUND THEN
      IF NOT v_opcion.activa THEN
        RAISE EXCEPTION 'El producto "%" está excluido del slot "%"', v_prod.nombre, v_grupo.nombre;
      END IF;
      v_delta := v_opcion.precio_delta_mxn;
    ELSIF v_grupo.categoria_id IS NOT NULL AND v_prod.categoria_id = v_grupo.categoria_id AND v_prod.visible_en_pos THEN
      v_delta := 0;
    ELSE
      RAISE EXCEPTION 'El producto "%" no es opción del slot "%"', v_prod.nombre, v_grupo.nombre;
    END IF;

    v_n := COALESCE((v_comp->>'cantidad')::numeric, 1);
    v_precio := v_precio + ((CASE WHEN v_grupo.modo_precio = 'SUMA_PRECIO_PRODUCTO' THEN v_prod.precio_base_mxn ELSE 0 END) + v_delta) * v_n;
    v_carta  := v_carta + v_prod.precio_base_mxn * v_n * p_cantidad;
  END LOOP;

  v_total_padre := ROUND(v_precio * p_cantidad, 2);

  -- 3) El padre: snapshot igual al de agregar_item_a_ticket, precio = el del combo, sin área
  SELECT COALESCE(MAX(orden_visualizacion), 0) + 1 INTO v_next_orden FROM ticket_items WHERE ticket_id = p_ticket_id;
  INSERT INTO ticket_items (
    tenant_id, ticket_id, producto_id, cantidad, orden_visualizacion,
    producto_nombre_snapshot, producto_sku_snapshot,
    precio_unitario_snapshot, tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
    clave_sat_snapshot, unidad_sat_snapshot,
    categoria_nombre_snapshot, modos_servicio_snapshot, area_cocina_nombre_snapshot,
    nota_cocina, client_id_local, created_by, combo_rol
  ) VALUES (
    v_tenant_id, p_ticket_id, v_combo.id, p_cantidad, v_next_orden,
    v_combo.nombre, v_combo.codigo_interno,
    v_precio, v_combo.tasa_iva, v_combo.iva_incluido_en_precio,
    v_combo.clave_sat, v_combo.unidad_sat,
    v_combo.categoria_nombre, v_combo.modos_servicio_disponibles, NULL,
    p_nota_cocina, p_client_id_local, auth.uid(), 'PADRE'
  ) RETURNING id INTO v_padre_id;

  -- Un modificador PAGADO en la línea del padre se cobraría sin aparecer en ningún reporte: las
  -- tres vistas de ventas excluyen combo_rol = 'PADRE', mientras que recalcular_totales_ticket sí
  -- mete monto_modificadores_mxn en el total del ticket y el CFDI lo conserva. Hoy está latente
  -- —el modal de la caja arma la línea del padre con modificadores: []— pero el parámetro existe y
  -- dos capas del cliente ya lo pasan, así que la primera función que lo use (la importación de
  -- Uber de la entrega 2 es candidata) subestimaría los ingresos en silencio.
  --
  -- Falla ruidosamente en vez de cobrar mal. Quien quiera levantar la restricción tiene que
  -- arreglar antes las vistas: el modificador del padre necesita llegar a algún renglón del
  -- reporte. Los modificadores del COMPONENTE (v_comp->'modificadores') sí funcionan y sí se
  -- reportan, porque cuelgan de un hijo, que las vistas sí cuentan.
  IF p_modificadores IS NOT NULL AND jsonb_array_length(p_modificadores) > 0 THEN
    RAISE EXCEPTION 'Los modificadores en la línea del combo no se soportan todavía: se cobrarían sin llegar a los reportes de ventas. Ponlos en el componente que corresponda.';
  END IF;

  -- 4) Los hijos: por la RPC de siempre (snapshot + modificadores) y luego a precio 0 con prorrateo
  v_n_comp := jsonb_array_length(p_componentes);
  FOR v_comp IN SELECT * FROM jsonb_array_elements(p_componentes) LOOP
    v_i := v_i + 1;
    v_n := COALESCE((v_comp->>'cantidad')::numeric, 1);
    SELECT nombre INTO v_cat_nombre FROM combo_grupos WHERE id = (v_comp->>'grupo_id')::uuid;
    v_hijo_id := agregar_item_a_ticket(
      p_ticket_id, (v_comp->>'producto_id')::uuid, v_n * p_cantidad,
      NULLIF(v_comp->>'nota_cocina', ''),
      COALESCE(v_comp->'modificadores', '[]'::jsonb),
      NULLIF(v_comp->>'client_id_local', ''));

    SELECT precio_unitario_snapshot * cantidad, parent_item_id, combo_rol
      INTO v_carta_hijo, v_hijo_parent_id, v_hijo_combo_rol
      FROM ticket_items WHERE id = v_hijo_id;
    -- 0111 hallazgo 1: agregar_item_a_ticket puede devolver una fila EXISTENTE (idempotencia por
    -- client_id_local) en vez de insertar. Si esa fila ya forma parte de un combo, no la
    -- re-apadrinamos a ciegas: se la robaríamos a su combo original y corromperíamos sus totales.
    --
    -- Se rechaza también cuando ya es hijo de ESTE mismo padre (revisión final, hallazgo 7). No
    -- hay reintento legítimo que llegue aquí —un reintento del combo entero sale antes por la
    -- idempotencia del padre, y la RPC es una sola transacción—, pero sí hay un payload malformado
    -- que llega: dos componentes de la MISMA llamada con el mismo client_id_local. Con la guarda
    -- anterior, el segundo recibía la fila del primero —ya puesta a 0—, el prorrateo se calculaba
    -- sobre un precio de carta de 0 y el UPDATE pisaba precio_unitario_original_snapshot con 0.
    IF v_hijo_combo_rol IS NOT NULL OR v_hijo_parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'El componente ya pertenece a otro renglón del ticket (client_id_local reusado)';
    END IF;
    IF v_carta > 0 THEN
      v_asignado := ROUND(v_total_padre * v_carta_hijo / v_carta, 2);
    ELSE
      v_asignado := ROUND(v_total_padre / v_n_comp, 2);
    END IF;
    IF v_i = v_n_comp THEN v_asignado := v_total_padre - v_acum; ELSE v_acum := v_acum + v_asignado; END IF;

    UPDATE ticket_items
       SET precio_unitario_original_snapshot = precio_unitario_snapshot,
           precio_unitario_snapshot = 0,
           parent_item_id = v_padre_id,
           combo_rol = 'HIJO',
           combo_grupo_nombre_snapshot = v_cat_nombre,
           precio_asignado_mxn = v_asignado
     WHERE id = v_hijo_id;
  END LOOP;

  RETURN v_padre_id;
END;
$$;
COMMENT ON FUNCTION agregar_combo_a_ticket IS 'Inserta un combo: padre (cobra el precio calculado aquí) + hijos a precio 0 con prorrateo informativo. Valida slots, pertenencia y agotados. Idempotente por client_id_local. Rechaza p_modificadores en la línea del padre (no llegarían a las vistas de ventas). ADR 0015.';

-- ── §2.4 cancelar_item_ticket: el padre arrastra a los hijos; un hijo no se cancela solo ──
CREATE OR REPLACE FUNCTION cancelar_item_ticket(
  p_ticket_item_id  uuid,
  p_motivo          text,
  p_autorizacion_pin_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_item    record;
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
  IF v_item.combo_rol = 'HIJO' THEN
    RAISE EXCEPTION 'Cancela el combo completo';
  END IF;
  IF v_item.estado_cocina IN ('EN_COCINA', 'LISTO') AND p_autorizacion_pin_id IS NULL THEN
    RAISE EXCEPTION 'Cancelar item con comanda en cocina requiere autorización_pin_id';
  END IF;

  UPDATE ticket_items
  SET cancelado = true,
      motivo_cancelacion = p_motivo,
      usuario_cancelo_id = auth.uid(),
      autorizacion_cancelacion_id = p_autorizacion_pin_id,
      cancelado_at = now()
  WHERE id = p_ticket_item_id
     OR (parent_item_id = p_ticket_item_id AND cancelado = false);
  -- recalcular_totales_ticket() invocada por trigger (UPDATE OF cancelado)
END;
$$;
COMMENT ON FUNCTION cancelar_item_ticket IS 'Cancela un ítem individual sin cancelar el ticket. Si la comanda ya está en cocina, requiere PIN (§16.3). Un PADRE de combo arrastra a sus HIJOS; un HIJO no se cancela solo (0111).';

-- ── §3.1 Vistas de ventas: sin padres; hijos valen su parte prorrateada + sus extras ────────
-- CREATE OR REPLACE VIEW exige las mismas columnas en el mismo orden: solo cambian expresiones.
-- WITH (security_invoker = true) se repite a propósito: la 0044 lo puso con un ALTER VIEW
-- dinámico sobre TODAS las vistas de public, pero CREATE OR REPLACE VIEW no conserva reloptions
-- —lo resetea a security_definer (el dueño de la vista, no el que consulta)—, así que si no se
-- repite aquí la vista deja de respetar la RLS de tickets/ticket_items (0002_rls_cobertura lo
-- comprueba: "toda vista vw_* declara security_invoker").
CREATE OR REPLACE VIEW vw_ventas_por_categoria
WITH (security_invoker = true) AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  ti.categoria_nombre_snapshot AS categoria,
  COUNT(DISTINCT t.id)         AS tickets_con_categoria,
  SUM(ti.cantidad)             AS unidades_vendidas,
  SUM(CASE WHEN ti.combo_rol = 'HIJO' THEN ti.precio_asignado_mxn + ti.subtotal_bruto_mxn ELSE ti.subtotal_bruto_mxn END) AS subtotal_mxn,
  -- IVA del HIJO: su parte prorrateada del precio del padre nunca pasó por recalcular_totales_ticket
  -- (ese cálculo solo corre sobre precio_unitario_snapshot, que en el HIJO es 0), así que aquí se
  -- deriva a mano. Los atributos fiscales son los DEL PADRE (join `padre` + lateral `rebanada`), no los
  -- del hijo: precio_asignado_mxn es una rebanada del precio del padre y lleva su carácter fiscal.
  -- Leer el snapshot del hijo daba números que no corresponden a ningún cobro (una ensalada al 16 %
  -- por afuera dentro de un combo con IVA dentro reportaba 7.40 donde se cobraron 6.38).
  SUM(CASE WHEN ti.combo_rol = 'HIJO' THEN rebanada.iva_mxn + ti.iva_item_mxn
           ELSE ti.iva_item_mxn END) AS iva_mxn,
  -- Con IVA por AFUERA la rebanada es un importe NETO y el cobro real fue neto × (1 + tasa): sin
  -- sumarle el IVA derivado, todo reporte de ventas queda corto por el impuesto y la fila se
  -- contradice a sí misma (total_mxn < subtotal_mxn + iva_mxn). Con IVA dentro no se suma nada
  -- porque la rebanada ya lo trae, igual que subtotal_bruto_mxn en un renglón normal.
  SUM(CASE WHEN ti.combo_rol = 'HIJO'
           THEN ti.precio_asignado_mxn + (CASE WHEN rebanada.iva_dentro THEN 0 ELSE rebanada.iva_mxn END) + ti.total_item_mxn
           ELSE ti.total_item_mxn END) AS total_mxn,
  AVG(CASE WHEN ti.combo_rol = 'HIJO' THEN ti.precio_unitario_original_snapshot ELSE ti.precio_unitario_snapshot END) AS precio_unitario_promedio_mxn
FROM tickets t
JOIN ticket_items ti ON ti.ticket_id = t.id
LEFT JOIN ticket_items padre ON padre.id = ti.parent_item_id
LEFT JOIN LATERAL (
  SELECT ROUND(ti.precio_asignado_mxn * padre.tasa_iva_snapshot
               / (CASE WHEN padre.iva_incluido_en_precio_snapshot THEN 100 + padre.tasa_iva_snapshot ELSE 100 END), 2) AS iva_mxn,
         padre.iva_incluido_en_precio_snapshot AS iva_dentro
) rebanada ON ti.combo_rol = 'HIJO'
WHERE t.deleted_at IS NULL
  AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
  AND ti.cancelado = false
  AND ti.categoria_nombre_snapshot IS NOT NULL
  AND ti.combo_rol IS DISTINCT FROM 'PADRE'
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable, ti.categoria_nombre_snapshot;
COMMENT ON VIEW vw_ventas_por_categoria IS 'Ventas por categoría/día. Los PADRES de combo no cuentan; los HIJOS valen su precio asignado más sus extras, con el IVA derivado de los atributos fiscales DEL PADRE (y sumado al total cuando el padre cobra con IVA por afuera). ADR 0015.';

CREATE OR REPLACE VIEW vw_ventas_por_producto
WITH (security_invoker = true) AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  ti.producto_id,
  ti.producto_nombre_snapshot  AS producto_nombre,
  ti.producto_sku_snapshot     AS producto_sku,
  COUNT(DISTINCT t.id)         AS tickets_con_producto,
  SUM(ti.cantidad)             AS unidades_vendidas,
  SUM(CASE WHEN ti.combo_rol = 'HIJO' THEN ti.precio_asignado_mxn + ti.subtotal_bruto_mxn ELSE ti.subtotal_bruto_mxn END) AS subtotal_mxn,
  -- IVA y total del HIJO: misma regla que en vw_ventas_por_categoria — atributos fiscales DEL
  -- PADRE (join `padre`) y, con IVA por afuera, el impuesto derivado se suma a total_mxn.
  SUM(CASE WHEN ti.combo_rol = 'HIJO' THEN rebanada.iva_mxn + ti.iva_item_mxn
           ELSE ti.iva_item_mxn END) AS iva_mxn,
  SUM(CASE WHEN ti.combo_rol = 'HIJO'
           THEN ti.precio_asignado_mxn + (CASE WHEN rebanada.iva_dentro THEN 0 ELSE rebanada.iva_mxn END) + ti.total_item_mxn
           ELSE ti.total_item_mxn END) AS total_mxn,
  AVG(CASE WHEN ti.combo_rol = 'HIJO' THEN ti.precio_unitario_original_snapshot ELSE ti.precio_unitario_snapshot END) AS precio_unitario_promedio_mxn
FROM tickets t
JOIN ticket_items ti ON ti.ticket_id = t.id
LEFT JOIN ticket_items padre ON padre.id = ti.parent_item_id
LEFT JOIN LATERAL (
  SELECT ROUND(ti.precio_asignado_mxn * padre.tasa_iva_snapshot
               / (CASE WHEN padre.iva_incluido_en_precio_snapshot THEN 100 + padre.tasa_iva_snapshot ELSE 100 END), 2) AS iva_mxn,
         padre.iva_incluido_en_precio_snapshot AS iva_dentro
) rebanada ON ti.combo_rol = 'HIJO'
WHERE t.deleted_at IS NULL
  AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
  AND ti.cancelado = false
  AND ti.combo_rol IS DISTINCT FROM 'PADRE'
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable,
         ti.producto_id, ti.producto_nombre_snapshot, ti.producto_sku_snapshot;
COMMENT ON VIEW vw_ventas_por_producto IS 'Ventas por producto/día. Los PADRES de combo no cuentan; los HIJOS valen su precio asignado más sus extras, con el IVA derivado de los atributos fiscales DEL PADRE (y sumado al total cuando el padre cobra con IVA por afuera). ADR 0015.';

CREATE OR REPLACE VIEW vw_ventas_por_area_cocina
WITH (security_invoker = true) AS
SELECT
  t.tenant_id,
  t.sucursal_id,
  t.dia_contable,
  ti.area_cocina_nombre_snapshot AS area_cocina,
  COUNT(DISTINCT t.id)           AS tickets_con_area,
  SUM(ti.cantidad)               AS unidades_preparadas,
  -- Mismo criterio que las otras dos vistas: con IVA por afuera en el PADRE, la rebanada es neta
  -- y hay que sumarle el impuesto derivado para reportar lo que de verdad se cobró.
  SUM(CASE WHEN ti.combo_rol = 'HIJO'
           THEN ti.precio_asignado_mxn + (CASE WHEN rebanada.iva_dentro THEN 0 ELSE rebanada.iva_mxn END) + ti.total_item_mxn
           ELSE ti.total_item_mxn END) AS total_vendido_mxn
FROM tickets t
JOIN ticket_items ti ON ti.ticket_id = t.id
LEFT JOIN ticket_items padre ON padre.id = ti.parent_item_id
LEFT JOIN LATERAL (
  SELECT ROUND(ti.precio_asignado_mxn * padre.tasa_iva_snapshot
               / (CASE WHEN padre.iva_incluido_en_precio_snapshot THEN 100 + padre.tasa_iva_snapshot ELSE 100 END), 2) AS iva_mxn,
         padre.iva_incluido_en_precio_snapshot AS iva_dentro
) rebanada ON ti.combo_rol = 'HIJO'
WHERE t.deleted_at IS NULL
  AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
  AND ti.cancelado = false
  AND ti.area_cocina_nombre_snapshot IS NOT NULL
  AND ti.combo_rol IS DISTINCT FROM 'PADRE'
GROUP BY t.tenant_id, t.sucursal_id, t.dia_contable, ti.area_cocina_nombre_snapshot;
COMMENT ON VIEW vw_ventas_por_area_cocina IS 'Ventas por área de cocina/día. Los PADRES de combo no cuentan; los HIJOS valen su precio asignado más sus extras, con el IVA derivado de los atributos fiscales DEL PADRE (y sumado al total cuando el padre cobra con IVA por afuera). ADR 0015.';

-- ── §3.2 Pull: las dos tablas bajan a la caja (ADR 0004: lista explícita) ───────────────
-- Cuerpo idéntico al vigente (0101) más dos claves después de productos_grupos_modificadores.
CREATE OR REPLACE FUNCTION sync_pull_snapshot(p_tenant uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT jsonb_build_object(
    'tenants',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM tenants x WHERE x.id = p_tenant), '[]'::jsonb),
    'sucursales',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sucursales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'cajas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM cajas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'secciones',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM secciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'mesas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM mesas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'areas_cocina',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM areas_cocina x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'marcas_virtuales',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM marcas_virtuales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'categorias',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM categorias x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'grupos_modificadores',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'opciones_modificador',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM opciones_modificador x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos_grupos_modificadores', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Combos (ADR 0015): slots y opciones; el combo mismo ya baja con productos.
    'combo_grupos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_grupos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'combo_opciones',                 coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_opciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'subtipos_personal',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM subtipos_personal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'configuracion_tenant',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM configuracion_tenant x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'repartidores',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM repartidores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Inventario (ADR 0013): lo que la caja necesita para descontar al vender. Nunca sube de vuelta.
    'unidades_medida',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM unidades_medida x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'insumos',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'insumo_stock_sucursal',          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumo_stock_sucursal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'recetas',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM recetas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'receta_componentes',             coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM receta_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'modificador_componentes',        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM modificador_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'roles',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM roles x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'rol_permisos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM rol_permisos x WHERE x.rol_id IN (SELECT id FROM roles WHERE tenant_id = p_tenant OR tenant_id IS NULL)), '[]'::jsonb),
    'permisos',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM permisos x), '[]'::jsonb),
    'usuarios_acceso',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_acceso x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'usuarios_perfil',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_perfil x WHERE x.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    'users',                          coalesce((SELECT jsonb_agg(jsonb_build_object(
                                          'id', u.id, 'email', u.email, 'encrypted_password', u.encrypted_password,
                                          'email_confirmed_at', u.email_confirmed_at, 'created_at', u.created_at,
                                          'raw_app_meta_data', u.raw_app_meta_data, 'raw_user_meta_data', u.raw_user_meta_data))
                                        FROM auth.users u
                                        WHERE u.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    '__watermark', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
$$;
REVOKE EXECUTE ON FUNCTION sync_pull_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_pull_snapshot(uuid) TO service_role;

-- ── §3.3 catalogo_version(): un slot nuevo también es "el menú cambió" ──────────────────
CREATE OR REPLACE FUNCTION catalogo_version()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(
    (SELECT max(updated_at) FROM categorias),
    (SELECT max(updated_at) FROM productos),
    (SELECT max(updated_at) FROM grupos_modificadores),
    (SELECT max(updated_at) FROM opciones_modificador),
    (SELECT max(created_at) FROM productos_grupos_modificadores),
    (SELECT max(updated_at) FROM combo_grupos),
    (SELECT max(updated_at) FROM combo_opciones)
  );
$$;
REVOKE EXECUTE ON FUNCTION catalogo_version() FROM public, anon;
GRANT EXECUTE ON FUNCTION catalogo_version() TO authenticated, service_role;
