# Menú distinto por sucursal — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendada) o
> superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas
> (`- [ ]`) para el seguimiento.

**Meta:** que cada sucursal de un negocio pueda apagar productos, cobrarlos a otro precio y
agotarlos por su cuenta, y que el agotado automático por insumos deje de agotar en todas.

**Arquitectura:** una tabla escasa `productos_sucursal` (una fila por producto y sucursal, solo lo
que cambia; sin fila = lo general). El servidor cobra con `precio_producto_en_sucursal`; la caja
ajusta el catálogo con la misma regla en TS (`aplicarSucursal`); Uber, con `aplicarSucursalCarta`.
Las columnas `agotado_*` de `productos` pasan a ser «agotado en todas» y las mantiene un trigger,
para que las cajas sin actualizar sigan funcionando.

**Stack:** Postgres/Supabase (plpgsql, RLS, pgTAP), Next.js + React (apps/pos, apps/admin, vitest),
Electron + Node (desktop, node:test), Edge Functions Deno (pruebas con node --test).

**Spec:** [`docs/superpowers/specs/2026-10-02-menu-por-sucursal-design.md`](../specs/2026-10-02-menu-por-sucursal-design.md)
— léelo antes de empezar; este plan argumenta desde él.

## Restricciones globales

- Todo se trabaja en `vim-pos/`, rama `feat/menu-por-sucursal` (ya existe, con el spec).
- **Una sola migración:** `supabase/migrations/0151_menu_por_sucursal.sql`. Las tareas 1–4 la van
  completando en orden (§1–§11). **No se aplica a producción** hasta la tarea 11, y solo con el OK
  de Fermín.
- Una función que se redefine se copia **íntegra** desde su última versión y se le pone
  `SET search_path = public, extensions, pg_temp` (0111 lo perdió en las de venta; 0044 lo había
  puesto a todas).
- Español en el dominio, SQL en `snake_case`, archivos `kebab-case`, componentes `PascalCase`.
  Sin `any`. Dinero en `numeric(12,2)`.
- RLS sagrado: toda tabla con `tenant_id` lleva política. Nada de `service_role` en apps/pos ni apps/admin.
- Cada commit termina con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Pruebas** (desde `vim-pos/`):
  - Smokes `.sql`: `cd desktop && node scripts/smokes.mjs <archivo.sql>` (Postgres embebido recién
    sembrado). **No los corras con el backend de dev arriba**: el runner mata los `postgres.exe` del checkout.
  - pgTAP: `supabase start` (Docker está instalado), `supabase db reset`, `supabase test db`.
  - Unitarias: `pnpm --filter @vim/pos test`, `pnpm --filter @vim/admin test`, `pnpm test:functions`,
    `pnpm test:escritorio`.
  - Tipos: `pnpm --filter @vim/pos typecheck` y `pnpm --filter @vim/admin typecheck`. **Nunca
    `next build`**: comparte `.next` con el dev server y lo rompe.
- **UI del admin:** antes de escribir clases, carga la skill `emil-design-eng` y lee
  `docs/diseno/admin.md` + `docs/diseno/nucleo.md`. Reusa las clases que ya usan
  `producto-form.tsx` y `catalogo/productos/page.tsx`; no inventes colores.
- **Fixture de la semilla** (`supabase/seed.sql`), usado por smokes y pgTAP:

  | Qué | id |
  |---|---|
  | Negocio Knock-Out dev | `99999999-0000-0000-0000-0000000000aa` |
  | Sucursal León Centro | `99999999-0000-0000-0000-0000000000bb` |
  | Caja 01 (Centro) | `99999999-0000-0000-0000-0000000000cc` |
  | María (CAJERO, PIN 1234) | `99999999-0000-0000-0000-000000000001` |
  | Dueño (acceso a todas) | `99999999-0000-0000-0000-0000000000e1` |
  | Categoría Hamburguesas | `a0000000-0000-0000-0000-0000000000c1` |
  | Hamburguesa Clásica $120 | `b0000000-0000-0000-0000-0000000000f1` |
  | Papas Gajo $55 | `b0000000-0000-0000-0000-0000000000f2` |

  El plan del seed permite **una** sucursal: para abrir otra, `tenant_limites.max_sucursales = 5`
  (lo mismo que haría el panel).

---

### Tarea 1: La tabla, sus guardias, el agotado derivado y la regla en SQL

**Archivos:**
- Crear: `supabase/migrations/0151_menu_por_sucursal.sql` (§1–§6)
- Crear: `supabase/tests/0035_menu_por_sucursal.test.sql`

**Interfaces:**
- Produce (SQL):
  - tabla `productos_sucursal(tenant_id, producto_id, sucursal_id, disponible, precio_mxn, agotado_manual, agotado_automatico, motivo_agotado, created_at, updated_at)`, PK `(producto_id, sucursal_id)`;
  - `precio_producto_en_sucursal(p_producto uuid, p_sucursal uuid) RETURNS numeric`;
  - `motivo_no_disponible_en_sucursal(p_producto uuid, p_sucursal uuid) RETURNS text` → `NULL | 'PAUSADO' | 'NO_SE_VENDE' | 'AGOTADO'`.

- [ ] **Paso 1: Escribir la prueba pgTAP que falla**

`supabase/tests/0035_menu_por_sucursal.test.sql`:

```sql
-- ============================================================================
-- 0151 · menú por sucursal: la tabla, quién la escribe, la regla de precio y disponibilidad,
-- y el agotado del producto como «agotado en todas».
-- ============================================================================
begin;
select plan(22);

\set t         '99999999-0000-0000-0000-0000000000aa'
\set centro    '99999999-0000-0000-0000-0000000000bb'
\set norte     '35353535-0000-0000-0000-0000000000b2'
\set cajero    '99999999-0000-0000-0000-000000000001'
\set dueno     '99999999-0000-0000-0000-0000000000e1'
\set clas      'b0000000-0000-0000-0000-0000000000f1'
\set papas     'b0000000-0000-0000-0000-0000000000f2'
\set otro      '35353535-0000-0000-0000-0000000000aa'
\set suc_otro  '35353535-0000-0000-0000-0000000000b9'
\set cat_otro  '35353535-0000-0000-0000-0000000000c9'
\set prod_otro '35353535-0000-0000-0000-0000000000f9'

-- SETUP (superusuario, sin request.path: las guardias no actúan)
insert into tenant_limites (tenant_id, max_sucursales) values (:'t', 5)
  on conflict (tenant_id) do update set max_sucursales = 5;
insert into sucursales (id, tenant_id, codigo, nombre) values (:'norte', :'t', 'KN', 'León Norte');
insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  values (:'otro', 'tenant-0035', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
insert into sucursales (id, tenant_id, codigo, nombre) values (:'suc_otro', :'otro', 'OT', 'Otra');
insert into categorias (id, tenant_id, nombre) values (:'cat_otro', :'otro', 'Otra categoría');
insert into productos (id, tenant_id, categoria_id, nombre, precio_base_mxn)
  values (:'prod_otro', :'otro', :'cat_otro', 'Ajeno', 10);
insert into productos_sucursal (tenant_id, producto_id, sucursal_id, precio_mxn)
  values (:'otro', :'prod_otro', :'suc_otro', 12);

-- 1) La tabla y su llave.
select has_table('public', 'productos_sucursal', 'existe productos_sucursal');
select col_is_pk('public', 'productos_sucursal', array['producto_id', 'sucursal_id'], 'la llave es (producto, sucursal)');

-- 2) Sin fila = lo general.
select is(precio_producto_en_sucursal(:'clas', :'norte'), 120.00::numeric, 'sin fila, el precio es el general');
select is(motivo_no_disponible_en_sucursal(:'clas', :'norte'), null::text, 'sin fila, se vende');

-- 3) Precio propio en Norte; Centro sigue con el general.
insert into productos_sucursal (tenant_id, producto_id, sucursal_id, precio_mxn) values (:'t', :'clas', :'norte', 135);
select is(precio_producto_en_sucursal(:'clas', :'norte'), 135.00::numeric, 'con precio propio, cobra ese');
select is(precio_producto_en_sucursal(:'clas', :'centro'), 120.00::numeric, 'la otra sucursal sigue con el general');

-- 4) Apagado en Norte.
update productos_sucursal set disponible = false where producto_id = :'clas' and sucursal_id = :'norte';
select is(motivo_no_disponible_en_sucursal(:'clas', :'norte'), 'NO_SE_VENDE', 'apagado en Norte');
select is(motivo_no_disponible_en_sucursal(:'clas', :'centro'), null::text, 'en Centro se sigue vendiendo');

-- 5) Agotado por sucursal y el producto como «agotado en todas» (dos sucursales activas).
insert into productos_sucursal (tenant_id, producto_id, sucursal_id, agotado_manual) values (:'t', :'papas', :'centro', true);
select is(motivo_no_disponible_en_sucursal(:'papas', :'centro'), 'AGOTADO', 'agotado en Centro');
select is((select agotado_manual from productos where id = :'papas'), false,
  'agotado en una de dos sucursales: el producto NO queda agotado en todas');
insert into productos_sucursal (tenant_id, producto_id, sucursal_id, agotado_manual) values (:'t', :'papas', :'norte', true);
select is((select agotado_manual from productos where id = :'papas'), true,
  'agotado en las dos: el producto queda agotado en todas (lo leen las cajas sin actualizar)');
update productos_sucursal set agotado_manual = false where producto_id = :'papas' and sucursal_id = :'centro';
select is((select agotado_manual from productos where id = :'papas'), false,
  'al volver una, deja de estar agotado en todas');

-- 6) Pausar es global y gana.
update productos set estado = 'PAUSADO' where id = :'papas';
select is(motivo_no_disponible_en_sucursal(:'papas', :'centro'), 'PAUSADO', 'pausar es global y gana');
update productos set estado = 'ACTIVO' where id = :'papas';

-- 7) Coherencia: la sucursal tiene que ser del negocio del producto, y el negocio sale del producto.
select throws_ok(
  format($$ insert into productos_sucursal (tenant_id, producto_id, sucursal_id) values (%L, %L, %L) $$, :'t', :'clas', :'suc_otro'),
  '23514', null, 'no se apunta a la sucursal de otro negocio');
insert into productos_sucursal (tenant_id, producto_id, sucursal_id) values (:'otro', :'clas', :'centro');
select is((select tenant_id from productos_sucursal where producto_id = :'clas' and sucursal_id = :'centro'), :'t'::uuid,
  'el negocio de la fila sale del producto, no de lo que mande el cliente');

-- Como la cajera.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'cajero', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 8) Lee las de su negocio (la caja las necesita) y no las ajenas.
select is((select count(*)::int from productos_sucursal where tenant_id = :'otro'), 0, 'no se ven las filas de otro negocio');
select ok((select count(*) from productos_sucursal) > 0, 'la cajera lee las de su negocio');

-- 9) Por REST directo no las escribe.
select set_config('request.path', '/productos_sucursal', true);
select throws_ok(
  format($$ update productos_sucursal set precio_mxn = 1 where producto_id = %L and sucursal_id = %L $$, :'clas', :'norte'),
  '42501', null, 'una cajera no cambia el precio de una sucursal por REST');

-- Como el dueño, por REST (el panel).
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 10) El dueño sí, salvo el agotado por inventario, y no borra.
select lives_ok(
  format($$ update productos_sucursal set precio_mxn = 140, agotado_automatico = true where producto_id = %L and sucursal_id = %L $$, :'clas', :'norte'),
  'el dueño cambia el precio de Norte desde el panel');
select is((select agotado_automatico from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), false,
  'pero el agotado por inventario no se escribe a mano');
select is((select precio_mxn from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), 140.00::numeric,
  'y el precio sí quedó');
select throws_ok(
  format($$ delete from productos_sucursal where producto_id = %L and sucursal_id = %L $$, :'clas', :'norte'),
  '42501', null, 'las filas no se borran: el pull de la caja no trae bajas');

reset role;

select * from finish();
rollback;
```

- [ ] **Paso 2: Correrla y ver que falla**

```bash
supabase start
supabase db reset
supabase test db
```

Esperado: `0035_menu_por_sucursal.test.sql` falla en `has_table` (la tabla no existe) y el resto
aborta. Las demás pruebas siguen en verde.

- [ ] **Paso 3: Escribir §1–§6 de la migración**

`supabase/migrations/0151_menu_por_sucursal.sql`:

```sql
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
```

- [ ] **Paso 4: Correr las pruebas y verlas pasar**

```bash
supabase db reset
supabase test db
```

Esperado: `0035_menu_por_sucursal.test.sql .. ok` y todas las demás en verde (en particular
`0002`, que exige RLS y política en toda tabla con `tenant_id`, y `0018`, la guardia del dinero).

- [ ] **Paso 5: La migración aplica en el Postgres de la caja**

```bash
cd desktop && npm run verify:migraciones
```

Esperado: aplica 0001–0151 en un Postgres vacío sin errores.

- [ ] **Paso 6: Commit**

```bash
git add supabase/migrations/0151_menu_por_sucursal.sql supabase/tests/0035_menu_por_sucursal.test.sql
git commit -m "feat(db): productos_sucursal — menú por sucursal, guardias y agotado derivado (0151)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 2: El servidor cobra el precio de la sucursal del ticket

**Archivos:**
- Modificar: `supabase/migrations/0151_menu_por_sucursal.sql` (agregar §7)
- Crear: `supabase/scripts/smoke_menu_sucursal.sql`
- Modificar: `supabase/scripts/smoke_combos.sql:88` y `:95`
- Modificar: `desktop/src/delivery-espejo.mjs:62-63`
- Modificar: `desktop/src/delivery-espejo.test.mjs` (agregar una prueba al final)

**Interfaces:**
- Consume: `precio_producto_en_sucursal`, `motivo_no_disponible_en_sucursal` (Tarea 1).
- Produce: `agregar_item_a_ticket` y `agregar_combo_a_ticket` con la misma firma que en 0111.
  Mensajes nuevos/estables: `'El producto "%" no se vende en esta sucursal'` y
  `'El producto "%" está agotado o pausado'`. Código de la caja nuevo: `PRODUCTO_NO_SE_VENDE`.

- [ ] **Paso 1: Escribir el smoke que falla**

`supabase/scripts/smoke_menu_sucursal.sql`:

```sql
-- Smoke menú por sucursal (ADR 0027, spec 2026-10-02 §5 y §4.5). Sobre la semilla de dev: abre una
-- segunda sucursal (Norte) con su caja, le pone otro precio a la Clásica y al combo, apaga las
-- papas, y vende en las dos. ROLLBACK.
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
  v_turno_c uuid; v_turno_n uuid; v_t_c uuid; v_t_n uuid; v_item uuid;
  v_combo uuid; v_g_hamb uuid; v_g_acom uuid; v_padre uuid;
  v_precio numeric; v_bool boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  -- Segunda sucursal con su caja. El plan del seed permite una: se amplía como lo haría el panel.
  INSERT INTO tenant_limites (tenant_id, max_sucursales) VALUES (v_tenant, 5)
    ON CONFLICT (tenant_id) DO UPDATE SET max_sucursales = 5;
  INSERT INTO sucursales (id, tenant_id, codigo, nombre) VALUES (v_norte, v_tenant, 'KN', 'León Norte');
  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre) VALUES (v_caja_n, v_tenant, v_norte, 1, 'Caja Norte');

  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja_c AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_centro, v_caja_c, 'SMOKE-MS-C', calcular_dia_contable(v_tenant), v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno_c;
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_norte, v_caja_n, 'SMOKE-MS-N', calcular_dia_contable(v_tenant), v_dueno, 500, 'TOTAL')
  RETURNING id INTO v_turno_n;

  v_t_c := abrir_ticket(v_centro, v_caja_c, v_turno_c, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ms-c1', v_maria);
  v_t_n := abrir_ticket(v_norte,  v_caja_n, v_turno_n, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ms-n1', v_dueno);

  -- 1) Precio por sucursal: la Clásica cuesta 135 en Norte; en Centro sigue en 120.
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, precio_mxn) VALUES (v_tenant, v_clas, v_norte, 135);
  v_item := agregar_item_a_ticket(v_t_c, v_clas, 1, NULL, '[]'::jsonb, 'smoke-ms-c1-i');
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE id = v_item;
  IF v_precio <> 120 THEN RAISE EXCEPTION 'Centro debe cobrar 120, cobró %', v_precio; END IF;
  v_item := agregar_item_a_ticket(v_t_n, v_clas, 1, NULL, '[]'::jsonb, 'smoke-ms-n1-i');
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE id = v_item;
  IF v_precio <> 135 THEN RAISE EXCEPTION 'Norte debe cobrar 135, cobró %', v_precio; END IF;
  RAISE NOTICE 'precio por sucursal OK: Centro 120, Norte 135';

  -- 2) Combo por sucursal: base 45 (50 en Norte) + Clásica (SUMA) + papas (delta 10).
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, es_combo, clave_sat)
  VALUES (v_tenant, v_cat_h, 'Combo smoke ms', 45, true, '90101503') RETURNING id INTO v_combo;
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio, categoria_id)
  VALUES (v_tenant, v_combo, 'Hamburguesa', 1, 'SUMA_PRECIO_PRODUCTO', v_cat_h) RETURNING id INTO v_g_hamb;
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio)
  VALUES (v_tenant, v_combo, 'Acompañamiento', 2, 'DELTA') RETURNING id INTO v_g_acom;
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id, precio_delta_mxn, es_default)
  VALUES (v_tenant, v_g_acom, v_papas, 10, true);
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, precio_mxn) VALUES (v_tenant, v_combo, v_norte, 50);

  v_padre := agregar_combo_a_ticket(v_t_c, v_combo, 1, jsonb_build_array(
    jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas,  'cantidad', 1),
    jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1)), '[]'::jsonb, NULL, 'smoke-ms-c-combo');
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE id = v_padre;
  IF v_precio <> 175 THEN RAISE EXCEPTION 'combo en Centro debe ser 45+120+10 = 175, es %', v_precio; END IF;

  v_padre := agregar_combo_a_ticket(v_t_n, v_combo, 1, jsonb_build_array(
    jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas,  'cantidad', 1),
    jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1)), '[]'::jsonb, NULL, 'smoke-ms-n-combo');
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE id = v_padre;
  IF v_precio <> 195 THEN RAISE EXCEPTION 'combo en Norte debe ser 50+135+10 = 195, es %', v_precio; END IF;
  -- El prorrateo usa la carta de la sucursal (135 y 55) y tiene que cuadrar con el padre.
  SELECT sum(precio_asignado_mxn) INTO v_precio FROM ticket_items WHERE parent_item_id = v_padre;
  IF v_precio <> 195 THEN RAISE EXCEPTION 'el prorrateo en Norte debe sumar 195, suma %', v_precio; END IF;
  SELECT precio_unitario_original_snapshot INTO v_precio FROM ticket_items WHERE parent_item_id = v_padre AND producto_id = v_clas;
  IF v_precio <> 135 THEN RAISE EXCEPTION 'el hijo Clásica en Norte guarda su carta de 135, guarda %', v_precio; END IF;
  RAISE NOTICE 'combo por sucursal OK: Centro 175, Norte 195';

  -- 3) Apagar las papas en Norte: el combo de Norte las rechaza; en Centro se siguen vendiendo.
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, disponible) VALUES (v_tenant, v_papas, v_norte, false)
    ON CONFLICT (producto_id, sucursal_id) DO UPDATE SET disponible = false;
  BEGIN
    PERFORM agregar_combo_a_ticket(v_t_n, v_combo, 1, jsonb_build_array(
      jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas,  'cantidad', 1),
      jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1)), '[]'::jsonb, NULL, 'smoke-ms-n-x1');
    RAISE EXCEPTION 'debió fallar: las papas no se venden en Norte';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%no se vende en esta sucursal%' THEN RAISE; END IF; END;
  PERFORM agregar_combo_a_ticket(v_t_c, v_combo, 1, jsonb_build_array(
    jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas,  'cantidad', 1),
    jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1)), '[]'::jsonb, NULL, 'smoke-ms-c-combo2');
  -- El agregado suelto NO valida (invariante 7): un pedido de Uber pagado no se pierde por una carta vieja.
  PERFORM agregar_item_a_ticket(v_t_n, v_papas, 1, NULL, '[]'::jsonb, 'smoke-ms-n-papas');
  RAISE NOTICE 'disponibilidad por sucursal OK';

  -- 4) Agotar a mano solo en Centro: el combo de Centro lo rechaza y el producto no queda agotado en todas.
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, agotado_manual) VALUES (v_tenant, v_papas, v_centro, true)
    ON CONFLICT (producto_id, sucursal_id) DO UPDATE SET agotado_manual = true;
  BEGIN
    PERFORM agregar_combo_a_ticket(v_t_c, v_combo, 1, jsonb_build_array(
      jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas,  'cantidad', 1),
      jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1)), '[]'::jsonb, NULL, 'smoke-ms-c-x2');
    RAISE EXCEPTION 'debió fallar: papas agotadas en Centro';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%agotado o pausado%' THEN RAISE; END IF; END;
  SELECT agotado_manual INTO v_bool FROM productos WHERE id = v_papas;
  IF v_bool THEN RAISE EXCEPTION 'agotar en una de dos sucursales no debe agotar el producto en todas'; END IF;
  RAISE NOTICE 'agotado manual por sucursal OK';

  -- §5 (agotado automático) lo agrega la Tarea 3, aquí arriba de esta línea.
END $$;
ROLLBACK;
```

- [ ] **Paso 2: Correrlo y ver que falla**

```bash
cd desktop && node scripts/smokes.mjs smoke_menu_sucursal.sql
```

Esperado: ❌ con `Norte debe cobrar 135, cobró 120` (la RPC todavía usa el precio general).

- [ ] **Paso 3: Agregar §7 a la migración**

Al final de `supabase/migrations/0151_menu_por_sucursal.sql`:

```sql
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
```

- [ ] **Paso 4: `smoke_combos.sql` agota por sucursal**

En `supabase/scripts/smoke_combos.sql`, reemplazar la línea 88:

```sql
  UPDATE productos SET agotado_manual = true, estado = 'AGOTADO' WHERE id = v_papas;
```

por:

```sql
  -- 0151: el agotado es por sucursal.
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, agotado_manual) VALUES (v_tenant, v_papas, v_suc, true)
    ON CONFLICT (producto_id, sucursal_id) DO UPDATE SET agotado_manual = true;
```

y la línea 95:

```sql
  UPDATE productos SET agotado_manual = false, estado = 'ACTIVO' WHERE id = v_papas;
```

por:

```sql
  UPDATE productos_sucursal SET agotado_manual = false WHERE producto_id = v_papas AND sucursal_id = v_suc;
```

- [ ] **Paso 5: La caja traduce el rechazo nuevo de un pedido de app**

En `desktop/src/delivery-espejo.mjs`, después de la línea
`if (m.includes("está agotado o pausado")) return "PRODUCTO_AGOTADO";` agregar:

```js
  // 0151: el componente existe pero esta sucursal no lo vende (productos_sucursal.disponible = false).
  if (m.includes("no se vende en esta sucursal")) return "PRODUCTO_NO_SE_VENDE";
```

Al final de `desktop/src/delivery-espejo.test.mjs`:

```js
test("codigoDeError: un componente que la sucursal no vende (0151)", () => {
  assert.equal(codigoDeError('El producto "Papas" no se vende en esta sucursal'), "PRODUCTO_NO_SE_VENDE");
  assert.equal(codigoDeError('El producto "Papas" está agotado o pausado'), "PRODUCTO_AGOTADO");
});
```

(`test`, `assert` y `codigoDeError` ya están importados en ese archivo.)

- [ ] **Paso 6: Correr todo lo tocado**

```bash
cd desktop && node scripts/smokes.mjs smoke_menu_sucursal.sql smoke_combos.sql smoke_combos_uber.sql smoke_delivery_app.sql smoke_cuenta_mesa.sql
cd .. && pnpm test:escritorio
```

Esperado: ✅ en los cinco smokes (los NOTICE de `smoke_menu_sucursal` llegan hasta «agotado manual
por sucursal OK») y `pnpm test:escritorio` en verde.

- [ ] **Paso 7: Commit**

```bash
git add supabase/migrations/0151_menu_por_sucursal.sql supabase/scripts/smoke_menu_sucursal.sql supabase/scripts/smoke_combos.sql desktop/src/delivery-espejo.mjs desktop/src/delivery-espejo.test.mjs
git commit -m "feat(db): las RPCs de venta cobran el precio de la sucursal del ticket (0151)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 3: El agotado automático agota solo en la sucursal que se quedó sin insumo

**Archivos:**
- Modificar: `supabase/migrations/0151_menu_por_sucursal.sql` (agregar §8)
- Modificar: `supabase/scripts/smoke_menu_sucursal.sql` (agregar §5)
- Modificar: `supabase/scripts/smoke_combos.sql:181-183`
- Modificar: `supabase/scripts/smoke_sync_inventario.sql:96-103`

**Interfaces:**
- Consume: `productos_sucursal` y su trigger derivado (Tarea 1).
- Produce: `evaluar_alertas_stock(p_insumo_id uuid, p_sucursal_id uuid) RETURNS void` con la misma
  firma; escribe `productos_sucursal.agotado_automatico` en vez de `productos`.

- [ ] **Paso 1: Agregar al smoke la prueba del bug**

En `supabase/scripts/smoke_menu_sucursal.sql`, agregar `v_pza uuid; v_pan uuid;` a la línea de
variables `v_precio numeric; v_bool boolean;` (queda `v_precio numeric; v_bool boolean; v_pza uuid; v_pan uuid;`)
y reemplazar la línea `-- §5 (agotado automático) lo agrega la Tarea 3, aquí arriba de esta línea.` por:

```sql
  -- 5) Agotado automático por sucursal (el bug de 0007:1684-1723). Pan con receta crítica en la Clásica:
  -- Centro sin pan, Norte con 5.
  SELECT id INTO v_pza FROM unidades_medida WHERE tenant_id = v_tenant AND codigo = 'PZA' LIMIT 1;
  INSERT INTO insumos (tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
  VALUES (v_tenant, 'Pan smoke ms', v_pza, 'PANIFICACION', 4) RETURNING id INTO v_pan;
  INSERT INTO insumo_stock_sucursal (tenant_id, insumo_id, sucursal_id, stock_actual)
  VALUES (v_tenant, v_pan, v_centro, 0), (v_tenant, v_pan, v_norte, 5);
  DELETE FROM recetas WHERE producto_id = v_clas;
  PERFORM guardar_receta(v_clas, true, NULL, jsonb_build_array(jsonb_build_object(
    'insumo_id', v_pan, 'cantidad', 1, 'cantidad_capturada', 1, 'unidad_capturada_id', v_pza,
    'es_critico', true, 'notas', NULL, 'orden', 0)));

  PERFORM evaluar_alertas_stock(v_pan, v_centro);
  SELECT agotado_automatico INTO v_bool FROM productos_sucursal WHERE producto_id = v_clas AND sucursal_id = v_centro;
  IF NOT coalesce(v_bool, false) THEN RAISE EXCEPTION 'sin pan en Centro, la Clásica debe quedar agotada en Centro'; END IF;
  SELECT agotado_automatico INTO v_bool FROM productos_sucursal WHERE producto_id = v_clas AND sucursal_id = v_norte;
  IF coalesce(v_bool, false) THEN RAISE EXCEPTION 'el pan que falta en Centro no debe agotar la Clásica en Norte'; END IF;
  SELECT agotado_automatico INTO v_bool FROM productos WHERE id = v_clas;
  IF v_bool THEN RAISE EXCEPTION 'agotada en una de dos sucursales: el producto no queda agotado en todas'; END IF;

  -- Reabastecer Norte NO des-agota Centro (antes sí: el restablecimiento actualizaba el producto entero).
  UPDATE insumo_stock_sucursal SET stock_actual = 10 WHERE insumo_id = v_pan AND sucursal_id = v_norte;
  PERFORM evaluar_alertas_stock(v_pan, v_norte);
  SELECT agotado_automatico INTO v_bool FROM productos_sucursal WHERE producto_id = v_clas AND sucursal_id = v_centro;
  IF NOT v_bool THEN RAISE EXCEPTION 'reabastecer Norte des-agotó la Clásica en Centro (el bug)'; END IF;

  -- Reabastecer Centro sí.
  UPDATE insumo_stock_sucursal SET stock_actual = 3 WHERE insumo_id = v_pan AND sucursal_id = v_centro;
  PERFORM evaluar_alertas_stock(v_pan, v_centro);
  SELECT agotado_automatico INTO v_bool FROM productos_sucursal WHERE producto_id = v_clas AND sucursal_id = v_centro;
  IF v_bool THEN RAISE EXCEPTION 'con pan otra vez en Centro, la Clásica debe volver'; END IF;
  RAISE NOTICE 'agotado automático por sucursal OK';
```

- [ ] **Paso 2: Correrlo y ver que falla**

```bash
cd desktop && node scripts/smokes.mjs smoke_menu_sucursal.sql
```

Esperado: ❌ `sin pan en Centro, la Clásica debe quedar agotada en Centro` (la función vieja escribe en `productos`).

- [ ] **Paso 3: Agregar §8 a la migración**

Al final de `supabase/migrations/0151_menu_por_sucursal.sql`:

```sql
-- ── §8 evaluar_alertas_stock agota y restablece en LA sucursal del movimiento ───────────────
-- Copia íntegra de 0007_catalogo_inventario.sql §9.3 (nunca redefinida) salvo los dos UPDATE de
-- productos, que pasan a productos_sucursal:
--   · antes, un insumo crítico en 0 en Centro agotaba el producto en TODAS las sucursales;
--   · y el restablecimiento miraba el stock de la sucursal que se movió, así que reabastecer Norte
--     des-agotaba un producto que en Centro seguía sin insumo.
-- productos.agotado_automatico lo deriva el trigger de §4 («agotado en todas»).
-- Restablecer ya no exige agotado_manual = false: limpiar el automático cuando hay stock es
-- correcto aunque el dueño lo tenga agotado a mano (el manual sigue mandando por su cuenta).
CREATE OR REPLACE FUNCTION evaluar_alertas_stock(
  p_insumo_id uuid,
  p_sucursal_id uuid
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_stock numeric;
  v_minimo numeric;
  v_critico numeric;
  v_severidad alerta_severidad;
  v_tenant_id uuid;
  v_productos_afectados uuid[];
BEGIN
  -- Obtener stock y umbrales (override de sucursal o global del insumo)
  SELECT
    ss.tenant_id,
    ss.stock_actual,
    COALESCE(ss.stock_minimo, i.stock_minimo_global),
    COALESCE(ss.stock_critico, i.stock_critico_global)
  INTO v_tenant_id, v_stock, v_minimo, v_critico
  FROM insumo_stock_sucursal ss
  JOIN insumos i ON i.id = ss.insumo_id
  WHERE ss.insumo_id = p_insumo_id AND ss.sucursal_id = p_sucursal_id;

  -- Determinar severidad
  IF v_stock <= 0 THEN
    v_severidad := 'AGOTADO';
  ELSIF v_critico IS NOT NULL AND v_stock <= v_critico THEN
    v_severidad := 'ROJA';
  ELSIF v_minimo IS NOT NULL AND v_stock <= v_minimo THEN
    v_severidad := 'AMARILLA';
  ELSE
    v_severidad := NULL;
  END IF;

  -- Actualizar denormalizado en insumo_stock_sucursal
  UPDATE insumo_stock_sucursal
  SET alerta_actual = v_severidad
  WHERE insumo_id = p_insumo_id AND sucursal_id = p_sucursal_id;

  -- Cerrar alertas activas si ya no aplica
  IF v_severidad IS NULL THEN
    UPDATE alertas_inventario
    SET activa = false, fecha_atendida = now()
    WHERE insumo_id = p_insumo_id AND sucursal_id = p_sucursal_id AND activa = true;
  ELSE
    -- Buscar productos afectados (recetas críticas que usan este insumo)
    SELECT array_agg(DISTINCT r.producto_id)
    INTO v_productos_afectados
    FROM receta_componentes rc
    JOIN recetas r ON r.id = rc.receta_id
    WHERE rc.insumo_id = p_insumo_id AND rc.es_critico = true;

    -- Crear alerta si no existe activa para este nivel
    INSERT INTO alertas_inventario (
      tenant_id, sucursal_id, insumo_id, severidad,
      stock_al_alertar, umbral_disparador, productos_afectados_ids
    )
    SELECT v_tenant_id, p_sucursal_id, p_insumo_id, v_severidad,
           v_stock, COALESCE(v_critico, v_minimo, 0), COALESCE(v_productos_afectados, '{}')
    WHERE NOT EXISTS (
      SELECT 1 FROM alertas_inventario
      WHERE insumo_id = p_insumo_id
        AND sucursal_id = p_sucursal_id
        AND severidad = v_severidad
        AND activa = true
    );

    -- Auto-agotar EN ESTA SUCURSAL (§36.2 del /core, ADR 0027). No toca una fila agotada a mano.
    IF v_severidad = 'AGOTADO' AND v_productos_afectados IS NOT NULL THEN
      INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, agotado_automatico, motivo_agotado)
      SELECT v_tenant_id, pid, p_sucursal_id, true,
             'Insumo agotado: ' || (SELECT nombre FROM insumos WHERE id = p_insumo_id)
        FROM unnest(v_productos_afectados) AS pid
      ON CONFLICT (producto_id, sucursal_id) DO UPDATE
        SET agotado_automatico = true,
            motivo_agotado     = EXCLUDED.motivo_agotado
        WHERE NOT productos_sucursal.agotado_manual;
    END IF;
  END IF;

  -- Restablecer EN ESTA SUCURSAL los productos que ya tienen todos sus insumos críticos AQUÍ.
  IF v_severidad IS DISTINCT FROM 'AGOTADO' THEN
    UPDATE productos_sucursal ps
       SET agotado_automatico = false,
           motivo_agotado     = NULL
     WHERE ps.sucursal_id = p_sucursal_id
       AND ps.agotado_automatico = true
       AND ps.producto_id IN (
         SELECT DISTINCT r.producto_id
           FROM receta_componentes rc
           JOIN recetas r ON r.id = rc.receta_id
          WHERE rc.insumo_id = p_insumo_id AND rc.es_critico = true
       )
       AND NOT EXISTS (
         SELECT 1
           FROM receta_componentes rc2
           JOIN recetas r2 ON r2.id = rc2.receta_id
           JOIN insumo_stock_sucursal ss2 ON ss2.insumo_id = rc2.insumo_id
          WHERE r2.producto_id = ps.producto_id
            AND rc2.es_critico = true
            AND ss2.sucursal_id = p_sucursal_id
            AND ss2.stock_actual <= 0
       );
  END IF;
END;
$$;

COMMENT ON FUNCTION evaluar_alertas_stock IS 'Evalúa stock vs umbrales, dispara/cierra alertas y agota/restablece productos EN ESA sucursal (productos_sucursal). §36 del /core, ADR 0027.';
```

- [ ] **Paso 4: Ajustar los smokes que miraban el agotado en `productos`**

En `supabase/scripts/smoke_combos.sql`, reemplazar la línea 183:

```sql
  UPDATE productos SET agotado_automatico = false, estado = 'ACTIVO', motivo_agotado = NULL WHERE id = v_clas;
```

por:

```sql
  -- 0151: el agotado automático vive en la fila de la sucursal.
  UPDATE productos_sucursal SET agotado_automatico = false, motivo_agotado = NULL
   WHERE producto_id = v_clas AND sucursal_id = v_suc;
```

En `supabase/scripts/smoke_sync_inventario.sql`, cambiar el comentario de la línea 96 a
`-- 3) Agotado: una salida de 6 deja 0 → alerta AGOTADO y producto agotado automático en esa sucursal (0151)`
y reemplazar la línea

```sql
  SELECT estado::text INTO v_estado FROM productos WHERE id = v_prod;
```

por:

```sql
  SELECT CASE WHEN agotado_automatico THEN 'AGOTADO' ELSE 'DISPONIBLE' END INTO v_estado
    FROM productos_sucursal WHERE producto_id = v_prod AND sucursal_id = v_s;
```

y en la línea del `IF` siguiente, `v_estado <> 'AGOTADO'` por `coalesce(v_estado, '') <> 'AGOTADO'`.

- [ ] **Paso 5: Correr los smokes de inventario y de combos, y el resto**

```bash
cd desktop && node scripts/smokes.mjs smoke_menu_sucursal.sql smoke_combos.sql smoke_sync_inventario.sql smoke_inventario.sql smoke_inventario_plan.sql smoke_compras.sql
```

Esperado: ✅ en los seis. Después, la batería completa para ver que nada más dependía del agotado en `productos`:

```bash
cd desktop && npm run smokes
```

Esperado: «todos los smokes en verde».

- [ ] **Paso 6: Commit**

```bash
git add supabase/migrations/0151_menu_por_sucursal.sql supabase/scripts/smoke_menu_sucursal.sql supabase/scripts/smoke_combos.sql supabase/scripts/smoke_sync_inventario.sql
git commit -m "fix(db): el agotado automático agota y restablece solo en la sucursal del insumo (0151)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 4: El menú por sucursal baja a la caja

**Archivos:**
- Modificar: `supabase/migrations/0151_menu_por_sucursal.sql` (agregar §9 y §10)
- Modificar: `supabase/tests/0035_menu_por_sucursal.test.sql` (3 pruebas más)
- Modificar: `desktop/src/sync-pull.mjs:24`
- Modificar: `desktop/src/sync-pull.test.mjs` (una prueba más)

**Interfaces:**
- Produce: llave `productos_sucursal` en `sync_pull_snapshot(p_tenant)`; `catalogo_version()` la mira;
  `PULL_ORDER` la aplica después de `productos`.

- [ ] **Paso 1: Pruebas que fallan**

En `supabase/tests/0035_menu_por_sucursal.test.sql`, cambiar `select plan(22);` por `select plan(25);`
y, entre `reset role;` y `select * from finish();`, agregar:

```sql
-- 11) Baja a la caja: la llave viaja en el snapshot, solo con filas del negocio, y avisa por catalogo_version().
select ok(
  (select count(*) from jsonb_array_elements(sync_pull_snapshot(:'t') -> 'productos_sucursal') e
    where e ->> 'sucursal_id' = :'norte') >= 1,
  'el menú de Norte baja a la caja en el snapshot');
select is(
  (select count(*)::int from jsonb_array_elements(sync_pull_snapshot(:'t') -> 'productos_sucursal') e
    where e ->> 'tenant_id' = :'otro'), 0,
  'y solo el del negocio');
select ok(pg_get_functiondef('catalogo_version()'::regprocedure) like '%productos_sucursal%',
  'un cambio en el menú de una sucursal cuenta como cambio de catálogo');
```

Al final de `desktop/src/sync-pull.test.mjs`:

```js
test("PULL_ORDER baja el menú por sucursal después de productos y de sucursales (0151)", () => {
  const t = PULL_ORDER.map((x) => x.t);
  assert.ok(t.includes("productos_sucursal"), "productos_sucursal está en PULL_ORDER");
  assert.ok(t.indexOf("productos_sucursal") > t.indexOf("productos"), "va después de productos (FK)");
  assert.ok(t.indexOf("productos_sucursal") > t.indexOf("sucursales"), "va después de sucursales (FK)");
});
```

Correr:

```bash
supabase db reset && supabase test db
pnpm test:escritorio
```

Esperado: `0035` falla en las tres nuevas («el menú de Norte baja…» con NULL) y la prueba de
`PULL_ORDER` falla en `includes`.

- [ ] **Paso 2: Agregar §9 y §10 a la migración**

Al final de `supabase/migrations/0151_menu_por_sucursal.sql`:

```sql
-- ============================================================================
-- §9 sync_pull_snapshot: copia íntegra de la vigente (0150_anuncios_pantalla.sql) con UNA clave
-- más: productos_sucursal. Manda el negocio entero, como el resto: la caja lee las filas de su
-- sucursal al cargar el catálogo. No se toca nada más, en particular la condición del hash de 'users'.
-- ============================================================================
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
    -- Menú por sucursal (0151, ADR 0027).
    'productos_sucursal',             coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_sucursal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'opciones_modificador',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM opciones_modificador x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos_grupos_modificadores', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Combos (ADR 0015): slots y opciones; el combo mismo ya baja con productos.
    'combo_grupos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_grupos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'combo_opciones',                 coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_opciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'subtipos_personal',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM subtipos_personal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'configuracion_tenant',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM configuracion_tenant x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'repartidores',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM repartidores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'zonas_envio',                    coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM zonas_envio x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Anuncios de la pantalla del cliente (0150). Solo la lista: las imágenes las baja la caja aparte.
    'anuncios_pantalla',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM anuncios_pantalla x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
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
    -- 0136 (C2-5): la contraseña solo de la cuenta de una caja; de las personas, null explícito
    -- para que el siguiente pull borre el hash que ya estaba copiado en cada caja.
    'users',                          coalesce((SELECT jsonb_agg(jsonb_build_object(
                                          'id', u.id, 'email', u.email,
                                          'encrypted_password',
                                            CASE WHEN u.email ~* '^caja-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@dispositivos\.vimpos\.(com\.)?mx$'
                                                  AND EXISTS (SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
                                                               WHERE ua.usuario_id = u.id AND ua.tenant_id = p_tenant
                                                                 AND r.codigo = 'DISPOSITIVO')
                                                  AND NOT EXISTS (SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
                                                                   WHERE ua.usuario_id = u.id AND r.codigo <> 'DISPOSITIVO')
                                                 THEN u.encrypted_password
                                            END,
                                          'email_confirmed_at', u.email_confirmed_at, 'created_at', u.created_at,
                                          'raw_app_meta_data', u.raw_app_meta_data, 'raw_user_meta_data', u.raw_user_meta_data))
                                        FROM auth.users u
                                        WHERE u.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    '__watermark', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
$$;
REVOKE EXECUTE ON FUNCTION sync_pull_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_pull_snapshot(uuid) TO service_role;

-- ============================================================================
-- §10 catalogo_version(): apagar un producto en una sucursal, cambiarle el precio o agotarlo ahí
-- también es «el catálogo cambió». Sin esto el cambio tardaría hasta una hora en llegar a la caja
-- en vez de un minuto. Copia íntegra de la vigente (0150) con una línea más.
-- ============================================================================
CREATE OR REPLACE FUNCTION catalogo_version()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(
    (SELECT max(updated_at) FROM categorias),
    (SELECT max(updated_at) FROM productos),
    (SELECT max(updated_at) FROM productos_sucursal),
    (SELECT max(updated_at) FROM grupos_modificadores),
    (SELECT max(updated_at) FROM opciones_modificador),
    (SELECT max(created_at) FROM productos_grupos_modificadores),
    (SELECT max(updated_at) FROM combo_grupos),
    (SELECT max(updated_at) FROM combo_opciones),
    (SELECT max(updated_at) FROM zonas_envio),
    (SELECT max(updated_at) FROM anuncios_pantalla),
    (SELECT max(updated_at) FROM configuracion_tenant)
  );
$$;
REVOKE EXECUTE ON FUNCTION catalogo_version() FROM public, anon;
GRANT EXECUTE ON FUNCTION catalogo_version() TO authenticated, service_role;
```

- [ ] **Paso 3: La caja la aplica**

En `desktop/src/sync-pull.mjs`, después de la línea `  { t: "productos" },` agregar:

```js
  // Menú por sucursal (0151): FK a productos y a sucursales, que ya bajaron. Llave compuesta
  // (producto_id, sucursal_id): upsertTabla arma el ON CONFLICT con ella, sin CLAVES_NATURALES.
  { t: "productos_sucursal" },
```

- [ ] **Paso 4: Correr y ver pasar**

```bash
supabase db reset && supabase test db
pnpm test:escritorio
cd desktop && npm run verify:migraciones && npm run verify:sync
```

Esperado: `0035 .. ok` (25 pruebas), `test:escritorio` en verde, `verify:migraciones` aplica hasta
0151 y `verify:sync` aplica el snapshot sin errores (en su resumen aparece `productos_sucursal`).

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/0151_menu_por_sucursal.sql supabase/tests/0035_menu_por_sucursal.test.sql desktop/src/sync-pull.mjs desktop/src/sync-pull.test.mjs
git commit -m "feat(escritorio): el menú por sucursal baja a la caja y avisa por catalogo_version (0151)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 5: La caja vende el menú de su sucursal

**Archivos:**
- Crear: `apps/pos/app/lib/catalogo-sucursal.ts`
- Crear: `apps/pos/app/lib/__tests__/catalogo-sucursal.test.ts`
- Modificar: `apps/pos/app/lib/catalogo.ts` (tipo `Producto`, `listarProductosPos`)
- Modificar: `apps/pos/app/lib/combos.ts` (`armarCombos`, `combosQueAdmiten`)
- Modificar: `apps/pos/app/lib/__tests__/combos.test.ts`
- Modificar: `apps/pos/app/components/catalogo-productos.tsx:58-75`
- Modificar: `apps/pos/app/components/home-pos.tsx:358`
- Modificar: `apps/pos/app/lib/__tests__/carrito.test.ts:8`, `apps/pos/app/lib/__tests__/pantalla-cliente.test.ts:16`

**Interfaces:**
- Consume: tabla `productos_sucursal` (Tarea 1) vía PostgREST.
- Produce:
  - `Producto.seVendeAqui: boolean` (nuevo campo requerido).
  - `type FilaProductoSucursal = { producto_id: string; disponible: boolean; precio_mxn: number | string | null; agotado_manual: boolean; agotado_automatico: boolean }`
  - `aplicarSucursal(productos: Producto[], filas: FilaProductoSucursal[]): Producto[]`
  - `menuVisible(categorias: Categoria[], productos: Producto[]): { categorias: Categoria[]; productos: Producto[] }`
  - `listarProductosPos(token: string, sucursalId: string): Promise<Producto[]>`

- [ ] **Paso 1: Prueba que falla**

`apps/pos/app/lib/__tests__/catalogo-sucursal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Categoria, Producto } from "../catalogo";
import { aplicarSucursal, menuVisible, type FilaProductoSucursal } from "../catalogo-sucursal";

// Mismos casos que 0035_menu_por_sucursal.test.sql y que menu-uber.test.ts: la regla vive en tres lugares.
const prod = (id: string, precio: number, categoria_id: string, extra: Partial<Producto> = {}): Producto => ({
  id, nombre: id, descripcion: null, precio_base_mxn: precio, categoria_id, agotado: false, esCombo: false, seVendeAqui: true,
  sku: null, tasaIva: 16, ivaIncluido: true, claveSat: null, unidadSat: null, categoriaNombre: null, ...extra,
});
const fila = (producto_id: string, extra: Partial<FilaProductoSucursal> = {}): FilaProductoSucursal => ({
  producto_id, disponible: true, precio_mxn: null, agotado_manual: false, agotado_automatico: false, ...extra,
});
const cat = (id: string): Categoria => ({ id, nombre: id, color_hex: null, icono: null, orden: 0 });

describe("aplicarSucursal", () => {
  it("sin fila, el producto queda igual: precio general, se vende, sin agotar", () => {
    const [p] = aplicarSucursal([prod("clasica", 120, "hamb")], []);
    expect(p).toMatchObject({ precio_base_mxn: 120, seVendeAqui: true, agotado: false });
  });

  it("con precio propio cobra ese, aunque PostgREST lo mande como texto", () => {
    const [p] = aplicarSucursal([prod("clasica", 120, "hamb")], [fila("clasica", { precio_mxn: "135.00" })]);
    expect(p!.precio_base_mxn).toBe(135);
  });

  it("con fila pero sin precio, sigue el general", () => {
    const [p] = aplicarSucursal([prod("clasica", 120, "hamb")], [fila("clasica", { agotado_manual: true })]);
    expect(p!.precio_base_mxn).toBe(120);
  });

  it("apagado aquí: se marca, no se quita (la reapertura de cuentas lo necesita)", () => {
    const r = aplicarSucursal([prod("papas", 55, "acomp")], [fila("papas", { disponible: false })]);
    expect(r).toHaveLength(1);
    expect(r[0]!.seVendeAqui).toBe(false);
  });

  it("agotado a mano o por inventario en esta sucursal", () => {
    const r = aplicarSucursal(
      [prod("papas", 55, "acomp"), prod("aros", 60, "acomp")],
      [fila("papas", { agotado_manual: true }), fila("aros", { agotado_automatico: true })],
    );
    expect(r.map((p) => p.agotado)).toEqual([true, true]);
  });

  it("un estado AGOTADO heredado sigue agotado aunque la fila no lo diga", () => {
    const [p] = aplicarSucursal([prod("papas", 55, "acomp", { agotado: true })], [fila("papas")]);
    expect(p!.agotado).toBe(true);
  });
});

describe("menuVisible", () => {
  it("quita de la cuadrícula lo que no se vende aquí", () => {
    const r = menuVisible([cat("hamb")], [prod("clasica", 120, "hamb"), prod("doble", 150, "hamb", { seVendeAqui: false })]);
    expect(r.productos.map((p) => p.id)).toEqual(["clasica"]);
  });

  it("esconde la categoría que se quedó vacía por eso, no la que ya estaba vacía", () => {
    const r = menuVisible(
      [cat("hamb"), cat("postres"), cat("nueva")],
      [prod("clasica", 120, "hamb"), prod("pay", 40, "postres", { seVendeAqui: false })],
    );
    expect(r.categorias.map((c) => c.id)).toEqual(["hamb", "nueva"]);
  });

  it("un producto de una caché vieja, sin seVendeAqui, cuenta como que se vende", () => {
    const viejo: Partial<Producto> = { ...prod("clasica", 120, "hamb") };
    delete viejo.seVendeAqui;
    expect(menuVisible([cat("hamb")], [viejo as Producto]).productos).toHaveLength(1);
  });
});
```

```bash
pnpm --filter @vim/pos test -- catalogo-sucursal
```

Esperado: FAIL, `Cannot find module '../catalogo-sucursal'`.

- [ ] **Paso 2: La regla de la caja**

`apps/pos/app/lib/catalogo-sucursal.ts`:

```ts
import type { Categoria, Producto } from "./catalogo";

/**
 * Menú por sucursal (ADR 0027, migración 0151). La caja lee el catálogo del negocio y lo ajusta a
 * SU sucursal con las filas de `productos_sucursal`: sin fila, el producto se vende al precio
 * general y sin agotar.
 *
 * La misma regla vive en tres lugares, con los mismos casos de prueba:
 *   - SQL: precio_producto_en_sucursal / motivo_no_disponible_en_sucursal (0151). Es la que cobra.
 *   - Uber: aplicarSucursalCarta (supabase/functions/_shared/delivery/menu-uber.ts).
 *   - Aquí.
 */
export type FilaProductoSucursal = {
  producto_id: string;
  disponible: boolean;
  precio_mxn: number | string | null;
  agotado_manual: boolean;
  agotado_automatico: boolean;
};

/**
 * `precio_base_mxn` del Producto de la caja pasa a ser «lo que cobra ESTA sucursal»: así el
 * carrito, los combos, los modales y la pantalla del cliente lo usan sin saber de sucursales. Lo
 * que no se vende aquí se MARCA (`seVendeAqui: false`), no se quita: la reapertura de una cuenta
 * (`agruparPadresHijos`, cuenta-mesa.ts) tira los renglones cuyo producto no encuentra.
 */
export function aplicarSucursal(productos: Producto[], filas: FilaProductoSucursal[]): Producto[] {
  const porProducto = new Map(filas.map((f) => [f.producto_id, f]));
  return productos.map((p) => {
    const f = porProducto.get(p.id);
    if (!f) return p;
    return {
      ...p,
      precio_base_mxn: f.precio_mxn === null ? p.precio_base_mxn : Number(f.precio_mxn),
      agotado: p.agotado || f.agotado_manual || f.agotado_automatico,
      seVendeAqui: f.disponible,
    };
  });
}

/**
 * Lo que se pinta en la cuadrícula: sin lo que no se vende aquí, y sin las categorías que se
 * quedaron vacías POR eso. Una categoría vacía de verdad se queda como estaba: esconderla sería un
 * cambio para todos los negocios, no solo para los de varias sucursales. `seVendeAqui` ausente
 * (catálogo en caché de antes de 0151) cuenta como que se vende.
 */
export function menuVisible(categorias: Categoria[], productos: Producto[]): { categorias: Categoria[]; productos: Producto[] } {
  const visibles = productos.filter((p) => p.seVendeAqui !== false);
  const conProductos = new Set(productos.map((p) => p.categoria_id));
  const conVisibles = new Set(visibles.map((p) => p.categoria_id));
  return {
    categorias: categorias.filter((c) => !conProductos.has(c.id) || conVisibles.has(c.id)),
    productos: visibles,
  };
}
```

En `apps/pos/app/lib/catalogo.ts`:

1. En el tipo `Producto`, después de `esCombo: boolean;`, agregar:

```ts
  /**
   * false = esta sucursal no lo vende (productos_sucursal, 0151). Se carga igual —la reapertura de
   * cuentas lo necesita— pero no se pinta. `precio_base_mxn` y `agotado` ya son los de la sucursal.
   */
  seVendeAqui: boolean;
```

2. Reemplazar `listarProductosPos` completa por:

```ts
/**
 * Productos visibles en POS (ACTIVO/AGOTADO, no PAUSADO; visible_en_pos=true), ya ajustados a la
 * sucursal de la caja (ADR 0027): su precio, su agotado y si se vende aquí. RLS por tenant.
 */
export async function listarProductosPos(token: string, sucursalId: string): Promise<Producto[]> {
  const sb = employeeClient(token);
  const [{ data, error }, { data: filas, error: errorFilas }] = await Promise.all([
    sb
      .from("productos")
      .select("id, nombre, descripcion, precio_base_mxn, categoria_id, estado, visible_en_pos, codigo_interno, tasa_iva, iva_incluido_en_precio, clave_sat, unidad_sat, es_combo, categoria:categorias(nombre)")
      .is("deleted_at", null)
      .eq("visible_en_pos", true)
      .in("estado", ["ACTIVO", "AGOTADO"])
      .order("orden_visualizacion", { ascending: true }),
    sb
      .from("productos_sucursal")
      .select("producto_id, disponible, precio_mxn, agotado_manual, agotado_automatico")
      .eq("sucursal_id", sucursalId),
  ]);
  if (error) throw new Error(error.message);
  if (errorFilas) throw new Error(errorFilas.message);
  const base = (data ?? []).map((row): Producto => {
    const p = row as Record<string, unknown>;
    return {
      id: String(p.id),
      nombre: String(p.nombre),
      descripcion: (p.descripcion as string) ?? null,
      precio_base_mxn: Number(p.precio_base_mxn),
      categoria_id: String(p.categoria_id),
      // Las columnas agotado_* del producto ahora son «agotado en todas» (0151): el agotado de esta
      // sucursal sale de su fila. Aquí solo cuenta un estado AGOTADO heredado de antes de 0151.
      agotado: p.estado === "AGOTADO",
      esCombo: Boolean(p.es_combo),
      seVendeAqui: true,
      sku: (p.codigo_interno as string) ?? null,
      tasaIva: Number(p.tasa_iva ?? 16),
      ivaIncluido: Boolean(p.iva_incluido_en_precio),
      claveSat: (p.clave_sat as string) ?? null,
      unidadSat: (p.unidad_sat as string) ?? null,
      categoriaNombre: ((p.categoria as { nombre?: string } | null)?.nombre) ?? null,
    };
  });
  return aplicarSucursal(base, (filas ?? []) as FilaProductoSucursal[]);
}
```

3. Al principio del archivo, debajo de `import { employeeClient } from "./supabase";`:

```ts
import { aplicarSucursal, type FilaProductoSucursal } from "./catalogo-sucursal";
```

(`catalogo-sucursal.ts` solo importa **tipos** de `catalogo.ts`, así que no hay ciclo en tiempo de ejecución.)

- [ ] **Paso 3: Los ayudantes de prueba del `Producto` traen el campo nuevo**

- `apps/pos/app/lib/__tests__/carrito.test.ts:8`: después de `esCombo: false,` agregar ` seVendeAqui: true,`.
- `apps/pos/app/lib/__tests__/combos.test.ts:13`: después de `esCombo: false,` agregar ` seVendeAqui: true,`.
- `apps/pos/app/lib/__tests__/pantalla-cliente.test.ts:16`: después de `esCombo: false,` agregar ` seVendeAqui: true,`.

```bash
pnpm --filter @vim/pos test -- catalogo-sucursal
```

Esperado: PASS (9 pruebas).

- [ ] **Paso 4: Los combos respetan la sucursal (prueba primero)**

Al final de `apps/pos/app/lib/__tests__/combos.test.ts`:

```ts
describe("menú por sucursal (0151)", () => {
  const opcionesDe = (defs: ComboDef[]): string[] => defs.flatMap((d) => d.slots.flatMap((s) => s.opciones.map((o) => o.producto.id)));

  it("una opción que esta sucursal no vende no sale en ningún slot, por lista ni por categoría", () => {
    for (const id of ["h1", "a1"]) {
      expect(opcionesDe(armarCombos(filas, productos))).toContain(id);
      const ajustados = productos.map((p) => (p.id === id ? { ...p, seVendeAqui: false } : p));
      expect(opcionesDe(armarCombos(filas, ajustados))).not.toContain(id);
    }
  });

  it("el combo se sigue armando aunque no se venda aquí (para reabrir cuentas), pero no se ofrece", () => {
    const ajustados = productos.map((p) => (p.id === "c1" ? { ...p, seVendeAqui: false } : p));
    const defs = armarCombos(filas, ajustados);
    expect(defs.map((d) => d.producto.id)).toContain("c1");
    expect(combosQueAdmiten(clasica, defs)).toEqual([]);
  });
});
```

```bash
pnpm --filter @vim/pos test -- combos
```

Esperado: FAIL en las dos pruebas nuevas.

En `apps/pos/app/lib/combos.ts`:

- En `armarCombos`, rama por categoría, cambiar
  `.filter((p) => p.categoria_id === f.categoria_id && !p.esCombo && !excluidos.has(p.id))`
  por
  `.filter((p) => p.categoria_id === f.categoria_id && !p.esCombo && p.seVendeAqui !== false && !excluidos.has(p.id))`.
- En la rama por lista, cambiar
  `return p && !p.esCombo ? [...] : [];`
  por
  `return p && !p.esCombo && p.seVendeAqui !== false ? [...] : [];` (el arreglo de dentro no cambia).
- Agregar al comentario de `armarCombos`: `Lo que esta sucursal no vende (seVendeAqui: false, 0151) no es opción.`
- En `combosQueAdmiten`, cambiar
  `return combos.filter((c) => !c.producto.agotado && c.slots[0]?.opciones.some(...));`
  por
  `return combos.filter((c) => !c.producto.agotado && c.producto.seVendeAqui !== false && c.slots[0]?.opciones.some((o) => o.producto.id === producto.id));`

```bash
pnpm --filter @vim/pos test -- combos
```

Esperado: PASS.

- [ ] **Paso 5: La cuadrícula pinta el menú de la sucursal**

En `apps/pos/app/components/catalogo-productos.tsx`:

1. Agregar el import: `import { menuVisible } from "../lib/catalogo-sucursal";`
2. En la firma de `CatalogoProductos`, renombrar al desestructurar:
   `categorias,` → `categorias: todasCategorias,` y `productos,` → `productos: todosProductos,`
   (el tipo de las props no cambia).
3. Como primeras líneas del cuerpo, antes de `const [elegida, setElegida] = …`:

```tsx
  // Menú por sucursal (ADR 0027): lo que esta sucursal no vende no se pinta, ni la categoría que se
  // quedó vacía por eso. Las listas completas siguen en home-pos: reabrir una cuenta las necesita.
  const categorias = useMemo(
    () => (todasCategorias && todosProductos ? menuVisible(todasCategorias, todosProductos).categorias : todasCategorias),
    [todasCategorias, todosProductos],
  );
  const productos = useMemo(
    () => (todosProductos ? todosProductos.filter((p) => p.seVendeAqui !== false) : null),
    [todosProductos],
  );
```

El resto del componente sigue usando `categorias` y `productos` sin cambios.

En `apps/pos/app/components/home-pos.tsx:358`, cambiar
`listarProductosPos(token)` por `listarProductosPos(token, caja.sucursal_id)`.
Confirmar que no hay otra llamada:

```bash
grep -rn "listarProductosPos(" apps/pos/app
```

Esperado: solo la definición y la de `home-pos.tsx`.

- [ ] **Paso 6: Pruebas y tipos**

```bash
pnpm --filter @vim/pos test
pnpm --filter @vim/pos typecheck
```

Esperado: todo en verde.

- [ ] **Paso 7: Commit**

```bash
git add apps/pos/app/lib/catalogo-sucursal.ts apps/pos/app/lib/__tests__/catalogo-sucursal.test.ts apps/pos/app/lib/catalogo.ts apps/pos/app/lib/combos.ts apps/pos/app/lib/__tests__/combos.test.ts apps/pos/app/lib/__tests__/carrito.test.ts apps/pos/app/lib/__tests__/pantalla-cliente.test.ts apps/pos/app/components/catalogo-productos.tsx apps/pos/app/components/home-pos.tsx
git commit -m "feat(pos): la caja vende el menú de su sucursal — precio, agotado y lo que no se vende ahí

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 6: El admin lee y guarda el menú por sucursal

**Archivos:**
- Crear: `apps/admin/app/lib/menu-sucursal.ts`
- Crear: `apps/admin/app/lib/__tests__/menu-sucursal.test.ts`
- Modificar: `apps/admin/app/lib/catalogo.ts` (tipo `Producto`, lecturas, `resolverEstado`, `crearProducto`, `actualizarProducto`)

**Interfaces:**
- Consume: tabla `productos_sucursal`; `listarCajas()` y `type Caja` de `apps/admin/app/lib/configuracion.ts`.
- Produce (en `menu-sucursal.ts`):
  - `VERSION_MINIMA_MENU_SUCURSAL: string` (= `"0.4.109"`, se verifica en la Tarea 10)
  - `type SucursalMenu = { id: string; nombre: string }`
  - `type FilaMenuSucursal = { producto_id: string; sucursal_id: string; disponible: boolean; precio_mxn: number | null; agotado_manual: boolean; agotado_automatico: boolean }`
  - `type EdicionMenuSucursal = Pick<FilaMenuSucursal, "producto_id" | "sucursal_id" | "disponible" | "precio_mxn" | "agotado_manual">`
  - `type EstadoEnSucursal = "ACTIVO" | "PAUSADO" | "AGOTADO" | "NO_SE_VENDE"`
  - `type FilaFormMenu = { sucursalId: string; nombre: string; disponible: boolean; precio: string; agotado: boolean; agotadoAuto: boolean }`
  - puras: `filaPorDefecto`, `esPorDefecto`, `filasParaGuardar`, `filasFormIniciales`, `edicionesDeForm`, `estadoEnSucursal`, `estadoGeneral`, `versionMenor`, `cajasSinMenuPorSucursal`
  - datos: `listarSucursalesMenu`, `leerMenuDeProducto`, `leerMenuDeSucursal`, `guardarMenuSucursal`, `hayMenuPorSucursal`, `cajasQueNoRespetanMenu`
- Produce (en `catalogo.ts`): `crearProducto(input): Promise<string>` (devuelve el id); `Producto.agotado_automatico: boolean`.

- [ ] **Paso 1: Prueba que falla**

`apps/admin/app/lib/__tests__/menu-sucursal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  cajasSinMenuPorSucursal,
  edicionesDeForm,
  esPorDefecto,
  estadoEnSucursal,
  estadoGeneral,
  filaPorDefecto,
  filasFormIniciales,
  filasParaGuardar,
  versionMenor,
  type FilaMenuSucursal,
} from "../menu-sucursal";

const fila = (sucursal_id: string, extra: Partial<FilaMenuSucursal> = {}): FilaMenuSucursal => ({
  ...filaPorDefecto("p1", sucursal_id), ...extra,
});

describe("estado en una sucursal (misma regla que 0151 y que la caja)", () => {
  it("sin fila, se vende", () => {
    expect(estadoEnSucursal("ACTIVO", undefined)).toBe("ACTIVO");
  });
  it("orden: pausado gana, luego no se vende, luego agotado", () => {
    expect(estadoEnSucursal("PAUSADO", fila("n", { disponible: false }))).toBe("PAUSADO");
    expect(estadoEnSucursal("ACTIVO", fila("n", { disponible: false, agotado_manual: true }))).toBe("NO_SE_VENDE");
    expect(estadoEnSucursal("ACTIVO", fila("n", { agotado_automatico: true }))).toBe("AGOTADO");
    expect(estadoEnSucursal("AGOTADO", undefined)).toBe("AGOTADO");
  });
  it("en «todas», agotado es «agotado en todas» (las columnas derivadas)", () => {
    expect(estadoGeneral({ estado: "ACTIVO", agotado_manual: false, agotado_automatico: true })).toBe("AGOTADO");
    expect(estadoGeneral({ estado: "PAUSADO", agotado_manual: true, agotado_automatico: false })).toBe("PAUSADO");
    expect(estadoGeneral({ estado: "ACTIVO", agotado_manual: false, agotado_automatico: false })).toBe("ACTIVO");
  });
});

describe("qué se guarda", () => {
  it("una fila en los valores por defecto es igual que no tenerla", () => {
    expect(esPorDefecto({ disponible: true, precio_mxn: null, agotado_manual: false })).toBe(true);
    expect(esPorDefecto({ disponible: true, precio_mxn: 0, agotado_manual: false })).toBe(false);
  });
  it("no crea filas por defecto, pero sí regresa a lo general una que ya existía", () => {
    const ediciones = edicionesDeForm("p1", [
      { sucursalId: "centro", nombre: "Centro", disponible: true, precio: "", agotado: false, agotadoAuto: false },
      { sucursalId: "norte", nombre: "Norte", disponible: true, precio: "", agotado: false, agotadoAuto: false },
      { sucursalId: "sur", nombre: "Sur", disponible: false, precio: "", agotado: false, agotadoAuto: false },
    ]);
    const r = filasParaGuardar(ediciones, [{ sucursal_id: "norte" }]);
    expect(r.map((e) => e.sucursal_id)).toEqual(["norte", "sur"]);
  });
  it("del formulario: precio vacío = general (null), con texto = número", () => {
    const [a, b] = edicionesDeForm("p1", [
      { sucursalId: "c", nombre: "C", disponible: true, precio: "", agotado: true, agotadoAuto: false },
      { sucursalId: "n", nombre: "N", disponible: true, precio: "135.5", agotado: false, agotadoAuto: false },
    ]);
    expect(a).toEqual({ producto_id: "p1", sucursal_id: "c", disponible: true, precio_mxn: null, agotado_manual: true });
    expect(b!.precio_mxn).toBe(135.5);
  });
  it("las filas del formulario salen de las sucursales, con lo guardado encima", () => {
    const r = filasFormIniciales(
      [{ id: "c", nombre: "Centro" }, { id: "n", nombre: "Norte" }],
      [fila("n", { precio_mxn: 135, agotado_automatico: true })],
    );
    expect(r).toEqual([
      { sucursalId: "c", nombre: "Centro", disponible: true, precio: "", agotado: false, agotadoAuto: false },
      { sucursalId: "n", nombre: "Norte", disponible: true, precio: "135", agotado: false, agotadoAuto: true },
    ]);
  });
});

describe("cajas que todavía no respetan el menú por sucursal", () => {
  it("compara versiones por número, no por texto", () => {
    expect(versionMenor("0.4.9", "0.4.10")).toBe(true);
    expect(versionMenor("0.4.109", "0.4.109")).toBe(false);
    expect(versionMenor("0.5.0", "0.4.109")).toBe(false);
    expect(versionMenor("basura", "0.4.109")).toBe(true);
  });
  it("solo cajas de escritorio (con latido) de versión vieja o desconocida", () => {
    const cajas = [
      { id: "1", nombre: "Caja 01", sucursalNombre: "Centro", ultimoLatido: "2026-10-02T10:00:00Z", versionApp: "0.4.108" },
      { id: "2", nombre: "Caja 02", sucursalNombre: "Norte", ultimoLatido: "2026-10-02T10:00:00Z", versionApp: "0.4.109" },
      { id: "3", nombre: "Caja web", sucursalNombre: "Norte", ultimoLatido: null, versionApp: null },
      { id: "4", nombre: "Caja vieja", sucursalNombre: "Sur", ultimoLatido: "2026-10-01T10:00:00Z", versionApp: null },
    ];
    expect(cajasSinMenuPorSucursal(cajas, "0.4.109").map((c) => c.id)).toEqual(["1", "4"]);
  });
});
```

```bash
pnpm --filter @vim/admin test -- menu-sucursal
```

Esperado: FAIL, `Cannot find module '../menu-sucursal'`.

- [ ] **Paso 2: La lib**

`apps/admin/app/lib/menu-sucursal.ts`:

```ts
"use client";
import { supabase, leerSesion } from "./supabase";
import { listarCajas, type Caja } from "./configuracion";

/**
 * Menú por sucursal (ADR 0027, migración 0151). Una fila por producto y sucursal guarda solo lo que
 * cambia ahí; sin fila, el producto se vende al precio general y sin agotar. La regla es la misma
 * que precio_producto_en_sucursal / motivo_no_disponible_en_sucursal (0151) y que aplicarSucursal
 * de la caja (apps/pos/app/lib/catalogo-sucursal.ts).
 */

/** Primera versión del escritorio que respeta el menú por sucursal. Una caja anterior vende todo al precio general. */
export const VERSION_MINIMA_MENU_SUCURSAL = "0.4.109";

export type SucursalMenu = { id: string; nombre: string };

export type FilaMenuSucursal = {
  producto_id: string;
  sucursal_id: string;
  disponible: boolean;
  precio_mxn: number | null;
  agotado_manual: boolean;
  agotado_automatico: boolean;
};

/** Lo que el dueño edita de una fila. El agotado por inventario no: lo escribe la base. */
export type EdicionMenuSucursal = Pick<FilaMenuSucursal, "producto_id" | "sucursal_id" | "disponible" | "precio_mxn" | "agotado_manual">;

export type EstadoEnSucursal = "ACTIVO" | "PAUSADO" | "AGOTADO" | "NO_SE_VENDE";

/** Una fila del formulario de producto. El precio va como texto: es lo que el dueño teclea. */
export type FilaFormMenu = { sucursalId: string; nombre: string; disponible: boolean; precio: string; agotado: boolean; agotadoAuto: boolean };

export function filaPorDefecto(producto_id: string, sucursal_id: string): FilaMenuSucursal {
  return { producto_id, sucursal_id, disponible: true, precio_mxn: null, agotado_manual: false, agotado_automatico: false };
}

/** ¿Deja la fila igual que no tenerla? */
export function esPorDefecto(e: Pick<EdicionMenuSucursal, "disponible" | "precio_mxn" | "agotado_manual">): boolean {
  return e.disponible && e.precio_mxn === null && !e.agotado_manual;
}

/**
 * Qué mandar al guardar. Una sucursal sin fila y en los valores por defecto no se manda (el menú
 * queda escaso). Una que ya tenía fila se manda siempre, aunque vuelva a lo general: las filas no
 * se borran, porque el pull de la caja no trae bajas.
 */
export function filasParaGuardar(ediciones: EdicionMenuSucursal[], existentes: Pick<FilaMenuSucursal, "sucursal_id">[]): EdicionMenuSucursal[] {
  const conFila = new Set(existentes.map((f) => f.sucursal_id));
  return ediciones.filter((e) => conFila.has(e.sucursal_id) || !esPorDefecto(e));
}

export function filasFormIniciales(sucursales: SucursalMenu[], filas: FilaMenuSucursal[]): FilaFormMenu[] {
  const porSucursal = new Map(filas.map((f) => [f.sucursal_id, f]));
  return sucursales.map((s) => {
    const f = porSucursal.get(s.id);
    return {
      sucursalId: s.id,
      nombre: s.nombre,
      disponible: f?.disponible ?? true,
      precio: f?.precio_mxn === null || f?.precio_mxn === undefined ? "" : String(f.precio_mxn),
      agotado: f?.agotado_manual ?? false,
      agotadoAuto: f?.agotado_automatico ?? false,
    };
  });
}

/** Del formulario a lo que se guarda. Precio vacío = el general (null). */
export function edicionesDeForm(productoId: string, filas: FilaFormMenu[]): EdicionMenuSucursal[] {
  return filas.map((f) => ({
    producto_id: productoId,
    sucursal_id: f.sucursalId,
    disponible: f.disponible,
    precio_mxn: f.precio.trim() === "" ? null : Number(f.precio),
    agotado_manual: f.agotado,
  }));
}

/** El estado en una sucursal, con el mismo orden que motivo_no_disponible_en_sucursal (0151). */
export function estadoEnSucursal(estadoProducto: string, fila: FilaMenuSucursal | undefined): EstadoEnSucursal {
  if (estadoProducto === "PAUSADO") return "PAUSADO";
  if (fila && !fila.disponible) return "NO_SE_VENDE";
  if (estadoProducto === "AGOTADO" || fila?.agotado_manual || fila?.agotado_automatico) return "AGOTADO";
  return "ACTIVO";
}

/** El estado en «todas»: las columnas agotado_* del producto son «agotado en todas» (0151). */
export function estadoGeneral(p: { estado: string; agotado_manual: boolean; agotado_automatico: boolean }): EstadoEnSucursal {
  if (p.estado === "PAUSADO") return "PAUSADO";
  if (p.estado === "AGOTADO" || p.agotado_manual || p.agotado_automatico) return "AGOTADO";
  return "ACTIVO";
}

/** "0.4.9" < "0.4.10". Una versión ilegible cuenta como vieja: es más seguro avisar de más. */
export function versionMenor(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  if (pa.some((n) => !Number.isFinite(n))) return true;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/**
 * Cajas de escritorio (con latido) que todavía no respetan el menú por sucursal: versión vieja o
 * desconocida (NULL = anterior a 0.4.60, 0105). La caja web no cuenta: toma el código al desplegar.
 */
export function cajasSinMenuPorSucursal<C extends Pick<Caja, "ultimoLatido" | "versionApp">>(
  cajas: C[],
  minima: string = VERSION_MINIMA_MENU_SUCURSAL,
): C[] {
  return cajas.filter((c) => c.ultimoLatido !== null && (c.versionApp === null || versionMenor(c.versionApp, minima)));
}

// ── Datos ────────────────────────────────────────────────────────────────────
const COLUMNAS = "producto_id, sucursal_id, disponible, precio_mxn, agotado_manual, agotado_automatico";

function aFila(f: Record<string, unknown>): FilaMenuSucursal {
  return {
    producto_id: String(f.producto_id),
    sucursal_id: String(f.sucursal_id),
    disponible: f.disponible !== false,
    precio_mxn: f.precio_mxn === null || f.precio_mxn === undefined ? null : Number(f.precio_mxn),
    agotado_manual: f.agotado_manual === true,
    agotado_automatico: f.agotado_automatico === true,
  };
}

/** Sucursales activas del negocio, por nombre. Con menos de dos no hay menú por sucursal que mostrar. */
export async function listarSucursalesMenu(): Promise<SucursalMenu[]> {
  const { data, error } = await supabase
    .from("sucursales")
    .select("id, nombre")
    .eq("activa", true)
    .is("deleted_at", null)
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; nombre: string }[]).map((s) => ({ id: s.id, nombre: s.nombre }));
}

export async function leerMenuDeProducto(productoId: string): Promise<FilaMenuSucursal[]> {
  const { data, error } = await supabase.from("productos_sucursal").select(COLUMNAS).eq("producto_id", productoId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(aFila);
}

export async function leerMenuDeSucursal(sucursalId: string): Promise<FilaMenuSucursal[]> {
  const { data, error } = await supabase.from("productos_sucursal").select(COLUMNAS).eq("sucursal_id", sucursalId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(aFila);
}

/** Upsert por (producto, sucursal). No manda agotado_automatico: lo escribe la base y la guardia lo protege. */
export async function guardarMenuSucursal(filas: EdicionMenuSucursal[]): Promise<void> {
  if (filas.length === 0) return;
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  const tenantId = s.tenantId;
  const { error } = await supabase
    .from("productos_sucursal")
    .upsert(filas.map((f) => ({ ...f, tenant_id: tenantId })), { onConflict: "producto_id,sucursal_id" });
  if (error) throw new Error(error.message);
}

/** ¿Algún producto apagado o con otro precio en alguna sucursal? Solo entonces importa una caja vieja. */
export async function hayMenuPorSucursal(): Promise<boolean> {
  const { count, error } = await supabase
    .from("productos_sucursal")
    .select("producto_id", { count: "exact", head: true })
    .or("disponible.eq.false,precio_mxn.not.is.null");
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/** Las cajas a nombrar en el aviso (§7.3 del spec). Vacío si el negocio no usa menú por sucursal. */
export async function cajasQueNoRespetanMenu(): Promise<Caja[]> {
  if (!(await hayMenuPorSucursal())) return [];
  return cajasSinMenuPorSucursal(await listarCajas());
}
```

```bash
pnpm --filter @vim/admin test -- menu-sucursal
```

Esperado: PASS.

- [ ] **Paso 3: `catalogo.ts` deja de escribir el agotado en el producto**

En `apps/admin/app/lib/catalogo.ts`:

1. En el tipo `Producto`, después de `agotado_manual: boolean;` agregar:

```ts
  /** «Agotado en todas» por inventario (derivada en la base, 0151). Solo para mostrar. */
  agotado_automatico: boolean;
```

2. En los dos `.select(...)` de `listarProductos` y `obtenerProducto`, cambiar
   `estado, agotado_manual, visible_en_pos` por `estado, agotado_manual, agotado_automatico, visible_en_pos`,
   y en los dos mapeos, después de `agotado_manual: f.agotado_manual,` agregar
   `agotado_automatico: f.agotado_automatico,`.

3. Reemplazar `resolverEstado` por:

```ts
// El agotado vive por sucursal (0151, ADR 0027): el producto solo guarda ACTIVO o PAUSADO, y sus
// columnas agotado_* las deriva la base («agotado en todas»). `input.agotado` lo guarda el
// formulario en la fila de cada sucursal (menu-sucursal.ts).
function resolverEstado(input: ProductoInput): EstadoProducto {
  return input.estado;
}
```

4. Reemplazar `crearProducto` completa por (devuelve el id, que el formulario necesita para guardar
   las filas de cada sucursal):

```ts
export async function crearProducto(input: ProductoInput): Promise<string> {
  const datos = productoSchema.parse(input);
  const tid = await tenantId();
  const estado = resolverEstado(datos);
  const { data: maxRow } = await supabase
    .from("productos")
    .select("orden_visualizacion")
    .is("deleted_at", null)
    .order("orden_visualizacion", { ascending: false })
    .limit(1)
    .maybeSingle();
  const orden = (maxRow?.orden_visualizacion ?? 0) + 1;
  const { data: creado, error } = await supabase
    .from("productos")
    .insert({
      tenant_id: tid,
      nombre: datos.nombre,
      categoria_id: datos.categoria_id,
      precio_base_mxn: datos.precio_base_mxn,
      descripcion: datos.descripcion || null,
      codigo_interno: datos.codigo_interno || null,
      estado,
      visible_en_pos: datos.visible_en_pos,
      marca_virtual_id: datos.marca_virtual_id || null,
      area_cocina_id: datos.area_cocina_id || null,
      clave_sat: datos.clave_sat || null,
      tasa_iva: datos.tasa_iva,
      iva_incluido_en_precio: datos.iva_incluido_en_precio,
      orden_visualizacion: orden,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return String((creado as { id: string }).id);
}
```

5. En `actualizarProducto`: `const { estado, agotado_manual } = resolverEstado(datos);` →
   `const estado = resolverEstado(datos);` y quitar `agotado_manual,` del `.update({...})`.

`importar-menu.ts` llama a `crearProducto` e ignora el resultado: no cambia.

- [ ] **Paso 4: Pruebas y tipos**

```bash
pnpm --filter @vim/admin test
pnpm --filter @vim/admin typecheck
```

Esperado: verde. Si `typecheck` marca `producto-form.tsx` por `agotado_manual`, no se arregla aquí:
lo cubre la Tarea 7 (en ese caso, haz el commit después de la Tarea 7).

- [ ] **Paso 5: Commit**

```bash
git add apps/admin/app/lib/menu-sucursal.ts apps/admin/app/lib/__tests__/menu-sucursal.test.ts apps/admin/app/lib/catalogo.ts
git commit -m "feat(admin): leer y guardar el menú por sucursal; el producto deja de guardar el agotado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 7: El formulario de producto, por sucursal

**Archivos:**
- Crear: `apps/admin/app/components/disponibilidad-sucursales.tsx`
- Crear: `apps/admin/app/components/aviso-cajas-menu.tsx`
- Modificar: `apps/admin/app/components/producto-form.tsx`

**Interfaces:**
- Consume (Tarea 6): `FilaFormMenu`, `FilaMenuSucursal`, `listarSucursalesMenu`, `leerMenuDeProducto`,
  `filasFormIniciales`, `edicionesDeForm`, `filasParaGuardar`, `guardarMenuSucursal`,
  `cajasQueNoRespetanMenu`; `crearProducto(): Promise<string>`.
- Produce:
  - `DisponibilidadSucursales({ filas, precioGeneral, onCambio }: { filas: FilaFormMenu[]; precioGeneral: number | null; onCambio: (sucursalId: string, cambio: Partial<FilaFormMenu>) => void })`
  - `AvisoCajasMenu({ cajas }: { cajas: Pick<Caja, "id" | "nombre" | "sucursalNombre" | "versionApp">[] })`

- [ ] **Paso 1: Cargar el diseño**

Carga la skill `emil-design-eng` y lee `docs/diseno/admin.md` («Densidad», «Números») y
`docs/diseno/nucleo.md`. En el admin los controles miden 36–40 px (no 44) y los números van a la
derecha con `tabular-nums`.

- [ ] **Paso 2: El aviso de cajas sin actualizar**

`apps/admin/app/components/aviso-cajas-menu.tsx`:

```tsx
"use client";
import type { Caja } from "../lib/configuracion";

/**
 * Una caja de escritorio sin actualizar ignora el menú por sucursal y vende todo al precio general
 * (spec 2026-10-02 §7.3). Se nombra cada una: el dueño necesita saber a cuál ir.
 */
export function AvisoCajasMenu({ cajas }: { cajas: Pick<Caja, "id" | "nombre" | "sucursalNombre" | "versionApp">[] }) {
  if (cajas.length === 0) return null;
  return (
    <div role="status" className="mb-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
      <p className="font-semibold">
        {cajas.length === 1 ? "Una caja todavía no respeta el menú por sucursal" : `${cajas.length} cajas todavía no respetan el menú por sucursal`}
      </p>
      <ul className="mt-1 text-ink-2">
        {cajas.map((c) => (
          <li key={c.id}>
            {c.nombre} ({c.sucursalNombre}) tiene la versión {c.versionApp ?? "anterior a 0.4.60"}: hasta que se actualice vende todo
            al precio general y muestra todos los productos.
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Paso 3: La tabla de sucursales del formulario**

`apps/admin/app/components/disponibilidad-sucursales.tsx`:

```tsx
"use client";
import { precioMxn } from "../lib/catalogo";
import { limpiarPrecio } from "../lib/numeros";
import type { FilaFormMenu } from "../lib/menu-sucursal";

/**
 * Por sucursal: si se vende, a qué precio (vacío = el general) y si está agotado. «Por inventario»
 * es de solo lectura: lo pone y lo quita la base cuando un insumo crítico se acaba EN esa sucursal.
 * Solo se muestra con dos o más sucursales; con una, el formulario se ve como siempre.
 */
export function DisponibilidadSucursales({
  filas,
  precioGeneral,
  onCambio,
}: {
  filas: FilaFormMenu[];
  precioGeneral: number | null;
  onCambio: (sucursalId: string, cambio: Partial<FilaFormMenu>) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-13 font-medium text-ink-2">Por sucursal</p>
      <div className="overflow-hidden rounded border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-sel text-left text-12 font-bold uppercase tracking-wide text-ink-3">
              <th className="px-3 py-2">Sucursal</th>
              <th className="w-[84px] px-3 py-2">Se vende</th>
              <th className="w-[132px] px-3 py-2 text-right">Precio</th>
              <th className="w-[84px] px-3 py-2">Agotado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.sucursalId} className="border-t border-line">
                <td className="px-3 py-2 font-medium">
                  {f.nombre}
                  {f.agotadoAuto && (
                    <span className="ml-2 rounded-full bg-[#FBF1EF] px-2 py-0.5 text-11 font-semibold text-danger">Agotado por inventario</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-ink"
                    aria-label={`Se vende en ${f.nombre}`}
                    checked={f.disponible}
                    onChange={(e) => onCambio(f.sucursalId, { disponible: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="relative">
                    <span aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2">$</span>
                    <input
                      className="h-9 w-full rounded border border-line-strong pl-6 pr-2 text-right text-sm tabular-nums outline-none focus:border-ink disabled:bg-hover disabled:text-ink-3"
                      inputMode="decimal"
                      aria-label={`Precio en ${f.nombre}`}
                      value={f.precio}
                      disabled={!f.disponible}
                      placeholder={precioGeneral !== null ? String(precioGeneral) : "General"}
                      onChange={(e) => onCambio(f.sucursalId, { precio: limpiarPrecio(e.target.value) })}
                    />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-ink"
                    aria-label={`Agotado en ${f.nombre}`}
                    checked={f.agotado}
                    disabled={!f.disponible}
                    onChange={(e) => onCambio(f.sucursalId, { agotado: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-13 text-ink-2">
        Precio vacío = el general{precioGeneral !== null ? ` (${precioMxn(precioGeneral)})` : ""}. Lo que se apaga en una sucursal no
        sale en sus cajas ni en su carta de Uber.
      </p>
    </div>
  );
}
```

- [ ] **Paso 4: Integrarla en `producto-form.tsx`**

1. Imports (junto a los demás):

```tsx
import { AvisoCajasMenu } from "./aviso-cajas-menu";
import { DisponibilidadSucursales } from "./disponibilidad-sucursales";
import {
  cajasQueNoRespetanMenu,
  edicionesDeForm,
  filasFormIniciales,
  filasParaGuardar,
  guardarMenuSucursal,
  leerMenuDeProducto,
  listarSucursalesMenu,
  type FilaFormMenu,
  type FilaMenuSucursal,
} from "../lib/menu-sucursal";
import type { Caja } from "../lib/configuracion";
```

2. Estado nuevo, debajo de `const [ivaIncluido, …]`:

```tsx
  // Menú por sucursal (ADR 0027). `menu` tiene una fila por sucursal activa; con dos o más, la
  // sección Disponibilidad muestra la tabla y el agotado deja de estar en el selector.
  const [menu, setMenu] = useState<FilaFormMenu[]>([]);
  const [menuExistente, setMenuExistente] = useState<FilaMenuSucursal[]>([]);
  const [menuListo, setMenuListo] = useState(false);
  const [cajasViejas, setCajasViejas] = useState<Caja[]>([]);
  const multi = menu.length >= 2;
```

3. Cambiar la línea de `valores` para que el menú cuente como cambio:

```tsx
  const valores = JSON.stringify([nombre, categoriaId, marcaId, areaId, precio, descripcion, codigo, estado, agotado, visible, claveSat, tasaIva, ivaIncluido, menu]);
```

y, justo después de `const sucio = valores !== guardado.current;`, agregar:

```tsx
  // El menú llega después del primer render: al llegar, lo cargado es el punto de partida, no un cambio.
  useEffect(() => {
    if (menuListo) guardado.current = valores;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al terminar de cargar
  }, [menuListo]);
```

4. Dentro del `useEffect` de carga (el que llama `listarCategoriasOpciones`), agregar al final:

```tsx
    Promise.all([listarSucursalesMenu(), producto ? leerMenuDeProducto(producto.id) : Promise.resolve([] as FilaMenuSucursal[])])
      .then(([sucursales, filas]) => {
        const iniciales = filasFormIniciales(sucursales, filas);
        setMenuExistente(filas);
        setMenu(iniciales);
        // Con una sola sucursal, «Agotado» del selector es el de esa sucursal.
        if (iniciales.length === 1 && iniciales[0]!.agotado) setAgotado(true);
        setMenuListo(true);
      })
      .catch(() => setError("No se pudo leer el menú por sucursal"));
    cajasQueNoRespetanMenu().then(setCajasViejas).catch(() => setCajasViejas([]));
```

y cambiar sus dependencias de `[]` a `[producto]` (con `// eslint-disable-next-line react-hooks/exhaustive-deps`
si el linter pide más; `producto` no cambia mientras el formulario vive).

5. En `guardar()`, reemplazar

```tsx
      if (editar) await actualizarProducto(producto!.id, parsed.data);
      else await crearProducto(parsed.data);
```

por:

```tsx
      if (editar) await actualizarProducto(producto!.id, parsed.data);
      const id = editar ? producto!.id : await crearProducto(parsed.data);
      // Con una sola sucursal, el agotado del selector va a la fila de esa sucursal.
      const filasForm = multi ? menu : menu.map((f) => ({ ...f, agotado }));
      await guardarMenuSucursal(filasParaGuardar(edicionesDeForm(id, filasForm), menuExistente));
      setMenuExistente((prev) => [
        ...prev,
        ...filasForm.filter((f) => !prev.some((p) => p.sucursal_id === f.sucursalId)).map((f) => ({
          producto_id: id, sucursal_id: f.sucursalId, disponible: f.disponible,
          precio_mxn: f.precio.trim() === "" ? null : Number(f.precio), agotado_manual: f.agotado, agotado_automatico: f.agotadoAuto,
        })),
      ]);
```

(El `setMenuExistente` hace que un segundo «Guardar» en la misma pantalla —el editor de combos no
navega— trate como existentes las filas recién creadas.)

6. En el `<fieldset>` de Disponibilidad, el `<select id="estado">` pasa a:

```tsx
            <select
              id="estado"
              className={input}
              value={!multi && agotado ? "AGOTADO" : estado}
              onChange={(e) => {
                const v = e.target.value;
                setAgotado(v === "AGOTADO");
                if (v !== "AGOTADO") setEstado(v as "ACTIVO" | "PAUSADO");
              }}
            >
              <option value="ACTIVO">Se vende</option>
              {!multi && <option value="AGOTADO">Agotado · se ve en gris y no se puede vender</option>}
              <option value="PAUSADO">{multi ? "Pausado · no aparece en ninguna sucursal" : "Pausado · no aparece"}</option>
            </select>
```

y, dentro del mismo `<fieldset>`, después del `<label>` de «Producto interno», agregar:

```tsx
          {multi && (
            <>
              <AvisoCajasMenu cajas={cajasViejas} />
              <DisponibilidadSucursales
                filas={menu}
                precioGeneral={precio.trim() === "" ? null : Number(precio)}
                onCambio={(sucursalId, cambio) =>
                  setMenu((prev) => prev.map((f) => (f.sucursalId === sucursalId ? { ...f, ...cambio } : f)))
                }
              />
            </>
          )}
```

- [ ] **Paso 5: Tipos y pruebas**

```bash
pnpm --filter @vim/admin typecheck
pnpm --filter @vim/admin test
```

Esperado: verde.

- [ ] **Paso 6: Verlo funcionar en local**

Con el stack local arriba (`supabase start`) y la semilla con una segunda sucursal (en el SQL
editor de Studio, `http://127.0.0.1:54323`, o con psql):

```sql
insert into tenant_limites (tenant_id, max_sucursales) values ('99999999-0000-0000-0000-0000000000aa', 5)
  on conflict (tenant_id) do update set max_sucursales = 5;
insert into sucursales (tenant_id, codigo, nombre) values ('99999999-0000-0000-0000-0000000000aa', 'KN', 'León Norte');
```

Levanta el admin con el preview (`preview_start`, configuración del admin en `.claude/launch.json`;
si no existe, créala con `pnpm --filter @vim/admin dev`, puerto 3001), entra como el dueño de la
semilla y abre Catálogo → Productos → Hamburguesa Clásica. Comprueba:

- la tabla «Por sucursal» con Centro y Norte, y el selector sin la opción «Agotado»;
- precio 135 en Norte y «Agotado» en Centro → Guardar → al volver a abrir, sigue así;
- en la base: `select * from productos_sucursal where producto_id = 'b0000000-0000-0000-0000-0000000000f1';`
  da dos filas, y `productos.agotado_manual` de la Clásica es `false` (solo una de dos agotada);
- sin consola con errores (`read_console_messages`). Captura de pantalla como prueba.

- [ ] **Paso 7: Commit**

```bash
git add apps/admin/app/components/disponibilidad-sucursales.tsx apps/admin/app/components/aviso-cajas-menu.tsx apps/admin/app/components/producto-form.tsx
git commit -m "feat(admin): el formulario de producto se vende, cuesta y se agota por sucursal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 8: La lista de productos, por sucursal

**Archivos:**
- Modificar (reescribir): `apps/admin/app/(panel)/catalogo/productos/page.tsx`

**Interfaces:**
- Consume (Tarea 6): `listarSucursalesMenu`, `leerMenuDeSucursal`, `guardarMenuSucursal`,
  `cajasQueNoRespetanMenu`, `estadoEnSucursal`, `estadoGeneral`, `filaPorDefecto`, `esPorDefecto`
  y sus tipos; `AvisoCajasMenu` (Tarea 7).

- [ ] **Paso 1: Reescribir la página**

`apps/admin/app/(panel)/catalogo/productos/page.tsx` completo:

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, DialogoPeligro } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { CatalogoTabs } from "../../../components/catalogo-tabs";
import { AvisoCajasMenu } from "../../../components/aviso-cajas-menu";
import { eliminarProducto, listarProductos, precioMxn, type Producto } from "../../../lib/catalogo";
import type { Caja } from "../../../lib/configuracion";
import { mensajeError } from "../../../lib/errores";
import { limpiarPrecio } from "../../../lib/numeros";
import {
  cajasQueNoRespetanMenu,
  esPorDefecto,
  estadoEnSucursal,
  estadoGeneral,
  filaPorDefecto,
  guardarMenuSucursal,
  leerMenuDeSucursal,
  listarSucursalesMenu,
  type EdicionMenuSucursal,
  type EstadoEnSucursal,
  type FilaMenuSucursal,
  type SucursalMenu,
} from "../../../lib/menu-sucursal";

type Filtro = "all" | EstadoEnSucursal;
const TODAS = "todas";

const BADGE: Record<EstadoEnSucursal, { txt: string; cls: string; dot: string }> = {
  ACTIVO: { txt: "Activo", cls: "bg-success-soft text-success", dot: "bg-success" },
  PAUSADO: { txt: "Pausado", cls: "bg-hover text-ink-3", dot: "bg-ink-3" },
  AGOTADO: { txt: "Agotado", cls: "bg-[#FBF1EF] text-danger", dot: "bg-danger" },
  NO_SE_VENDE: { txt: "No se vende aquí", cls: "bg-hover text-ink-2", dot: "bg-ink-3" },
};
const NOMBRE_FILTRO: Record<Filtro, string> = {
  all: "Todos",
  ACTIVO: "Activos",
  PAUSADO: "Pausados",
  AGOTADO: "Agotados",
  NO_SE_VENDE: "No se venden aquí",
};

export default function ProductosPage() {
  const router = useRouter();
  const [prods, setProds] = useState<Producto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [borrar, setBorrar] = useState<Producto | null>(null);
  const [borrando, setBorrando] = useState(false);
  // Menú por sucursal (ADR 0027): con dos o más sucursales se elige una y se ajusta en línea.
  const [sucursales, setSucursales] = useState<SucursalMenu[]>([]);
  const [sucSel, setSucSel] = useState<string>(TODAS);
  const [filas, setFilas] = useState<Map<string, FilaMenuSucursal>>(new Map());
  const [guardandoFila, setGuardandoFila] = useState<string | null>(null);
  const [cajasViejas, setCajasViejas] = useState<Caja[]>([]);
  const porSucursal = sucSel !== TODAS;
  const nombreSuc = sucursales.find((s) => s.id === sucSel)?.nombre ?? "";

  async function recargar() {
    setError(null);
    try {
      setProds(await listarProductos());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los productos"));
    }
  }
  useEffect(() => {
    recargar();
    listarSucursalesMenu().then(setSucursales).catch(() => setSucursales([]));
    cajasQueNoRespetanMenu().then(setCajasViejas).catch(() => setCajasViejas([]));
  }, []);

  useEffect(() => {
    if (sucSel === TODAS) {
      setFilas(new Map());
      return;
    }
    let vivo = true;
    leerMenuDeSucursal(sucSel)
      .then((fs) => {
        if (vivo) setFilas(new Map(fs.map((f) => [f.producto_id, f])));
      })
      .catch((e) => setError(mensajeError(e, "No se pudo leer el menú de la sucursal")));
    return () => {
      vivo = false;
    };
  }, [sucSel]);

  const visibles = useMemo(() => {
    return (prods ?? []).filter((p) => {
      const estado = porSucursal ? estadoEnSucursal(p.estado, filas.get(p.id)) : estadoGeneral(p);
      if (filtro !== "all" && estado !== filtro) return false;
      if (query && !p.nombre.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [prods, filtro, query, porSucursal, filas]);

  /** Una escritura a la vez; al terminar se vuelve a leer: lo que se ve es lo guardado. */
  async function guardarFila(p: Producto, cambio: Partial<Pick<EdicionMenuSucursal, "disponible" | "precio_mxn">>) {
    if (!porSucursal || guardandoFila) return;
    const actual = filas.get(p.id) ?? filaPorDefecto(p.id, sucSel);
    const edicion: EdicionMenuSucursal = {
      producto_id: p.id,
      sucursal_id: sucSel,
      disponible: actual.disponible,
      precio_mxn: actual.precio_mxn,
      agotado_manual: actual.agotado_manual,
      ...cambio,
    };
    if (!filas.has(p.id) && esPorDefecto(edicion)) return;
    setGuardandoFila(p.id);
    setError(null);
    try {
      await guardarMenuSucursal([edicion]);
      setFilas(new Map((await leerMenuDeSucursal(sucSel)).map((f) => [f.producto_id, f])));
      setCajasViejas(await cajasQueNoRespetanMenu());
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar el menú de la sucursal"));
    } finally {
      setGuardandoFila(null);
    }
  }

  async function confirmarBorrado() {
    if (!borrar) return;
    setBorrando(true);
    try {
      await eliminarProducto(borrar.id);
      setBorrar(null);
      setBorrando(false);
      await recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo eliminar"));
      setBorrando(false);
    }
  }

  const sinNada = prods !== null && prods.length === 0;
  const filtros: Filtro[] = porSucursal ? ["all", "ACTIVO", "PAUSADO", "AGOTADO", "NO_SE_VENDE"] : ["all", "ACTIVO", "PAUSADO", "AGOTADO"];
  const th = "border-b border-line bg-sel px-4 py-[13px] text-12 font-bold uppercase tracking-wide text-ink-3";

  return (
    <>
      <PageHeader
        titulo="Productos"
        subtitulo={
          sucursales.length >= 2
            ? "El menú de tu negocio. Elige una sucursal para ver y ajustar lo que vende y a qué precio."
            : "El menú completo de tu negocio. Aquí sí se muestran los precios."
        }
        migas={[{ label: "Catálogo" }, { label: "Productos" }]}
        right={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.push("/catalogo/importar")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[16px] w-[16px]"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              Importar menú
            </Button>
            <Button onClick={() => router.push("/catalogo/productos/nuevo")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[17px] w-[17px]">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nuevo producto
            </Button>
          </div>
        }
      />
      <CatalogoTabs />
      <PageBody>
        <AvisoCajasMenu cajas={cajasViejas} />

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          {sucursales.length >= 2 && (
            <select
              aria-label="Sucursal"
              value={sucSel}
              onChange={(e) => {
                setSucSel(e.target.value);
                setFiltro("all");
              }}
              className="h-10 rounded border border-line-strong px-3 text-sm outline-none focus:border-ink"
            >
              <option value={TODAS}>Todas las sucursales</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )}
          <div className="relative w-full flex-1 sm:max-w-[340px]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-[13px] top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-ink-3">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar producto"
              placeholder="Buscar producto…"
              className="h-10 w-full rounded border border-line-strong pl-[38px] pr-3 text-sm outline-none focus:border-ink"
            />
          </div>
          <div className="scroll-x-limpio inline-flex max-w-full gap-0.5 overflow-x-auto rounded border border-line bg-hover p-[3px] lg:max-w-none lg:overflow-x-visible">
            {filtros.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={[
                  "flex-shrink-0 whitespace-nowrap rounded-[4px] px-3 py-2.5 text-13 font-semibold transition lg:py-[7px]",
                  filtro === f ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
                ].join(" ")}
              >
                {NOMBRE_FILTRO[f]}
              </button>
            ))}
          </div>
        </div>

        {porSucursal && (
          <p className="mb-3 text-13 text-ink-2">
            Precio vacío = el general. Los cambios llegan a las cajas de {nombreSuc} en uno o dos minutos.
          </p>
        )}

        {error && (
          <p className="mb-4 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        {prods === null && <p className="text-sm text-ink-3">Cargando…</p>}

        {prods !== null && (
          <div className="tabla-caja overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${th} text-left`}>Producto</th>
                  <th className={`${th} w-[180px] text-left`}>Categoría</th>
                  {porSucursal && <th className={`${th} w-[110px] text-left`}>Se vende aquí</th>}
                  <th className={`${th} ${porSucursal ? "w-[150px]" : "w-[120px]"} text-right`}>{porSucursal ? "Precio aquí" : "Precio"}</th>
                  <th className={`${th} w-[150px] text-left`}>Estado</th>
                  <th className={`${th} w-[104px]`}></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const fila = filas.get(p.id);
                  const b = BADGE[porSucursal ? estadoEnSucursal(p.estado, fila) : estadoGeneral(p)];
                  // Un combo se edita en su propia pantalla (slots, vista previa de precio).
                  const editarHref = p.es_combo ? `/catalogo/combos/${p.id}` : `/catalogo/productos/${p.id}`;
                  const ocupado = guardandoFila !== null;
                  return (
                    <tr
                      key={p.id}
                      className={["group cursor-pointer border-b border-line last:border-none hover:bg-hover", guardandoFila === p.id ? "opacity-50" : ""].join(" ")}
                      onClick={() => router.push(editarHref)}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-15 font-semibold">{p.nombre}</span>
                          {p.es_combo && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-11 font-semibold text-accent">Combo</span>}
                        </div>
                        {p.codigo_interno && <div className="mt-px text-13 text-ink-3">{p.codigo_interno}</div>}
                      </td>
                      <td className="px-4 py-3.5 text-14 text-ink-2">{p.categoriaNombre}</td>
                      {porSucursal && (
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-ink"
                            aria-label={`${p.nombre} se vende en ${nombreSuc}`}
                            checked={fila?.disponible ?? true}
                            disabled={ocupado}
                            onChange={(e) => void guardarFila(p, { disponible: e.target.checked })}
                          />
                        </td>
                      )}
                      {porSucursal ? (
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <div className="relative ml-auto w-[120px]">
                            <span aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-2">$</span>
                            <input
                              key={`${p.id}:${fila?.precio_mxn ?? ""}`}
                              defaultValue={fila?.precio_mxn ?? ""}
                              placeholder={String(p.precio_base_mxn)}
                              inputMode="decimal"
                              aria-label={`Precio de ${p.nombre} en ${nombreSuc}`}
                              disabled={ocupado || fila?.disponible === false}
                              className="h-9 w-full rounded border border-line-strong pl-6 pr-2 text-right text-sm tabular-nums outline-none focus:border-ink disabled:bg-hover disabled:text-ink-3"
                              onChange={(e) => {
                                e.target.value = limpiarPrecio(e.target.value);
                              }}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                const nuevo = v === "" ? null : Number(v);
                                if (nuevo !== (fila?.precio_mxn ?? null)) void guardarFila(p, { precio_mxn: nuevo });
                              }}
                            />
                          </div>
                        </td>
                      ) : (
                        <td className="px-4 py-3.5 text-right font-display text-15 font-semibold tabular-nums">{precioMxn(p.precio_base_mxn)}</td>
                      )}
                      <td className="px-4 py-3.5">
                        <span className={["inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-13 font-semibold", b.cls].join(" ")}>
                          <span className={["h-1.5 w-1.5 rounded-full", b.dot].join(" ")} />
                          {b.txt}
                        </span>
                        {porSucursal && fila && fila.precio_mxn !== null && (
                          <div className="mt-1 text-12 text-ink-3 tabular-nums">General {precioMxn(p.precio_base_mxn)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex gap-1">
                          <button
                            type="button"
                            title="Editar"
                            aria-label={`Editar ${p.nombre}`}
                            onClick={() => router.push(editarHref)}
                            className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-8 lg:w-8 text-ink-3 transition hover:border-line-strong hover:bg-surface hover:text-ink"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                          <button
                            type="button"
                            title="Eliminar"
                            aria-label={`Eliminar ${p.nombre}`}
                            onClick={() => setBorrar(p)}
                            className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-8 lg:w-8 text-ink-3 transition hover:border-danger-line hover:text-danger"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {visibles.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <p className="font-display text-lg font-semibold">{sinNada ? "Aún no hay productos" : "Sin resultados"}</p>
                <p className="max-w-sm text-sm text-ink-2">
                  {sinNada
                    ? "Crea tu primer producto. Necesitas al menos una categoría."
                    : "No hay productos que coincidan con tu búsqueda o filtro."}
                </p>
                {sinNada && <Button onClick={() => router.push("/catalogo/productos/nuevo")}>Crear el primer producto</Button>}
              </div>
            )}
          </div>
        )}

        {prods !== null && visibles.length > 0 && (
          <p className="mt-4 text-13 text-ink-3">
            Mostrando <b className="text-ink-2">{visibles.length}</b> de <b className="text-ink-2">{prods.length}</b> productos
          </p>
        )}
      </PageBody>

      {borrar && (
        <DialogoPeligro
          error={error}
          titulo="¿Eliminar este producto?"
          consecuencia={
            <>
              <b className="text-ink">{borrar.nombre}</b> se ocultará del catálogo y del POS.
            </>
          }
          boton="Eliminar"
          ocupado={borrando}
          textoOcupado="Eliminando…"
          ancho="sm"
          onConfirmar={confirmarBorrado}
          onCerrar={() => setBorrar(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Paso 2: Tipos y pruebas**

```bash
pnpm --filter @vim/admin typecheck
pnpm --filter @vim/admin test
```

Esperado: verde.

- [ ] **Paso 3: Verlo funcionar en local**

Con la segunda sucursal del paso 6 de la Tarea 7, en Catálogo → Productos:

- aparece el selector «Todas las sucursales · León Centro · León Norte»;
- en León Norte: desmarcar «Se vende aquí» de las Papas → la fila se atenúa, se guarda y el estado
  dice «No se vende aquí»; el filtro «No se venden aquí» la muestra;
- escribir 140 en el precio de la Clásica y salir del campo → se guarda; debajo del estado sale
  «General $120.00»; borrar el precio → vuelve a lo general;
- en «Todas», las columnas son las de siempre;
- con una caja con `version_app = '0.4.108'` y `ultimo_latido` no nulo
  (`update cajas set version_app = '0.4.108', ultimo_latido = now() where id = '99999999-0000-0000-0000-0000000000cc';`)
  sale el aviso nombrando «Caja 01 (León Centro)»;
- a 375 px de ancho no hay scroll horizontal de la página (la tabla tiene el suyo, como antes);
- sin errores en consola. Captura de pantalla como prueba.

- [ ] **Paso 4: Commit**

```bash
git add "apps/admin/app/(panel)/catalogo/productos/page.tsx"
git commit -m "feat(admin): la lista de productos se ajusta por sucursal, en línea

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 9: La carta de Uber es la de la sucursal de la tienda

**Archivos:**
- Modificar: `supabase/functions/_shared/delivery/menu-uber.ts`
- Modificar: `supabase/functions/_shared/delivery/menu-uber.test.ts`
- Modificar: `supabase/functions/delivery-uber-conexion/index.ts:347-383`

**Interfaces:**
- Produce:
  - `ProductoCarta.se_vende?: boolean`
  - `type FilaSucursalCarta = { producto_id: string; disponible: boolean; precio_mxn: number | string | null; agotado_manual: boolean; agotado_automatico: boolean }`
  - `aplicarSucursalCarta(productos: ProductoCarta[], filas: FilaSucursalCarta[]): ProductoCarta[]`
  - motivo de exclusión nuevo: `"no se vende en esta sucursal"`.

- [ ] **Paso 1: Pruebas que fallan**

En `supabase/functions/_shared/delivery/menu-uber.test.ts`, agregar `aplicarSucursalCarta` al
import de `./menu-uber.ts` y, al final:

```ts
test("la carta de una sucursal usa su precio, su agotado y lo que no se vende ahí (0151)", () => {
  const ajustados = aplicarSucursalCarta(prods, [
    { producto_id: "p-cheese", disponible: true, precio_mxn: "115.00", agotado_manual: false, agotado_automatico: false },
    { producto_id: "p-agua", disponible: false, precio_mxn: null, agotado_manual: false, agotado_automatico: false },
    { producto_id: "p-sin-cat", disponible: true, precio_mxn: null, agotado_manual: false, agotado_automatico: true },
  ]);
  const r = construirMenuUber(ajustados, cats);
  assert.deepEqual((r.menu.items as { id: string }[]).map((i) => i.id), ["p-cheese"]);
  assert.deepEqual((r.menu.items as Record<string, unknown>[])[0].price_info, { price: 11500 });
  assert.ok(r.excluidos.some((e) => e.id === "p-agua" && e.motivo === "no se vende en esta sucursal"));
  assert.ok(r.excluidos.some((e) => e.id === "p-sin-cat" && e.motivo === "agotado"));
});

test("sin filas, la carta es la general (0151)", () => {
  assert.deepEqual(aplicarSucursalCarta(prods, []), prods);
});

test("en un combo, lo que la sucursal no vende no es opción y la SUMA usa su precio (0151)", () => {
  const productos: ProductoCarta[] = [
    { id: "combo", nombre: "Combo", precio_base_mxn: 45, categoria_id: "c-hamb", es_combo: true, n_slots: 1 },
    { id: "h1", nombre: "Clásica", precio_base_mxn: 120, categoria_id: "c-hamb" },
    { id: "h2", nombre: "Doble", precio_base_mxn: 150, categoria_id: "c-hamb" },
  ];
  const ajustados = aplicarSucursalCarta(productos, [
    { producto_id: "h1", disponible: true, precio_mxn: 135, agotado_manual: false, agotado_automatico: false },
    { producto_id: "h2", disponible: false, precio_mxn: null, agotado_manual: false, agotado_automatico: false },
  ]);
  const combos = armarCombosCarta(
    ajustados,
    [{ id: "s1", combo_producto_id: "combo", nombre: "Hamburguesa", orden_visualizacion: 1, minimo_selecciones: 1, maximo_selecciones: 1, modo_precio: "SUMA_PRECIO_PRODUCTO", categoria_id: "c-hamb" }],
    [],
  );
  assert.deepEqual(combos[0].slots[0].opciones, [{ producto_id: "h1", importe_mxn: 135 }]);
});
```

```bash
pnpm test:functions
```

Esperado: FAIL, `aplicarSucursalCarta` no existe.

- [ ] **Paso 2: Implementar en `menu-uber.ts`**

1. En `ProductoCarta`, después de `visible?: boolean;`:

```ts
  /** false = la sucursal de esta carta no lo vende (productos_sucursal.disponible, 0151). */
  se_vende?: boolean;
```

2. En `motivoBase`, después de la línea del id inválido:

```ts
    : p.se_vende === false ? "no se vende en esta sucursal"
```

(queda: id inválido → no se vende en esta sucursal → oculto en el POS → agotado → sin precio).

3. En `armarCombosCarta`, la línea de `vendibles` pasa a:

```ts
  const vendibles = new Map(productos.filter((p) => !p.es_combo && p.visible !== false && p.se_vende !== false && !p.agotado).map((p) => [p.id, p]));
```

4. Después de `centavos(...)`, agregar:

```ts
/** Una fila de productos_sucursal (0151) de la sucursal de la conexión. */
export type FilaSucursalCarta = {
  producto_id: string;
  disponible: boolean;
  precio_mxn: number | string | null;
  agotado_manual: boolean;
  agotado_automatico: boolean;
};

/**
 * La carta de una tienda de Uber es la de SU sucursal (delivery_conexiones.sucursal_id): precio,
 * agotado y «se vende» de esa sucursal. Misma regla que precio_producto_en_sucursal /
 * motivo_no_disponible_en_sucursal (0151) y que aplicarSucursal de la caja
 * (apps/pos/app/lib/catalogo-sucursal.ts), con los mismos casos. Va ANTES de armarCombosCarta: así
 * el importe de una opción SUMA ya sale con el precio de la sucursal.
 */
export function aplicarSucursalCarta(productos: ProductoCarta[], filas: FilaSucursalCarta[]): ProductoCarta[] {
  const porProducto = new Map(filas.map((f) => [f.producto_id, f]));
  return productos.map((p) => {
    const f = porProducto.get(p.id);
    if (!f) return p;
    return {
      ...p,
      precio_base_mxn: f.precio_mxn === null ? p.precio_base_mxn : f.precio_mxn,
      agotado: p.agotado === true || f.agotado_manual || f.agotado_automatico,
      se_vende: f.disponible,
    };
  });
}
```

```bash
pnpm test:functions
```

Esperado: PASS (las pruebas viejas siguen verdes).

- [ ] **Paso 3: La Edge Function lee la sucursal de la conexión**

En `supabase/functions/delivery-uber-conexion/index.ts`, acción `"menu"`:

1. Agregar `aplicarSucursalCarta` y `type FilaSucursalCarta` al import de `../_shared/delivery/menu-uber.ts`.
2. En el `Promise.all`, agregar `{ data: filasSucursal }` al final del arreglo desestructurado y, como
   última consulta:

```ts
          // Menú por sucursal (0151): la carta de esta tienda es la de su sucursal.
          admin.from("productos_sucursal").select("producto_id, disponible, precio_mxn, agotado_manual, agotado_automatico")
            .eq("tenant_id", tenantId).eq("sucursal_id", cx.sucursal_id),
```

3. En la consulta de `productos`, quitar `agotado_manual, agotado_automatico` del `select`.
4. Cambiar `const productos: ProductoCarta[] = …map((p) => ({ … }))` a
   `const productosBase: ProductoCarta[] = …` y, en el objeto, reemplazar
   `agotado: p.agotado_manual === true || p.agotado_automatico === true, visible: p.visible_en_pos !== false,`
   por
   `agotado: false, visible: p.visible_en_pos !== false,` con el comentario
   `// El agotado es por sucursal (0151): lo pone aplicarSucursalCarta.`
5. Justo debajo:

```ts
        const productos = aplicarSucursalCarta(productosBase, (filasSucursal ?? []) as FilaSucursalCarta[]);
```

El resto (`armarCombosCarta(productos, …)`, `construirMenuUber(productos, …)`) no cambia.

Confirma que `cx` trae `sucursal_id`:

```bash
grep -n "async function conexionDelTenant" -A8 supabase/functions/delivery-uber-conexion/index.ts
```

Esperado: su `select` incluye `sucursal_id` (o `*`). Si no, agrégalo a ese `select`.

- [ ] **Paso 4: Pruebas**

```bash
pnpm test:functions
```

Esperado: verde. (La función no se despliega aquí: es la Tarea 11.)

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/_shared/delivery/menu-uber.ts supabase/functions/_shared/delivery/menu-uber.test.ts supabase/functions/delivery-uber-conexion/index.ts
git commit -m "feat(delivery): la carta de Uber es la de la sucursal de la tienda (0151)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 10: ADR, documentos, tipos, versión y verificación completa

**Archivos:**
- Crear: `docs/decisiones/0027-el-menu-se-ajusta-por-sucursal.md`
- Modificar: `docs/decisiones/README.md` (fila en la tabla)
- Modificar: `docs/diseno/admin.md` (sección nueva antes de «Lo que NO se hereda del POS»)
- Modificar: `packages/db/src/database.types.ts` (regenerado)
- Modificar: `desktop/package.json`, `desktop/package-lock.json` (versión)
- Modificar (si cambia la versión): `apps/admin/app/lib/menu-sucursal.ts` (`VERSION_MINIMA_MENU_SUCURSAL`)

- [ ] **Paso 1: El ADR**

`docs/decisiones/0027-el-menu-se-ajusta-por-sucursal.md`:

```markdown
# 0027 — El menú se ajusta por sucursal: una fila guarda solo lo que cambia

**Fecha:** 2026-10-02 · **Estado:** vigente · **Supera:** D16 (un solo precio base) y la nota de
`10-SETUP-INICIAL.md` §15.2 («precios pueden variar por sucursal», que nunca se construyó).

## Qué había

- `productos` y `categorias` colgaban de `tenant_id`: un negocio con dos sucursales tenía un menú.
- Un solo precio por producto (`precio_base_mxn`, D16).
- Agotar era global: `productos.agotado_manual` agotaba en todas.
- **Bug:** `evaluar_alertas_stock(insumo, sucursal)` (0007) leía el stock de una sucursal y escribía
  el producto entero. Un insumo crítico en 0 en Centro agotaba en todas; reabastecer Norte
  des-agotaba un producto que en Centro seguía sin insumo.
- Uber publicaba una carta por sucursal (`delivery_conexiones.sucursal_id`) armada con el catálogo
  del negocio entero.

## Qué hacemos ahora (migración 0151)

- **`productos_sucursal`**, una fila por (producto, sucursal) con solo lo que cambia: `disponible`,
  `precio_mxn` (NULL = el general), `agotado_manual`, `agotado_automatico`. **Sin fila = lo general**:
  un producto nuevo sale en todas y una sucursal nueva arranca con todo. Las filas no se borran (el
  pull de la caja no trae bajas): quitar una excepción es volver la fila a lo general.
- **El servidor cobra el precio de la sucursal del ticket** (`precio_producto_en_sucursal` en
  `agregar_item_a_ticket` y `agregar_combo_a_ticket`). Los combos validan además que el combo y sus
  componentes se vendan y no estén agotados **en esa sucursal**. El agregado suelto no valida: la
  caja filtra, y un pedido de Uber pagado no se pierde por una carta vieja.
- **El agotado automático es por sucursal**: `evaluar_alertas_stock` agota y restablece la fila de la
  sucursal del movimiento.
- **`productos.agotado_*` pasan a significar «agotado en todas»** y las mantiene un trigger. Existen
  para las cajas sin actualizar; con una sola sucursal se comportan igual que antes.
  `productos.estado` queda en ACTIVO/PAUSADO.
- La regla vive en tres lugares con los mismos casos de prueba: SQL (0151), la caja
  (`aplicarSucursal`) y la carta de Uber (`aplicarSucursalCarta`).
- Escribir la tabla por REST exige `config.productos`; el agotado por inventario no se escribe a mano.

## Por qué así y no de otra forma

- **No «menús» como entidad** (Menú Centro, Menú Norte): obligaría a dar de alta cada producto en
  cada menú y abriría otra sección del admin. Hoy no hace falta; las excepciones cubren el caso.
- **No duplicar el catálogo por sucursal**: la misma hamburguesa serían dos productos y se rompen los
  reportes juntos, las recetas y los ids de Uber.

## Consecuencias

- Una caja de escritorio anterior a la versión que trae 0151 ignora la tabla: vende todo al precio
  general. El admin lo avisa nombrando la caja (`cajas.version_app`).
- Extras y modificadores siguen globales. Menús por horario, precio por modo de servicio y
  promociones por sucursal quedan fuera.
- `productos.area_cocina_id` sigue apuntando al área de una sola sucursal y el ruteo va por nombre
  (0120): un negocio con menús distintos lo notará si nombra distinto sus áreas.
- Las tres implementaciones de la regla se tocan juntas; los comentarios de cada una apuntan a las otras.
```

En `docs/decisiones/README.md`, agregar después de la fila de 0026:

```markdown
| [0027](0027-el-menu-se-ajusta-por-sucursal.md) | El menú se ajusta por sucursal: una fila guarda solo lo que cambia | 02/10/2026 |
```

- [ ] **Paso 2: El diseño del admin**

En `docs/diseno/admin.md`, antes de `## Lo que NO se hereda del POS`:

```markdown
## Menú por sucursal (0151, ADR 0027)

Solo aparece con **dos o más sucursales**; con una, Catálogo se ve como siempre.

- **Formulario de producto:** en Disponibilidad, una fila por sucursal con «Se vende», precio y
  «Agotado». El precio vacío enseña el general en gris: vacío no es $0, es «el de siempre». Apagar
  una sucursal deshabilita su precio y su agotado. «Agotado por inventario» es una etiqueta, no un
  control: lo pone y lo quita la base. El selector «En la caja» se queda con Se vende / Pausado
  (pausar es para todas).
- **Lista de productos:** un selector de sucursal. En «Todas», la tabla de siempre. Con una
  sucursal elegida, cada renglón deja apagar «Se vende aquí» y escribir su precio en línea, sin
  abrir el producto: armar el menú de una sucursal nueva con 80 productos no puede costar 80 visitas.
  Una escritura a la vez; al terminar se relee, y la fila que se guarda se atenúa.
- **Aviso de cajas viejas:** si el negocio ya usa precios o productos apagados por sucursal y una
  caja de escritorio no se ha actualizado, se nombra la caja y su sucursal: el dueño tiene que saber
  a cuál ir.
```

- [ ] **Paso 3: Tipos de la base**

```bash
supabase db reset
pnpm db:types
git diff --stat packages/db/src/database.types.ts
```

Esperado: el diff agrega `productos_sucursal` y las dos funciones nuevas.

- [ ] **Paso 4: Versión del escritorio**

```bash
grep '"version"' desktop/package.json
```

Si dice `0.4.108`:

```bash
cd desktop && npm version 0.4.109 --no-git-tag-version
```

Si dice otra (otra sesión publicó mientras tanto), sube a la siguiente y pon **esa** en
`VERSION_MINIMA_MENU_SUCURSAL` (`apps/admin/app/lib/menu-sucursal.ts`) y en su prueba
(`menu-sucursal.test.ts`, los casos de `versionMenor` y `cajasSinMenuPorSucursal` que usan `0.4.109`).

- [ ] **Paso 5: Verificación completa**

```bash
pnpm --filter @vim/pos test && pnpm --filter @vim/pos typecheck
pnpm --filter @vim/admin test && pnpm --filter @vim/admin typecheck
pnpm test:functions
pnpm test:escritorio
supabase db reset && supabase test db
cd desktop && npm run smokes && npm run verify:migraciones && npm run verify:sync
```

Esperado: todo en verde. Si algo falla, **no** se sigue a la Tarea 11: se arregla aquí.

- [ ] **Paso 6: La caja de punta a punta, en local**

Con el POS empaquetado en el navegador (receta de la memoria «Reproducir el POS sin Docker»,
`npm run build:ui` en `desktop/` y el `ui-server`), con la segunda sucursal y precios de la
Tarea 7: la caja de Centro no ve lo que se apagó en Centro y cobra los precios de Centro; una cuenta
de mesa abierta con un producto que después se apaga en esa sucursal se reabre **sin perder el
renglón**. Captura como prueba.

- [ ] **Paso 7: Commit**

```bash
git add docs/decisiones/0027-el-menu-se-ajusta-por-sucursal.md docs/decisiones/README.md docs/diseno/admin.md packages/db/src/database.types.ts desktop/package.json desktop/package-lock.json apps/admin/app/lib/menu-sucursal.ts apps/admin/app/lib/__tests__/menu-sucursal.test.ts
git commit -m "docs: ADR 0027 menú por sucursal; tipos y versión 0.4.109 del escritorio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 11: Entrega (cada paso, con el OK de Fermín)

Todo lo de esta tarea sale a producción o a clientes. **Nada se hace sin un sí explícito de Fermín
en el chat, paso por paso** (regla «lista antes de publicar»).

- [ ] **Paso 1: Lista de lo que incluye y OK para seguir**

Mandarle a Fermín: qué cambia para el dueño (formulario, lista, aviso), para la caja (menú de su
sucursal, agotado por sucursal), para Uber (carta por sucursal), el bug que se corrige, la versión
del instalador y que una caja vieja vende al precio general hasta actualizarse. Esperar su OK.

- [ ] **Paso 2: PR y CI**

Escribir el cuerpo del PR en el scratchpad (`pr-menu-por-sucursal.md`): el resumen del paso 1, la
lista de pruebas de la Tarea 10 con su resultado, el orden de despliegue de esta tarea, y al final
la línea `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Luego:

```bash
git push -u origin feat/menu-por-sucursal
gh pr create --title "Menú distinto por sucursal (0151, ADR 0027, 0.4.109)" --body-file "<ruta del scratchpad>/pr-menu-por-sucursal.md"
```

Enlazar el PR con `bind_pr` y esperar CI verde (smokes, pgTAP, unitarias). No mezclar todavía.

- [ ] **Paso 3: Migración a producción ANTES de mezclar** (memoria «Migraciones: antes del merge»)

```bash
supabase migration list
supabase db push --yes
```

`migration list` debe mostrar solo 0151 pendiente en remoto. Después, comprobar en producción:
`select count(*) from productos_sucursal;` (las filas de agotado copiadas) y que una venta normal
de un negocio de una sola sucursal sigue cobrando igual.

- [ ] **Paso 4: Desplegar la función de Uber**

```bash
npx supabase functions deploy delivery-uber-conexion
```

No es pública (la llama el admin con sesión): **no** lleva `--no-verify-jwt`. Probar «Enviar carta»
desde el admin de un negocio con Uber activo solo si Fermín lo autoriza.

- [ ] **Paso 5: Mezclar** el PR (Vercel publica admin y POS web).

- [ ] **Paso 6: Instalador 0.4.109**

Pasar la lista «Antes de empaquetar» de `desktop/RUNBOOK.md` desde un checkout completo (con
`desktop/bin/postgrest.exe`). `npm run dist` en segundo plano (tarda más de 10 min); verificar que
`dist/win-unpacked/resources/bin/postgrest.exe` existe y que el `.exe` pesa más de ~155 MB.
**Publicar solo con OK de Fermín**, firmado (llave en `C:\Users\Fermi\.vim-pos-llaves`), escribiendo
`TODOS` en /versiones.
