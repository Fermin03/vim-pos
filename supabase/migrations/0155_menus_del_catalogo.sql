-- ============================================================================
-- 0155 — Menús del catálogo (ADR 0029). Ajusta ADR 0027 (0152): no cambia lo que lee la caja,
-- cambia quién lo escribe.
--
-- El menú por sucursal (0152) se capturaba como excepciones sueltas por producto y sucursal, y el
-- dueño no lo encontraba. Ahora hay MENÚS con nombre: el dueño crea «Menú Norte», lo asigna a una o
-- varias sucursales y lo administra desde el Catálogo.
--
-- QUÉ ES CADA COSA
--   · El menú GENERAL es el catálogo de siempre: precio = productos.precio_base_mxn, «se vende» =
--     productos.en_menu_general. No tiene fila en `menus`. sucursales.menu_id NULL = usa el General.
--   · Un menú PROPIO es completo e independiente: una fila en menu_productos por cada producto,
--     con su propio disponible y su propio precio (nunca nulo). Lo que pase después en el General
--     no lo cambia.
--   · productos_sucursal (0152) es LO PROYECTADO: lo que leen la caja, las RPCs de venta y Uber.
--     disponible y precio_mxn los escribe solo proyectar_menu(); agotado_* sigue siendo de la sucursal.
--
-- Por eso esta migración no toca la caja ni las funciones de venta, y no pide instalador.
--
-- Diseño: docs/superpowers/specs/2026-10-05-menus-del-catalogo-design.md
-- ============================================================================

-- ── §1 Tablas y columnas ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menus (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  nombre      varchar(80) NOT NULL CHECK (btrim(nombre) <> ''),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Baja lógica: eliminar_menu() (§7) devuelve sus sucursales al General y sella esto.
  deleted_at  timestamptz NULL
);
COMMENT ON TABLE menus IS 'Menús propios del catálogo (ADR 0029). El General no tiene fila: es el catálogo base.';
CREATE UNIQUE INDEX IF NOT EXISTS menus_nombre_unico ON menus (tenant_id, lower(nombre)) WHERE deleted_at IS NULL;

ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS menu_id uuid NULL REFERENCES menus(id) ON DELETE SET NULL;
COMMENT ON COLUMN sucursales.menu_id IS 'Menú propio que usa la sucursal. NULL = el General. Solo lo mueven crear_menu/actualizar_menu/eliminar_menu.';
CREATE INDEX IF NOT EXISTS idx_sucursales_menu ON sucursales (menu_id) WHERE menu_id IS NOT NULL;

ALTER TABLE productos ADD COLUMN IF NOT EXISTS en_menu_general boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN productos.en_menu_general IS '«Se vende» en el menú General. false = solo existe en los menús propios que lo enciendan.';

CREATE TABLE IF NOT EXISTS menu_productos (
  menu_id      uuid NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  producto_id  uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  disponible   boolean NOT NULL DEFAULT true,
  -- Nunca nulo: el menú propio no hereda el precio del General (spec §3, invariante 3).
  precio_mxn   numeric(12,2) NOT NULL CHECK (precio_mxn >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (menu_id, producto_id)
);
COMMENT ON TABLE menu_productos IS 'Contenido de un menú propio: una fila por producto, con su disponible y su precio. Se proyecta a productos_sucursal.';
CREATE INDEX IF NOT EXISTS idx_menu_productos_producto ON menu_productos (producto_id);

ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_productos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON menus, menu_productos TO authenticated, service_role;

DO $$ BEGIN
  CREATE POLICY menus_tenant ON menus FOR ALL
    USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY menu_productos_tenant ON menu_productos FOR ALL
    USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_menus_updated_at ON menus;
CREATE TRIGGER trg_menus_updated_at BEFORE UPDATE ON menus
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_menu_productos_updated_at ON menu_productos;
CREATE TRIGGER trg_menu_productos_updated_at BEFORE UPDATE ON menu_productos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── §2 Coherencia: el negocio de cada fila sale de su menú ───────────────────
-- Bajo RLS, un menú o un producto de otro negocio no se ven: quedan NULL y se rechaza.
CREATE OR REPLACE FUNCTION menu_productos_coherencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_menu     uuid;
  v_tenant_producto uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_menu     FROM menus     WHERE id = NEW.menu_id;
  SELECT tenant_id INTO v_tenant_producto FROM productos WHERE id = NEW.producto_id;
  IF v_tenant_menu IS NULL OR v_tenant_producto IS NULL OR v_tenant_menu <> v_tenant_producto THEN
    RAISE EXCEPTION 'El menú y el producto tienen que ser del mismo negocio.' USING ERRCODE = '23514';
  END IF;
  NEW.tenant_id := v_tenant_menu;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_menu_productos_coherencia ON menu_productos;
CREATE TRIGGER trg_menu_productos_coherencia
  BEFORE INSERT OR UPDATE OF tenant_id, menu_id, producto_id ON menu_productos
  FOR EACH ROW EXECUTE FUNCTION menu_productos_coherencia();

-- Una sucursal solo usa un menú VIVO de su mismo negocio, y por REST directo no se cambia: lo
-- mueven las RPCs de §7 (así un cajero —o un PATCH suelto— no cambia el menú de su sucursal).
CREATE OR REPLACE FUNCTION sucursales_menu_coherencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.menu_id IS NOT DISTINCT FROM OLD.menu_id THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.menu_id IS NULL THEN RETURN NEW; END IF;
  IF pg_trigger_depth() = 1 AND _es_escritura_rest_directa() THEN
    RAISE EXCEPTION 'El menú de una sucursal se cambia desde Catálogo, no escribiendo la sucursal.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.menu_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM menus m WHERE m.id = NEW.menu_id AND m.tenant_id = NEW.tenant_id AND m.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Ese menú no existe en este negocio.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sucursales_menu_coherencia ON sucursales;
CREATE TRIGGER trg_sucursales_menu_coherencia
  BEFORE INSERT OR UPDATE OF menu_id ON sucursales
  FOR EACH ROW EXECUTE FUNCTION sucursales_menu_coherencia();

-- ── §3 Quién escribe por REST ────────────────────────────────────────────────
-- Mismo criterio que 0133 y 0152 §3: solo actúa en escritura REST directa de un rol sujeto a RLS.
-- `menus`: nada por REST (crear, renombrar y borrar tocan varias tablas: van por RPC, §7).
-- `menu_productos`: solo UPDATE de disponible y precio_mxn, con config.productos. Las filas las
-- crean crear_menu() y el trigger de producto nuevo (§6), no el cliente.
CREATE OR REPLACE FUNCTION guardia_menus()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() <> 1 OR NOT _es_escritura_rest_directa() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_TABLE_NAME = 'menus' OR TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Los menús se crean, se editan y se borran desde Catálogo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT usuario_actual_tiene_permiso('config.productos') THEN
    RAISE EXCEPTION 'Tu rol no puede modificar el catálogo (menu_productos).'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Lo administran el dueño y el administrador desde el panel.';
  END IF;
  NEW.menu_id     := OLD.menu_id;
  NEW.producto_id := OLD.producto_id;
  NEW.tenant_id   := OLD.tenant_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a00_guardia_escritura_directa ON menus;
CREATE TRIGGER a00_guardia_escritura_directa
  BEFORE INSERT OR UPDATE OR DELETE ON menus
  FOR EACH ROW EXECUTE FUNCTION guardia_menus();
DROP TRIGGER IF EXISTS a00_guardia_escritura_directa ON menu_productos;
CREATE TRIGGER a00_guardia_escritura_directa
  BEFORE INSERT OR UPDATE OR DELETE ON menu_productos
  FOR EACH ROW EXECUTE FUNCTION guardia_menus();

-- productos_sucursal (0152 §3): copia íntegra de guardia_productos_sucursal con UN cambio — por
-- REST ya tampoco se escriben disponible ni precio_mxn: son lo proyectado desde el menú de la
-- sucursal. En INSERT se ponen en lo que el menú dice hoy; en UPDATE se conserva lo que había.
-- Por REST solo queda agotado_manual.
CREATE OR REPLACE FUNCTION guardia_productos_sucursal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_menu uuid;
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
  -- El agotado por inventario y su motivo los escribe solo evaluar_alertas_stock (0152 §8).
  IF TG_OP = 'INSERT' THEN
    NEW.agotado_automatico := false;
    NEW.motivo_agotado := NULL;
    -- 0155: disponible y precio salen del menú de la sucursal, no del cliente.
    SELECT s.menu_id INTO v_menu FROM sucursales s WHERE s.id = NEW.sucursal_id;
    IF v_menu IS NULL THEN
      SELECT p.en_menu_general, NULL::numeric INTO NEW.disponible, NEW.precio_mxn
        FROM productos p WHERE p.id = NEW.producto_id;
    ELSE
      SELECT mp.disponible, mp.precio_mxn INTO NEW.disponible, NEW.precio_mxn
        FROM menu_productos mp WHERE mp.menu_id = v_menu AND mp.producto_id = NEW.producto_id;
    END IF;
    NEW.disponible := COALESCE(NEW.disponible, true);
  ELSE
    NEW.agotado_automatico := OLD.agotado_automatico;
    NEW.motivo_agotado := OLD.motivo_agotado;
    NEW.disponible := OLD.disponible;
    NEW.precio_mxn := OLD.precio_mxn;
  END IF;
  RETURN NEW;
END $$;

-- ── §4 La proyección: lo único que decide lo que lee la caja ─────────────────
-- General (menu_id nulo): disponible = productos.en_menu_general, precio_mxn = NULL (la venta cobra
-- precio_base_mxn). Menú propio: lo que diga menu_productos. Nunca toca agotado_*, nunca borra.
-- Para una sucursal del General no crea filas que quedarían por defecto (el menú sigue escaso,
-- como en 0152); las que ya existen sí vuelven a lo general.
CREATE OR REPLACE FUNCTION proyectar_menu(p_sucursal uuid, p_producto uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_menu   uuid;
  v_tenant uuid;
BEGIN
  SELECT menu_id, tenant_id INTO v_menu, v_tenant FROM sucursales WHERE id = p_sucursal;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_menu IS NULL THEN
    UPDATE productos_sucursal ps
       SET disponible = p.en_menu_general,
           precio_mxn = NULL
      FROM productos p
     WHERE p.id = ps.producto_id
       AND ps.sucursal_id = p_sucursal
       AND (p_producto IS NULL OR ps.producto_id = p_producto)
       AND (ps.disponible IS DISTINCT FROM p.en_menu_general OR ps.precio_mxn IS NOT NULL);

    INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, disponible, precio_mxn)
    SELECT p.tenant_id, p.id, p_sucursal, false, NULL
      FROM productos p
     WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL AND NOT p.en_menu_general
       AND (p_producto IS NULL OR p.id = p_producto)
    ON CONFLICT (producto_id, sucursal_id) DO NOTHING;
  ELSE
    INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, disponible, precio_mxn)
    SELECT mp.tenant_id, mp.producto_id, p_sucursal, mp.disponible, mp.precio_mxn
      FROM menu_productos mp
     WHERE mp.menu_id = v_menu
       AND (p_producto IS NULL OR mp.producto_id = p_producto)
    ON CONFLICT (producto_id, sucursal_id) DO UPDATE
      SET disponible = EXCLUDED.disponible,
          precio_mxn = EXCLUDED.precio_mxn
      WHERE productos_sucursal.disponible IS DISTINCT FROM EXCLUDED.disponible
         OR productos_sucursal.precio_mxn IS DISTINCT FROM EXCLUDED.precio_mxn;
  END IF;
END $$;
COMMENT ON FUNCTION proyectar_menu(uuid, uuid) IS
  'Copia a productos_sucursal (disponible, precio_mxn) lo que dice el menú de la sucursal. Único escritor de esas dos columnas. ADR 0029.';
REVOKE EXECUTE ON FUNCTION proyectar_menu(uuid, uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION proyectar_menu(uuid, uuid) TO authenticated, service_role;

-- ── §5 Cuándo se proyecta ────────────────────────────────────────────────────
-- En la caja el pull aplica en modo réplica (sin triggers) y trae productos_sucursal ya proyectado.
CREATE OR REPLACE FUNCTION menu_productos_proyectar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM proyectar_menu(s.id, NEW.producto_id) FROM sucursales s WHERE s.menu_id = NEW.menu_id;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_menu_productos_proyectar ON menu_productos;
CREATE TRIGGER trg_menu_productos_proyectar
  AFTER INSERT OR UPDATE OF disponible, precio_mxn ON menu_productos
  FOR EACH ROW EXECUTE FUNCTION menu_productos_proyectar();

CREATE OR REPLACE FUNCTION sucursales_menu_proyectar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM proyectar_menu(NEW.id);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_sucursales_menu_proyectar ON sucursales;
CREATE TRIGGER trg_sucursales_menu_proyectar
  AFTER UPDATE OF menu_id ON sucursales
  FOR EACH ROW WHEN (OLD.menu_id IS DISTINCT FROM NEW.menu_id)
  EXECUTE FUNCTION sucursales_menu_proyectar();

-- Una sucursal NUEVA también se proyecta. 0152 lee «sin fila» como «se vende al precio base», así
-- que una sucursal recién creada en el General vendería lo que el General tiene apagado (incluido
-- lo que es exclusivo de un menú propio). Al nacer recibe las filas de lo apagado; si nace ya con
-- menú propio, el menú completo.
DROP TRIGGER IF EXISTS trg_sucursales_nueva_proyectar ON sucursales;
CREATE TRIGGER trg_sucursales_nueva_proyectar
  AFTER INSERT ON sucursales
  FOR EACH ROW EXECUTE FUNCTION sucursales_menu_proyectar();

-- productos.precio_base_mxn NO dispara nada: las sucursales del General ya lo leen (precio nulo) y
-- los menús propios no lo siguen. Solo en_menu_general se proyecta.
--
-- Se proyecta a TODAS las sucursales del General, también a las inactivas y a las dadas de baja
-- (aquí y en §6 no se filtra por deleted_at ni por activa): así una sucursal que se restaura o se
-- reactiva ya trae al día lo que el General apagó mientras no estaba, sin un trigger aparte para
-- «volvió». Las de menú propio ya se mantenían igual (menu_productos_proyectar tampoco filtra).
CREATE OR REPLACE FUNCTION productos_menu_general_proyectar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM proyectar_menu(s.id, NEW.id)
     FROM sucursales s WHERE s.tenant_id = NEW.tenant_id AND s.menu_id IS NULL;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_productos_menu_general_proyectar ON productos;
CREATE TRIGGER trg_productos_menu_general_proyectar
  AFTER UPDATE OF en_menu_general ON productos
  FOR EACH ROW WHEN (OLD.en_menu_general IS DISTINCT FROM NEW.en_menu_general)
  EXECUTE FUNCTION productos_menu_general_proyectar();

-- ── §6 Producto nuevo: entra a cada menú vivo ────────────────────────────────
-- Nace con disponible = en_menu_general y al precio con que nació. Un producto «solo de Menú
-- Norte» se inserta con en_menu_general = false (apagado en todos) y el panel enciende su fila en
-- ese menú. Además, apagado en el General se proyecta a las sucursales del General.
CREATE OR REPLACE FUNCTION productos_nuevo_en_menus()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO menu_productos (menu_id, producto_id, tenant_id, disponible, precio_mxn)
  SELECT m.id, NEW.id, NEW.tenant_id, NEW.en_menu_general, NEW.precio_base_mxn
    FROM menus m WHERE m.tenant_id = NEW.tenant_id AND m.deleted_at IS NULL
  ON CONFLICT (menu_id, producto_id) DO NOTHING;
  IF NOT NEW.en_menu_general THEN
    PERFORM proyectar_menu(s.id, NEW.id)
       FROM sucursales s WHERE s.tenant_id = NEW.tenant_id AND s.menu_id IS NULL;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_productos_nuevo_en_menus ON productos;
CREATE TRIGGER trg_productos_nuevo_en_menus
  AFTER INSERT ON productos
  FOR EACH ROW EXECUTE FUNCTION productos_nuevo_en_menus();

-- ── §7 Crear, editar y eliminar un menú ──────────────────────────────────────
-- Por RPC porque cada una toca varias tablas y tiene que ser una sola transacción. Corren bajo RLS
-- (INVOKER): el negocio lo acota la política; el permiso se comprueba aquí porque la guardia de
-- REST no ve las RPCs.
CREATE OR REPLACE FUNCTION _menu_exigir_permiso()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE v_tenant uuid := current_tenant_id();
BEGIN
  IF v_tenant IS NULL OR NOT usuario_actual_tiene_permiso('config.productos') THEN
    RAISE EXCEPTION 'Tu rol no puede modificar el catálogo (menús).'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Lo administran el dueño y el administrador desde el panel.';
  END IF;
  RETURN v_tenant;
END $$;

-- Todas las sucursales pedidas tienen que ser del negocio, activas y vivas.
CREATE OR REPLACE FUNCTION _menu_validar_sucursales(p_tenant uuid, p_sucursales uuid[])
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM unnest(coalesce(p_sucursales, ARRAY[]::uuid[])) AS x(id)
        WHERE NOT EXISTS (SELECT 1 FROM sucursales s
                           WHERE s.id = x.id AND s.tenant_id = p_tenant AND s.activa AND s.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'Alguna sucursal no existe o no está activa.' USING ERRCODE = '22023';
  END IF;
END $$;

-- El nombre ya limpio, o el motivo por el que no sirve. «General» (con cualquier mayúscula, acento
-- o espacio, y también «Menú General») es el nombre del catálogo base: un menú propio que se llame
-- igual haría dos pastillas indistinguibles en el panel.
CREATE OR REPLACE FUNCTION _menu_nombre_limpio(p_nombre text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
BEGIN
  IF v_nombre = '' THEN
    RAISE EXCEPTION 'Ponle nombre al menú.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_nombre) > 80 THEN
    RAISE EXCEPTION 'El nombre del menú no puede pasar de 80 letras.' USING ERRCODE = '22023';
  END IF;
  IF translate(lower(v_nombre), 'áéíóú', 'aeiou') IN ('general', 'menu general') THEN
    RAISE EXCEPTION 'Ese nombre es el del menú General. Elige otro.' USING ERRCODE = '22023';
  END IF;
  RETURN v_nombre;
END $$;

CREATE OR REPLACE FUNCTION crear_menu(p_nombre text, p_sucursales uuid[])
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := _menu_exigir_permiso();
  v_nombre text := _menu_nombre_limpio(p_nombre);
  v_menu   uuid;
BEGIN
  IF coalesce(cardinality(p_sucursales), 0) = 0 THEN
    RAISE EXCEPTION 'Elige al menos una sucursal para el menú.' USING ERRCODE = '22023';
  END IF;
  PERFORM _menu_validar_sucursales(v_tenant, p_sucursales);

  BEGIN
    INSERT INTO menus (tenant_id, nombre) VALUES (v_tenant, v_nombre) RETURNING id INTO v_menu;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya hay un menú con ese nombre.' USING ERRCODE = '23505';
  END;

  -- Arranca como copia del General. Aún no tiene sucursales: nada se proyecta todavía.
  INSERT INTO menu_productos (menu_id, producto_id, tenant_id, disponible, precio_mxn)
  SELECT v_menu, p.id, v_tenant, p.en_menu_general, p.precio_base_mxn
    FROM productos p WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL;

  -- Al asignar las sucursales, su trigger proyecta el menú completo a cada una.
  UPDATE sucursales SET menu_id = v_menu WHERE tenant_id = v_tenant AND id = ANY (p_sucursales);
  RETURN v_menu;
END $$;

CREATE OR REPLACE FUNCTION actualizar_menu(p_menu uuid, p_nombre text, p_sucursales uuid[])
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant     uuid := _menu_exigir_permiso();
  v_nombre     text;
  v_sucursales uuid[] := coalesce(p_sucursales, ARRAY[]::uuid[]);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM menus WHERE id = p_menu AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Ese menú ya no existe.' USING ERRCODE = '22023';
  END IF;
  v_nombre := _menu_nombre_limpio(p_nombre);
  PERFORM _menu_validar_sucursales(v_tenant, v_sucursales);

  BEGIN
    UPDATE menus SET nombre = v_nombre WHERE id = p_menu AND nombre IS DISTINCT FROM v_nombre;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya hay un menú con ese nombre.' USING ERRCODE = '23505';
  END;

  -- El menú queda aplicando EXACTAMENTE a esas sucursales: las que sobran vuelven al General.
  -- Solo entre las ACTIVAS y vivas: el panel no lista las demás, así que no vienen en p_sucursales
  -- y renombrar el menú le quitaría el suyo a una sucursal desactivada. Esas lo conservan.
  UPDATE sucursales SET menu_id = NULL
   WHERE tenant_id = v_tenant AND menu_id = p_menu AND activa AND deleted_at IS NULL
     AND NOT (id = ANY (v_sucursales));
  UPDATE sucursales SET menu_id = p_menu
   WHERE tenant_id = v_tenant AND id = ANY (v_sucursales) AND menu_id IS DISTINCT FROM p_menu;
END $$;

CREATE OR REPLACE FUNCTION eliminar_menu(p_menu uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := _menu_exigir_permiso();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM menus WHERE id = p_menu AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Ese menú ya no existe.' USING ERRCODE = '22023';
  END IF;
  -- Primero las sucursales vuelven al General (su trigger revierte lo proyectado); luego la baja.
  UPDATE sucursales SET menu_id = NULL WHERE tenant_id = v_tenant AND menu_id = p_menu;
  UPDATE menus SET deleted_at = now() WHERE id = p_menu;
END $$;

COMMENT ON FUNCTION crear_menu(text, uuid[]) IS 'Crea un menú propio como copia del General y lo asigna a las sucursales. Exige config.productos. ADR 0029.';
COMMENT ON FUNCTION actualizar_menu(uuid, text, uuid[]) IS 'Renombra el menú y lo deja aplicando exactamente a esas sucursales (las demás activas vuelven al General; una desactivada conserva el suyo). ADR 0029.';
COMMENT ON FUNCTION eliminar_menu(uuid) IS 'Baja lógica del menú; sus sucursales vuelven al General. ADR 0029.';

-- ── §8 Permisos de ejecución ─────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION crear_menu(text, uuid[])            FROM public, anon;
REVOKE EXECUTE ON FUNCTION actualizar_menu(uuid, text, uuid[]) FROM public, anon;
REVOKE EXECUTE ON FUNCTION eliminar_menu(uuid)                 FROM public, anon;
REVOKE EXECUTE ON FUNCTION _menu_exigir_permiso()              FROM public, anon;
REVOKE EXECUTE ON FUNCTION _menu_validar_sucursales(uuid, uuid[]) FROM public, anon;
REVOKE EXECUTE ON FUNCTION _menu_nombre_limpio(text)           FROM public, anon;
GRANT  EXECUTE ON FUNCTION crear_menu(text, uuid[])            TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION actualizar_menu(uuid, text, uuid[]) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION eliminar_menu(uuid)                 TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION _menu_exigir_permiso()              TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION _menu_validar_sucursales(uuid, uuid[]) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION _menu_nombre_limpio(text)           TO authenticated, service_role;
