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
