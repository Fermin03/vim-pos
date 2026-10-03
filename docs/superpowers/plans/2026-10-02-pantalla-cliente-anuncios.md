# Pantalla del cliente (entrega 2: anuncios) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el dueño suba imágenes desde `/admin` y la pantalla del cliente las muestre en carrusel cuando no se está capturando nada, también sin internet.

**Architecture:** Las imágenes viven en un almacén público de Supabase (`anuncios`) y su lista en la tabla `anuncios_pantalla`, que baja a la caja con el resto del catálogo. Después de cada pull, el proceso principal descarga a disco las imágenes que le falten y borra las que sobren; el ui-server local las sirve y la vista del cliente las rota. La caja nunca sube nada: los anuncios se administran solo en `/admin`.

**Tech Stack:** Postgres + RLS + Supabase Storage, pgTAP, Node `node:test`, Next 15, React 19, Zod 3, Vitest 3, Tailwind con los tokens de `@vim/ui`.

**Spec:** `docs/superpowers/specs/2026-10-02-pantalla-cliente-design.md` (sección «Anuncios (entrega 2)»). ADR: `docs/decisiones/0026-la-pantalla-del-cliente-se-enciende-sola.md`.

## Global Constraints

- Rama `feat/pantalla-cliente-anuncios` desde `main`. No se trabaja en `main`. Antes de cada tarea: `git branch --show-current`.
- Migración `0150_anuncios_pantalla.sql`. Antes de escribirla, confirmar con `ls supabase/migrations | tail -3` que 0150 sigue libre; si no, usar el siguiente número y cambiarlo en todo el plan.
- La migración corre también en el Postgres embebido de la caja, que no tiene `storage.buckets` (sí tiene `storage.objects` y `storage.foldername`, del `00-compat-shim.sql`). Todo lo que toque `storage.buckets` va dentro de un `IF EXISTS` como en `0098`.
- RLS sagrado: lectura por `tenant_id = current_tenant_id()`; escritura además con `es_admin_del_tenant(tenant_id)`. Nada usa `service_role` en `apps/admin` ni `apps/pos`.
- **El pull no borra filas** (no hay lápidas). Un anuncio eliminado es una baja lógica: `deleted_at`, como `zonas_envio`.
- Tope: **10** anuncios vivos por negocio.
- Tiempo en pantalla: hay un **tiempo general** (`configuracion_tenant.pantalla_cliente_segundos`, entero entre **3 y 60**, por omisión **8**) y cada anuncio puede tener **el suyo** (`anuncios_pantalla.segundos`, mismo rango, `NULL` = usa el general). Los dos se eligen en la misma página donde se suben las imágenes. Quien resuelve cuál aplica es la caja (`listarAnuncios`): la pantalla recibe cada anuncio ya con sus segundos.
- Solo imágenes: `image/jpeg`, `image/png`, `image/webp`. Lado mayor **1920 px**, tope **800 KB** tras reducir en el navegador. Sin video.
- Anuncios por negocio (los mismos en todas las sucursales). Sin candado de plan.
- La caja no sube ni edita anuncios. Sin cambios en `sync-push`.
- Una imagen que falla (descarga, archivo dañado, carga en pantalla) se salta; si no queda ninguna, la pantalla muestra logo y nombre como hoy. Un fallo de anuncios nunca toca la venta ni el arranque.
- Nombres de archivo en disco: `<uuid>.<jpg|png|webp>`. La ruta que sirve archivos valida el nombre contra esa forma; nunca concatena rutas libres.
- Sin `any`: `unknown` + Zod. Español en el dominio. Archivos `kebab-case`.
- `apps/pos` no tiene ESLint: la verificación es `typecheck` + pruebas. No correr `next build` con un dev server arriba.
- Commits con pathspec explícito y el trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Orden de despliegue:** la migración se aplica a producción a mano y ANTES de mezclar; al mezclar se despliega el admin; la caja necesita instalador nuevo. Nada de eso es parte de este plan: publicar pasa por la lista del RUNBOOK y el visto bueno de Fermín.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0150_anuncios_pantalla.sql` (nuevo) | Tabla, RLS, tope, segundos, almacén, snapshot del pull, versión del catálogo. |
| `supabase/tests/0034_anuncios_pantalla.test.sql` (nuevo) | Aislamiento entre negocios, solo administra el dueño/admin, tope de 10, snapshot. |
| `packages/db/src/database.types.ts` | Regenerado. |
| `desktop/src/sync-pull.mjs` | `anuncios_pantalla` en `PULL_ORDER`. |
| `desktop/src/anuncios.mjs` (nuevo) + `anuncios.test.mjs` | Qué descargar y qué borrar; descarga a disco; lista para la vista. |
| `desktop/src/ui-server.mjs` + `ui-server-anuncios.test.mjs` (nuevo) | Rutas `/__anuncios` y `/__anuncios/<archivo>`. |
| `desktop/src/main.mjs` | Sincronizar anuncios tras cada pull y pasar los ganchos al ui-server. |
| `apps/pos/app/lib/pantalla-cliente/anuncios.ts` (nuevo) | Leer la lista y decidir qué imagen sigue. |
| `apps/pos/app/components/carrusel-anuncios.tsx` (nuevo) | El carrusel. |
| `apps/pos/app/components/pantalla-cliente.tsx` | Reposo usa el carrusel cuando hay anuncios. |
| `apps/admin/app/lib/anuncios-pantalla.ts` (nuevo) + prueba | Capa de datos del admin. |
| `apps/admin/app/(panel)/configuracion/pantalla-cliente/page.tsx` (nuevo) | Página del dueño. |
| `apps/admin/app/components/config-sidenav.tsx` | Entrada «Pantalla del cliente». |
| `docs/decisiones/0026-…md`, `docs/diseno/pantalla-cliente.md`, `docs/diseno/admin.md`, `desktop/RUNBOOK.md` | Documentación. |

---

### Task 0: Rama

- [ ] **Step 1**

```bash
git checkout main && git pull
git checkout -b feat/pantalla-cliente-anuncios
git add docs/superpowers/plans/2026-10-02-pantalla-cliente-anuncios.md
git commit -m "docs: plan de los anuncios de la pantalla del cliente" -- docs/superpowers/plans/2026-10-02-pantalla-cliente-anuncios.md
```

---

### Task 1: Migración 0150 y prueba SQL

**Files:**
- Create: `supabase/migrations/0150_anuncios_pantalla.sql`
- Create: `supabase/tests/0034_anuncios_pantalla.test.sql`
- Modify: `packages/db/src/database.types.ts` (regenerado)

**Interfaces:**
- Produces:
  - Tabla `anuncios_pantalla (id uuid, tenant_id uuid, ruta text, orden int, activo bool, segundos int NULL, ancho int, alto int, bytes int, created_at, updated_at, deleted_at)`. `segundos` NULL = usa el tiempo general.
  - Columna `configuracion_tenant.pantalla_cliente_segundos int NOT NULL DEFAULT 8`.
  - Almacén `anuncios` (público), rutas `<tenant_id>/<uuid>.<ext>`.
  - Clave `anuncios_pantalla` en `sync_pull_snapshot(p_tenant)`.
  - `catalogo_version()` también mira `anuncios_pantalla`.

- [ ] **Step 1: Escribir la prueba**

`supabase/tests/0034_anuncios_pantalla.test.sql`. Los ids del seed son los que usa `0023_override_precio_y_zonas.test.sql` (tenant `…00aa`, cajero `…0001`, dueño `…00e1`); el segundo negocio se siembra como en `0001_rls_cross_tenant.test.sql`.

```sql
-- ============================================================================
-- 0150 · anuncios de la pantalla del cliente: cada negocio ve solo los suyos, solo el dueño o el
-- admin los administra, hay un tope de 10 y bajan a la caja en el snapshot.
-- ============================================================================
begin;
select plan(10);

\set t      '99999999-0000-0000-0000-0000000000aa'
\set cajero '99999999-0000-0000-0000-000000000001'
\set dueno  '99999999-0000-0000-0000-0000000000e1'
\set otro   '34343434-0000-0000-0000-0000000000aa'
\set a1     '34343434-0000-0000-0000-000000000001'
\set ajeno  '34343434-0000-0000-0000-000000000002'

insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal)
values (:'otro', 'tenant-0034', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
insert into anuncios_pantalla (id, tenant_id, ruta, orden) values
  (:'a1',    :'t',    :'t'    || '/' || :'a1'    || '.jpg', 0),
  (:'ajeno', :'otro', :'otro' || '/' || :'ajeno' || '.jpg', 0);

-- 1) Los segundos tienen valor por omisión y límites.
select col_default_is('configuracion_tenant', 'pantalla_cliente_segundos', '8', 'los segundos por imagen son 8 por omisión');
select throws_ok(
  format($$ insert into configuracion_tenant (tenant_id, pantalla_cliente_segundos) values (%L, 2)
            on conflict (tenant_id) do update set pantalla_cliente_segundos = 2 $$, :'t'),
  '23514', null, 'menos de 3 segundos no se acepta');

-- 1b) El tiempo propio de un anuncio tiene los mismos límites.
select throws_ok(
  format($$ update anuncios_pantalla set segundos = 61 where id = %L $$, :'a1'),
  '23514', null, 'un anuncio no puede durar más de 60 segundos');

-- Como el cajero del negocio.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'cajero', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 2) Ve los de su negocio y no los ajenos.
select is((select count(*)::int from anuncios_pantalla), 1, 'el cajero ve solo los anuncios de su negocio');
select is((select count(*)::int from anuncios_pantalla where id = :'ajeno'), 0, 'el anuncio de otro negocio no se ve');

-- 3) Pero no los administra.
select throws_ok(
  format($$ insert into anuncios_pantalla (tenant_id, ruta) values (%L, %L) $$, :'t', :'t' || '/x.jpg'),
  '42501', null, 'un cajero no puede subir anuncios');

-- Como el dueño.
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 4) El dueño sí, pero nunca en otro negocio.
select lives_ok(
  format($$ insert into anuncios_pantalla (tenant_id, ruta, orden) values (%L, %L, 1) $$, :'t', :'t' || '/dos.jpg'),
  'el dueño sube un anuncio');
select throws_ok(
  format($$ insert into anuncios_pantalla (tenant_id, ruta) values (%L, %L) $$, :'otro', :'otro' || '/y.jpg'),
  '42501', null, 'el dueño no puede subir anuncios a otro negocio');

-- 5) Tope de 10 vivos: ya hay 2; entran 8 más y el undécimo se rechaza.
insert into anuncios_pantalla (tenant_id, ruta, orden)
select :'t', :'t' || '/lote-' || g || '.jpg', 10 + g from generate_series(1, 8) g;
select throws_ok(
  format($$ insert into anuncios_pantalla (tenant_id, ruta) values (%L, %L) $$, :'t', :'t' || '/once.jpg'),
  'P0001', null, 'el undécimo anuncio se rechaza');

-- 6) El snapshot del pull los trae (lo llama service_role; aquí, el superusuario de la prueba).
reset role;
select is(
  (select jsonb_array_length(sync_pull_snapshot(:'t') -> 'anuncios_pantalla')), 10,
  'el snapshot de la caja trae los 10 anuncios del negocio');

select * from finish();
rollback;
```

Si el seed no trae al cajero `…0001` o al dueño `…00e1` con esos roles, usar los que sí use `0023_override_precio_y_zonas.test.sql`.

- [ ] **Step 2: Correr y ver que falla**

Run (desde `desktop/`, sin Docker): `npm run smokes`
Expected: `0034_anuncios_pantalla` FALLA con `relation "anuncios_pantalla" does not exist`.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/0150_anuncios_pantalla.sql`:

```sql
-- ============================================================================
-- 0150 — Anuncios de la pantalla del cliente (ADR 0026, entrega 2).
--
-- La pantalla que mira el cliente enseña anuncios cuando nadie está capturando. Las imágenes van
-- al almacén `anuncios` y aquí solo queda la LISTA: qué imagen, en qué orden y si está activa.
--
-- POR QUÉ NO VIAJAN DENTRO DEL SYNC, COMO EL LOGO
-- El logo es un data URI en `tenants` porque tiene que imprimirse sin internet y pesa poco. Diez
-- imágenes a pantalla completa en cada snapshot serían megas en cada ciclo de cada caja. El
-- snapshot lleva solo estas filas; la caja descarga cada imagen una vez y la guarda en disco.
--
-- POR QUÉ `deleted_at` Y NO DELETE
-- El pull no trae lápidas: una fila borrada en la nube se queda viva en la caja para siempre. La
-- baja lógica sí viaja.
-- ============================================================================

CREATE TABLE IF NOT EXISTS anuncios_pantalla (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  -- Ruta dentro del almacén `anuncios`: <tenant_id>/<uuid>.<ext>.
  ruta        text NOT NULL CHECK (ruta ~ '^[0-9a-f-]{36}/[0-9A-Za-z._-]{1,80}$'),
  orden       integer NOT NULL DEFAULT 0,
  activo      boolean NOT NULL DEFAULT true,
  -- Tiempo propio de este anuncio. NULL = usa el general (configuracion_tenant.pantalla_cliente_segundos).
  segundos    integer NULL CHECK (segundos BETWEEN 3 AND 60),
  ancho       integer NULL CHECK (ancho > 0),
  alto        integer NULL CHECK (alto > 0),
  bytes       integer NULL CHECK (bytes > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL
);

COMMENT ON TABLE anuncios_pantalla IS 'Imágenes que la pantalla del cliente muestra en reposo. La imagen vive en el almacén `anuncios`; aquí va la lista. Por negocio, no por sucursal.';

-- Sin filtro por deleted_at a propósito: catalogo_version() tiene que notar también las bajas.
CREATE INDEX IF NOT EXISTS idx_anuncios_pantalla_version
  ON anuncios_pantalla (tenant_id, updated_at DESC);

ALTER TABLE anuncios_pantalla ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON anuncios_pantalla TO authenticated, service_role;

DO $$ BEGIN
  CREATE POLICY anuncios_pantalla_select ON anuncios_pantalla
    FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Administrar anuncios es cosa del dueño o del admin, no de cualquier empleado con sesión.
DO $$ BEGIN
  CREATE POLICY anuncios_pantalla_insert ON anuncios_pantalla
    FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY anuncios_pantalla_update ON anuncios_pantalla
    FOR UPDATE USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id))
    WITH CHECK (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY anuncios_pantalla_delete ON anuncios_pantalla
    FOR DELETE USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_anuncios_pantalla_updated_at ON anuncios_pantalla;
CREATE TRIGGER trg_anuncios_pantalla_updated_at
  BEFORE UPDATE ON anuncios_pantalla
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tope de 10 vivos por negocio. En la base y no solo en la página: el contador del admin es una
-- cortesía; esto es la regla. El candado por negocio evita que dos subidas a la vez pasen las dos.
CREATE OR REPLACE FUNCTION anuncios_pantalla_tope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_vivos integer;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('anuncios_pantalla:' || NEW.tenant_id::text, 0));
  SELECT count(*) INTO v_vivos FROM anuncios_pantalla
   WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND id <> NEW.id;
  IF v_vivos >= 10 THEN
    RAISE EXCEPTION 'Ya hay 10 anuncios. Quita uno para subir otro.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_anuncios_pantalla_tope ON anuncios_pantalla;
CREATE TRIGGER trg_anuncios_pantalla_tope
  BEFORE INSERT OR UPDATE OF deleted_at ON anuncios_pantalla
  FOR EACH ROW EXECUTE FUNCTION anuncios_pantalla_tope();

-- Segundos que dura cada imagen. En configuracion_tenant porque esa fila ya baja a la caja.
ALTER TABLE configuracion_tenant
  ADD COLUMN IF NOT EXISTS pantalla_cliente_segundos integer NOT NULL DEFAULT 8;
DO $$ BEGIN
  ALTER TABLE configuracion_tenant ADD CONSTRAINT configuracion_tenant_pantalla_segundos_chk
    CHECK (pantalla_cliente_segundos BETWEEN 3 AND 60);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Almacén ─────────────────────────────────────────────────────────────────
-- Público para leer: son anuncios, y la caja los descarga sin sesión. En el Postgres embebido de
-- la caja no hay `storage.buckets` (mismo criterio que la 0098): el bloque se omite.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('anuncios', 'anuncios', true, 1048576, ARRAY['image/jpeg', 'image/png', 'image/webp'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Escribir y borrar: solo el dueño o el admin, y solo dentro de la carpeta de su negocio.
DO $$ BEGIN
  CREATE POLICY "anuncios_write_own_tenant" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'anuncios'
      AND (storage.foldername(name))[1] = current_tenant_id()::text
      AND es_admin_del_tenant(current_tenant_id()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anuncios_delete_own_tenant" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'anuncios'
      AND (storage.foldername(name))[1] = current_tenant_id()::text
      AND es_admin_del_tenant(current_tenant_id()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

Después de ese bloque, dos funciones que ya existen se vuelven a crear con una línea más cada una. **No se reescriben de memoria**: se copia la definición vigente y se le agrega la línea.

1. `sync_pull_snapshot(p_tenant uuid)`: copiar literal la definición de `supabase/migrations/0136_limites_y_sync_pull.sql` (desde `CREATE OR REPLACE FUNCTION sync_pull_snapshot` hasta los `REVOKE`/`GRANT` inclusive), confirmando antes con `grep -ln "FUNCTION sync_pull_snapshot" supabase/migrations/*.sql | tail -1` que 0136 sigue siendo la última. Agregar, después de la línea de `'zonas_envio'`:

```sql
    -- Anuncios de la pantalla del cliente (0150). Solo la lista: las imágenes las baja la caja aparte.
    'anuncios_pantalla',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM anuncios_pantalla x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
```

2. `catalogo_version()`: copiar literal la definición vigente (la última está en `0116_zonas_envio.sql`; confirmar con `grep -ln "FUNCTION catalogo_version" supabase/migrations/*.sql | tail -1`) con sus `REVOKE`/`GRANT`, y agregar `anuncios_pantalla` a lo que mide, con la misma forma que usa para `zonas_envio`. Sin esto, un anuncio nuevo tardaría hasta una hora en llegar a la caja en vez de un minuto. Si `configuracion_tenant` tiene `updated_at`, incluirla también para que el cambio de segundos llegue igual de rápido; si no lo tiene, dejarlo y anotarlo en el informe.

- [ ] **Step 4: Correr y ver que pasa**

Run (desde `desktop/`): `npm run smokes`
Expected: todos en verde, incluido `0034_anuncios_pantalla` con 10 de 10. Además `npm run verify:migraciones` en verde (la migración aplica en el Postgres de la caja).

- [ ] **Step 5: Regenerar tipos**

Run: `pnpm db:types`
Expected: `packages/db/src/database.types.ts` gana `anuncios_pantalla` y `pantalla_cliente_segundos`. Si el comando exige Docker o el Supabase local y no están, agregar a mano esas dos definiciones siguiendo la forma de `zonas_envio` en el mismo archivo, y decirlo en el informe.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0150_anuncios_pantalla.sql supabase/tests/0034_anuncios_pantalla.test.sql packages/db/src/database.types.ts
git commit -m "feat(db): anuncios de la pantalla del cliente (0150)" -- supabase/migrations/0150_anuncios_pantalla.sql supabase/tests/0034_anuncios_pantalla.test.sql packages/db/src/database.types.ts
```

---

### Task 2: La caja baja y guarda las imágenes

**Files:**
- Modify: `desktop/src/sync-pull.mjs` (`PULL_ORDER`)
- Create: `desktop/src/anuncios.mjs`
- Test: `desktop/src/anuncios.test.mjs`

**Interfaces:**
- Consumes: tabla local `anuncios_pantalla` y `configuracion_tenant.pantalla_cliente_segundos` (Task 1).
- Produces:
  - `nombreArchivo(fila: { id: string, ruta: string }): string | null` → `<id>.<ext>` o null si la fila no es válida.
  - `ARCHIVO_VALIDO: RegExp`
  - `planAnuncios(filas, enDisco: string[]): { descargar: Array<{ archivo, ruta }>, borrar: string[] }`
  - `sincronizarAnuncios({ pool, dir, cloudUrl, fetch?, log? }): Promise<{ bajados: number, borrados: number, fallidos: number }>` (nunca lanza)
  - `listarAnuncios({ pool, dir }): Promise<{ segundos: number, anuncios: Array<{ id: string, url: string, segundos: number }> }>` (nunca lanza). El `segundos` de cada anuncio ya viene resuelto: el propio si lo tiene y es válido; si no, el general.
  - `rutaDeAnuncio(dir: string, archivo: string): string | null`

- [ ] **Step 1: Escribir las pruebas**

`desktop/src/anuncios.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { nombreArchivo, planAnuncios, sincronizarAnuncios, listarAnuncios, rutaDeAnuncio } from "./anuncios.mjs";

const T = "99999999-0000-0000-0000-0000000000aa";
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const fila = (id, ext = "jpg", extra = {}) => ({ id, ruta: `${T}/${id}.${ext}`, orden: 0, ...extra });

/** Postgres de mentira: contesta las dos consultas del módulo. */
function poolFalso(filas, segundos = 8) {
  return {
    query: async (sql) => {
      if (/FROM anuncios_pantalla/i.test(sql)) return { rows: filas };
      if (/pantalla_cliente_segundos/i.test(sql)) return { rows: segundos === null ? [] : [{ pantalla_cliente_segundos: segundos }] };
      throw new Error("consulta inesperada: " + sql);
    },
  };
}
const imagen = (tipo = "image/jpeg", bytes = 10) => new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": tipo } });
const enTemporal = async (fn) => { const dir = mkdtempSync(path.join(os.tmpdir(), "vim-anuncios-")); try { await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test("el nombre en disco es el id con la extensión de la ruta", () => {
  assert.equal(nombreArchivo(fila(A, "png")), `${A}.png`);
  assert.equal(nombreArchivo(fila(A, "JPEG")), `${A}.jpg`);
  assert.equal(nombreArchivo({ id: A, ruta: `${T}/foto.gif` }), null, "una extensión que no es imagen permitida no entra");
  assert.equal(nombreArchivo({ id: "../../x", ruta: `${T}/a.jpg` }), null, "un id que no es uuid no entra");
});

test("el plan baja lo que falta y borra lo que sobra, sin tocar lo ajeno", () => {
  const p = planAnuncios([fila(A), fila(B, "png")], [`${A}.jpg`, "33333333-3333-3333-3333-333333333333.jpg", "leeme.txt", `${B}.png.tmp`]);
  assert.deepEqual(p.descargar, [{ archivo: `${B}.png`, ruta: `${T}/${B}.png` }]);
  assert.deepEqual(p.borrar.sort(), ["33333333-3333-3333-3333-333333333333.jpg", `${B}.png.tmp`].sort());
});

test("baja las imágenes que faltan desde el almacén público", async () => {
  await enTemporal(async (dir) => {
    const pedidas = [];
    const r = await sincronizarAnuncios({
      pool: poolFalso([fila(A), fila(B, "png")]), dir, cloudUrl: "https://nube.example",
      fetch: async (url) => { pedidas.push(url); return imagen(url.endsWith(".png") ? "image/png" : "image/jpeg"); },
    });
    assert.deepEqual(r, { bajados: 2, borrados: 0, fallidos: 0 });
    assert.deepEqual(pedidas, [`https://nube.example/storage/v1/object/public/anuncios/${T}/${A}.jpg`, `https://nube.example/storage/v1/object/public/anuncios/${T}/${B}.png`]);
    assert.deepEqual(readdirSync(dir).sort(), [`${A}.jpg`, `${B}.png`]);
  });
});

test("no vuelve a bajar lo que ya tiene y borra lo que ya no está en la lista", async () => {
  await enTemporal(async (dir) => {
    writeFileSync(path.join(dir, `${A}.jpg`), "ya");
    writeFileSync(path.join(dir, `${B}.png`), "sobra");
    let pedidas = 0;
    const r = await sincronizarAnuncios({ pool: poolFalso([fila(A)]), dir, cloudUrl: "https://nube.example", fetch: async () => { pedidas++; return imagen(); } });
    assert.deepEqual(r, { bajados: 0, borrados: 1, fallidos: 0 });
    assert.equal(pedidas, 0);
    assert.equal(readFileSync(path.join(dir, `${A}.jpg`), "utf8"), "ya");
  });
});

test("una descarga que falla se salta, no deja medio archivo y no tumba a las demás", async () => {
  await enTemporal(async (dir) => {
    const logs = [];
    const r = await sincronizarAnuncios({
      pool: poolFalso([fila(A), fila(B)]), dir, cloudUrl: "https://nube.example", log: (m) => logs.push(m),
      fetch: async (url) => { if (url.includes(A)) throw new Error("sin red"); return imagen(); },
    });
    assert.deepEqual(r, { bajados: 1, borrados: 0, fallidos: 1 });
    assert.deepEqual(readdirSync(dir), [`${B}.jpg`]);
    assert.equal(logs.length, 1);
  });
});

test("lo que no es una imagen, o pesa de más, no se guarda", async () => {
  await enTemporal(async (dir) => {
    const r = await sincronizarAnuncios({
      pool: poolFalso([fila(A), fila(B)]), dir, cloudUrl: "https://nube.example",
      fetch: async (url) => (url.includes(A) ? new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }) : imagen("image/jpeg", 3 * 1024 * 1024)),
    });
    assert.deepEqual(r, { bajados: 0, borrados: 0, fallidos: 2 });
    assert.deepEqual(readdirSync(dir), []);
  });
});

test("si la base falla, no lanza y no borra lo que hay en disco", async () => {
  await enTemporal(async (dir) => {
    writeFileSync(path.join(dir, `${A}.jpg`), "ya");
    const r = await sincronizarAnuncios({ pool: { query: async () => { throw new Error("sin base"); } }, dir, cloudUrl: "https://nube.example", fetch: async () => imagen() });
    assert.deepEqual(r, { bajados: 0, borrados: 0, fallidos: 0 });
    assert.deepEqual(readdirSync(dir), [`${A}.jpg`]);
  });
});

test("la lista para la pantalla trae solo lo que ya está en disco, en orden, con los segundos", async () => {
  await enTemporal(async (dir) => {
    writeFileSync(path.join(dir, `${B}.png`), "x");
    const l = await listarAnuncios({ pool: poolFalso([fila(A), fila(B, "png")], 12), dir });
    assert.deepEqual(l, { segundos: 12, anuncios: [{ id: B, url: `/__anuncios/${B}.png`, segundos: 12 }] });
  });
});

test("un anuncio con tiempo propio lo conserva; uno sin él, o con uno inválido, usa el general", async () => {
  await enTemporal(async (dir) => {
    const C = "33333333-3333-3333-3333-333333333333";
    for (const id of [A, B, C]) writeFileSync(path.join(dir, `${id}.jpg`), "x");
    const filas = [fila(A, "jpg", { segundos: 20 }), fila(B, "jpg", { segundos: null }), fila(C, "jpg", { segundos: 999 })];
    const l = await listarAnuncios({ pool: poolFalso(filas, 10), dir });
    assert.deepEqual(l.anuncios.map((a) => a.segundos), [20, 10, 10]);
  });
});

test("sin configuración usa 8 segundos; si algo falla, lista vacía", async () => {
  await enTemporal(async (dir) => {
    assert.deepEqual(await listarAnuncios({ pool: poolFalso([], null), dir }), { segundos: 8, anuncios: [] });
    assert.deepEqual(await listarAnuncios({ pool: { query: async () => { throw new Error("x"); } }, dir }), { segundos: 8, anuncios: [] });
  });
});

test("la ruta de un archivo solo se resuelve para nombres con forma de anuncio", () => {
  const dir = path.join(os.tmpdir(), "anuncios");
  assert.equal(rutaDeAnuncio(dir, `${A}.jpg`), path.join(dir, `${A}.jpg`));
  for (const malo of ["../secreto.jpg", `${A}.exe`, `..%2f${A}.jpg`, `${A}.jpg/..`, ""]) assert.equal(rutaDeAnuncio(dir, malo), null, malo);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test desktop/src/anuncios.test.mjs`
Expected: FAIL, `Cannot find module ... anuncios.mjs`.

- [ ] **Step 3: Implementar**

`desktop/src/anuncios.mjs`:

```js
// Anuncios de la pantalla del cliente: la copia local de las imágenes.
//
// La lista (`anuncios_pantalla`) baja con el pull; las imágenes no caben ahí, así que después de
// cada pull se descargan a disco las que falten y se borran las que ya no están en la lista. La
// pantalla del cliente solo enseña lo que ya está en disco: así funciona sin internet y nunca
// pinta una imagen a medias.
//
// Nada de aquí lanza. Los anuncios son un adorno: una descarga fallida se reintenta en el
// siguiente pull, y un fallo no puede tocar la venta, el sync ni el arranque.
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** La única forma de nombre que se guarda y se sirve. */
export const ARCHIVO_VALIDO = new RegExp(`^${UUID}\\.(jpg|png|webp)$`);
const TIPOS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const EXTENSIONES = { jpg: "jpg", jpeg: "jpg", png: "png", webp: "webp" };
/** El almacén acepta hasta 1 MB; el doble de margen por si el tope cambia allá antes que aquí. */
const MAX_BYTES = 2 * 1024 * 1024;
const SEGUNDOS = 8;
const valido = (n) => Number.isInteger(n) && n >= 3 && n <= 60;

export function nombreArchivo(fila) {
  const ext = EXTENSIONES[String(fila?.ruta ?? "").split(".").pop()?.toLowerCase() ?? ""];
  const nombre = `${fila?.id}.${ext}`;
  return ext && ARCHIVO_VALIDO.test(nombre) ? nombre : null;
}

/** Qué bajar y qué borrar. PURA. Solo borra lo que tiene forma de anuncio (o un temporal suyo). */
export function planAnuncios(filas, enDisco) {
  const quiero = new Map();
  for (const f of filas) { const a = nombreArchivo(f); if (a) quiero.set(a, f.ruta); }
  const tengo = new Set(enDisco);
  const descargar = [...quiero].filter(([a]) => !tengo.has(a)).map(([archivo, ruta]) => ({ archivo, ruta }));
  const borrar = enDisco.filter((a) => (ARCHIVO_VALIDO.test(a) && !quiero.has(a)) || (a.endsWith(".tmp") && ARCHIVO_VALIDO.test(a.slice(0, -4))));
  return { descargar, borrar };
}

const SQL_FILAS = `SELECT id, ruta, segundos FROM anuncios_pantalla WHERE activo AND deleted_at IS NULL ORDER BY orden, created_at`;

export async function sincronizarAnuncios({ pool, dir, cloudUrl, fetch: pedir = fetch, log = () => {} }) {
  const r = { bajados: 0, borrados: 0, fallidos: 0 };
  let filas;
  try { filas = (await pool.query(SQL_FILAS)).rows; } catch (e) { log(`no se pudo leer la lista: ${e?.message ?? e}`); return r; }
  let plan;
  try { mkdirSync(dir, { recursive: true }); plan = planAnuncios(filas, readdirSync(dir)); } catch (e) { log(`no se pudo leer la carpeta: ${e?.message ?? e}`); return r; }

  for (const a of plan.borrar) { try { rmSync(path.join(dir, a), { force: true }); if (!a.endsWith(".tmp")) r.borrados++; } catch { /* se reintenta en el siguiente pull */ } }

  for (const { archivo, ruta } of plan.descargar) {
    const destino = path.join(dir, archivo);
    try {
      const res = await pedir(`${String(cloudUrl).replace(/\/+$/, "")}/storage/v1/object/public/anuncios/${ruta}`, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tipo = String(res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!TIPOS[tipo]) throw new Error(`no es una imagen (${tipo || "sin tipo"})`);
      const datos = Buffer.from(await res.arrayBuffer());
      if (datos.length === 0 || datos.length > MAX_BYTES) throw new Error(`tamaño fuera de rango (${datos.length} bytes)`);
      // A un temporal y luego rename: la pantalla nunca ve un archivo a medio escribir.
      writeFileSync(destino + ".tmp", datos);
      renameSync(destino + ".tmp", destino);
      r.bajados++;
    } catch (e) {
      r.fallidos++;
      try { rmSync(destino + ".tmp", { force: true }); } catch { /* */ }
      log(`no se pudo bajar ${archivo}: ${e?.message ?? e}`);
    }
  }
  return r;
}

export async function listarAnuncios({ pool, dir }) {
  try {
    const filas = (await pool.query(SQL_FILAS)).rows;
    const cfg = (await pool.query(`SELECT pantalla_cliente_segundos FROM configuracion_tenant LIMIT 1`)).rows[0];
    const s = Number(cfg?.pantalla_cliente_segundos);
    const general = valido(s) ? s : SEGUNDOS;
    const anuncios = [];
    for (const f of filas) {
      const archivo = nombreArchivo(f);
      if (archivo && existsSync(path.join(dir, archivo))) anuncios.push({ id: String(f.id), url: `/__anuncios/${archivo}`, segundos: f.segundos !== null && valido(Number(f.segundos)) ? Number(f.segundos) : general });
    }
    return { segundos: general, anuncios };
  } catch {
    return { segundos: SEGUNDOS, anuncios: [] };
  }
}

/** Ruta en disco de un anuncio, o null si el nombre no tiene forma de anuncio. Sin rutas libres. */
export function rutaDeAnuncio(dir, archivo) {
  return typeof archivo === "string" && ARCHIVO_VALIDO.test(archivo) ? path.join(dir, archivo) : null;
}
```

En `desktop/src/sync-pull.mjs`, dentro de `PULL_ORDER`, después de `{ t: "configuracion_tenant" },`:

```js
  // Anuncios de la pantalla del cliente (0150). Solo la lista; las imágenes las baja anuncios.mjs.
  { t: "anuncios_pantalla" },
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test desktop/src/anuncios.test.mjs desktop/src/sync-pull.test.mjs`
Expected: las 11 pruebas nuevas en PASS y las de `sync-pull` sin cambios.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/anuncios.mjs desktop/src/anuncios.test.mjs desktop/src/sync-pull.mjs
git commit -m "feat(escritorio): la caja guarda en disco los anuncios de la pantalla del cliente" -- desktop/src/anuncios.mjs desktop/src/anuncios.test.mjs desktop/src/sync-pull.mjs
```

---

### Task 3: Rutas `/__anuncios` y enganche en `main.mjs`

**Files:**
- Modify: `desktop/src/ui-server.mjs` (junto a la ruta `/__pantalla-cliente`)
- Create: `desktop/src/ui-server-anuncios.test.mjs`
- Modify: `desktop/src/main.mjs` (opciones de `startUiServer` en `bootCaja`; `avisarCatalogoNuevo`)

**Interfaces:**
- Consumes: `sincronizarAnuncios`, `listarAnuncios`, `rutaDeAnuncio` (Task 2).
- Produces:
  - `GET /__anuncios` → `{ segundos, anuncios: [{ id, url, segundos }] }`; sin gancho, `{ segundos: 8, anuncios: [] }`.
  - `GET /__anuncios/<archivo>` → la imagen, o 404.
  - Ganchos del ui-server: `opts.anuncios?: () => Promise<Lista>`, `opts.archivoAnuncio?: (nombre: string) => string | null`.

- [ ] **Step 1: Escribir las pruebas**

`desktop/src/ui-server-anuncios.test.mjs`, con el mismo armazón `conServidor` de `ui-server-pantalla-cliente.test.mjs` (puerto al azar en 55000–55040) y un directorio temporal con un archivo `<uuid>.jpg` de contenido conocido. Casos, cada uno con su aserción:

```js
test("GET /__anuncios devuelve la lista del proceso principal", …)          // 200, JSON igual al del gancho, Cache-Control: no-store
test("sin gancho devuelve una lista vacía, no un error", …)                 // { segundos: 8, anuncios: [] }
test("si el gancho lanza, la pantalla recibe una lista vacía", …)           // 200 y lista vacía
test("GET /__anuncios/<archivo> sirve la imagen con su tipo", …)            // 200, content-type image/jpeg, cuerpo idéntico, Cache-Control con immutable
test("un nombre que el gancho no reconoce da 404", …)                       // archivoAnuncio devuelve null → 404
test("un archivo que ya no está en disco da 404, no el index del POS", …)   // gancho devuelve una ruta inexistente → 404 (y el cuerpo no es HTML)
test("no se sale de la carpeta", …)                                         // GET /__anuncios/..%2f..%2fpackage.json → 404 y el gancho recibe el nombre tal cual o no se llama
```

Escribir el código completo de cada caso siguiendo ese armazón; cada prueba debe fallar si se rompe la línea que protege (comprobarlo rompiéndola y restaurándola).

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test desktop/src/ui-server-anuncios.test.mjs`
Expected: FAIL (las rutas caen al respaldo de la SPA y devuelven HTML).

- [ ] **Step 3: Implementar las rutas**

En `desktop/src/ui-server.mjs`, inmediatamente después del bloque de `/__pantalla-cliente`:

```js
      // CAJA: anuncios de la pantalla del cliente. La lista y las imágenes que la caja ya bajó a
      // disco. Solo desde la propia caja: quien las pide es la ventana del segundo monitor.
      if (!kds && req.method === "GET" && req.url.startsWith("/__anuncios")) {
        if (!LOCALES.has(req.socket.remoteAddress ?? "")) {
          res.writeHead(403, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "Solo desde la caja." }));
        }
        const ruta = new URL(req.url, "http://x").pathname;
        if (ruta === "/__anuncios" || ruta === "/__anuncios/") {
          let lista = { segundos: 8, anuncios: [] };
          try { lista = (await opts.anuncios?.()) ?? lista; } catch { /* sin anuncios: la pantalla enseña el logo */ }
          res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          return res.end(JSON.stringify(lista));
        }
        // El nombre lo valida quien conoce la carpeta (rutaDeAnuncio): aquí no se arma ninguna ruta.
        let nombre = "";
        try { nombre = decodeURIComponent(ruta.slice("/__anuncios/".length)); } catch { /* nombre mal codificado: 404 */ }
        const archivo = nombre ? opts.archivoAnuncio?.(nombre) ?? null : null;
        let datos = null;
        if (archivo) { try { datos = await readFile(archivo); } catch { /* ya no está en disco */ } }
        if (!datos) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("no existe"); }
        // El nombre lleva el id del anuncio: una imagen nueva es otro nombre, así que se puede cachear para siempre.
        res.writeHead(200, { "Content-Type": MIME[path.extname(archivo).toLowerCase()] || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable" });
        return res.end(datos);
      }
```

Comprobar que `MIME` (arriba del archivo) tiene `.jpg`, `.png` y `.webp`; agregar la que falte.

- [ ] **Step 4: Enganchar en `main.mjs`**

Import, junto al de `./pantalla-cliente.mjs`:

```js
import { sincronizarAnuncios, listarAnuncios, rutaDeAnuncio } from "./anuncios.mjs";
```

Constante, junto a `NUBE_CFG`:

```js
// Copia local de las imágenes de los anuncios de la pantalla del cliente (anuncios.mjs).
const ANUNCIOS_DIR = path.join(CONFIG_DIR, "anuncios");
```

En las opciones de `startUiServer` de `bootCaja`, después de `onPantallaCliente`:

```js
      anuncios: () => listarAnuncios({ pool: backend?.pool, dir: ANUNCIOS_DIR }),
      archivoAnuncio: (nombre) => rutaDeAnuncio(ANUNCIOS_DIR, nombre),
```

`avisarCatalogoNuevo(motivo)` se llama después de cada pull que termina bien (ciclo de sync y sondeo del catálogo). Al final de esa función, sin `await` para no retrasar el aviso del menú:

```js
  // Los anuncios bajaron como lista; aquí se traen las imágenes que falten. Sin esperar: son un
  // adorno y no deben retrasar el aviso del menú.
  bajarAnuncios().catch(() => {});
```

Y la función, junto a `avisarCatalogoNuevo`:

```js
let anunciosEnCurso = null;
/** Una sola pasada a la vez: dos pulls seguidos no deben bajar la misma imagen dos veces. */
function bajarAnuncios() {
  if (anunciosEnCurso || !backend?.pool) return anunciosEnCurso ?? Promise.resolve();
  anunciosEnCurso = sincronizarAnuncios({ pool: backend.pool, dir: ANUNCIOS_DIR, cloudUrl: CLOUD_URL, log: (m) => console.log("· [anuncios]", m) })
    .then((r) => { if (r.bajados || r.borrados || r.fallidos) console.log(`· [anuncios] ${r.bajados} bajados, ${r.borrados} borrados, ${r.fallidos} fallidos`); })
    .finally(() => { anunciosEnCurso = null; });
  return anunciosEnCurso;
}
```

Además, una pasada al arrancar: en `bootCaja`, después de `iniciarRespaldoDiario();`, `bajarAnuncios().catch(() => {});` (una caja que se apagó a media descarga las completa sin esperar al siguiente pull).

Confirmar con `grep -n "pullFromCloud" desktop/src/main.mjs` que los pulls del ciclo y del sondeo pasan por `avisarCatalogoNuevo`; el pull de vinculación (`vincularConNube`) no pasa por ahí: agregar `bajarAnuncios().catch(() => {});` después de su `pullFromCloud`.

- [ ] **Step 5: Verificar**

Run: `node --check desktop/src/main.mjs && node --test desktop/src/ui-server-anuncios.test.mjs desktop/src/ui-server.test.mjs desktop/src/ui-server-pantalla-cliente.test.mjs desktop/src/anuncios.test.mjs`
Expected: todo en PASS.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/ui-server.mjs desktop/src/ui-server-anuncios.test.mjs desktop/src/main.mjs
git commit -m "feat(escritorio): la caja sirve los anuncios a la pantalla del cliente" -- desktop/src/ui-server.mjs desktop/src/ui-server-anuncios.test.mjs desktop/src/main.mjs
```

---

### Task 4: Carrusel en la pantalla del cliente

**Files:**
- Create: `apps/pos/app/lib/pantalla-cliente/anuncios.ts`
- Create: `apps/pos/app/components/carrusel-anuncios.tsx`
- Modify: `apps/pos/app/components/pantalla-cliente.tsx` (componente `Reposo`)
- Modify: `apps/pos/app/lib/__tests__/pantalla-cliente.test.ts`
- Modify: `docs/diseno/pantalla-cliente.md` (fila Reposo y sección de movimiento)

**Interfaces:**
- Consumes: `GET /__anuncios` (Task 3).
- Produces:
  - `type ListaAnuncios = { segundos: number; anuncios: Array<{ id: string; url: string; segundos: number }> }`
  - `LISTA_VACIA: ListaAnuncios`
  - `leerAnuncios(pedir?: typeof fetch): Promise<ListaAnuncios>` (nunca lanza)
  - `siguienteAnuncio(ids: string[], actual: string | null, rotos: ReadonlySet<string>): string | null`
  - `CarruselAnuncios({ lista, alQuedarseSinImagenes })`

Antes de escribir CSS: leer `docs/diseno/pantalla-cliente.md` y `docs/diseno/nucleo.md`, y cargar las skills `emil-design-eng` e `impeccable`. Solo tokens existentes.

- [ ] **Step 1: Agregar las pruebas**

Al final de `apps/pos/app/lib/__tests__/pantalla-cliente.test.ts` (imports arriba):

```ts
import { leerAnuncios, siguienteAnuncio, LISTA_VACIA } from "../pantalla-cliente/anuncios";

describe("siguienteAnuncio", () => {
  const ids = ["a", "b", "c"];
  it("empieza por el primero y da la vuelta", () => {
    expect(siguienteAnuncio(ids, null, new Set())).toBe("a");
    expect(siguienteAnuncio(ids, "a", new Set())).toBe("b");
    expect(siguienteAnuncio(ids, "c", new Set())).toBe("a");
  });
  it("se salta las imágenes que no cargaron", () => {
    expect(siguienteAnuncio(ids, "a", new Set(["b"]))).toBe("c");
    expect(siguienteAnuncio(ids, null, new Set(["a", "b"]))).toBe("c");
  });
  it("con una sola imagen buena se queda en ella", () => {
    expect(siguienteAnuncio(ids, "c", new Set(["a", "b"]))).toBe("c");
  });
  it("si todas fallaron, o no hay, no hay nada que enseñar", () => {
    expect(siguienteAnuncio(ids, "a", new Set(ids))).toBeNull();
    expect(siguienteAnuncio([], null, new Set())).toBeNull();
  });
  it("si la actual ya no está en la lista, vuelve al principio", () => {
    expect(siguienteAnuncio(ids, "z", new Set())).toBe("a");
  });
});

describe("leerAnuncios", () => {
  const con = (cuerpo: unknown, ok = true) => (async () => ({ ok, json: async () => cuerpo })) as unknown as typeof fetch;
  it("devuelve la lista que da la caja", async () => {
    const lista = { segundos: 12, anuncios: [{ id: "a", url: "/__anuncios/11111111-1111-1111-1111-111111111111.jpg", segundos: 20 }] };
    expect(await leerAnuncios(con(lista))).toEqual(lista);
  });
  it("una respuesta rara, un error o la falta de red dan lista vacía", async () => {
    expect(await leerAnuncios(con({ segundos: "x", anuncios: 1 }))).toEqual(LISTA_VACIA);
    expect(await leerAnuncios(con({}, false))).toEqual(LISTA_VACIA);
    expect(await leerAnuncios((async () => { throw new Error("sin red"); }) as unknown as typeof fetch)).toEqual(LISTA_VACIA);
  });
  it("no acepta direcciones fuera de la carpeta de anuncios de la caja", async () => {
    expect(await leerAnuncios(con({ segundos: 8, anuncios: [{ id: "a", url: "https://otro.example/x.jpg", segundos: 8 }] }))).toEqual(LISTA_VACIA);
  });
  it("un tiempo por anuncio fuera de rango invalida la lista", async () => {
    expect(await leerAnuncios(con({ segundos: 8, anuncios: [{ id: "a", url: "/__anuncios/11111111-1111-1111-1111-111111111111.jpg", segundos: 2 }] }))).toEqual(LISTA_VACIA);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `pnpm --filter @vim/pos test -- pantalla-cliente`
Expected: FAIL, no existe `../pantalla-cliente/anuncios`.

- [ ] **Step 3: Implementar la lógica**

`apps/pos/app/lib/pantalla-cliente/anuncios.ts`:

```ts
/**
 * Anuncios de la pantalla del cliente: la lista que la caja ya tiene en disco, y qué imagen sigue.
 *
 * La pantalla no habla con la nube: le pide la lista al servidor local de la caja, que solo
 * incluye las imágenes ya descargadas. Por eso el carrusel funciona sin internet.
 */
import { z } from "zod";

const esquema = z.object({
  segundos: z.number().int().min(3).max(60),
  anuncios: z.array(z.object({
    id: z.string().min(1),
    // Solo lo que sirve la propia caja: una dirección externa no se pinta en el monitor del cliente.
    url: z.string().regex(/^\/__anuncios\/[0-9a-f-]{36}\.(jpg|png|webp)$/),
    // Lo que dura ESTE anuncio: la caja ya resolvió si es el suyo o el general.
    segundos: z.number().int().min(3).max(60),
  })),
});

export type ListaAnuncios = z.infer<typeof esquema>;
export const LISTA_VACIA: ListaAnuncios = { segundos: 8, anuncios: [] };

/** Nunca lanza: sin escritorio, sin anuncios o con una respuesta rara, la pantalla enseña el logo. */
export async function leerAnuncios(pedir: typeof fetch = fetch): Promise<ListaAnuncios> {
  try {
    const r = await pedir("/__anuncios", { cache: "no-store" });
    if (!r.ok) return LISTA_VACIA;
    const p = esquema.safeParse(await r.json());
    return p.success ? p.data : LISTA_VACIA;
  } catch {
    return LISTA_VACIA;
  }
}

/**
 * El anuncio que toca después de `actual`, saltándose los que no cargaron. PURA.
 * null = no hay ninguno que se pueda enseñar.
 */
export function siguienteAnuncio(ids: string[], actual: string | null, rotos: ReadonlySet<string>): string | null {
  const buenos = ids.filter((id) => !rotos.has(id));
  if (buenos.length === 0) return null;
  const desde = actual === null ? -1 : ids.indexOf(actual);
  for (let paso = 1; paso <= ids.length; paso++) {
    const candidato = ids[(desde + paso) % ids.length]!;
    if (!rotos.has(candidato)) return candidato;
  }
  return buenos[0]!;
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `pnpm --filter @vim/pos test -- pantalla-cliente`
Expected: todo en PASS, con las 9 pruebas nuevas.

- [ ] **Step 5: Escribir el carrusel y usarlo en Reposo**

`apps/pos/app/components/carrusel-anuncios.tsx`. Comportamiento obligatorio:

- Recibe `lista: ListaAnuncios` y `alQuedarseSinImagenes: () => void`.
- Una imagen a la vez, a pantalla completa, con `object-contain` sobre `bg-bg`: nada del anuncio se recorta, sea el monitor horizontal o vertical.
- Cada imagen dura **sus propios** segundos (el `segundos` del anuncio que está en pantalla) y al terminar pasa a la que diga `siguienteAnuncio`. El temporizador se rearma con cada imagen, porque la duración cambia de una a otra. Con una sola imagen no hay temporizador.
- Fundido cruzado entre la que sale y la que entra con `--ease-out`, solo opacidad, ≤ 400 ms; con `prefers-reduced-motion`, corte seco.
- La siguiente imagen se precarga antes de mostrarse (`new Image()` o un `<img>` oculto), para que nunca aparezca a medio pintar.
- `onError` de una imagen: se anota su id en el conjunto de rotas y se pasa a la siguiente. Si `siguienteAnuncio` devuelve null, se llama `alQuedarseSinImagenes()`.
- Limpia sus temporizadores al desmontarse. Nada lee `window` durante el render.
- `<img alt="" draggable={false}>`; sin controles, sin puntos indicadores, sin texto encima.

En `pantalla-cliente.tsx`, `Reposo` pasa a decidir entre carrusel y logo:

- Estado `lista` (empieza en `LISTA_VACIA`) y `sinImagenes` (false).
- Al montarse `Reposo` (es decir, cada vez que la pantalla vuelve a reposo, porque la fase es la `key`) y luego cada 5 minutos: `leerAnuncios().then(setLista)`, y `setSinImagenes(false)` si la lista cambió. Así un anuncio nuevo aparece sin reiniciar la caja.
- Si `lista.anuncios.length > 0 && !sinImagenes` → `<CarruselAnuncios lista={lista} alQuedarseSinImagenes={() => setSinImagenes(true)} />`. Si no → lo que hay hoy (logo, nombre, o la marca de VIM).
- El logo y el nombre no se dibujan encima de los anuncios.

Actualizar `docs/diseno/pantalla-cliente.md`: la fila Reposo («carrusel de anuncios; sin anuncios, logo y nombre»), una regla «El anuncio se ve entero» (contain, nunca recortar) y el fundido cruzado en Movimiento.

- [ ] **Step 6: Verificar**

Run: `pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test`
Expected: sin errores; toda la suite en PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/pos/app/lib/pantalla-cliente/anuncios.ts apps/pos/app/components/carrusel-anuncios.tsx apps/pos/app/components/pantalla-cliente.tsx apps/pos/app/lib/__tests__/pantalla-cliente.test.ts docs/diseno/pantalla-cliente.md
git commit -m "feat(pos): carrusel de anuncios en la pantalla del cliente" -- apps/pos/app/lib/pantalla-cliente/anuncios.ts apps/pos/app/components/carrusel-anuncios.tsx apps/pos/app/components/pantalla-cliente.tsx apps/pos/app/lib/__tests__/pantalla-cliente.test.ts docs/diseno/pantalla-cliente.md
```

---

### Task 5: Página del admin

**Files:**
- Create: `apps/admin/app/lib/anuncios-pantalla.ts`
- Create: `apps/admin/app/lib/__tests__/anuncios-pantalla.test.ts`
- Create: `apps/admin/app/(panel)/configuracion/pantalla-cliente/page.tsx`
- Modify: `apps/admin/app/components/config-sidenav.tsx` (sección «Operación», después de «Zonas de envío»)
- Modify: `docs/diseno/admin.md` (una entrada para la página nueva, con el formato de las demás)

**Interfaces:**
- Consumes: tabla `anuncios_pantalla`, almacén `anuncios`, `configuracion_tenant.pantalla_cliente_segundos` (Task 1); `reescalarImagen` de `apps/admin/app/lib/imagen.ts`; `supabase` y `leerSesion` de `apps/admin/app/lib/supabase`.
- Produces:
  - `MAX_ANUNCIOS = 10`, `ANUNCIO_MAX_BYTES = 800 * 1024`, `ANUNCIO_LADO_MAX = 1920`
  - `type Anuncio = { id: string; ruta: string; url: string; orden: number; activo: boolean; segundos: number | null }` (`segundos` null = usa el general)
  - `setSegundosAnuncio(id: string, segundos: number | null): Promise<void>`
  - `dataUriAArchivo(dataUri: string): { blob: Blob; ext: "jpg" | "png" | "webp"; tipo: string }` (lanza si no es una imagen permitida)
  - `ordenTrasMover(ids: string[], id: string, hacia: "arriba" | "abajo"): string[]`
  - `segundosSchema` (Zod: entero 3–60)
  - `listarAnuncios(): Promise<Anuncio[]>`, `subirAnuncio(archivo: File): Promise<void>`, `setActivoAnuncio(id, activo)`, `moverAnuncio(anuncios, id, hacia)`, `eliminarAnuncio(a: Anuncio)`, `leerSegundos(): Promise<number>`, `guardarSegundos(n: number)`

Antes de escribir la página: leer `docs/diseno/admin.md` y `apps/admin/app/(panel)/configuracion/envios/page.tsx` completo (es el patrón: `PageHeader`, `PageBody`, `DialogoPeligro`, `mensajeError`, las clases `input` y `label`), y cargar las skills `emil-design-eng` e `impeccable`.

- [ ] **Step 1: Pruebas de las funciones puras**

`apps/admin/app/lib/__tests__/anuncios-pantalla.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dataUriAArchivo, ordenTrasMover, segundosSchema } from "../anuncios-pantalla";

describe("dataUriAArchivo", () => {
  it("convierte un data URI de imagen en un archivo con su extensión", () => {
    const r = dataUriAArchivo("data:image/jpeg;base64,/9j/4AAQ");
    expect(r.ext).toBe("jpg");
    expect(r.tipo).toBe("image/jpeg");
    expect(r.blob.size).toBeGreaterThan(0);
    expect(dataUriAArchivo("data:image/png;base64,iVBORw0KGgo=").ext).toBe("png");
    expect(dataUriAArchivo("data:image/webp;base64,UklGRg==").ext).toBe("webp");
  });
  it("rechaza lo que no es una imagen permitida", () => {
    expect(() => dataUriAArchivo("data:image/svg+xml;base64,PHN2Zz4=")).toThrow();
    expect(() => dataUriAArchivo("data:text/html;base64,PGh0bWw+")).toThrow();
    expect(() => dataUriAArchivo("hola")).toThrow();
  });
});

describe("ordenTrasMover", () => {
  const ids = ["a", "b", "c"];
  it("sube y baja un lugar", () => {
    expect(ordenTrasMover(ids, "b", "arriba")).toEqual(["b", "a", "c"]);
    expect(ordenTrasMover(ids, "b", "abajo")).toEqual(["a", "c", "b"]);
  });
  it("en los extremos no cambia nada", () => {
    expect(ordenTrasMover(ids, "a", "arriba")).toEqual(ids);
    expect(ordenTrasMover(ids, "c", "abajo")).toEqual(ids);
    expect(ordenTrasMover(ids, "z", "arriba")).toEqual(ids);
  });
});

describe("segundosSchema", () => {
  it("acepta enteros de 3 a 60", () => {
    expect(segundosSchema.safeParse("8").success).toBe(true);
    expect(segundosSchema.safeParse(3).success).toBe(true);
    expect(segundosSchema.safeParse(60).success).toBe(true);
  });
  it("rechaza lo demás", () => {
    for (const v of [2, 61, 4.5, "", "abc"]) expect(segundosSchema.safeParse(v).success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `pnpm --filter @vim/admin test -- anuncios-pantalla`
Expected: FAIL, no existe `../anuncios-pantalla`.

- [ ] **Step 3: Implementar la capa de datos**

`apps/admin/app/lib/anuncios-pantalla.ts`:

```ts
"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";
import { reescalarImagen } from "./imagen";

/**
 * Anuncios de la pantalla del cliente (0150): las imágenes que el segundo monitor de la caja
 * enseña cuando nadie está capturando.
 *
 * La imagen va al almacén público `anuncios`; la fila de `anuncios_pantalla` es la lista que baja
 * a la caja, y la caja descarga cada imagen una sola vez. La baja es lógica (`deleted_at`): el
 * pull de la caja no se entera de una fila borrada, pero sí de una marcada.
 */

export const MAX_ANUNCIOS = 10;
export const ANUNCIO_LADO_MAX = 1920;
/** Tras reducir en el navegador. El almacén acepta hasta 1 MB. */
export const ANUNCIO_MAX_BYTES = 800 * 1024;
const ALMACEN = "anuncios";

/** `segundos` null = este anuncio usa el tiempo general. */
export type Anuncio = { id: string; ruta: string; url: string; orden: number; activo: boolean; segundos: number | null };

export const segundosSchema = z.coerce.number().int("Usa un número entero").min(3, "Mínimo 3 segundos").max(60, "Máximo 60 segundos");

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
type Tipo = keyof typeof EXT;

/** El data URI que devuelve `reescalarImagen`, como archivo para subir. PURA. */
export function dataUriAArchivo(dataUri: string): { blob: Blob; ext: (typeof EXT)[Tipo]; tipo: Tipo } {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUri);
  if (!m) throw new Error("El archivo no es una imagen válida.");
  const tipo = m[1] as Tipo;
  const binario = atob(m[2]!);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return { blob: new Blob([bytes], { type: tipo }), ext: EXT[tipo], tipo };
}

/** El orden de los ids después de mover uno un lugar. PURA. */
export function ordenTrasMover(ids: string[], id: string, hacia: "arriba" | "abajo"): string[] {
  const i = ids.indexOf(id);
  const j = hacia === "arriba" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const r = [...ids];
  [r[i], r[j]] = [r[j]!, r[i]!];
  return r;
}

const urlPublica = (ruta: string) => supabase.storage.from(ALMACEN).getPublicUrl(ruta).data.publicUrl;

export async function listarAnuncios(): Promise<Anuncio[]> {
  const { data, error } = await supabase
    .from("anuncios_pantalla")
    .select("id, ruta, orden, activo, segundos")
    .is("deleted_at", null)
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((a) => ({
    id: String(a.id), ruta: String(a.ruta), url: urlPublica(String(a.ruta)), orden: Number(a.orden) || 0, activo: a.activo !== false,
    segundos: a.segundos == null ? null : Number(a.segundos),
  }));
}

/** Reduce la imagen en el navegador, la sube al almacén y la da de alta al final de la lista. */
export async function subirAnuncio(archivo: File): Promise<void> {
  const tid = await tenantId();
  const dataUri = await reescalarImagen(archivo, { ladoMax: ANUNCIO_LADO_MAX, maxBytes: Math.floor(ANUNCIO_MAX_BYTES * 4 / 3) });
  const { blob, ext, tipo } = dataUriAArchivo(dataUri);
  const id = crypto.randomUUID();
  const ruta = `${tid}/${id}.${ext}`;

  const { data: ultimo } = await supabase.from("anuncios_pantalla").select("orden").is("deleted_at", null).order("orden", { ascending: false }).limit(1);
  const orden = ((ultimo?.[0] as { orden?: number } | undefined)?.orden ?? -10) + 10;

  const subida = await supabase.storage.from(ALMACEN).upload(ruta, blob, { contentType: tipo, cacheControl: "31536000", upsert: false });
  if (subida.error) throw new Error(subida.error.message);

  const { error } = await supabase.from("anuncios_pantalla").insert({ id, tenant_id: tid, ruta, orden, bytes: blob.size });
  if (error) {
    // La fila no entró (el tope de 10, por ejemplo): la imagen recién subida se quedaría huérfana.
    await supabase.storage.from(ALMACEN).remove([ruta]).catch(() => {});
    throw new Error(traducir(error.message));
  }
}

export async function setActivoAnuncio(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from("anuncios_pantalla").update({ activo }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Tiempo propio de un anuncio; null lo devuelve al tiempo general. */
export async function setSegundosAnuncio(id: string, segundos: number | null): Promise<void> {
  const valor = segundos === null ? null : segundosSchema.parse(segundos);
  const { error } = await supabase.from("anuncios_pantalla").update({ segundos: valor }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Mueve un anuncio un lugar y reescribe el orden de los que cambiaron. */
export async function moverAnuncio(anuncios: Anuncio[], id: string, hacia: "arriba" | "abajo"): Promise<void> {
  const antes = anuncios.map((a) => a.id);
  const despues = ordenTrasMover(antes, id, hacia);
  for (const [i, aid] of despues.entries()) {
    if (antes[i] === aid && anuncios[i]!.orden === i * 10) continue;
    const { error } = await supabase.from("anuncios_pantalla").update({ orden: i * 10 }).eq("id", aid);
    if (error) throw new Error(error.message);
  }
}

/** Baja lógica (es la que viaja a la caja) y, después, la imagen del almacén. */
export async function eliminarAnuncio(a: Anuncio): Promise<void> {
  const { error } = await supabase.from("anuncios_pantalla").update({ deleted_at: new Date().toISOString(), activo: false }).eq("id", a.id);
  if (error) throw new Error(error.message);
  // Si esto falla queda una imagen sin fila, que nadie enseña: no es motivo para decirle al dueño que falló.
  await supabase.storage.from(ALMACEN).remove([a.ruta]).catch(() => {});
}

export async function leerSegundos(): Promise<number> {
  const tid = await tenantId();
  const { data, error } = await supabase.from("configuracion_tenant").select("pantalla_cliente_segundos").eq("tenant_id", tid).maybeSingle();
  if (error) throw new Error(error.message);
  return Number((data as { pantalla_cliente_segundos?: number } | null)?.pantalla_cliente_segundos) || 8;
}

export async function guardarSegundos(n: number): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase.from("configuracion_tenant").upsert({ tenant_id: tid, pantalla_cliente_segundos: n }, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);
}

/** Los rechazos de la base llegan en jerga; aquí se dice lo que pasó. */
function traducir(mensaje: string): string {
  if (mensaje.includes("Ya hay 10 anuncios")) return "Ya hay 10 anuncios. Quita uno para subir otro.";
  if (/row-level security|permission denied/i.test(mensaje)) return "Solo el dueño o un administrador puede cambiar los anuncios.";
  return mensaje;
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `pnpm --filter @vim/admin test -- anuncios-pantalla`
Expected: las 6 pruebas en PASS.

- [ ] **Step 5: Escribir la página y la entrada del menú**

`apps/admin/app/(panel)/configuracion/pantalla-cliente/page.tsx`, con el patrón de `envios/page.tsx`. Contenido obligatorio:

- Encabezado «Pantalla del cliente» y una línea que diga qué es: las imágenes que muestra el segundo monitor de la caja cuando no se está cobrando.
- Botón «Subir imagen» (`<input type="file" accept="image/jpeg,image/png,image/webp">` dentro de un `<label>`, como el logo en `negocio/page.tsx`). Deshabilitado con el texto «Ya hay 10 anuncios» al llegar al tope. Mientras sube, estado ocupado; no permite una segunda subida a la vez.
- Contador «N de 10».
- Lista en el orden real. Cada renglón: miniatura (`<img>` con la `url`, `object-contain`, alto fijo), botones «Subir» y «Bajar» (deshabilitados en los extremos), el selector de tiempo propio, interruptor «Activo / En pausa» y «Eliminar» (con `DialogoPeligro`: «¿Eliminar este anuncio? Dejará de mostrarse en las cajas.»).
- **Tiempo general:** campo «Tiempo en pantalla (segundos)» con `segundosSchema` y botón Guardar, arriba de la lista, con la explicación «Lo usan todas las imágenes que no tengan un tiempo propio». El error de validación se muestra junto al campo.
- **Tiempo propio, en cada renglón:** un selector con «Tiempo general (N s)» como primera opción (guarda `null`) y después 5, 8, 10, 15, 20, 30, 45 y 60 segundos; si el anuncio trae un valor que no está en la lista, se agrega como opción. Al cambiarlo se guarda en el acto con `setSegundosAnuncio`. «N» es el tiempo general vigente, para que se vea qué significa.
- Estado vacío: qué es, que conviene una imagen horizontal de 1920×1080 y que se ve entera aunque el monitor sea vertical.
- Aviso fijo, corto: «Los cambios llegan a las cajas en uno o dos minutos. La pantalla los muestra sin reiniciar.»
- Errores con `mensajeError(e, "…")` en la misma franja que usa `envios/page.tsx`. Tras cada acción, recargar la lista.
- Controles de 44 px de alto como mínimo; se usa bien en celular (el admin tiene tira horizontal en móvil).

En `config-sidenav.tsx`, después de `{ label: "Zonas de envío", href: "/configuracion/envios" },`:

```ts
    { label: "Pantalla del cliente", href: "/configuracion/pantalla-cliente" },
```

Agregar la página a `docs/diseno/admin.md` con el formato de las demás entradas.

- [ ] **Step 6: Verificar**

Run: `pnpm --filter @vim/admin typecheck && pnpm --filter @vim/admin test`
Expected: sin errores; suite en PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/app/lib/anuncios-pantalla.ts apps/admin/app/lib/__tests__/anuncios-pantalla.test.ts "apps/admin/app/(panel)/configuracion/pantalla-cliente/page.tsx" apps/admin/app/components/config-sidenav.tsx docs/diseno/admin.md
git commit -m "feat(admin): anuncios de la pantalla del cliente" -- apps/admin/app/lib/anuncios-pantalla.ts apps/admin/app/lib/__tests__/anuncios-pantalla.test.ts "apps/admin/app/(panel)/configuracion/pantalla-cliente/page.tsx" apps/admin/app/components/config-sidenav.tsx docs/diseno/admin.md
```

---

### Task 6: Verificación de punta a punta

**Files:**
- Modify: `desktop/scripts/arnes-pantalla-cliente.mjs` (pasar los ganchos de anuncios)

El arnés levanta la caja empaquetada sin Electron en los puertos 54450/54460. Exige que VIM POS instalado esté cerrado (comparten el Postgres 54329): comprobarlo antes con `Get-NetTCPConnection -LocalPort 54329,54350,54360 -State Listen`.

- [ ] **Step 1: Ganchos en el arnés**

En `desktop/scripts/arnes-pantalla-cliente.mjs`, importar `listarAnuncios` y `rutaDeAnuncio` de `../src/anuncios.mjs`, crear un directorio temporal de anuncios (`os.tmpdir()` + `vim-arnes-anuncios`) y pasar a `startUiServer`:

```js
  anuncios: () => listarAnuncios({ pool: backend.pool, dir: ANUNCIOS_DIR }),
  archivoAnuncio: (nombre) => rutaDeAnuncio(ANUNCIOS_DIR, nombre),
```

Imprimir la ruta de `ANUNCIOS_DIR` al arrancar.

- [ ] **Step 2: Sembrar anuncios de prueba, sin nube**

Con el arnés arriba: copiar tres imágenes cualesquiera (una horizontal, una vertical, una cuadrada; por ejemplo de `sitio-web/`) a `ANUNCIOS_DIR` con nombres `<uuid>.jpg` / `.png`, e insertar sus filas en el Postgres local (receta en la memoria «Leer la base de una caja»: puerto 54329, contraseña en `bin/.pg-password`) con `tenant_id` del seed, `ruta = '<tenant>/<uuid>.<ext>'`, y `orden` 0, 10, 20. Poner `pantalla_cliente_segundos = 3` para no esperar.

- [ ] **Step 3: Recorrer en el navegador**

`npm run build:ui` en `desktop/` (con el dev server apagado), levantar el arnés, y con dos pestañas (`/` y `/?cliente`, viewport fijo):

| Acción | Lo que debe verse en `/?cliente` |
|---|---|
| Reposo con tres anuncios | Rotan cada 3 s, en orden, con fundido; cada imagen entera, sin recortes. |
| Poner `segundos = 10` a uno de los tres | Ese dura 10 s; los otros dos siguen en 3 s. |
| Agregar un producto en la caja | El carrusel desaparece y sale la cuenta. |
| Cobrar y dejar pasar el «¡Gracias!» | Vuelve el carrusel. |
| Marcar un anuncio `activo = false` en la base y esperar al regreso a reposo | Ya no sale. |
| Borrar del disco el archivo de un anuncio | Se salta; los otros siguen. |
| Dejar la lista vacía (`deleted_at = now()` en las tres) | Logo y nombre, como antes. |
| Monitor vertical (768×1024) y casi cuadrado (1280×1024) | La imagen se ve entera, centrada, sin barras de scroll. |
| `prefers-reduced-motion` | Cambia sin fundido. |

`GET /__anuncios/..%2f..%2fpackage.json` debe dar 404.

- [ ] **Step 4: Probar la página del admin**

El admin local apunta al Supabase local (memoria «/platform apunta a Supabase LOCAL»; para entrar al admin sin contraseña, ver la memoria «Rediseño del admin por partes»). Si el Supabase local está disponible con la 0150 aplicada: subir una imagen pesada (se reduce), subir hasta el tope, reordenar, pausar, eliminar, cambiar el tiempo general, darle tiempo propio a una imagen y devolverla al general, y probar con un usuario que no sea dueño ni admin (debe ver el mensaje de permiso). Si no está disponible, decirlo en el informe: esa parte queda para verificarse contra producción después de aplicar la migración.

- [ ] **Step 5: Limpiar y commit**

Detener el arnés por puerto (PowerShell, verificando el `CommandLine`), borrar las tres filas de prueba y el directorio temporal.

```bash
git add desktop/scripts/arnes-pantalla-cliente.mjs
git commit -m "test(escritorio): el arnés de la pantalla del cliente sirve anuncios" -- desktop/scripts/arnes-pantalla-cliente.mjs
```

---

### Task 7: Documentación

**Files:**
- Modify: `docs/decisiones/0026-la-pantalla-del-cliente-se-enciende-sola.md`
- Modify: `desktop/RUNBOOK.md` (sección «Pantalla del cliente»)
- Modify: `docs/superpowers/specs/2026-10-02-pantalla-cliente-design.md` (cerrar el punto «por verificar»)

- [ ] **Step 1: ADR 0026**

Donde dice que los anuncios son la entrega 2 y no están construidos: describir lo que se construyó (almacén público `anuncios`, lista en `anuncios_pantalla`, copia en disco tras cada pull, ruta local, carrusel) y dos decisiones con su porqué: la baja es lógica porque el pull no trae lápidas; solo el dueño o el admin administra anuncios, y la caja no los edita.

- [ ] **Step 2: RUNBOOK**

En la lista de «Pantalla del cliente», agregar:

```markdown
- [ ] Con anuncios subidos en /admin: tras uno o dos minutos, la pantalla en reposo los rota.
- [ ] Sin internet: los anuncios ya bajados siguen saliendo.
- [ ] Un anuncio eliminado o pausado en /admin deja de salir sin reiniciar la caja.
- [ ] Sin anuncios: logo y nombre, como antes.
- [ ] Una imagen con tiempo propio dura lo suyo; las demás, el tiempo general.
```

Y una nota: las imágenes viven en `anuncios/` dentro de la carpeta de datos de la caja; el registro lleva la etiqueta `[anuncios]`.

- [ ] **Step 3: Spec**

En «Por verificar en el plan», reemplazar el párrafo por lo que se decidió: el pull no borra, así que la baja es lógica con `deleted_at`.

- [ ] **Step 4: Suite completa y commit**

Run: `node --test desktop/src/*.test.mjs; pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test && pnpm --filter @vim/admin typecheck && pnpm --filter @vim/admin test` y, desde `desktop/`, `npm run smokes`.
Expected: todo en PASS (salvo `endurecimiento.test.mjs`, que aborta al salir por una aserción de libuv ajena a esta rama).

```bash
git add docs/decisiones/0026-la-pantalla-del-cliente-se-enciende-sola.md desktop/RUNBOOK.md docs/superpowers/specs/2026-10-02-pantalla-cliente-design.md
git commit -m "docs: los anuncios de la pantalla del cliente en el ADR 0026 y el RUNBOOK" -- docs/decisiones/0026-la-pantalla-del-cliente-se-enciende-sola.md desktop/RUNBOOK.md docs/superpowers/specs/2026-10-02-pantalla-cliente-design.md
```

- [ ] **Step 5: Parar aquí**

No abrir PR, no aplicar la migración a producción, no empaquetar y no publicar sin que Fermín lo pida. Entregarle el orden de salida:

1. Aplicar la 0150 a producción (crea la tabla y el almacén). Antes de mezclar.
2. Mezclar: el admin se despliega y ya se pueden subir anuncios.
3. Instalador nuevo de la caja: hasta que una caja se actualice, no muestra anuncios (ignora la tabla nueva del snapshot sin fallar).
