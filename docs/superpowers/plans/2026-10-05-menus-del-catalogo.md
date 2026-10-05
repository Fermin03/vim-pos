# Menús del catálogo — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendada) o
> superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas
> (`- [ ]`) para el seguimiento.

**Meta:** que el dueño cree menús con nombre («Nuevo menú»), los asigne a sucursales y los
administre desde un selector arriba de las pestañas del Catálogo, con precios independientes por
menú y sin comparar precios.

**Arquitectura:** el menú es un concepto de quien administra. Dos tablas nuevas (`menus`,
`menu_productos`) más `sucursales.menu_id` y `productos.en_menu_general` son la fuente de verdad;
una función (`proyectar_menu`) y sus triggers copian a `productos_sucursal` lo que el menú de cada
sucursal dice. La caja, las RPCs de venta, la carta de Uber y el sync siguen leyendo
`productos_sucursal` (0152) sin cambios: **no hay instalador nuevo**.

**Stack:** Postgres/Supabase (plpgsql, RLS, pgTAP), Next.js + React (apps/admin, vitest).

**Spec:** [`docs/superpowers/specs/2026-10-05-menus-del-catalogo-design.md`](../specs/2026-10-05-menus-del-catalogo-design.md)
— léelo antes de empezar; este plan argumenta desde él.

## Global Constraints

- Todo se trabaja en `vim-pos/`, rama `feat/menus-del-catalogo` (ya existe, con el spec).
- **Números:** migración `0155_menus_del_catalogo.sql`, pgTAP `0037_menus_del_catalogo.test.sql`,
  ADR `0029`. **Antes de crear cada archivo**, `git fetch origin` y comprueba que el número siga
  libre en `origin/main` (otras sesiones mezclan a diario). Si está tomado, usa el siguiente libre
  y dilo en tu reporte.
- **Una sola migración**; las tareas 1 y 2 la completan en orden (§1–§5, luego §6–§8). No se aplica a
  producción hasta la tarea 10, con el OK de Fermín.
- **No se toca** nada de `apps/pos`, `desktop/`, `supabase/functions/`, ni las funciones de venta de
  0152 (`precio_producto_en_sucursal`, `motivo_no_disponible_en_sucursal`, `agregar_*_a_ticket`,
  `evaluar_alertas_stock`, `sync_pull_snapshot`, `catalogo_version`). La única función de 0152 que
  se redefine es `guardia_productos_sucursal` (copia íntegra + lo que dice la tarea 1).
- **Invariantes del spec (§3)** que toda tarea respeta: una sucursal usa exactamente un menú
  (`menu_id` nulo = General); el General es el catálogo de siempre (`precio_base_mxn`,
  `en_menu_general`); un menú propio tiene una fila por producto con `precio_mxn` **no nulo** e
  independiente del General; `productos_sucursal.disponible`/`precio_mxn` solo los escribe la
  proyección; las filas de `productos_sucursal` no se borran; **ninguna pantalla enseña el precio
  de otro menú junto al del menú elegido**.
- Español en el dominio, SQL en `snake_case`, archivos `kebab-case`, componentes `PascalCase`. Sin
  `any`. Dinero en `numeric(12,2)`. RLS en toda tabla con `tenant_id`; nada de `service_role` en apps/admin.
- Funciones SQL nuevas llevan `SET search_path = public, pg_temp`.
- Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Pruebas** (desde `vim-pos/`):
  - Smokes: `cd desktop && node scripts/smokes.mjs <archivo.sql>` (Postgres embebido recién
    sembrado; mata los `postgres.exe` del checkout: no lo corras con otro backend del escritorio arriba).
  - pgTAP: `supabase db reset` y `supabase test db` (el stack local ya corre en Docker; Fermín
    autorizó resetear la base local).
  - Admin: `pnpm --filter @vim/admin test` y `pnpm --filter @vim/admin typecheck`. **Nunca `next build`.**
- **UI del admin:** carga la skill `emil-design-eng` y lee `docs/diseno/admin.md` y
  `docs/diseno/nucleo.md` antes de escribir clases. Reusa las clases de las páginas del catálogo;
  no inventes colores. Controles de 36–40 px en escritorio, números a la derecha con `tabular-nums`.
  Los servidores de desarrollo se levantan con `preview_start` (config `admin` de
  `.claude/launch.json`), nunca con Bash.
- **Fixture de la semilla** (`supabase/seed.sql`): negocio `99999999-0000-0000-0000-0000000000aa`,
  sucursal León Centro `…00bb`, Caja 01 `…00cc`, María (CAJERO) `…0001`, dueño `…00e1`, categoría
  Hamburguesas `a0000000-0000-0000-0000-0000000000c1`, Hamburguesa Clásica $120
  `b0000000-0000-0000-0000-0000000000f1`, Papas Gajo $55 `b0000000-0000-0000-0000-0000000000f2`. El
  plan del seed permite una sucursal: para abrir otra, `tenant_limites.max_sucursales = 5`.

---

### Task 1: Tablas, guardias y la proyección a `productos_sucursal`

**Files:**
- Create: `supabase/migrations/0155_menus_del_catalogo.sql` (§1–§5)
- Create: `supabase/tests/0037_menus_del_catalogo.test.sql`

**Interfaces:**
- Produces (SQL):
  - `menus(id, tenant_id, nombre, created_at, updated_at, deleted_at)`
  - `menu_productos(menu_id, producto_id, tenant_id, disponible, precio_mxn NOT NULL, created_at, updated_at)`, PK `(menu_id, producto_id)`
  - `sucursales.menu_id uuid NULL`, `productos.en_menu_general boolean NOT NULL DEFAULT true`
  - `proyectar_menu(p_sucursal uuid, p_producto uuid DEFAULT NULL) RETURNS void`
  - Por REST: `menus` no se escribe (solo RPC, tarea 2); `menu_productos` solo UPDATE de
    `disponible`/`precio_mxn` con `config.productos`; `sucursales.menu_id` no se cambia;
    `productos_sucursal.disponible`/`precio_mxn` no se cambian.

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/0037_menus_del_catalogo.test.sql`:

```sql
-- ============================================================================
-- 0155 · menús del catálogo: tablas, quién las escribe y la proyección a productos_sucursal
-- (lo que lee la caja). Las RPCs crear/actualizar/eliminar se prueban al final (tarea 2).
-- ============================================================================
begin;
select plan(19);

\set t         '99999999-0000-0000-0000-0000000000aa'
\set centro    '99999999-0000-0000-0000-0000000000bb'
\set norte     '37373737-0000-0000-0000-0000000000b2'
\set cajero    '99999999-0000-0000-0000-000000000001'
\set dueno     '99999999-0000-0000-0000-0000000000e1'
\set clas      'b0000000-0000-0000-0000-0000000000f1'
\set papas     'b0000000-0000-0000-0000-0000000000f2'
\set menu      '37373737-0000-0000-0000-0000000000a1'
\set otro      '37373737-0000-0000-0000-0000000000aa'
\set menu_otro '37373737-0000-0000-0000-0000000000a9'

-- SETUP (superusuario, sin request.path: las guardias no actúan)
insert into tenant_limites (tenant_id, max_sucursales) values (:'t', 5)
  on conflict (tenant_id) do update set max_sucursales = 5;
insert into sucursales (id, tenant_id, codigo, nombre) values (:'norte', :'t', 'KN', 'León Norte');
insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  values (:'otro', 'tenant-0037', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
insert into menus (id, tenant_id, nombre) values (:'menu', :'t', 'Menú Norte'), (:'menu_otro', :'otro', 'Ajeno');
insert into menu_productos (menu_id, producto_id, tenant_id, disponible, precio_mxn) values
  (:'menu', :'clas', :'t', true, 135), (:'menu', :'papas', :'t', false, 55);

-- 1) Estructura.
select has_table('public', 'menus', 'existe menus');
select col_is_pk('public', 'menu_productos', array['menu_id', 'producto_id'], 'la llave de menu_productos es (menú, producto)');
select col_not_null('public', 'menu_productos', 'precio_mxn', 'un menú propio siempre tiene precio');
select col_default_is('public', 'productos', 'en_menu_general', 'true', 'un producto nace en el menú General');

-- 2) Asignar el menú a Norte proyecta TODO el menú a productos_sucursal.
update sucursales set menu_id = :'menu' where id = :'norte';
select is((select precio_mxn from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), 135.00::numeric,
  'Norte cobra el precio de su menú');
select is((select disponible from productos_sucursal where producto_id = :'papas' and sucursal_id = :'norte'), false,
  'lo apagado en el menú no se vende en Norte');
select is((select count(*)::int from productos_sucursal where sucursal_id = :'centro'), 0,
  'Centro sigue en el General: sin filas');

-- 3) Cambiar una fila del menú se proyecta sola.
update menu_productos set precio_mxn = 140 where menu_id = :'menu' and producto_id = :'clas';
select is((select precio_mxn from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), 140.00::numeric,
  'cambiar el precio en el menú llega a la sucursal');

-- 4) Independencia: subir el precio en el General no toca el menú propio ni lo que cobra Norte.
update productos set precio_base_mxn = 125 where id = :'clas';
select is((select precio_mxn from menu_productos where menu_id = :'menu' and producto_id = :'clas'), 140.00::numeric,
  'el menú propio no sigue al General');
select is(precio_producto_en_sucursal(:'clas', :'norte'), 140.00::numeric, 'Norte sigue cobrando su precio');
select is(precio_producto_en_sucursal(:'clas', :'centro'), 125.00::numeric, 'Centro cobra el del General');

-- 5) Apagar en el General se proyecta a las sucursales del General, no a las de menú propio.
update productos set en_menu_general = false where id = :'clas';
select is(motivo_no_disponible_en_sucursal(:'clas', :'centro'), 'NO_SE_VENDE', 'apagado en el General: Centro no lo vende');
select is(motivo_no_disponible_en_sucursal(:'clas', :'norte'), null::text, 'Norte, con menú propio, lo sigue vendiendo');
update productos set en_menu_general = true where id = :'clas';

-- 6) La proyección no toca el agotado de la sucursal.
update productos_sucursal set agotado_manual = true where producto_id = :'clas' and sucursal_id = :'norte';
update menu_productos set precio_mxn = 141 where menu_id = :'menu' and producto_id = :'clas';
select is((select agotado_manual from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), true,
  'proyectar no borra el agotado de la sucursal');

-- 7) Volver al General: las filas regresan a lo general (no se borran).
update sucursales set menu_id = null where id = :'norte';
select is((select precio_mxn from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), null::numeric,
  'de vuelta en el General, el precio propio desaparece');
select is((select disponible from productos_sucursal where producto_id = :'papas' and sucursal_id = :'norte'), true,
  'y lo que estaba apagado en el menú vuelve a venderse');

-- 8) No se asigna el menú de otro negocio.
select throws_ok(
  format($$ update sucursales set menu_id = %L where id = %L $$, :'menu_otro', :'norte'),
  '23514', null, 'una sucursal no usa el menú de otro negocio');

-- Como el dueño, por REST (el panel).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);
select set_config('request.path', '/sucursales', true);

-- 9) Ni el dueño cambia el menú de una sucursal por REST directo (solo las RPCs).
select throws_ok(
  format($$ update sucursales set menu_id = %L where id = %L $$, :'menu', :'norte'),
  '42501', null, 'el menú de una sucursal no se cambia por REST');

-- 10) Ni escribe por REST lo que proyecta el menú.
select set_config('request.path', '/productos_sucursal', true);
update productos_sucursal set precio_mxn = 1, disponible = false where producto_id = :'clas' and sucursal_id = :'norte';
select is((select precio_mxn from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), null::numeric,
  'por REST no se escribe el precio proyectado');

reset role;
select * from finish();
rollback;
```

- [ ] **Step 2: Run it and see it fail**

```bash
supabase db reset
supabase test db
```

Expected: `0037_menus_del_catalogo.test.sql` falla (la tabla `menus` no existe). Las demás, en verde.

- [ ] **Step 3: Write §1–§5 of the migration**

`supabase/migrations/0155_menus_del_catalogo.sql`:

```sql
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

-- productos.precio_base_mxn NO dispara nada: las sucursales del General ya lo leen (precio nulo) y
-- los menús propios no lo siguen. Solo en_menu_general se proyecta.
CREATE OR REPLACE FUNCTION productos_menu_general_proyectar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM proyectar_menu(s.id, NEW.id)
     FROM sucursales s WHERE s.tenant_id = NEW.tenant_id AND s.menu_id IS NULL AND s.deleted_at IS NULL;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_productos_menu_general_proyectar ON productos;
CREATE TRIGGER trg_productos_menu_general_proyectar
  AFTER UPDATE OF en_menu_general ON productos
  FOR EACH ROW WHEN (OLD.en_menu_general IS DISTINCT FROM NEW.en_menu_general)
  EXECUTE FUNCTION productos_menu_general_proyectar();
```

- [ ] **Step 4: Run and see it pass**

```bash
supabase db reset
supabase test db
```

Expected: `0037 .. ok` (19 pruebas) y todas las demás en verde, en particular `0036_menu_por_sucursal`
(su prueba «el dueño cambia el precio de Norte desde el panel» por REST **va a fallar**: ahora ese
precio no se escribe por REST). Ajusta `0036` en este mismo paso: en su bloque 10 el `update` del
dueño por REST sigue sin fallar (`lives_ok`), pero ya no cambia el precio — cambia la aserción que
espera `140` para que verifique que el precio **se conserva** (el valor que tenía antes de ese
update) con el texto «por REST el precio lo decide el menú (0155)», y ajusta el texto del
`lives_ok` a «el dueño escribe la fila de Norte desde el panel». Conserva la de
`agotado_automatico` y la del `delete`. No cambies el número de `plan`.

- [ ] **Step 5: The migration applies on the register's Postgres, and 0152's smoke still passes**

```bash
cd desktop && npm run verify:migraciones && node scripts/smokes.mjs smoke_menu_sucursal.sql smoke_combos.sql
```

Expected: aplica hasta 0155 y los dos smokes en verde (escriben `productos_sucursal` como
superusuario, que las guardias dejan pasar).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0155_menus_del_catalogo.sql supabase/tests/0037_menus_del_catalogo.test.sql supabase/tests/0036_menu_por_sucursal.test.sql
git commit -m "feat(db): menús del catálogo — tablas, guardias y proyección a productos_sucursal (0155)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Crear, editar y eliminar un menú; producto nuevo

**Files:**
- Modify: `supabase/migrations/0155_menus_del_catalogo.sql` (append §6–§8)
- Modify: `supabase/tests/0037_menus_del_catalogo.test.sql` (more tests)
- Create: `supabase/scripts/smoke_menus.sql`

**Interfaces:**
- Consumes: tablas, `proyectar_menu` y triggers de la Task 1.
- Produces (RPCs, todas exigen `config.productos`; errores con mensaje para el dueño):
  - `crear_menu(p_nombre text, p_sucursales uuid[]) RETURNS uuid`
  - `actualizar_menu(p_menu uuid, p_nombre text, p_sucursales uuid[]) RETURNS void`
  - `eliminar_menu(p_menu uuid) RETURNS void`
  - Trigger: un producto nuevo recibe su fila en cada menú vivo.

- [ ] **Step 1: Write the failing smoke**

`supabase/scripts/smoke_menus.sql`:

```sql
-- Smoke menús del catálogo (ADR 0029, spec 2026-10-05). Sobre la semilla: segunda sucursal (Norte),
-- «Menú Norte» creado por RPC, un precio propio y un producto apagado; vende en las dos sucursales
-- con las RPCs de 0152, que ahora alimenta el menú. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant  uuid := '99999999-0000-0000-0000-0000000000aa';
  v_centro  uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja_c  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria   uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno   uuid := '99999999-0000-0000-0000-0000000000e1';
  v_cat_h   uuid := 'a0000000-0000-0000-0000-0000000000c1';
  v_clas    uuid := 'b0000000-0000-0000-0000-0000000000f1';  -- Hamburguesa Clásica $120
  v_papas   uuid := 'b0000000-0000-0000-0000-0000000000f2';  -- Papas Gajo $55
  v_norte   uuid := gen_random_uuid();
  v_caja_n  uuid := gen_random_uuid();
  v_menu uuid; v_turno_c uuid; v_turno_n uuid; v_t_c uuid; v_t_n uuid; v_item uuid; v_nuevo uuid; v_solo uuid;
  v_precio numeric; v_n int; v_bool boolean;
BEGIN
  -- Las RPCs de menús exigen config.productos: corre como el dueño.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_dueno::text, 'tenant_id', v_tenant::text)::text, true);

  INSERT INTO tenant_limites (tenant_id, max_sucursales) VALUES (v_tenant, 5)
    ON CONFLICT (tenant_id) DO UPDATE SET max_sucursales = 5;
  INSERT INTO sucursales (id, tenant_id, codigo, nombre) VALUES (v_norte, v_tenant, 'KN', 'León Norte');
  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre) VALUES (v_caja_n, v_tenant, v_norte, 1, 'Caja Norte');

  -- 1) Crear el menú copia el General: una fila por producto vivo, al precio del General.
  v_menu := crear_menu('Menú Norte', ARRAY[v_norte]);
  SELECT count(*) INTO v_n FROM menu_productos WHERE menu_id = v_menu;
  IF v_n <> (SELECT count(*) FROM productos WHERE tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'el menú nuevo debe traer todos los productos (trae %)', v_n; END IF;
  SELECT precio_mxn INTO v_precio FROM menu_productos WHERE menu_id = v_menu AND producto_id = v_clas;
  IF v_precio <> 120 THEN RAISE EXCEPTION 'el menú nuevo arranca con el precio del General (120), trae %', v_precio; END IF;
  IF (SELECT menu_id FROM sucursales WHERE id = v_norte) IS DISTINCT FROM v_menu THEN
    RAISE EXCEPTION 'Norte debe quedar usando el menú nuevo'; END IF;
  BEGIN
    PERFORM crear_menu('menú norte', ARRAY[v_norte]);
    RAISE EXCEPTION 'debió fallar: nombre repetido';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Ya hay un menú con ese nombre%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM crear_menu('Sin sucursales', ARRAY[]::uuid[]);
    RAISE EXCEPTION 'debió fallar: sin sucursales';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%al menos una sucursal%' THEN RAISE; END IF; END;
  RAISE NOTICE 'crear_menu OK';

  -- 2) Precio propio y un producto apagado en el menú; la venta los respeta.
  UPDATE menu_productos SET precio_mxn = 135 WHERE menu_id = v_menu AND producto_id = v_clas;
  UPDATE menu_productos SET disponible = false WHERE menu_id = v_menu AND producto_id = v_papas;

  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja_c AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_centro, v_caja_c, 'SMOKE-MN-C', calcular_dia_contable(v_tenant), v_maria, 500, 'TOTAL') RETURNING id INTO v_turno_c;
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_norte, v_caja_n, 'SMOKE-MN-N', calcular_dia_contable(v_tenant), v_dueno, 500, 'TOTAL') RETURNING id INTO v_turno_n;
  v_t_c := abrir_ticket(v_centro, v_caja_c, v_turno_c, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-mn-c1', v_maria);
  v_t_n := abrir_ticket(v_norte,  v_caja_n, v_turno_n, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-mn-n1', v_dueno);

  v_item := agregar_item_a_ticket(v_t_n, v_clas, 1, NULL, '[]'::jsonb, 'smoke-mn-n1-i');
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE id = v_item;
  IF v_precio <> 135 THEN RAISE EXCEPTION 'Norte debe cobrar el precio de su menú (135), cobró %', v_precio; END IF;
  IF motivo_no_disponible_en_sucursal(v_papas, v_norte) IS DISTINCT FROM 'NO_SE_VENDE' THEN
    RAISE EXCEPTION 'las papas apagadas en el menú no se venden en Norte'; END IF;
  IF motivo_no_disponible_en_sucursal(v_papas, v_centro) IS NOT NULL THEN
    RAISE EXCEPTION 'en Centro (General) las papas se siguen vendiendo'; END IF;

  -- 3) Independencia: subir el precio en el General cambia Centro, no Norte.
  UPDATE productos SET precio_base_mxn = 150 WHERE id = v_clas;
  v_item := agregar_item_a_ticket(v_t_c, v_clas, 1, NULL, '[]'::jsonb, 'smoke-mn-c1-i');
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE id = v_item;
  IF v_precio <> 150 THEN RAISE EXCEPTION 'Centro debe cobrar el precio nuevo del General (150), cobró %', v_precio; END IF;
  v_item := agregar_item_a_ticket(v_t_n, v_clas, 1, NULL, '[]'::jsonb, 'smoke-mn-n1-i2');
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE id = v_item;
  IF v_precio <> 135 THEN RAISE EXCEPTION 'Norte no debe seguir al General (135), cobró %', v_precio; END IF;
  RAISE NOTICE 'venta por menú e independencia de precios OK';

  -- 4) Producto nuevo en el General: entra a todos los menús, al precio con que nació.
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn)
  VALUES (v_tenant, v_cat_h, 'Hamburguesa nueva smoke', 99) RETURNING id INTO v_nuevo;
  SELECT disponible, precio_mxn INTO v_bool, v_precio FROM menu_productos WHERE menu_id = v_menu AND producto_id = v_nuevo;
  IF v_bool IS DISTINCT FROM true OR v_precio <> 99 THEN RAISE EXCEPTION 'el producto nuevo debe entrar al menú encendido a 99 (%, %)', v_bool, v_precio; END IF;

  -- 5) Producto solo de Menú Norte: nace apagado en el General y en el menú; se enciende en Norte.
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, en_menu_general)
  VALUES (v_tenant, v_cat_h, 'Solo Norte smoke', 80, false) RETURNING id INTO v_solo;
  UPDATE menu_productos SET disponible = true WHERE menu_id = v_menu AND producto_id = v_solo;
  IF motivo_no_disponible_en_sucursal(v_solo, v_centro) IS DISTINCT FROM 'NO_SE_VENDE' THEN
    RAISE EXCEPTION 'un producto solo de Norte no se vende en Centro'; END IF;
  IF motivo_no_disponible_en_sucursal(v_solo, v_norte) IS NOT NULL THEN
    RAISE EXCEPTION 'un producto solo de Norte sí se vende en Norte'; END IF;
  RAISE NOTICE 'producto nuevo OK';

  -- 6) Editar: renombrar y dejar el menú sin sucursales; Norte vuelve al General y el menú se conserva.
  PERFORM actualizar_menu(v_menu, 'Menú Sucursal Norte', ARRAY[]::uuid[]);
  IF (SELECT menu_id FROM sucursales WHERE id = v_norte) IS NOT NULL THEN RAISE EXCEPTION 'Norte debió volver al General'; END IF;
  IF precio_producto_en_sucursal(v_clas, v_norte) <> 150 THEN RAISE EXCEPTION 'de vuelta en el General, Norte cobra 150'; END IF;
  IF (SELECT precio_mxn FROM menu_productos WHERE menu_id = v_menu AND producto_id = v_clas) <> 135 THEN
    RAISE EXCEPTION 'el menú sin sucursales conserva su contenido'; END IF;
  PERFORM actualizar_menu(v_menu, 'Menú Sucursal Norte', ARRAY[v_norte]);
  IF precio_producto_en_sucursal(v_clas, v_norte) <> 135 THEN RAISE EXCEPTION 'al reasignarlo, Norte vuelve a cobrar 135'; END IF;

  -- 7) Eliminar: Norte vuelve al General y el menú queda dado de baja.
  PERFORM eliminar_menu(v_menu);
  IF (SELECT menu_id FROM sucursales WHERE id = v_norte) IS NOT NULL THEN RAISE EXCEPTION 'al eliminar el menú, Norte vuelve al General'; END IF;
  IF (SELECT deleted_at FROM menus WHERE id = v_menu) IS NULL THEN RAISE EXCEPTION 'el menú debe quedar dado de baja'; END IF;
  IF motivo_no_disponible_en_sucursal(v_papas, v_norte) IS NOT NULL THEN RAISE EXCEPTION 'sin menú propio, Norte vuelve a vender papas'; END IF;
  -- El nombre de un menú eliminado se puede volver a usar.
  PERFORM crear_menu('Menú Sucursal Norte', ARRAY[v_norte]);
  RAISE NOTICE 'editar y eliminar OK';

  -- 8) Sin permiso no se crean menús.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  BEGIN
    PERFORM crear_menu('De la cajera', ARRAY[v_centro]);
    RAISE EXCEPTION 'debió fallar: la cajera no administra el catálogo';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%no puede modificar el catálogo%' THEN RAISE; END IF; END;
  RAISE NOTICE 'permisos OK';
END $$;
ROLLBACK;
```

Run:

```bash
cd desktop && node scripts/smokes.mjs smoke_menus.sql
```

Expected: ❌ `function crear_menu(unknown, uuid[]) does not exist`.

- [ ] **Step 2: Append §6–§8 to the migration**

```sql
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
       FROM sucursales s WHERE s.tenant_id = NEW.tenant_id AND s.menu_id IS NULL AND s.deleted_at IS NULL;
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

CREATE OR REPLACE FUNCTION crear_menu(p_nombre text, p_sucursales uuid[])
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := _menu_exigir_permiso();
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_menu   uuid;
BEGIN
  IF v_nombre = '' THEN
    RAISE EXCEPTION 'Ponle nombre al menú.' USING ERRCODE = '22023';
  END IF;
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
  v_nombre     text := btrim(coalesce(p_nombre, ''));
  v_sucursales uuid[] := coalesce(p_sucursales, ARRAY[]::uuid[]);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM menus WHERE id = p_menu AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Ese menú ya no existe.' USING ERRCODE = '22023';
  END IF;
  IF v_nombre = '' THEN
    RAISE EXCEPTION 'Ponle nombre al menú.' USING ERRCODE = '22023';
  END IF;
  PERFORM _menu_validar_sucursales(v_tenant, v_sucursales);

  BEGIN
    UPDATE menus SET nombre = v_nombre WHERE id = p_menu AND nombre IS DISTINCT FROM v_nombre;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya hay un menú con ese nombre.' USING ERRCODE = '23505';
  END;

  -- El menú queda aplicando EXACTAMENTE a esas sucursales: las que sobran vuelven al General.
  UPDATE sucursales SET menu_id = NULL
   WHERE tenant_id = v_tenant AND menu_id = p_menu AND NOT (id = ANY (v_sucursales));
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
COMMENT ON FUNCTION actualizar_menu(uuid, text, uuid[]) IS 'Renombra el menú y lo deja aplicando exactamente a esas sucursales (las demás vuelven al General). ADR 0029.';
COMMENT ON FUNCTION eliminar_menu(uuid) IS 'Baja lógica del menú; sus sucursales vuelven al General. ADR 0029.';

-- ── §8 Permisos de ejecución ─────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION crear_menu(text, uuid[])            FROM public, anon;
REVOKE EXECUTE ON FUNCTION actualizar_menu(uuid, text, uuid[]) FROM public, anon;
REVOKE EXECUTE ON FUNCTION eliminar_menu(uuid)                 FROM public, anon;
REVOKE EXECUTE ON FUNCTION _menu_exigir_permiso()              FROM public, anon;
REVOKE EXECUTE ON FUNCTION _menu_validar_sucursales(uuid, uuid[]) FROM public, anon;
GRANT  EXECUTE ON FUNCTION crear_menu(text, uuid[])            TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION actualizar_menu(uuid, text, uuid[]) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION eliminar_menu(uuid)                 TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION _menu_exigir_permiso()              TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION _menu_validar_sucursales(uuid, uuid[]) TO authenticated, service_role;
```

Nota: `eliminar_menu` hace `UPDATE menus SET deleted_at` desde una RPC (`/rpc/…`), así que la
guardia `guardia_menus` (solo REST directo) lo deja pasar. Lo mismo `crear_menu` con sus INSERT.

- [ ] **Step 3: Add pgTAP tests for the RPCs under RLS**

En `supabase/tests/0037_menus_del_catalogo.test.sql`: cambia `select plan(19);` por `select plan(24);`
y, entre `reset role;` y `select * from finish();`, agrega:

```sql
-- 11) Las RPCs bajo RLS: el dueño crea; la cajera no; nadie toca el menú de otro negocio.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);
select set_config('request.path', '/rpc/crear_menu', true);
select lives_ok(
  format($$ select crear_menu('Menú del dueño', array[%L]::uuid[]) $$, :'norte'),
  'el dueño crea un menú por RPC');
select is((select count(*)::int from menus where tenant_id = :'otro'), 0, 'no ve los menús de otro negocio');
select throws_ok(
  format($$ select actualizar_menu(%L, 'Robado', array[]::uuid[]) $$, :'menu_otro'),
  '22023', null, 'no edita el menú de otro negocio');
select set_config('request.path', '/menus', true);
select throws_ok(
  format($$ insert into menus (tenant_id, nombre) values (%L, 'Por REST') $$, :'t'),
  '42501', null, 'los menús no se crean por REST directo');
select set_config('request.jwt.claims', json_build_object('sub', :'cajero', 'role', 'authenticated', 'tenant_id', :'t')::text, true);
select set_config('request.path', '/rpc/crear_menu', true);
select throws_ok(
  format($$ select crear_menu('De la cajera', array[%L]::uuid[]) $$, :'centro'),
  '42501', null, 'una cajera no crea menús');
reset role;
```

- [ ] **Step 4: Run everything**

```bash
supabase db reset && supabase test db
cd desktop && node scripts/smokes.mjs smoke_menus.sql smoke_menu_sucursal.sql smoke_combos.sql && npm run verify:migraciones
```

Expected: `0037 .. ok` (24 pruebas), los tres smokes en verde (los NOTICE de `smoke_menus` llegan a
«permisos OK») y `verify:migraciones` aplica hasta 0155. Después, la batería completa:

```bash
cd desktop && npm run smokes
```

Expected: todos en verde (el trigger de producto nuevo corre en cada `INSERT INTO productos` de los
demás smokes; sin menús no hace nada).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0155_menus_del_catalogo.sql supabase/tests/0037_menus_del_catalogo.test.sql supabase/scripts/smoke_menus.sql
git commit -m "feat(db): crear, editar y eliminar menús; un producto nuevo entra a cada menú (0155)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: La lib de menús del admin

**Files:**
- Create: `apps/admin/app/lib/menus.ts`
- Create: `apps/admin/app/lib/__tests__/menus.test.ts`
- Modify: `apps/admin/app/lib/catalogo.ts` (tipo `Producto` + lecturas: `en_menu_general`; `crearProducto` acepta `en_menu_general`)

**Interfaces:**
- Consumes: tablas y RPCs de las Tasks 1–2; `precioValido` de `apps/admin/app/lib/menu-sucursal.ts`.
- Produces (en `menus.ts`):
  - `MENU_GENERAL = "general"`; `type MenuId = string` (id de menú o `"general"`)
  - `type SucursalDeMenu = { id: string; nombre: string; menuId: string | null }`
  - `type Menu = { id: string; nombre: string; sucursales: { id: string; nombre: string }[] }`
  - `type FilaDeMenu = { disponible: boolean; precio_mxn: number }`
  - `type EstadoEnMenu = "ACTIVO" | "PAUSADO" | "NO_SE_VENDE"`
  - `type EstadoCategoria = "encendida" | "apagada" | "parcial" | "vacia"`
  - puras: `armarMenus`, `elegirMenuInicial`, `hayMenus`, `estadoEnMenu`, `estadoCategoria`, `filasDelGeneral`, `avisoAlMover`, `sucursalesDe`
  - datos: `listarMenus`, `crearMenu`, `actualizarMenu`, `eliminarMenu`, `leerFilasDeMenu`, `guardarFilaDeMenu`, `encenderCategoria`
- Produces (en `catalogo.ts`): `Producto.en_menu_general: boolean`; `crearProducto(input, opciones?: { enMenuGeneral?: boolean }): Promise<string>`

- [ ] **Step 1: Write the failing test**

`apps/admin/app/lib/__tests__/menus.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MENU_GENERAL,
  armarMenus,
  avisoAlMover,
  elegirMenuInicial,
  estadoCategoria,
  estadoEnMenu,
  filasDelGeneral,
  hayMenus,
  sucursalesDe,
  type SucursalDeMenu,
} from "../menus";

const sucursales: SucursalDeMenu[] = [
  { id: "centro", nombre: "León Centro", menuId: null },
  { id: "norte", nombre: "León Norte", menuId: "m1" },
  { id: "sur", nombre: "León Sur", menuId: "m1" },
];
const menus = armarMenus([{ id: "m1", nombre: "Menú Norte" }, { id: "m2", nombre: "Vacío" }], sucursales);

describe("menús y sus sucursales", () => {
  it("cada menú lleva las sucursales que lo usan; uno sin sucursales se conserva", () => {
    expect(menus.map((m) => [m.nombre, m.sucursales.map((s) => s.id)])).toEqual([
      ["Menú Norte", ["norte", "sur"]],
      ["Vacío", []],
    ]);
  });
  it("las sucursales del General son las que no tienen menú", () => {
    expect(sucursalesDe(MENU_GENERAL, sucursales).map((s) => s.id)).toEqual(["centro"]);
    expect(sucursalesDe("m1", sucursales).map((s) => s.id)).toEqual(["norte", "sur"]);
  });
  it("el selector se pinta con dos sucursales o con algún menú propio", () => {
    expect(hayMenus([], [sucursales[0]!])).toBe(false);
    expect(hayMenus([], sucursales)).toBe(true);
    expect(hayMenus(menus, [sucursales[0]!])).toBe(true);
  });
});

describe("qué menú se abre", () => {
  it("URL, luego lo último que se usó, luego el General", () => {
    expect(elegirMenuInicial(menus, "m1", "m2")).toBe("m1");
    expect(elegirMenuInicial(menus, null, "m2")).toBe("m2");
    expect(elegirMenuInicial(menus, null, null)).toBe(MENU_GENERAL);
  });
  it("un menú que ya no existe no se abre", () => {
    expect(elegirMenuInicial(menus, "borrado", null)).toBe(MENU_GENERAL);
    expect(elegirMenuInicial(menus, "general", "m1")).toBe(MENU_GENERAL);
  });
});

describe("estado de un producto y de una categoría en un menú", () => {
  it("pausado gana; apagado en el menú es «no se vende»", () => {
    expect(estadoEnMenu("PAUSADO", false)).toBe("PAUSADO");
    expect(estadoEnMenu("ACTIVO", false)).toBe("NO_SE_VENDE");
    expect(estadoEnMenu("ACTIVO", true)).toBe("ACTIVO");
  });
  it("una categoría está encendida, apagada o parcial según cuántos de sus productos se venden", () => {
    expect(estadoCategoria(3, 3)).toBe("encendida");
    expect(estadoCategoria(0, 3)).toBe("apagada");
    expect(estadoCategoria(1, 3)).toBe("parcial");
    expect(estadoCategoria(0, 0)).toBe("vacia");
  });
  it("las filas del General salen del producto", () => {
    const filas = filasDelGeneral([
      { id: "p1", precio_base_mxn: 120, en_menu_general: true },
      { id: "p2", precio_base_mxn: 55, en_menu_general: false },
    ]);
    expect(filas.get("p1")).toEqual({ disponible: true, precio_mxn: 120 });
    expect(filas.get("p2")).toEqual({ disponible: false, precio_mxn: 55 });
  });
});

describe("avisos del modal al mover sucursales", () => {
  it("dice de qué menú propio sale una sucursal; del General no avisa", () => {
    expect(avisoAlMover(["norte", "centro"], "m2", sucursales, menus)).toEqual(["León Norte dejará de usar Menú Norte."]);
  });
  it("no avisa de las que ya eran de este menú", () => {
    expect(avisoAlMover(["norte", "sur"], "m1", sucursales, menus)).toEqual([]);
  });
});
```

```bash
pnpm --filter @vim/admin test -- menus
```

Expected: FAIL, `Cannot find module '../menus'`.

- [ ] **Step 2: Write the lib**

`apps/admin/app/lib/menus.ts`:

```ts
"use client";
import { supabase } from "./supabase";

/**
 * Menús del catálogo (ADR 0029, migración 0155). El dueño crea menús con nombre y los asigna a
 * sucursales; cada sucursal usa exactamente uno. El General es el catálogo de siempre
 * (`productos.precio_base_mxn`, `productos.en_menu_general`) y no tiene fila en `menus`. Un menú
 * propio guarda una fila por producto en `menu_productos`, con su disponible y su precio.
 *
 * La base copia sola a `productos_sucursal` lo que el menú de cada sucursal dice (proyectar_menu):
 * la caja, la venta y Uber leen eso y no saben de menús. Aquí nunca se escribe `productos_sucursal`
 * para precio o disponibilidad.
 */

export const MENU_GENERAL = "general";
/** El id de un menú propio, o `MENU_GENERAL`. */
export type MenuId = string;

export type SucursalDeMenu = { id: string; nombre: string; menuId: string | null };
export type Menu = { id: string; nombre: string; sucursales: { id: string; nombre: string }[] };
/** Lo que un menú dice de un producto. En el General sale del producto mismo. */
export type FilaDeMenu = { disponible: boolean; precio_mxn: number };
export type EstadoEnMenu = "ACTIVO" | "PAUSADO" | "NO_SE_VENDE";
export type EstadoCategoria = "encendida" | "apagada" | "parcial" | "vacia";

export function armarMenus(filas: { id: string; nombre: string }[], sucursales: SucursalDeMenu[]): Menu[] {
  return filas.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    sucursales: sucursales.filter((s) => s.menuId === m.id).map((s) => ({ id: s.id, nombre: s.nombre })),
  }));
}

/** Las sucursales que usan ese menú (el General = las que no tienen menú propio). */
export function sucursalesDe(menu: MenuId, sucursales: SucursalDeMenu[]): SucursalDeMenu[] {
  return sucursales.filter((s) => (menu === MENU_GENERAL ? s.menuId === null : s.menuId === menu));
}

/** ¿Se pinta el selector? Con una sola sucursal y sin menús propios, el Catálogo se ve como siempre. */
export function hayMenus(menus: Menu[], sucursales: SucursalDeMenu[]): boolean {
  return menus.length > 0 || sucursales.length >= 2;
}

/** Elige con lo que hay: URL → lo último que se usó → el General. Un menú que ya no existe no cuenta. */
export function elegirMenuInicial(menus: Menu[], url: string | null, guardado: string | null): MenuId {
  for (const v of [url, guardado]) {
    if (v === MENU_GENERAL) return MENU_GENERAL;
    if (v && menus.some((m) => m.id === v)) return v;
  }
  return MENU_GENERAL;
}

/** Pausar es global y gana; apagado en el menú es «no se vende aquí». El agotado no es del menú. */
export function estadoEnMenu(estadoProducto: string, disponible: boolean): EstadoEnMenu {
  if (estadoProducto === "PAUSADO") return "PAUSADO";
  return disponible ? "ACTIVO" : "NO_SE_VENDE";
}

/** Una categoría no tiene estado propio por menú: es lo que resulta de sus productos. */
export function estadoCategoria(seVenden: number, total: number): EstadoCategoria {
  if (total === 0) return "vacia";
  if (seVenden === 0) return "apagada";
  return seVenden === total ? "encendida" : "parcial";
}

export function filasDelGeneral(
  productos: { id: string; precio_base_mxn: number; en_menu_general: boolean }[],
): Map<string, FilaDeMenu> {
  return new Map(productos.map((p) => [p.id, { disponible: p.en_menu_general, precio_mxn: p.precio_base_mxn }]));
}

/**
 * Lo que el modal avisa antes de guardar: qué sucursales salen de OTRO menú propio para entrar a
 * este. Salir del General no se avisa (no se pierde nada), ni las que ya eran de este menú.
 */
export function avisoAlMover(elegidas: string[], menuDestino: string | null, sucursales: SucursalDeMenu[], menus: Menu[]): string[] {
  return elegidas.flatMap((id) => {
    const s = sucursales.find((x) => x.id === id);
    if (!s || s.menuId === null || s.menuId === menuDestino) return [];
    const origen = menus.find((m) => m.id === s.menuId);
    return origen ? [`${s.nombre} dejará de usar ${origen.nombre}.`] : [];
  });
}

// ── Datos ────────────────────────────────────────────────────────────────────

/** Los menús propios vivos y las sucursales activas con el menú que usa cada una. */
export async function listarMenus(): Promise<{ menus: Menu[]; sucursales: SucursalDeMenu[] }> {
  const [{ data: ms, error: e1 }, { data: ss, error: e2 }] = await Promise.all([
    supabase.from("menus").select("id, nombre").is("deleted_at", null).order("nombre", { ascending: true }),
    supabase.from("sucursales").select("id, nombre, menu_id").eq("activa", true).is("deleted_at", null).order("nombre", { ascending: true }),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  const sucursales = ((ss ?? []) as { id: string; nombre: string; menu_id: string | null }[]).map((s) => ({
    id: s.id,
    nombre: s.nombre,
    menuId: s.menu_id ?? null,
  }));
  return { menus: armarMenus((ms ?? []) as { id: string; nombre: string }[], sucursales), sucursales };
}

export async function crearMenu(nombre: string, sucursalIds: string[]): Promise<string> {
  const { data, error } = await supabase.rpc("crear_menu", { p_nombre: nombre, p_sucursales: sucursalIds });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function actualizarMenu(menuId: string, nombre: string, sucursalIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("actualizar_menu", { p_menu: menuId, p_nombre: nombre, p_sucursales: sucursalIds });
  if (error) throw new Error(error.message);
}

export async function eliminarMenu(menuId: string): Promise<void> {
  const { error } = await supabase.rpc("eliminar_menu", { p_menu: menuId });
  if (error) throw new Error(error.message);
}

/** Las filas de un menú PROPIO, por producto. Las del General salen de los productos (`filasDelGeneral`). */
export async function leerFilasDeMenu(menuId: string): Promise<Map<string, FilaDeMenu>> {
  const { data, error } = await supabase.from("menu_productos").select("producto_id, disponible, precio_mxn").eq("menu_id", menuId);
  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as { producto_id: string; disponible: boolean; precio_mxn: number | string }[]).map((f) => [
      f.producto_id,
      { disponible: f.disponible !== false, precio_mxn: Number(f.precio_mxn) },
    ]),
  );
}

/**
 * Cambia «se vende» o el precio de un producto en un menú. En el General escribe el producto
 * (`en_menu_general`, `precio_base_mxn`); en un menú propio, su fila de `menu_productos`.
 */
export async function guardarFilaDeMenu(menu: MenuId, productoId: string, cambio: Partial<FilaDeMenu>): Promise<void> {
  if (menu === MENU_GENERAL) {
    const valores: Record<string, boolean | number> = {};
    if (cambio.disponible !== undefined) valores.en_menu_general = cambio.disponible;
    if (cambio.precio_mxn !== undefined) valores.precio_base_mxn = cambio.precio_mxn;
    const { error } = await supabase.from("productos").update(valores).eq("id", productoId);
    if (error) throw new Error(error.message);
    return;
  }
  const { data, error } = await supabase
    .from("menu_productos")
    .update(cambio)
    .eq("menu_id", menu)
    .eq("producto_id", productoId)
    .select("producto_id");
  if (error) throw new Error(error.message);
  if ((data ?? []).length === 0) throw new Error("Ese producto no está en este menú. Recarga la página.");
}

/** Enciende o apaga TODOS los productos de una categoría en un menú (spec §5.4: es una acción, no un estado). */
export async function encenderCategoria(menu: MenuId, categoriaId: string, encender: boolean): Promise<void> {
  if (menu === MENU_GENERAL) {
    const { error } = await supabase.from("productos").update({ en_menu_general: encender }).eq("categoria_id", categoriaId).is("deleted_at", null);
    if (error) throw new Error(error.message);
    return;
  }
  const { data: prods, error: e1 } = await supabase.from("productos").select("id").eq("categoria_id", categoriaId).is("deleted_at", null);
  if (e1) throw new Error(e1.message);
  const ids = ((prods ?? []) as { id: string }[]).map((p) => p.id);
  if (ids.length === 0) return;
  const { error } = await supabase.from("menu_productos").update({ disponible: encender }).eq("menu_id", menu).in("producto_id", ids);
  if (error) throw new Error(error.message);
}
```

En `apps/admin/app/lib/catalogo.ts`:

1. En el tipo `Producto`, después de `visible_en_pos: boolean;`:

```ts
  /** «Se vende» en el menú General (0155). false = solo existe en los menús propios que lo enciendan. */
  en_menu_general: boolean;
```

2. En los dos `.select(...)` de `listarProductos` y `obtenerProducto`, agrega `en_menu_general` a la
   lista de columnas, y en los dos mapeos `en_menu_general: f.en_menu_general !== false,`.
3. `crearProducto`: cambia la firma a
   `export async function crearProducto(input: ProductoInput, opciones: { enMenuGeneral?: boolean } = {}): Promise<string>`
   y en el objeto del `.insert({...})` agrega `en_menu_general: opciones.enMenuGeneral ?? true,`.

```bash
pnpm --filter @vim/admin test -- menus
```

Expected: PASS.

- [ ] **Step 3: Full admin tests and types**

```bash
pnpm --filter @vim/admin test
pnpm --filter @vim/admin typecheck
```

Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/lib/menus.ts apps/admin/app/lib/__tests__/menus.test.ts apps/admin/app/lib/catalogo.ts
git commit -m "feat(admin): lib de menús del catálogo — leer, crear, editar y encender por menú

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: El selector de menú y «Nuevo menú» en todo el Catálogo

**Files:**
- Create: `apps/admin/app/components/selector-menu.tsx` (hook `useMenuCatalogo` + franja `FranjaMenus`)
- Create: `apps/admin/app/components/modal-menu.tsx`
- Modify: `apps/admin/app/components/catalogo-tabs.tsx` (las pestañas conservan `?menu=`)
- Modify: `apps/admin/app/(panel)/catalogo/categorias/page.tsx`, `productos/page.tsx`, `modificadores/page.tsx`, `combos/page.tsx`, `recetas/page.tsx` (pintar la franja)

**Interfaces:**
- Consumes (Task 3): `listarMenus`, `crearMenu`, `actualizarMenu`, `eliminarMenu`, `elegirMenuInicial`, `hayMenus`, `avisoAlMover`, `sucursalesDe`, `MENU_GENERAL`, tipos.
- Produces:
  - `useMenuCatalogo(): MenuCatalogo` con
    `{ menus: Menu[]; sucursales: SucursalDeMenu[]; id: MenuId; nombre: string; esGeneral: boolean; visible: boolean; listo: boolean; cambiar(id: MenuId): void; recargar(): Promise<void> }`
    — `nombre` es «General» o el del menú; `visible` = `hayMenus(...)`; `listo` es `false` hasta saber qué menú mirar.
  - `<FranjaMenus menu={menu} nota?: string />` — la franja con las pastillas, «Nuevo menú», «Editar» y «Eliminar».
  - `<CatalogoTabs />` sin cambios de props.

- [ ] **Step 1: Load the design guidance**

Carga `emil-design-eng` y lee `docs/diseno/admin.md` y `docs/diseno/nucleo.md`. Lee también
`apps/admin/app/components/selector-sucursal.tsx`: el hook nuevo sigue su mismo patrón (URL +
`localStorage`), y `DialogoPeligro`/`Button` de `@vim/ui/styles` tal como los usa
`catalogo/productos/page.tsx`. Para el modal, busca el modal existente más parecido en
`apps/admin/app/components/` (por ejemplo el de categorías en `catalogo/categorias/page.tsx`) y
reusa su estructura, su manejo de Escape y sus clases.

- [ ] **Step 2: The hook and the strip**

`apps/admin/app/components/selector-menu.tsx`:

```tsx
"use client";
/**
 * Qué menú se está administrando en el Catálogo (ADR 0029).
 *
 * Antes el menú de una sucursal eran excepciones escondidas en Productos; ahora es un menú con
 * nombre y se elige aquí, arriba de las pestañas, igual en Categorías, Productos, Combos,
 * Modificadores y Recetas. La elección viaja como la sucursal de los reportes: en la URL
 * (`?menu=`) y entre pantallas (localStorage). Con una sola sucursal y sin menús propios no hay
 * nada que elegir y la franja no se pinta.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, DialogoPeligro } from "@vim/ui/styles";
import { mensajeError } from "../lib/errores";
import {
  MENU_GENERAL,
  elegirMenuInicial,
  eliminarMenu,
  hayMenus,
  listarMenus,
  sucursalesDe,
  type Menu,
  type MenuId,
  type SucursalDeMenu,
} from "../lib/menus";
import { ModalMenu } from "./modal-menu";

const CLAVE = "vim.catalogo.menu";

export type MenuCatalogo = {
  menus: Menu[];
  sucursales: SucursalDeMenu[];
  /** El menú elegido: el id de un menú propio o `MENU_GENERAL`. */
  id: MenuId;
  /** «General» o el nombre del menú propio. */
  nombre: string;
  esGeneral: boolean;
  /** ¿Se pinta la franja? (dos o más sucursales, o algún menú propio) */
  visible: boolean;
  /** `false` hasta saber qué menú mirar: antes de eso no se consulta nada por menú. */
  listo: boolean;
  cambiar: (id: MenuId) => void;
  recargar: () => Promise<void>;
};

function recordar(valor: MenuId) {
  const u = new URL(window.location.href);
  u.searchParams.set("menu", valor);
  window.history.replaceState(window.history.state, "", u);
  try {
    localStorage.setItem(CLAVE, valor);
  } catch {
    /* sin almacenamiento: la elección vive solo en la URL */
  }
}

function leerGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function useMenuCatalogo(): MenuCatalogo {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [sucursales, setSucursales] = useState<SucursalDeMenu[]>([]);
  const [id, setId] = useState<MenuId>(MENU_GENERAL);
  const [listo, setListo] = useState(false);

  const recargar = useCallback(async () => {
    const r = await listarMenus();
    setMenus(r.menus);
    setSucursales(r.sucursales);
    // Si el menú elegido ya no existe (lo borraron en otra pestaña), se vuelve al General.
    setId((actual) => (actual === MENU_GENERAL || r.menus.some((m) => m.id === actual) ? actual : MENU_GENERAL));
  }, []);

  useEffect(() => {
    let vivo = true;
    listarMenus()
      .then((r) => {
        if (!vivo) return;
        const inicial = elegirMenuInicial(r.menus, new URLSearchParams(window.location.search).get("menu"), leerGuardado());
        setMenus(r.menus);
        setSucursales(r.sucursales);
        setId(inicial);
        if (hayMenus(r.menus, r.sucursales)) recordar(inicial);
      })
      // Si no se pueden leer los menús, el Catálogo se ve como siempre (el General) en vez de nada.
      .catch(() => {})
      .finally(() => {
        if (vivo) setListo(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const cambiar = useCallback((nuevo: MenuId) => {
    setId(nuevo);
    recordar(nuevo);
  }, []);

  const esGeneral = id === MENU_GENERAL;
  return {
    menus,
    sucursales,
    id,
    nombre: esGeneral ? "General" : (menus.find((m) => m.id === id)?.nombre ?? "General"),
    esGeneral,
    visible: hayMenus(menus, sucursales),
    listo,
    cambiar,
    recargar,
  };
}

const pastilla = "inline-flex min-h-[44px] flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded border px-3 text-13 transition-colors lg:min-h-0 lg:py-1.5";

/**
 * La franja de menús: una pastilla por menú con las sucursales que lo usan, «Nuevo menú», y
 * «Editar» / «Eliminar» sobre el menú propio elegido. `nota` es una línea opcional bajo la franja
 * (p. ej. «Los modificadores son los mismos en todos los menús.»).
 */
export function FranjaMenus({ menu, nota }: { menu: MenuCatalogo; nota?: string }) {
  const [modal, setModal] = useState<"nuevo" | "editar" | null>(null);
  const [borrar, setBorrar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!menu.visible) return null;

  const elegido = menu.menus.find((m) => m.id === menu.id) ?? null;
  const nombresDe = (id: MenuId) => {
    const ss = sucursalesDe(id, menu.sucursales).map((s) => s.nombre);
    return ss.length ? ss.join(", ") : "sin sucursales";
  };

  async function confirmarBorrado() {
    if (!elegido) return;
    setBorrando(true);
    setError(null);
    try {
      await eliminarMenu(elegido.id);
      setBorrar(false);
      menu.cambiar(MENU_GENERAL);
      await menu.recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo eliminar el menú"));
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div className="flex-shrink-0 border-b border-line bg-sel px-4 py-2.5 lg:px-8">
      <div className="scroll-x-limpio flex items-center gap-2 overflow-x-auto lg:flex-wrap lg:overflow-x-visible">
        <span className="flex-shrink-0 text-13 font-medium text-ink-2">Menú</span>
        {[{ id: MENU_GENERAL, nombre: "General" }, ...menu.menus].map((m) => {
          const activo = m.id === menu.id;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={activo}
              onClick={() => menu.cambiar(m.id)}
              className={[pastilla, activo ? "border-ink bg-surface font-semibold text-ink" : "border-line-strong text-ink-2 hover:border-ink hover:text-ink"].join(" ")}
            >
              {m.nombre}
              <span className="font-normal text-ink-3">· {nombresDe(m.id)}</span>
            </button>
          );
        })}
        <span className="ml-auto flex flex-shrink-0 items-center gap-2">
          {elegido && (
            <>
              <Button variant="ghost" onClick={() => setModal("editar")}>Editar</Button>
              <Button variant="ghost" onClick={() => setBorrar(true)}>Eliminar</Button>
            </>
          )}
          <Button variant="ghost" onClick={() => setModal("nuevo")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[16px] w-[16px]" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Nuevo menú
          </Button>
        </span>
      </div>
      {nota && <p className="mt-2 text-13 text-ink-2">{nota}</p>}
      {error && !borrar && <p className="mt-2 text-13 font-medium text-danger" role="alert">{error}</p>}

      {modal && (
        <ModalMenu
          menu={modal === "editar" ? elegido : null}
          menus={menu.menus}
          sucursales={menu.sucursales}
          onCerrar={() => setModal(null)}
          onGuardado={async (id) => {
            setModal(null);
            await menu.recargar();
            menu.cambiar(id);
          }}
        />
      )}

      {borrar && elegido && (
        <DialogoPeligro
          error={error}
          titulo={`¿Eliminar ${elegido.nombre}?`}
          consecuencia={
            elegido.sucursales.length > 0 ? (
              <>
                <b className="text-ink">{elegido.sucursales.map((s) => s.nombre).join(", ")}</b>{" "}
                {elegido.sucursales.length === 1 ? "volverá" : "volverán"} a usar el menú General.
              </>
            ) : (
              <>Ninguna sucursal lo usa. Sus precios y lo que tenía apagado se pierden.</>
            )
          }
          boton="Eliminar menú"
          ocupado={borrando}
          textoOcupado="Eliminando…"
          ancho="sm"
          onConfirmar={confirmarBorrado}
          onCerrar={() => {
            setBorrar(false);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
```

Si `bg-sel` no contrasta bien como fondo de franja o `Button variant="ghost"` no acepta hijos con
icono como en `catalogo/productos/page.tsx`, ajusta a lo que ya use esa página; no inventes clases.

- [ ] **Step 3: The modal**

`apps/admin/app/components/modal-menu.tsx` — un modal con la estructura y las clases del modal más
parecido que ya exista en el admin (ver Step 1), con este contenido y comportamiento:

```tsx
"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@vim/ui/styles";
import { mensajeError } from "../lib/errores";
import { actualizarMenu, avisoAlMover, crearMenu, type Menu, type SucursalDeMenu } from "../lib/menus";

/**
 * Crear o editar un menú: nombre y a qué sucursales aplica. Un menú nuevo arranca como copia del
 * General (lo hace crear_menu en la base). Cada sucursal usa un solo menú: marcar una que está en
 * otro menú propio la mueve, y se avisa antes de guardar.
 */
export function ModalMenu({
  menu,
  menus,
  sucursales,
  onCerrar,
  onGuardado,
}: {
  /** El menú a editar; `null` = uno nuevo. */
  menu: Menu | null;
  menus: Menu[];
  sucursales: SucursalDeMenu[];
  onCerrar: () => void;
  onGuardado: (menuId: string) => void | Promise<void>;
}) {
  const [nombre, setNombre] = useState(menu?.nombre ?? "");
  const [elegidas, setElegidas] = useState<string[]>(menu ? menu.sucursales.map((s) => s.id) : []);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const avisos = avisoAlMover(elegidas, menu?.id ?? null, sucursales, menus);
  const usa = (s: SucursalDeMenu) => (s.menuId === null ? "General" : (menus.find((m) => m.id === s.menuId)?.nombre ?? "General"));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (nombre.trim() === "") return setError("Ponle nombre al menú.");
    if (!menu && elegidas.length === 0) return setError("Elige al menos una sucursal para el menú.");
    setGuardando(true);
    try {
      const id = menu ? (await actualizarMenu(menu.id, nombre.trim(), elegidas), menu.id) : await crearMenu(nombre.trim(), elegidas);
      await onGuardado(id);
    } catch (err) {
      setError(mensajeError(err, "No se pudo guardar el menú"));
      setGuardando(false);
    }
  }

  // ── Contenido del formulario (envuélvelo en el contenedor de modal del admin) ──
  return (
    <form onSubmit={guardar} noValidate>
      <h2 className="font-display text-lg font-semibold">{menu ? "Editar menú" : "Nuevo menú"}</h2>
      {!menu && <p className="mt-1 text-13 text-ink-2">Arranca igual que el menú General. Después le apagas productos o le cambias precios.</p>}

      <label className="mb-1.5 mt-4 block text-13 font-medium text-ink-2" htmlFor="menu-nombre">Nombre</label>
      <input
        id="menu-nombre"
        className="h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink"
        value={nombre}
        maxLength={80}
        autoFocus
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Menú Norte"
      />

      <fieldset className="mt-4">
        <legend className="mb-1.5 text-13 font-medium text-ink-2">Sucursales que lo usan</legend>
        <ul className="divide-y divide-line rounded border border-line">
          {sucursales.map((s) => (
            <li key={s.id}>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 px-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-ink"
                  checked={elegidas.includes(s.id)}
                  onChange={(e) => setElegidas((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                />
                <span className="text-sm font-medium">{s.nombre}</span>
                <span className="ml-auto text-13 text-ink-3">usa: {usa(s)}</span>
              </label>
            </li>
          ))}
        </ul>
        {menu && <p className="mt-1.5 text-13 text-ink-2">Las que desmarques vuelven al menú General.</p>}
      </fieldset>

      {avisos.map((a) => (
        <p key={a} className="mt-2 text-13 text-ink-2">{a}</p>
      ))}
      {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
        <Button type="submit" disabled={guardando}>{guardando ? "Guardando…" : menu ? "Guardar menú" : "Crear menú"}</Button>
      </div>
    </form>
  );
}
```

El `return` de arriba es el **contenido**: envuélvelo en el contenedor de modal que ya use el admin
(fondo, tarjeta centrada, cierre con Escape y clic fuera, foco atrapado si el patrón existente lo
hace). No dejes el formulario suelto en la página.

- [ ] **Step 4: Tabs keep the menu, and every Catalog page paints the strip**

En `apps/admin/app/components/catalogo-tabs.tsx`, las pestañas son `<Link href={t.href}>`: para que
el menú elegido no se pierda al cambiar de pestaña **no hace falta tocar los href** — el hook lo
recupera de `localStorage`. Deja `CatalogoTabs` como está.

En cada una de las cinco páginas (`catalogo/categorias/page.tsx`, `productos/page.tsx`,
`modificadores/page.tsx`, `combos/page.tsx`, `recetas/page.tsx`):

```tsx
import { FranjaMenus, useMenuCatalogo } from "../../../components/selector-menu";
// …dentro del componente:
const menu = useMenuCatalogo();
// …en el JSX, entre <PageHeader … /> y <CatalogoTabs />:
<FranjaMenus menu={menu} />
```

- En `modificadores/page.tsx`: `<FranjaMenus menu={menu} nota={menu.esGeneral ? undefined : "Los modificadores son los mismos en todos los menús."} />`
- En `recetas/page.tsx`: `nota={menu.esGeneral ? undefined : "Las recetas son las mismas en todos los menús."}`

En esta tarea las páginas **solo pintan la franja**; lo que cada una hace con el menú elegido es de
las Tasks 5–7. En `productos/page.tsx` no quites todavía el selector de sucursal (Task 5).

- [ ] **Step 5: Types, tests, and a look in the browser**

```bash
pnpm --filter @vim/admin typecheck
pnpm --filter @vim/admin test
```

Con el stack local (`supabase db reset` deja la semilla) agrega la segunda sucursal:

```sql
insert into tenant_limites (tenant_id, max_sucursales) values ('99999999-0000-0000-0000-0000000000aa', 5)
  on conflict (tenant_id) do update set max_sucursales = 5;
insert into sucursales (tenant_id, codigo, nombre) values ('99999999-0000-0000-0000-0000000000aa', 'KN', 'León Norte');
```

Levanta el admin con `preview_start` (config `admin`) y entra como el dueño de la semilla (la
memoria «Rediseño del admin por partes» dice cómo entrar al admin local sin contraseña; si no la
tienes, busca en `supabase/seed.sql` el correo del dueño). Comprueba:

- la franja aparece en las cinco pestañas, con «General · León Centro, León Norte»;
- «Nuevo menú» → «Menú Norte» con León Norte marcada → se crea, queda elegido y la pastilla dice
  «Menú Norte · León Norte»; el General pasa a «· León Centro»;
- en la base: `select count(*) from menu_productos;` = número de productos, y
  `select menu_id from sucursales where codigo = 'KN';` no es nulo;
- cambiar de pestaña conserva el menú elegido; recargar la página también;
- «Editar» renombra; «Eliminar» pide confirmación nombrando la sucursal, y al aceptar la franja
  vuelve al General;
- nombre repetido → «Ya hay un menú con ese nombre.» dentro del modal;
- a 375 px de ancho la franja se desliza en horizontal sin romper la página;
- sin errores en consola (`read_console_messages`). Captura de pantalla como prueba; detén el preview.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/components/selector-menu.tsx apps/admin/app/components/modal-menu.tsx "apps/admin/app/(panel)/catalogo"
git commit -m "feat(admin): selector de menú y «Nuevo menú» arriba de las pestañas del Catálogo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Productos por menú

**Files:**
- Modify: `apps/admin/app/(panel)/catalogo/productos/page.tsx`

**Interfaces:**
- Consumes: `useMenuCatalogo`/`FranjaMenus` (Task 4); `leerFilasDeMenu`, `guardarFilaDeMenu`, `filasDelGeneral`, `estadoEnMenu`, `MENU_GENERAL`, `FilaDeMenu`, `EstadoEnMenu` (Task 3); `precioValido` (`lib/menu-sucursal.ts`); `Producto.en_menu_general`.

La página ya tiene resuelto lo difícil de la edición en línea (cola de escrituras en `colaRef`,
`filasRef`/`filasDe` para no mezclar datos al cambiar de vista, remontar con `recarga`, Enter
confirma, precio inválido no guarda). **Se conserva esa mecánica**; lo que cambia es la llave (menú
en vez de sucursal) y de dónde salen y a dónde van las filas.

- [ ] **Step 1: Swap the branch selector for the menu**

1. Quita el estado y el efecto del selector de sucursal: `sucursales`, `sucSel`, `TODAS`,
   `listarSucursalesMenu`, el `<select aria-label="Sucursal">`, y los imports de `menu-sucursal`
   que ya no se usen (`esPorDefecto`, `estadoEnSucursal`, `filaPorDefecto`, `guardarMenuSucursal`,
   `leerMenuDeSucursal`, `listarSucursalesMenu`, `EdicionMenuSucursal`, `FilaMenuSucursal`,
   `SucursalMenu`). Conserva `cajasQueNoRespetanMenu`, `precioValido` y `estadoGeneral`.
2. La llave de las filas pasa a ser el menú: donde el código usa `sucSel` usa `menu.id`
   (`sucRef` → `menuRef`), y las filas son `Map<string, FilaDeMenu>`.
3. **Modo menú** = `menu.visible && menu.listo`. Sin modo menú (negocio de una sucursal y sin menús
   propios) la tabla queda exactamente como hoy en «Todas»: sin casilla, precio de solo lectura,
   insignia con `estadoGeneral(p)` y filtros Todos/Activos/Pausados/Agotados.
4. Carga de filas (el efecto que hoy lee `leerMenuDeSucursal`):

```tsx
  useEffect(() => {
    // Al cambiar de menú se olvida el anterior antes de leer el nuevo.
    filasRef.current = { de: null, filas: new Map() };
    setFilas(new Map());
    setFilasDe(null);
    if (!modoMenu || prods === null) return;
    if (menu.esGeneral) {
      aplicarFilas(MENU_GENERAL, filasDelGeneral(prods));
      return;
    }
    let vivo = true;
    const id = menu.id;
    leerFilasDeMenu(id)
      .then((fs) => {
        if (vivo) aplicarFilas(id, fs);
      })
      .catch((e) => {
        if (vivo) setError(mensajeError(e, "No se pudo leer el menú"));
      });
    return () => {
      vivo = false;
    };
  }, [menu.id, menu.esGeneral, modoMenu, prods]);
```

   con `aplicarFilas(de: MenuId, mapa: Map<string, FilaDeMenu>)`.

5. `guardarFila(p, cambio: Partial<FilaDeMenu>)`: dentro de la cola, en vez de armar una
   `EdicionMenuSucursal` y llamar `guardarMenuSucursal`, llama
   `await guardarFilaDeMenu(m, p.id, cambio)`. Después de guardar, **relee**: en un menú propio
   `leerFilasDeMenu(m)`; en el General `setProds(await listarProductos())` (el efecto de arriba
   rehace las filas). Mantén todas las comprobaciones de «sigue siendo el menú elegido» que hoy se
   hacen con la sucursal, el `try/finally` que saca el id de `guardando`, y el remontaje con
   `recarga` cuando falla.

- [ ] **Step 2: The table in menu mode**

- Columna de la casilla: encabezado «En este menú» («Se vende» si `menu.esGeneral`); `checked` =
  `fila?.disponible ?? true`; `aria-label={`${p.nombre} se vende en ${menu.nombre}`}`.
- Columna de precio: el input en línea muestra **el precio del menú** como valor
  (`defaultValue={fila ? String(fila.precio_mxn) : ""}`, `key` con `recarga` y el precio guardado),
  **sin placeholder con otro precio**. Al salir del campo: `precioValido(texto)`; `"invalido"` o
  vacío (`null`) → no guarda y el campo vuelve al valor guardado (en un menú el precio no puede
  quedar vacío); un número distinto al guardado → `guardarFila(p, { precio_mxn })`.
- **Borra la línea «General $…»** bajo la insignia (el `div` con `General {precioMxn(...)}`), y
  cualquier otro texto que compare con el precio de otro menú (spec §3, invariante 7).
- Insignia: `estadoEnMenu(p.estado, fila?.disponible ?? true)` con `ACTIVO` «Activo»,
  `NO_SE_VENDE` «No se vende aquí», `PAUSADO` «Pausado». Filtros en modo menú: Todos, Activos,
  Pausados, No se venden aquí.
- Texto bajo los filtros en modo menú: `Estás viendo ${menu.nombre}. Los cambios llegan a sus cajas en uno o dos minutos.`
- Subtítulo del `PageHeader`: en modo menú, «El menú de tu negocio. Elige un menú para ver y
  ajustar lo que vende y a qué precio.»
- «Nuevo producto» conserva el menú: `router.push("/catalogo/productos/nuevo")` (el formulario lee
  el menú con el mismo hook, Task 8).

- [ ] **Step 3: Types and tests**

```bash
pnpm --filter @vim/admin typecheck
pnpm --filter @vim/admin test
```

- [ ] **Step 4: See it work**

Con «Menú Norte» creado (Task 4), en Catálogo → Productos:

- en Menú Norte: desmarcar Papas → «No se vende aquí»; poner 135 a la Clásica y Enter → se guarda;
  **no aparece ningún «General $…»**;
- cambiar a General: la Clásica sigue en $120 y las Papas encendidas; subir la Clásica a 125 aquí
  y volver a Menú Norte → sigue en 135;
- en la base: `select disponible, precio_mxn from productos_sucursal ps join sucursales s on s.id = ps.sucursal_id where s.codigo = 'KN' and producto_id = 'b0000000-0000-0000-0000-0000000000f1';`
  → `t | 135.00`;
- cambiar rápido entre General y Menú Norte no mezcla precios; tabular entre precios no bloquea;
- borrar el precio y salir del campo → vuelve el valor guardado, no guarda vacío.
- Captura de pantalla; detén el preview.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/app/(panel)/catalogo/productos/page.tsx"
git commit -m "feat(admin): la lista de productos se administra por menú, sin comparar precios

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Categorías por menú, con interruptor

**Files:**
- Modify: `apps/admin/app/(panel)/catalogo/categorias/page.tsx`
- Modify: `apps/admin/app/lib/menus.ts` (una función pura más) y `apps/admin/app/lib/__tests__/menus.test.ts`

**Interfaces:**
- Consumes: `useMenuCatalogo`, `leerFilasDeMenu`, `filasDelGeneral`, `encenderCategoria`, `estadoCategoria` (Tasks 3–4); `listarProductos` (`lib/catalogo.ts`).
- Produces (en `menus.ts`):
  `conteoPorCategoria(productos: { id: string; categoria_id: string }[], filas: Map<string, FilaDeMenu>): Map<string, { seVenden: number; total: number }>`

- [ ] **Step 1: Failing test for the count**

Agrega a `apps/admin/app/lib/__tests__/menus.test.ts` (e importa `conteoPorCategoria`):

```ts
describe("conteo de una categoría en un menú", () => {
  it("cuenta cuántos de sus productos se venden en ese menú", () => {
    const productos = [
      { id: "h1", categoria_id: "hamb" },
      { id: "h2", categoria_id: "hamb" },
      { id: "p1", categoria_id: "papas" },
    ];
    const filas = new Map([
      ["h1", { disponible: true, precio_mxn: 120 }],
      ["h2", { disponible: false, precio_mxn: 150 }],
      ["p1", { disponible: false, precio_mxn: 55 }],
    ]);
    const c = conteoPorCategoria(productos, filas);
    expect(c.get("hamb")).toEqual({ seVenden: 1, total: 2 });
    expect(c.get("papas")).toEqual({ seVenden: 0, total: 1 });
    expect(c.get("vacia")).toBeUndefined();
  });
  it("un producto sin fila todavía cuenta como que se vende", () => {
    const c = conteoPorCategoria([{ id: "x", categoria_id: "c" }], new Map());
    expect(c.get("c")).toEqual({ seVenden: 1, total: 1 });
  });
});
```

Run `pnpm --filter @vim/admin test -- menus` → FAIL (`conteoPorCategoria` no existe).

- [ ] **Step 2: Implement it**

En `apps/admin/app/lib/menus.ts`, después de `estadoCategoria`:

```ts
/** Por categoría: cuántos productos tiene y cuántos se venden en el menú. Sin fila = se vende. */
export function conteoPorCategoria(
  productos: { id: string; categoria_id: string }[],
  filas: Map<string, FilaDeMenu>,
): Map<string, { seVenden: number; total: number }> {
  const conteo = new Map<string, { seVenden: number; total: number }>();
  for (const p of productos) {
    const c = conteo.get(p.categoria_id) ?? { seVenden: 0, total: 0 };
    c.total += 1;
    if (filas.get(p.id)?.disponible ?? true) c.seVenden += 1;
    conteo.set(p.categoria_id, c);
  }
  return conteo;
}
```

Run the test → PASS.

- [ ] **Step 3: The page**

En `catalogo/categorias/page.tsx`, **solo en modo menú** (`menu.visible && menu.listo`; sin él la
página queda como hoy):

1. Carga los productos (`listarProductos()`) y las filas del menú elegido (`filasDelGeneral(prods)`
   si es el General, `leerFilasDeMenu(menu.id)` si no), y calcula
   `conteoPorCategoria(prods, filas)`. Recarga las filas al cambiar `menu.id`, cuidando no pintar
   el conteo de otro menú mientras llega (mismo patrón `vivo` que en Productos).
2. Columna «Productos»: `{seVenden} de {total}` + «productos» (con `tabular-nums`). Una categoría
   sin productos muestra `0` como hoy.
3. Columna nueva «En este menú» (antes de «Orden»; «Se vende» si es el General) con un interruptor
   por categoría, según `estadoCategoria(seVenden, total)`:
   - `encendida`: casilla marcada; al desmarcar → `encenderCategoria(menu.id, c.id, false)`;
   - `apagada`: casilla sin marcar; al marcar → `encenderCategoria(menu.id, c.id, true)`;
   - `parcial`: casilla en estado indeterminado (`ref` con `el.indeterminate = true`) y el texto
     «parcial» al lado; al hacer clic → `encenderCategoria(menu.id, c.id, true)` (enciende el resto);
   - `vacia`: sin interruptor (un guion).
   `aria-label={`${c.nombre} se vende en ${menu.nombre}`}`. Mientras se guarda una categoría, su
   renglón se atenúa y su interruptor se deshabilita; al terminar se releen productos y filas. Un
   error va al `role="alert"` que la página ya tiene.
4. Apagar una categoría con productos **no pide confirmación** (se revierte con un clic), pero el
   texto bajo los filtros lo explica:
   `Estás viendo ${menu.nombre}. Apagar una categoría apaga todos sus productos en este menú.`
5. Bajo ese texto: «El nombre, el orden y el color de las categorías son los mismos en todos los menús.»
6. La columna «Estado» (Activa/Inactiva) y el orden siguen siendo globales, sin cambios.

- [ ] **Step 4: Types, tests, browser**

```bash
pnpm --filter @vim/admin typecheck
pnpm --filter @vim/admin test
```

En el navegador, en Menú Norte: apagar «Hamburguesas» → pasa a «0 de N», y en Productos todas sus
filas dicen «No se vende aquí»; encender una hamburguesa desde Productos → en Categorías se ve
«parcial» con «1 de N»; clic en el interruptor parcial → «N de N». En el General nada de eso cambió.
En la base, `productos_sucursal` de Norte refleja lo apagado. Captura; detén el preview.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/app/(panel)/catalogo/categorias/page.tsx" apps/admin/app/lib/menus.ts apps/admin/app/lib/__tests__/menus.test.ts
git commit -m "feat(admin): categorías por menú — conteo y apagar o encender la categoría entera

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Combos por menú

**Files:**
- Modify: `apps/admin/app/(panel)/catalogo/combos/page.tsx`

**Interfaces:**
- Consumes: `useMenuCatalogo`, `leerFilasDeMenu`, `guardarFilaDeMenu`, `estadoEnMenu`, `MENU_GENERAL`, `FilaDeMenu` (Tasks 3–4); `precioValido`.
- `listarCombos()` (`lib/combos.ts`) devuelve `ComboResumen` con `id`, `nombre`, `precio_base_mxn`, `estado`, `nSlots`, `categoriaNombre`. Para las filas del General hace falta `en_menu_general`: agrégalo a `ComboResumen` y a su `select` en `lib/combos.ts`.

Un combo es un producto: su fila en el menú decide si se vende y su **precio base** en ese menú.

- [ ] **Step 1: Per-menu rows in the combos table**

**Solo en modo menú** (`menu.visible && menu.listo`); sin él, la página queda como hoy.

1. Filas del menú: en el General, `new Map(combos.map((c) => [c.id, { disponible: c.en_menu_general, precio_mxn: c.precio_base_mxn }]))`;
   en un menú propio, `leerFilasDeMenu(menu.id)` (trae todos los productos; se usan las de los combos).
2. En la tabla de escritorio:
   - columna nueva «En este menú» («Se vende» en el General) con casilla
     (`aria-label={`${c.nombre} se vende en ${menu.nombre}`}`); su `td` hace `stopPropagation`
     para no navegar al combo;
   - «Precio base»: input en línea con el precio del menú (mismas reglas que en Productos: Enter
     confirma, `precioValido`, vacío o inválido no guarda y el campo vuelve al valor guardado), su
     `td` con `stopPropagation`;
   - «Estado»: `estadoEnMenu(c.estado, fila?.disponible ?? true)` con las tres insignias de
     Productos. Un combo `AGOTADO` heredado se muestra como hoy.
3. Guardar: `guardarFilaDeMenu(menu.id, c.id, cambio)` y releer (`listarCombos()` en el General,
   `leerFilasDeMenu` en un menú propio). **Una escritura a la vez sin bloquear la tabla**: reusa el
   patrón de cola de `productos/page.tsx` (una promesa encadenada en un `useRef`, solo el renglón
   en cola atenuado). Si te resulta natural, extrae ese patrón a un hook compartido
   `apps/admin/app/lib/cola-escrituras.ts` y úsalo en las dos páginas; si no, replica lo mínimo aquí.
4. La lista móvil (`<ul>` de tarjetas) muestra el precio del menú y la insignia por menú, sin
   edición en línea (se edita abriendo el combo).
5. Sin comparación de precios en ningún lado.
6. El aviso «Un combo nuevo nace Pausado…» se conserva.

- [ ] **Step 2: Types, tests, browser**

```bash
pnpm --filter @vim/admin typecheck
pnpm --filter @vim/admin test
```

En el navegador (crea un combo si la semilla no trae): en Menú Norte, apagar el combo y cambiarle
el precio base; en el General sigue igual. `productos_sucursal` de Norte lo refleja. Captura; detén
el preview.

- [ ] **Step 3: Commit**

```bash
git add "apps/admin/app/(panel)/catalogo/combos/page.tsx" apps/admin/app/lib/combos.ts apps/admin/app/lib
git commit -m "feat(admin): combos por menú — se vende y precio base en línea

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: El formulario de producto, en el menú elegido

**Files:**
- Modify: `apps/admin/app/components/producto-form.tsx`
- Modify: `apps/admin/app/components/disponibilidad-sucursales.tsx` (queda solo «Agotado hoy»)
- Modify: `apps/admin/app/lib/menu-sucursal.ts` (guardar solo el agotado) y su prueba

**Interfaces:**
- Consumes: `useMenuCatalogo` (Task 4); `leerFilasDeMenu`, `guardarFilaDeMenu`, `MENU_GENERAL` (Task 3); `crearProducto(input, { enMenuGeneral })`, `Producto.en_menu_general`.
- Produces (en `menu-sucursal.ts`):
  `guardarAgotado(filas: { producto_id: string; sucursal_id: string; agotado_manual: boolean }[]): Promise<void>`
  (upsert por `(producto_id, sucursal_id)` que solo manda `agotado_manual` y `tenant_id`).

El formulario hoy guarda, por sucursal, «Se vende», «Precio» y «Agotado» (`menu`, `menuExistente`,
`edicionesDeForm`, `filasParaGuardar`, `guardarMenuSucursal`). El precio y el «se vende» pasan al
**menú elegido**; por sucursal solo queda el agotado.

- [ ] **Step 1: Agotado only, in the lib**

En `apps/admin/app/lib/menu-sucursal.ts`:

1. Agrega:

```ts
/**
 * Guarda el «Agotado hoy» de un producto en cada sucursal. Es lo único de productos_sucursal que el
 * panel escribe desde 0155: «se vende» y el precio los pone la base a partir del menú de la sucursal
 * (la guardia los ignora si llegan por aquí).
 */
export async function guardarAgotado(filas: { producto_id: string; sucursal_id: string; agotado_manual: boolean }[]): Promise<void> {
  if (filas.length === 0) return;
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  const tenantId = s.tenantId;
  const { error } = await supabase
    .from("productos_sucursal")
    .upsert(filas.map((f) => ({ ...f, tenant_id: tenantId })), { onConflict: "producto_id,sucursal_id" });
  if (error) throw new Error(error.message);
}

/** Qué sucursales mandar: las que ya tenían fila (aunque se des-agoten) y las que se agotan ahora. */
export function agotadosParaGuardar(
  productoId: string,
  filas: { sucursalId: string; agotado: boolean }[],
  existentes: Pick<FilaMenuSucursal, "sucursal_id">[],
): { producto_id: string; sucursal_id: string; agotado_manual: boolean }[] {
  const conFila = new Set(existentes.map((f) => f.sucursal_id));
  return filas
    .filter((f) => conFila.has(f.sucursalId) || f.agotado)
    .map((f) => ({ producto_id: productoId, sucursal_id: f.sucursalId, agotado_manual: f.agotado }));
}
```

2. Prueba (en `apps/admin/app/lib/__tests__/menu-sucursal.test.ts`, importando `agotadosParaGuardar`):

```ts
describe("agotado hoy por sucursal (0155)", () => {
  it("manda las que se agotan y las que ya tenían fila; no crea filas para lo que no cambia", () => {
    const r = agotadosParaGuardar(
      "p1",
      [
        { sucursalId: "centro", agotado: true },
        { sucursalId: "norte", agotado: false },
        { sucursalId: "sur", agotado: false },
      ],
      [{ sucursal_id: "norte" }],
    );
    expect(r).toEqual([
      { producto_id: "p1", sucursal_id: "centro", agotado_manual: true },
      { producto_id: "p1", sucursal_id: "norte", agotado_manual: false },
    ]);
  });
});
```

3. Borra de `menu-sucursal.ts` lo que deja de usarse tras esta tarea y la Task 5
   (`guardarMenuSucursal`, `edicionesDeForm`, `filasParaGuardar`, `errorPreciosForm`, `esPorDefecto`,
   `filaPorDefecto`, `leerMenuDeSucursal`, `estadoEnSucursal`, `EdicionMenuSucursal`) **solo si**
   `grep -rn` confirma que nadie más lo importa, y quita sus pruebas. Conserva `precioValido`,
   `estadoGeneral`, `leerMenuDeProducto`, `listarSucursalesMenu`, `filasFormIniciales`,
   `FilaFormMenu`, `versionMenor`, `cajasSinMenuPorSucursal`, `hayMenuPorSucursal`,
   `cajasQueNoRespetanMenu`, `VERSION_MINIMA_MENU_SUCURSAL`. Actualiza el comentario de cabecera:
   la captura de precio y disponibilidad vive ahora en `menus.ts` (ADR 0029).

- [ ] **Step 2: «Agotado hoy» table**

`apps/admin/app/components/disponibilidad-sucursales.tsx` queda con **dos columnas**: «Sucursal»
(con la etiqueta «Agotado por inventario» cuando `agotadoAuto`) y «Agotado hoy» (la casilla).
Quita las columnas «Se vende» y «Precio», la prop `precioGeneral`, el `import` de `precioMxn` y
`limpiarPrecio`, y el texto de ayuda sobre el precio. Título: «Agotado hoy». Ayuda:
«El agotado es de la sucursal y del día: no cambia el menú.» Actualiza el comentario del componente.

- [ ] **Step 3: The form edits the chosen menu**

En `apps/admin/app/components/producto-form.tsx`:

1. `const menuCat = useMenuCatalogo();` y `const enMenu = menuCat.visible && menuCat.listo;`
2. Estado nuevo: `const [seVende, setSeVende] = useState(true);` y, para saber si el precio del
   menú ya se cargó, `const [filaMenuLista, setFilaMenuLista] = useState(false);`
3. Al editar un producto en modo menú, cuando `menuCat.listo`:
   - General: `setPrecio(String(producto.precio_base_mxn)); setSeVende(producto.en_menu_general);`
   - menú propio: `leerFilasDeMenu(menuCat.id)` → fila del producto → `setPrecio(String(fila.precio_mxn)); setSeVende(fila.disponible);`
     (si no hay fila, `setError("Este producto no está en este menú. Recarga la página.")`).
   Después `setFilaMenuLista(true)`; fija ahí la línea base de «cambios sin guardar» (el mismo
   mecanismo que hoy usa `menuListo`: `guardado.current = valores` cuando termina la carga), e
   incluye `seVende` en `valores`.
   Producto nuevo: `seVende = true`, precio vacío.
4. Rótulos, solo en modo menú:
   - arriba del campo «Precio», a la derecha de la etiqueta: `en ${menuCat.nombre}`;
   - el `select` «En la caja» pasa a tres opciones: «Se vende» (`ACTIVO` + `seVende`),
     «No se vende en este menú» (`ACTIVO` + `!seVende`), «Pausado · no aparece en ningún menú»
     (`PAUSADO`). Sin modo menú queda como hoy (con «Agotado» si hay una sola sucursal);
   - bajo el fieldset de Disponibilidad: «El precio y si se vende son de {menuCat.nombre}. El
     nombre, la categoría y los datos fiscales son del producto y valen para todos los menús.»
   - producto **nuevo** en un menú propio: «Solo se venderá en {menuCat.nombre}.»
5. `guardar()`:
   - valida el precio con `precioValido(precio)`: `"invalido"` o `null` → `setError("Escribe un precio válido.")`.
   - **editar**: `actualizarProducto(id, datos)` con una salvedad — en un menú propio el precio que
     el dueño tecleó **no** es el del General: pasa a `actualizarProducto` el `precio_base_mxn`
     original del producto (`producto.precio_base_mxn`) y guarda el del menú con
     `guardarFilaDeMenu(menuCat.id, id, { precio_mxn, disponible: seVende })`. En el General,
     `actualizarProducto` lleva el precio tecleado y después
     `guardarFilaDeMenu(MENU_GENERAL, id, { disponible: seVende })`.
   - **crear** en el General (o sin modo menú): `crearProducto(datos)` (nace en todos los menús al
     precio tecleado); si `!seVende`, después `guardarFilaDeMenu(MENU_GENERAL, id, { disponible: false })`.
   - **crear** en un menú propio: `crearProducto(datos, { enMenuGeneral: false })` y luego
     `guardarFilaDeMenu(menuCat.id, id, { disponible: seVende, precio_mxn })`. Si ese segundo paso
     falla: «El producto se creó, pero no se pudo encender en este menú. Vuelve a intentar.» y el
     formulario queda editando ese producto (el mecanismo `idCreado` que ya existe).
   - el agotado: `guardarAgotado(agotadosParaGuardar(id, filasAgotado, menuExistente))`, donde
     `filasAgotado` sale de la tabla «Agotado hoy» (o, con una sola sucursal, del «Agotado» del
     `select`). Reemplaza la llamada a `guardarMenuSucursal(filasParaGuardar(edicionesDeForm(...)))`
     y su manejo de error por este, con el mismo mensaje «El producto se guardó, pero no el agotado
     por sucursal. Vuelve a intentar.»
6. La tabla «Agotado hoy» (`DisponibilidadSucursales`) se muestra con dos o más sucursales, como
   hoy, sin `precioGeneral`. El aviso de cajas viejas (`AvisoCajasMenu`) se conserva.
7. `combos/[id]/page.tsx` reusa `ProductoForm`: verifica que su flujo (`alGuardar`, segundo
   guardado en la misma pantalla) sigue funcionando; el precio del combo es también el del menú elegido.

- [ ] **Step 4: Types, tests, browser**

```bash
pnpm --filter @vim/admin typecheck
pnpm --filter @vim/admin test
```

En el navegador, con Menú Norte elegido:

- abrir la Clásica: el precio es el de Menú Norte (135), no el del General, y dice «en Menú Norte»;
  cambiarlo a 138 y guardar → en el General sigue su precio; en `menu_productos` quedó 138;
- «No se vende en este menú» → en la lista de Menú Norte dice «No se vende aquí»; en el General sigue activo;
- «Nuevo producto» dentro de Menú Norte → avisa «Solo se venderá en Menú Norte.»; al guardar, en
  la base `en_menu_general = false`, su fila de Menú Norte `disponible = true`, y en el General sale
  «No se vende aquí»;
- «Nuevo producto» en el General → aparece encendido en Menú Norte al mismo precio;
- «Agotado hoy» en León Centro → `productos_sucursal.agotado_manual` de Centro en `true`, sin tocar
  precio ni disponible;
- en un negocio de una sucursal (`update sucursales set activa = false where codigo = 'KN';` y sin
  menús) el formulario se ve como antes de 0152.
- Captura; detén el preview y revierte los cambios de datos que no vayas a usar.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/components/producto-form.tsx apps/admin/app/components/disponibilidad-sucursales.tsx apps/admin/app/lib/menu-sucursal.ts apps/admin/app/lib/__tests__/menu-sucursal.test.ts
git commit -m "feat(admin): el formulario de producto edita el menú elegido; por sucursal queda el agotado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: ADR, documentos, tipos y verificación completa

**Files:**
- Create: `docs/decisiones/0029-el-menu-es-de-quien-administra.md`
- Modify: `docs/decisiones/README.md`, `docs/decisiones/0027-el-menu-se-ajusta-por-sucursal.md` (nota de «ajustado por 0029»)
- Modify: `docs/diseno/admin.md` (reemplaza la sección «Menú por sucursal (0152, ADR 0027)»)
- Modify: `packages/db/src/database.types.ts` (regenerado)

- [ ] **Step 1: The ADR**

`docs/decisiones/0029-el-menu-es-de-quien-administra.md`:

```markdown
# 0029 — El menú es de quien administra; la caja lee lo proyectado

**Fecha:** 2026-10-05 · **Estado:** vigente · **Ajusta:** ADR 0027 (menú por sucursal). No lo
revierte: cambia cómo se captura.

## Qué había

Desde 0152 cada sucursal guardaba excepciones por producto (`productos_sucursal`: se vende, precio,
agotado). Funcionaba, pero el dueño no lo encontraba: estaba en un selector dentro de Productos y
en una tabla dentro de cada producto, no tenía nombre, no existía en Categorías ni en Combos, y
comparaba cada precio con el general. En producción nadie lo había usado.

## Qué hacemos ahora (migración 0155)

- **Menús con nombre.** `menus` + `menu_productos`; `sucursales.menu_id` dice cuál usa cada
  sucursal (nulo = el General). El General es el catálogo de siempre: `productos.precio_base_mxn` y
  `productos.en_menu_general`.
- **Un menú propio es una copia independiente.** `crear_menu` copia el General; desde ahí tiene su
  propio precio y su propio «se vende» por producto. Cambiar el General no lo toca. Un producto
  nuevo entra a cada menú al precio con que nació.
- **`productos_sucursal` pasa a ser lo proyectado.** `proyectar_menu()` y sus triggers copian ahí
  (`disponible`, `precio_mxn`) lo que dice el menú de la sucursal. La caja, las RPCs de venta, el
  sync y Uber siguen leyendo esa tabla, sin cambios y sin instalador nuevo. Por REST ya no se
  escriben esas dos columnas; el agotado sigue siendo de la sucursal.
- **El admin trabaja por menú.** Un selector arriba de las pestañas del Catálogo, «Nuevo menú», y
  en cada pestaña el menú elegido: productos, combos y categorías enteras se apagan y se les cambia
  el precio ahí. Sin comparar con el precio de otro menú.
- Crear, editar y borrar un menú va por RPC (toca varias tablas); el menú de una sucursal no se
  cambia por REST.

## Por qué así

- **No se guarda el menú solo como «grupo de sucursales»**: un menú sin sucursales perdería su
  contenido, y dos sucursales del mismo menú podrían divergir sin que nadie lo vea.
- **No se hace que la caja lea el menú directo**: obligaría a otro instalador y a rehacer 0152 dos
  días después de publicarlo, sin que el dueño note diferencia.
- **Precios independientes, no heredados**: sin comparación en pantalla, una herencia «salvo lo que
  toqué» no se ve, y un precio que cambia solo en otro menú es una sorpresa.

## Consecuencias

- Subir un precio en todos los menús exige cambiarlo en cada uno. Si molesta, la salida es una
  acción «aplicar a todos», no volver a heredar.
- Los menús propios son densos (una fila por producto, y otra proyectada por sucursal).
- Apagar una categoría es una acción sobre sus productos, no un estado: un producto nuevo en una
  categoría apagada nace encendido.
- `menus` y `menu_productos` no bajan a la caja; `sucursales.menu_id` sí viaja y la caja lo ignora.
```

En `docs/decisiones/README.md`, la fila después de la de 0028:

```markdown
| [0029](0029-el-menu-es-de-quien-administra.md) | El menú es de quien administra; la caja lee lo proyectado | 05/10/2026 |
```

En `docs/decisiones/0027-el-menu-se-ajusta-por-sucursal.md`, bajo la línea de Fecha/Estado:

```markdown
> **Ajustado por [ADR 0029](0029-el-menu-es-de-quien-administra.md) (5 oct 2026):** el precio y el
> «se vende» por sucursal ya no se capturan como excepciones; los proyecta la base desde el menú de
> la sucursal. La regla de venta, el agotado por sucursal y lo que lee la caja siguen como aquí.
```

- [ ] **Step 2: Admin design doc**

En `docs/diseno/admin.md`, reemplaza la sección «Menú por sucursal (0152, ADR 0027)» completa por:

```markdown
## Menús del catálogo (0155, ADR 0029)

La franja de menús aparece arriba de las pestañas del Catálogo cuando el negocio tiene dos o más
sucursales, o algún menú propio; con una sola sucursal, el Catálogo se ve como siempre.

- **Una pastilla por menú**, con las sucursales que lo usan en gris. «General» siempre va primero.
  El menú elegido se recuerda entre pestañas y entre visitas.
- **«Nuevo menú»** pide nombre y sucursales. Arranca igual que el General; si una sucursal viene de
  otro menú propio, se dice antes de guardar. Eliminar nombra la consecuencia: sus sucursales
  vuelven al General.
- **Cada pestaña trabaja sobre el menú elegido.** Productos y Combos: casilla «En este menú» y
  precio en línea. Categorías: «N de M productos» y un interruptor que apaga o enciende la
  categoría entera (con parte encendida se ve «parcial»). Modificadores y Recetas dicen que son los
  mismos en todos los menús.
- **No se comparan precios.** En un menú se ve solo su precio; nunca el de otro menú al lado.
- **Formulario de producto:** el precio y «se vende» son del menú elegido, y lo dice junto al
  campo; el resto es del producto. Un producto creado dentro de un menú propio solo se vende ahí, y
  el formulario lo avisa antes de guardar.
- **El agotado no es del menú.** Es de la sucursal y del día: en el formulario queda «Agotado hoy»
  con una casilla por sucursal.
- **Escrituras en línea:** entran en cola, una a la vez, y ninguna se pierde; solo se atenúa el
  renglón que se está guardando.
- **Aviso de cajas viejas** (anteriores a la 0.4.110): se conserva; una caja así no respeta ningún menú.
```

- [ ] **Step 3: Types**

```bash
supabase db reset
pnpm db:types
git diff --stat packages/db/src/database.types.ts
```

Expected: el diff agrega `menus`, `menu_productos`, `sucursales.menu_id`, `productos.en_menu_general`
y las funciones nuevas.

- [ ] **Step 4: Full verification**

```bash
pnpm --filter @vim/admin test && pnpm --filter @vim/admin typecheck
pnpm --filter @vim/pos test && pnpm --filter @vim/pos typecheck
pnpm test:functions
pnpm test:escritorio
supabase db reset && supabase test db
cd desktop && npm run smokes && npm run verify:migraciones && npm run verify:sync
```

Expected: todo en verde. Intermitentes conocidas y ajenas: `desktop/src/endurecimiento.test.mjs`
(libuv en Windows), `ui-server.test.mjs` («un escritorio viejo sin el gancho…») y un
«PostgREST no respondió» justo después de los smokes — si pasa, reintenta una vez y repórtalo.
Cualquier otra falla se investiga aquí.

- [ ] **Step 5: The register still sells each branch's menu (end to end, local)**

Con «Menú Norte» en local (precio propio y algo apagado), abre el POS empaquetado en el navegador
(receta de la memoria «Reproducir el POS sin Docker»: `npm run build:ui` en `desktop/` y el
`ui-server`; ejemplo de arnés en `desktop/scripts/arnes-pantalla-cliente.mjs`) para una caja de cada
sucursal: Norte ve y cobra su menú, Centro el General. No hay código de caja nuevo: es la prueba de
que la proyección alimenta lo que la 0.4.110 ya lee. Captura.

- [ ] **Step 6: Commit**

```bash
git add docs/decisiones docs/diseno/admin.md packages/db/src/database.types.ts
git commit -m "docs: ADR 0029 menús del catálogo; diseño del admin y tipos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Entrega (cada paso, con el OK de Fermín)

Todo lo de esta tarea sale a producción. **Nada se hace sin un sí explícito de Fermín en el chat.**

- [ ] **Step 1: La lista de lo que incluye y su OK**

Qué cambia para el dueño (franja de menús, «Nuevo menú», productos/combos/categorías por menú, sin
comparación de precios, «Agotado hoy» por sucursal), qué deja de existir (el selector de sucursal
en Productos y la tabla de precios por sucursal), y que **no hay instalador**: las cajas 0.4.110 ya
lo respetan.

- [ ] **Step 2: Poner la rama al día**

```bash
git fetch origin
git rebase origin/main
```

Si `origin/main` ya tomó `0155`, `0037` o el ADR `0029`, renumera (migración, prueba, ADR y sus
menciones) y vuelve a correr la Task 9 Step 4.

- [ ] **Step 3: Migración a producción ANTES de mezclar**

```bash
supabase migration list
supabase db push --dry-run --include-all
supabase db push --yes --include-all
```

El `--dry-run` debe listar solo la migración de menús. Después, en producción: `select count(*) from menus;`
(0) y que una venta normal sigue cobrando igual.

- [ ] **Step 4: Mezclar y subir**

Según lo que Fermín elija (mezcla local + push, o PR). Vercel publica el admin. CI en verde.

- [ ] **Step 5: Comprobar en producción**

En el admin de producción, con el negocio de dos sucursales: aparece la franja; crear un menú de
prueba **solo si Fermín lo pide**.
