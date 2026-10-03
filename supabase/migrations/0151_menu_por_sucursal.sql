-- ============================================================================
-- 0151 — Menú distinto por sucursal (ADR 0027).
--
-- Un negocio con varias sucursales tenía UN menú: productos y categorías cuelgan de tenant_id, el
-- precio era uno (D16) y agotar era global. Aquí cada sucursal guarda solo lo que cambia —se vende
-- o no, su precio, su agotado— en una fila por (producto, sucursal). Sin fila = lo general: un
-- producto nuevo aparece en todas y una sucursal nueva arranca con todo el menú.
--
-- POR QUÉ LAS COLUMNAS agotado_* DE productos SIGUEN AHÍ
-- Las cajas sin actualizar leen productos.agotado_manual/automatico. Pasan a significar «agotado
-- en TODAS las sucursales» y las mantiene un trigger (§4): para un negocio de una sola sucursal
-- —hoy, todos— queda exactamente como antes, en cualquier versión de la caja.
--
-- POR QUÉ NO SE BORRAN FILAS
-- El pull de la caja solo hace upsert (desktop/src/sync-pull.mjs). Una fila borrada en la nube se
-- quedaría viva en la caja. Quitar la excepción = volver la fila a sus valores por defecto.
--
-- Diseño: docs/superpowers/specs/2026-10-02-menu-por-sucursal-design.md
-- ============================================================================

-- ── §1 La tabla ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productos_sucursal (
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  producto_id         uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  disponible          boolean NOT NULL DEFAULT true,
  -- NULL = el precio general (productos.precio_base_mxn).
  precio_mxn          numeric(12,2) NULL CHECK (precio_mxn IS NULL OR precio_mxn >= 0),
  agotado_manual      boolean NOT NULL DEFAULT false,
  -- Solo lo escribe evaluar_alertas_stock (§8): insumo crítico en 0 EN ESTA sucursal.
  agotado_automatico  boolean NOT NULL DEFAULT false,
  motivo_agotado      text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- Llave compuesta: el upsert genérico del pull (upsertTabla) arma ON CONFLICT con la PK, y el
  -- admin hace upsert con onConflict 'producto_id,sucursal_id'. No hay id que reconciliar.
  PRIMARY KEY (producto_id, sucursal_id)
);
COMMENT ON TABLE productos_sucursal IS
  'Menú por sucursal (ADR 0027): solo lo que cambia en esa sucursal. Sin fila = se vende, al precio general, sin agotar. Las filas no se borran.';

-- La caja lee las de su sucursal; catalogo_version() mira updated_at (sin filtro: también cuenta
-- una fila que vuelve a lo general).
CREATE INDEX IF NOT EXISTS idx_productos_sucursal_sucursal ON productos_sucursal (tenant_id, sucursal_id);
CREATE INDEX IF NOT EXISTS idx_productos_sucursal_version  ON productos_sucursal (tenant_id, updated_at DESC);

ALTER TABLE productos_sucursal ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON productos_sucursal TO authenticated, service_role;

-- Igual que productos (0007): RLS dice de qué negocio; quién escribe lo dice la guardia de §3.
DO $$ BEGIN
  CREATE POLICY productos_sucursal_tenant ON productos_sucursal FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_productos_sucursal_updated_at ON productos_sucursal;
CREATE TRIGGER trg_productos_sucursal_updated_at
  BEFORE UPDATE ON productos_sucursal
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── §2 El negocio de la fila sale del producto; la sucursal tiene que ser del mismo ─────────
-- Bajo RLS, un producto o una sucursal de otro negocio no se ven: quedan NULL y se rechaza.
CREATE OR REPLACE FUNCTION productos_sucursal_coherencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_producto uuid;
  v_tenant_sucursal uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_producto FROM productos  WHERE id = NEW.producto_id;
  SELECT tenant_id INTO v_tenant_sucursal FROM sucursales WHERE id = NEW.sucursal_id;
  IF v_tenant_producto IS NULL OR v_tenant_sucursal IS NULL OR v_tenant_producto <> v_tenant_sucursal THEN
    RAISE EXCEPTION 'El producto y la sucursal tienen que ser del mismo negocio.' USING ERRCODE = '23514';
  END IF;
  NEW.tenant_id := v_tenant_producto;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_productos_sucursal_coherencia ON productos_sucursal;
CREATE TRIGGER trg_productos_sucursal_coherencia
  BEFORE INSERT OR UPDATE OF tenant_id, producto_id, sucursal_id ON productos_sucursal
  FOR EACH ROW EXECUTE FUNCTION productos_sucursal_coherencia();

-- ── §3 Quién escribe por REST (criterio de la guardia de 0133, en función propia) ──────────
-- Se llama a00_… para correr antes que los demás BEFORE (orden alfabético) y ver lo que mandó el
-- cliente. Solo actúa en escritura REST directa de un rol sujeto a RLS (_es_escritura_rest_directa,
-- 0133): RPCs, triggers en cascada, el pull de la caja (modo réplica) y los smokes pasan.
CREATE OR REPLACE FUNCTION guardia_productos_sucursal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() <> 1 OR NOT _es_escritura_rest_directa() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF NOT usuario_actual_tiene_permiso('config.productos') THEN
    RAISE EXCEPTION 'Tu rol no puede modificar el catálogo (productos_sucursal).'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Lo administran el dueño y el administrador desde el panel.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'El menú de una sucursal no se borra: vuelve la fila a lo general.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- El agotado por inventario y su motivo los escribe solo evaluar_alertas_stock (§8).
  IF TG_OP = 'INSERT' THEN
    NEW.agotado_automatico := false;
    NEW.motivo_agotado := NULL;
  ELSE
    NEW.agotado_automatico := OLD.agotado_automatico;
    NEW.motivo_agotado := OLD.motivo_agotado;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS a00_guardia_escritura_directa ON productos_sucursal;
CREATE TRIGGER a00_guardia_escritura_directa
  BEFORE INSERT OR UPDATE OR DELETE ON productos_sucursal
  FOR EACH ROW EXECUTE FUNCTION guardia_productos_sucursal();

-- ── §4 productos.agotado_* = «agotado en TODAS las sucursales» ─────────────────────────────
-- Para las cajas sin actualizar, que leen esas columnas. Falta de fila = no agotado. Un estado
-- 'AGOTADO' heredado de antes de 0151 pasa a ACTIVO: el agotado ya vive en las filas, y sin esto
-- quitar el último agotado violaría el CHECK estado_consistente (0007).
-- En la caja el pull aplica en modo réplica (sin triggers) y trae productos ya derivado de la nube.
CREATE OR REPLACE FUNCTION productos_sucursal_agotado_global()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n_suc    integer;
  v_n_manual integer;
  v_n_auto   integer;
  v_motivo   text;
  v_manual   boolean;
  v_auto     boolean;
BEGIN
  SELECT count(*) INTO v_n_suc
    FROM sucursales WHERE tenant_id = NEW.tenant_id AND activa AND deleted_at IS NULL;
  SELECT count(*) FILTER (WHERE ps.agotado_manual),
         count(*) FILTER (WHERE ps.agotado_automatico),
         max(ps.motivo_agotado) FILTER (WHERE ps.agotado_automatico)
    INTO v_n_manual, v_n_auto, v_motivo
    FROM productos_sucursal ps
    JOIN sucursales s ON s.id = ps.sucursal_id AND s.activa AND s.deleted_at IS NULL
   WHERE ps.producto_id = NEW.producto_id;
  v_manual := v_n_suc > 0 AND v_n_manual = v_n_suc;
  v_auto   := v_n_suc > 0 AND v_n_auto = v_n_suc;

  UPDATE productos p
     SET agotado_manual     = v_manual,
         agotado_automatico = v_auto,
         motivo_agotado     = CASE WHEN v_auto THEN v_motivo END,
         estado             = CASE WHEN p.estado = 'AGOTADO' THEN 'ACTIVO'::producto_estado ELSE p.estado END
   WHERE p.id = NEW.producto_id
     AND (p.agotado_manual IS DISTINCT FROM v_manual
          OR p.agotado_automatico IS DISTINCT FROM v_auto
          OR p.motivo_agotado IS DISTINCT FROM (CASE WHEN v_auto THEN v_motivo END)
          OR p.estado = 'AGOTADO');
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_productos_sucursal_agotado_global ON productos_sucursal;
CREATE TRIGGER trg_productos_sucursal_agotado_global
  AFTER INSERT OR UPDATE ON productos_sucursal
  FOR EACH ROW EXECUTE FUNCTION productos_sucursal_agotado_global();

-- ── §5 Lo que hoy está agotado sigue agotado, ahora en cada sucursal ────────────────────────
-- También corre en cada caja al actualizarse (aplica las mismas migraciones); el siguiente pull
-- le trae las filas de la nube, que son las mismas.
DO $$
DECLARE v_filas integer;
BEGIN
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, agotado_manual, agotado_automatico, motivo_agotado)
  SELECT p.tenant_id, p.id, s.id, p.agotado_manual, p.agotado_automatico,
         CASE WHEN p.agotado_automatico THEN p.motivo_agotado END
    FROM productos p
    JOIN sucursales s ON s.tenant_id = p.tenant_id AND s.deleted_at IS NULL
   WHERE p.deleted_at IS NULL AND (p.agotado_manual OR p.agotado_automatico)
  ON CONFLICT (producto_id, sucursal_id) DO NOTHING;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RAISE NOTICE '0151: % filas de agotado copiadas a productos_sucursal', v_filas;

  -- estado queda en ACTIVO/PAUSADO: el agotado ya vive en las filas.
  UPDATE productos SET estado = 'ACTIVO' WHERE estado = 'AGOTADO';
END $$;

-- ── §6 La regla: precio y disponibilidad de un producto en una sucursal ─────────────────────
-- Espejos en TS, con los mismos casos de prueba: aplicarSucursal (apps/pos/app/lib/catalogo-sucursal.ts)
-- y aplicarSucursalCarta (supabase/functions/_shared/delivery/menu-uber.ts). Si se toca una, se
-- tocan las tres.
CREATE OR REPLACE FUNCTION precio_producto_en_sucursal(p_producto uuid, p_sucursal uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(ps.precio_mxn, p.precio_base_mxn)
    FROM productos p
    LEFT JOIN productos_sucursal ps ON ps.producto_id = p.id AND ps.sucursal_id = p_sucursal
   WHERE p.id = p_producto;
$$;
COMMENT ON FUNCTION precio_producto_en_sucursal(uuid, uuid) IS
  'Precio de un producto en una sucursal: el de productos_sucursal si lo tiene, si no el general. ADR 0027.';

-- NULL = se vende. El orden importa: pausar es global y gana; luego "no se vende aquí"; luego el
-- agotado de esta sucursal (o un estado AGOTADO heredado que nadie ha vuelto a guardar).
CREATE OR REPLACE FUNCTION motivo_no_disponible_en_sucursal(p_producto uuid, p_sucursal uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN p.estado = 'PAUSADO' THEN 'PAUSADO'
           WHEN NOT COALESCE(ps.disponible, true) THEN 'NO_SE_VENDE'
           WHEN p.estado = 'AGOTADO'
             OR COALESCE(ps.agotado_manual, false)
             OR COALESCE(ps.agotado_automatico, false) THEN 'AGOTADO'
         END
    FROM productos p
    LEFT JOIN productos_sucursal ps ON ps.producto_id = p.id AND ps.sucursal_id = p_sucursal
   WHERE p.id = p_producto;
$$;
COMMENT ON FUNCTION motivo_no_disponible_en_sucursal(uuid, uuid) IS
  'NULL si el producto se vende en la sucursal; si no, PAUSADO, NO_SE_VENDE o AGOTADO. ADR 0027.';

REVOKE EXECUTE ON FUNCTION precio_producto_en_sucursal(uuid, uuid)      FROM public, anon;
REVOKE EXECUTE ON FUNCTION motivo_no_disponible_en_sucursal(uuid, uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION precio_producto_en_sucursal(uuid, uuid)      TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION motivo_no_disponible_en_sucursal(uuid, uuid) TO authenticated, service_role;

-- ── §7 Las RPCs de venta cobran el precio de la sucursal del ticket ─────────────────────────
-- Copias íntegras de 0111_combos.sql §2.2 y §2.3 con estos cambios:
--   · leen tickets.sucursal_id;
--   · el precio sale de precio_producto_en_sucursal (padre, componentes SUMA y la carta del prorrateo);
--   · el combo valida con motivo_no_disponible_en_sucursal (antes: estado/agotado globales);
--   · search_path fijo (0111 lo perdió al redefinirlas; 0044 se lo había puesto a todas).
-- agregar_item_a_ticket NO valida si se vende en la sucursal (invariante 7 del spec): la caja
-- filtra, y un pedido de Uber pagado no se pierde por una carta vieja.
CREATE OR REPLACE FUNCTION agregar_item_a_ticket(
  p_ticket_id      uuid,
  p_producto_id    uuid,
  p_cantidad       numeric(12,3),
  p_nota_cocina    text DEFAULT NULL,
  p_modificadores  jsonb DEFAULT '[]'::jsonb,
  p_client_id_local varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_tenant_id     uuid;
  v_sucursal_id   uuid;
  v_ticket_estado ticket_estado_fiscal;
  v_producto      record;
  v_item_id       uuid;
  v_modif         jsonb;
  v_opcion        record;
  v_next_orden    integer;
BEGIN
  SELECT tenant_id, sucursal_id, estado_fiscal INTO v_tenant_id, v_sucursal_id, v_ticket_estado
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

  SELECT p.id, p.nombre, p.codigo_interno AS sku,
         precio_producto_en_sucursal(p.id, v_sucursal_id) AS precio_mxn,
         p.tasa_iva, p.iva_incluido_en_precio, p.clave_sat, p.unidad_sat,
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
    v_producto.precio_mxn, v_producto.tasa_iva, v_producto.iva_incluido_en_precio,
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
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_tenant_id   uuid;
  v_sucursal_id uuid;
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
  v_motivo      text;
BEGIN
  SELECT tenant_id, sucursal_id, estado_fiscal INTO v_tenant_id, v_sucursal_id, v_estado FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;
  IF v_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'Solo se pueden agregar combos a tickets BORRADOR o ABIERTO (estado actual: %)', v_estado;
  END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_padre_id FROM ticket_items WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_padre_id; END IF;
  END IF;

  SELECT p.id, p.nombre, p.codigo_interno, p.tasa_iva, p.iva_incluido_en_precio,
         p.clave_sat, p.unidad_sat, p.modos_servicio_disponibles,
         precio_producto_en_sucursal(p.id, v_sucursal_id) AS precio_mxn,
         c.nombre AS categoria_nombre
    INTO v_combo
    FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id
   WHERE p.id = p_combo_producto_id AND p.tenant_id = v_tenant_id AND p.deleted_at IS NULL AND p.es_combo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'El producto % no es un combo de este negocio', p_combo_producto_id; END IF;
  -- 0151: pausado, apagado en esta sucursal o agotado en esta sucursal.
  IF motivo_no_disponible_en_sucursal(v_combo.id, v_sucursal_id) IS NOT NULL THEN
    RAISE EXCEPTION 'El combo "%" no está disponible', v_combo.nombre;
  END IF;

  v_precio := v_combo.precio_mxn;

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

  -- 2) Cada componente es opción válida de su slot; se acumula el precio (spec combos §4.3 y §4.5 paso 4)
  FOR v_comp IN SELECT * FROM jsonb_array_elements(p_componentes) LOOP
    SELECT g.id, g.nombre, g.modo_precio, g.categoria_id INTO v_grupo FROM combo_grupos g
     WHERE g.id = (v_comp->>'grupo_id')::uuid AND g.combo_producto_id = v_combo.id
       AND g.activo = true AND g.deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'El grupo % no pertenece al combo', v_comp->>'grupo_id'; END IF;

    SELECT p.id, p.nombre, precio_producto_en_sucursal(p.id, v_sucursal_id) AS precio_mxn,
           p.es_combo, p.categoria_id, p.visible_en_pos
      INTO v_prod FROM productos p
     WHERE p.id = (v_comp->>'producto_id')::uuid AND p.tenant_id = v_tenant_id AND p.deleted_at IS NULL;
    IF NOT FOUND OR v_prod.es_combo THEN
      RAISE EXCEPTION 'El producto % no es válido como componente', v_comp->>'producto_id';
    END IF;
    -- 0151: "está agotado o pausado" lo traduce la caja a PRODUCTO_AGOTADO y "no se vende en esta
    -- sucursal" a PRODUCTO_NO_SE_VENDE (desktop/src/delivery-espejo.mjs). No cambiar las frases.
    v_motivo := motivo_no_disponible_en_sucursal(v_prod.id, v_sucursal_id);
    IF v_motivo = 'NO_SE_VENDE' THEN
      RAISE EXCEPTION 'El producto "%" no se vende en esta sucursal', v_prod.nombre;
    ELSIF v_motivo IS NOT NULL THEN
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
    v_precio := v_precio + ((CASE WHEN v_grupo.modo_precio = 'SUMA_PRECIO_PRODUCTO' THEN v_prod.precio_mxn ELSE 0 END) + v_delta) * v_n;
    v_carta  := v_carta + v_prod.precio_mxn * v_n * p_cantidad;
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

  -- Un modificador PAGADO en la línea del padre se cobraría sin aparecer en ningún reporte (las
  -- tres vistas de ventas excluyen combo_rol = 'PADRE'). Ver la explicación completa en 0111 §2.3.
  IF p_modificadores IS NOT NULL AND jsonb_array_length(p_modificadores) > 0 THEN
    RAISE EXCEPTION 'Los modificadores en la línea del combo no se soportan todavía: se cobrarían sin llegar a los reportes de ventas. Ponlos en el componente que corresponda.';
  END IF;

  -- 4) Los hijos: por la RPC de siempre (snapshot + modificadores) y luego a precio 0 con prorrateo.
  -- agregar_item_a_ticket guarda el precio de la sucursal, el mismo que sumó v_carta.
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
    -- 0111 hallazgos 1 y 7: una fila EXISTENTE (idempotencia por client_id_local) que ya es parte
    -- de un combo —de otro o de este mismo— no se re-apadrina. Ver 0111 §2.3.
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
COMMENT ON FUNCTION agregar_combo_a_ticket IS 'Inserta un combo: padre (cobra el precio calculado aquí, con los precios de la sucursal del ticket) + hijos a precio 0 con prorrateo informativo. Valida slots, pertenencia y disponibilidad en la sucursal. Idempotente por client_id_local. Rechaza p_modificadores en la línea del padre. ADR 0015, ADR 0027.';
