# Panel de plataforma · Entrega 2 — latido y bloqueo real — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que lo que se decide en el panel llegue a la caja: un latido cada 10 minutos trae directivas resueltas en la nube (acceso con gracia, módulos, límites) y la caja, el POS web y el admin las obedecen.

**Architecture:** Una migración (0105) agrega tres columnas a `cajas` y tres funciones: `resolver_directivas(tenant, caja)` compone el paquete completo; `caja_latido(...)` sella el latido y lo devuelve (solo `service_role`); `mi_acceso()` lo entrega bajo RLS a un usuario autenticado. La Edge Function `caja-latido` es el único camino de la caja, autenticada con el JWT del dispositivo igual que `sync-push`. El escritorio (0.4.60) llama al latido al principio de cada ciclo, guarda el JSON en `userData/directivas.json` y lo sirve en `/__directivas`. El POS decide con una función pura `evaluarAcceso`; el admin usa `mi_acceso()`. Los límites dejan de ser informativos: `sucursales` gana su trigger y `crear-empleado` valida usuarios.

**Tech Stack:** Postgres/plpgsql (SECURITY DEFINER con `search_path` fijo), Deno + Zod en la Edge Function, Node ESM sin dependencias en el escritorio (probado con `node --test` y relojes falsos), Next 15 + React 19 en POS/admin/panel, vitest para lógica pura, pgTAP para SQL.

**Spec:** `docs/superpowers/specs/2026-09-04-platform-centro-de-control-design.md` §3 (invariantes), §4 (formato de directivas), §6 (esta entrega), §7 (compatibilidad), §10 (seguridad), §11 (pruebas), §12 paso 2. ADR: `docs/decisiones/0014-el-panel-manda-a-la-caja-por-latido.md`.

## Global Constraints

- **Carpeta:** worktree `PROYECTOS/VIM POS/vim-pos-platform/`, rama nueva `platform-latido` creada desde `main` (ya contiene la entrega 1). **No tocar `vim-pos/`**, que otra sesión usa.
- **Numeración de migraciones:** la siguiente libre es **0105**. Antes de fijarla, correr `supabase migration list --linked` y confirmar que 0105 no está tomada en producción. Si lo está, subir el número aquí y en la spec. Una migración cuyo número ya figura en el historial remoto **se salta en silencio**.
- **La venta nunca se bloquea por falta de red** (§3). Solo bloquea una directiva que diga `bloqueado: true`. Una directiva vieja o ausente **no** bloquea, aunque su `bloquea_desde` ya haya pasado.
- **El latido no puede frenar el push.** Su fallo se registra y el ciclo sigue; no cuenta como fallo ni dispara backoff.
- **Identidad por token, nunca por cuerpo.** El `caja_id` sale del correo sintético del dispositivo (`caja-<uuid>@dispositivos.vimpos.mx`), como en `desktop/src/auth.mjs`.
- **`service_role` solo en Edge Functions y `apps/platform`** (regla dura 1). `mi_acceso()` es la única pieza nueva ejecutable por `authenticated`, solo lee y solo del tenant de la sesión.
- **Sin `any`**: `unknown` + Zod o tipos declarados. `pnpm turbo run typecheck` en cero tras cada tarea.
- **Español en dominio**, archivos `kebab-case`, componentes `PascalCase`.
- **Compatibilidad (§7):** una caja anterior a 0.4.60 no late, no recibe directivas y no bloquea. El panel la muestra en gris como "versión anterior", nunca en rojo.
- Commits pequeños, en español, con prefijo (`db:`, `feat(pos):`, `escritorio:`, `test:`, `docs:`) y al final:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0105_caja_latido_y_bloqueo.sql` | columnas de `cajas`, `resolver_directivas`, `caja_latido`, `mi_acceso`, trigger de sucursales |
| `supabase/tests/0011_latido_y_directivas.test.sql` | pgTAP: directivas, gracia, aislamiento, trigger |
| `supabase/functions/caja-latido/index.ts` | Edge Function del latido |
| `supabase/functions/_shared/latido.ts` | validación pura del cuerpo (probada con `node --test`) |
| `supabase/functions/_shared/latido.test.ts` | su prueba |
| `supabase/functions/crear-empleado/index.ts` | valida el límite de usuarios |
| `desktop/src/directivas.mjs` | almacén del JSON + normalización (sin Electron) |
| `desktop/src/directivas.test.mjs` | pruebas con fs falso y reloj falso |
| `desktop/src/main.mjs` | `latir()`, cableado del ciclo y de `/__directivas` |
| `desktop/src/sync-ciclo.mjs` | gancho `antesDeCadaCiclo` |
| `desktop/src/sync-ciclo.test.mjs` | el latido corre siempre y su fallo no cuenta |
| `desktop/src/ui-server.mjs` | ruta `GET /__directivas` |
| `desktop/package.json` | versión 0.4.60 |
| `apps/pos/app/lib/directivas.ts` | lectura + `evaluarAcceso` (pura) |
| `apps/pos/app/lib/__tests__/directivas.test.ts` | su prueba |
| `apps/pos/app/components/banda-acceso.tsx` | banda de gracia |
| `apps/pos/app/components/pantalla-bloqueada.tsx` | pantalla de bloqueo |
| `apps/pos/app/page.tsx` | puerta de bloqueo antes del switch |
| `apps/pos/app/components/pantalla-inicio.tsx` | banda de gracia en la barra |
| `apps/admin/app/lib/acceso-tenant.ts` | `mi_acceso()` + tipos |
| `apps/admin/app/components/admin-shell.tsx` | banda y solo lectura |
| `apps/admin/app/lib/configuracion.ts` | mensaje del límite de sucursales |
| `apps/platform/app/lib/senal-caja.ts` | fuente `latido` |
| `apps/platform/app/components/salud-tenant.tsx` | versión y SO por caja |
| `apps/platform/app/api/tenants/[id]/salud/route.ts` | expone `version_app`, `so`, `ultimo_latido` |

---

### Task 0: Rama, prerrequisito comercial y número de migración

**Files:** ninguno del repo.

- [ ] **Step 1: Rama nueva desde `main`**

```bash
cd "D:/Users/Fermi/Documents/VIM MARKETING/Vim-marketing managment/PROYECTOS/VIM POS/vim-pos-platform"
git fetch origin main && git checkout main && git merge --ff-only origin/main
git checkout -b platform-latido
pnpm install --frozen-lockfile
```

- [ ] **Step 2: Confirmar que 0105 está libre en producción**

```bash
supabase migration list --linked
```
Expected: la última versión es `0103`. Si aparece `0105`, renumerar todo este plan a `0105` antes de seguir.

- [ ] **Step 3: Subir a Knock-Out al plan Cadena (decisión de Fermín, 5 sep 2026)**

Prerrequisito de esta entrega: Knock-Out paga **Negocio** (1 sucursal) y usa 2, así que el trigger de sucursales de la Task 1 lo dejaría bloqueado para dar de alta más. Desde `platform.vimpos.com.mx` → Clientes → Knock-Out Burger → Contrato → Plan → **Cadena**. Verificar:

```bash
URL=$(grep -m1 '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '"\r')
SR=$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '"\r')
curl -s "$URL/rest/v1/tenants?select=codigo,plan:planes(codigo,max_sucursales)&codigo=eq.knockout-burger" -H "apikey: $SR" -H "Authorization: Bearer $SR"
```
Expected: `plan.codigo = "CADENA"`, `max_sucursales = 3`.

- [ ] **Step 4: Línea base verde**

```bash
pnpm turbo run typecheck && pnpm turbo run test && supabase test db
```
Expected: todo en verde antes de tocar nada.

---

### Task 1: Migración 0105 — columnas, directivas, latido y límite de sucursales

**Files:**
- Create: `supabase/migrations/0105_caja_latido_y_bloqueo.sql`
- Create: `supabase/tests/0011_latido_y_directivas.test.sql`

**Interfaces:**
- Produces: `resolver_directivas(p_tenant uuid, p_caja uuid) RETURNS jsonb` con la forma de la spec §4; `caja_latido(p_caja uuid, p_version text, p_so text, p_ip inet) RETURNS jsonb`; `mi_acceso() RETURNS jsonb`; columnas `cajas.version_app`, `cajas.ultimo_latido`, `cajas.so`; trigger `trg_sucursales_limite`.
- Consumes: `modulos_efectivos(uuid)`, `limites_efectivos(uuid)`, `tenants.bloqueo_desde`, `tenants.bloqueo_mensaje` (todos de 0103).

- [ ] **Step 1: Escribir la prueba pgTAP (falla porque nada existe)**

`supabase/tests/0011_latido_y_directivas.test.sql`:

```sql
-- ============================================================================
-- Latido de la caja y directivas (spec 2026-09-04 §6, ADR 0014, migración 0105).
--
-- Lo que se protege: que las directivas digan bloqueado SOLO a partir de la fecha, que el
-- latido selle versión y hora, que un tenant no lea las directivas de otro, y que el límite de
-- sucursales se aplique igual que el de cajas.
-- ============================================================================
begin;
select plan(13);

insert into tenants (id, codigo, nombre_comercial, vertical_principal, estado, plan_actual_id)
values ('cccccccc-0000-0000-0000-0000000000e0', 'lat-uno', 'Latido Uno', 'QUICK_SERVICE', 'ACTIVO',
        (select id from planes where codigo = 'ESENCIAL'))
on conflict (id) do nothing;
insert into sucursales (id, tenant_id, codigo, nombre)
values ('cccccccc-0000-0000-0000-0000000000e1', 'cccccccc-0000-0000-0000-0000000000e0', 'L1', 'Suc L1')
on conflict (id) do nothing;
insert into configuracion_tenant (tenant_id) values ('cccccccc-0000-0000-0000-0000000000e0')
on conflict (tenant_id) do nothing;
insert into cajas (id, tenant_id, sucursal_id, numero, nombre)
values ('cccccccc-0000-0000-0000-0000000000e2', 'cccccccc-0000-0000-0000-0000000000e0', 'cccccccc-0000-0000-0000-0000000000e1', 1, 'Caja L1');

-- #1/#2 columnas nuevas
select has_column('cajas', 'ultimo_latido');
select has_column('cajas', 'version_app');

-- #3 tenant activo: no bloqueado
select is((resolver_directivas('cccccccc-0000-0000-0000-0000000000e0', null)->'acceso'->>'bloqueado'), 'false', 'un tenant activo no está bloqueado');

-- #4 suspendido con gracia futura: todavía NO bloquea
update tenants set estado = 'SUSPENDIDO', bloqueo_desde = now() + interval '2 days',
       bloqueo_mensaje = 'Pago pendiente'
 where id = 'cccccccc-0000-0000-0000-0000000000e0';
select is((resolver_directivas('cccccccc-0000-0000-0000-0000000000e0', null)->'acceso'->>'bloqueado'), 'false', 'durante la gracia no bloquea');
-- #5 y lleva el mensaje para el cajero
select is((resolver_directivas('cccccccc-0000-0000-0000-0000000000e0', null)->'acceso'->>'mensaje'), 'Pago pendiente', 'la directiva lleva el mensaje');

-- #6 pasada la fecha: bloquea
update tenants set bloqueo_desde = now() - interval '1 minute'
 where id = 'cccccccc-0000-0000-0000-0000000000e0';
select is((resolver_directivas('cccccccc-0000-0000-0000-0000000000e0', null)->'acceso'->>'bloqueado'), 'true', 'pasada la fecha bloquea');

-- #7 sin bloqueo_desde no bloquea aunque esté suspendido (no hay fecha que cumplir)
update tenants set bloqueo_desde = null where id = 'cccccccc-0000-0000-0000-0000000000e0';
select is((resolver_directivas('cccccccc-0000-0000-0000-0000000000e0', null)->'acceso'->>'bloqueado'), 'false', 'sin fecha de bloqueo no bloquea');
update tenants set estado = 'ACTIVO' where id = 'cccccccc-0000-0000-0000-0000000000e0';

-- #8 las directivas traen módulos y límites resueltos
select is((resolver_directivas('cccccccc-0000-0000-0000-0000000000e0', null)->'modulos'->>'kds'), 'true', 'las directivas traen los módulos efectivos');
-- #9
select is((resolver_directivas('cccccccc-0000-0000-0000-0000000000e0', null)->'limites'->>'max_cajas_por_sucursal'), '1', 'las directivas traen los límites');

-- #10 el latido sella hora y versión, y devuelve las directivas
select ok((caja_latido('cccccccc-0000-0000-0000-0000000000e2', '0.4.60', 'Windows 11', '10.0.0.5'::inet)) ? 'acceso', 'el latido devuelve directivas');
-- #11
select results_eq(
  $$ select version_app::text, (ultimo_latido is not null) from cajas where id = 'cccccccc-0000-0000-0000-0000000000e2' $$,
  $$ values ('0.4.60', true) $$,
  'el latido sella versión y hora');

-- #12 el límite de sucursales se aplica (Esencial da 1 y ya tiene una)
select throws_ok(
  $$ insert into sucursales (tenant_id, codigo, nombre)
     values ('cccccccc-0000-0000-0000-0000000000e0', 'L2', 'Suc L2') $$,
  'P0001', 'Tu plan permite 1 sucursal(es). Pide a VIM ampliar el límite.', 'la segunda sucursal se rechaza');

-- #13 un tenant autenticado no lee las directivas de otro
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-0000000000e9',
                    'tenant_id', 'dddddddd-0000-0000-0000-0000000000e0',
                    'role', 'authenticated')::text, true);
select is(mi_acceso(), null, 'mi_acceso de un tenant inexistente no devuelve nada ajeno');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver que falla**

```bash
supabase test db
```
Expected: falla en #1 (`ultimo_latido` no existe).

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/0105_caja_latido_y_bloqueo.sql`:

```sql
-- ============================================================================
-- 0105 — Latido de la caja y directivas (ADR 0014, entrega 2).
--
-- La 0103 dejó al panel decidiendo cosas que nadie obedecía: suspender escribía una fecha y la
-- caja seguía vendiendo. Aquí nace el canal: la caja llama cada 10 minutos, sella que está viva
-- y recibe un paquete de DIRECTIVAS ya resuelto en la nube. La caja no interpreta nada.
--
-- El latido resuelve además el hueco que la 0073 dejó escrito: `cajas.ultima_conexion` solo se
-- sella cuando hay ventas que subir, así que una caja encendida en un día flojo envejecía en el
-- panel. `ultimo_latido` prueba que está encendida aunque no venda.
-- ============================================================================

ALTER TABLE cajas
  ADD COLUMN ultimo_latido timestamptz NULL,
  ADD COLUMN version_app   text NULL,
  ADD COLUMN so            text NULL;
COMMENT ON COLUMN cajas.ultimo_latido IS
  'Última vez que la caja llamó a caja_latido(). Prueba que está encendida aunque no venda (a diferencia de ultima_conexion).';
COMMENT ON COLUMN cajas.version_app IS 'Versión del escritorio que reportó la caja. NULL = anterior a 0.4.60.';
COMMENT ON COLUMN cajas.so IS 'Sistema operativo reportado, para soporte.';

-- ── Directivas: todo lo que la caja debe obedecer, resuelto aquí ────────────
-- `bloqueado` exige estado Y fecha cumplida: una suspensión sin fecha no bloquea, y durante la
-- gracia la caja sigue vendiendo con aviso. INTERNO y TRIAL nunca bloquean (§6.2).
CREATE OR REPLACE FUNCTION resolver_directivas(p_tenant uuid, p_caja uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado    text;
  v_desde     timestamptz;
  v_mensaje   text;
  v_bloqueado boolean;
BEGIN
  IF p_tenant IS NULL THEN RETURN NULL; END IF;
  SELECT t.estado::text, t.bloqueo_desde, t.bloqueo_mensaje
    INTO v_estado, v_desde, v_mensaje
    FROM tenants t WHERE t.id = p_tenant AND t.deleted_at IS NULL;
  IF v_estado IS NULL THEN RETURN NULL; END IF;

  v_bloqueado := v_estado IN ('SUSPENDIDO', 'CANCELADO')
                 AND v_desde IS NOT NULL
                 AND v_desde <= now();

  RETURN jsonb_build_object(
    'servidor_hora', to_jsonb(now()),
    'acceso', jsonb_build_object(
      'estado',        v_estado,
      'bloqueado',     v_bloqueado,
      'bloquea_desde', v_desde,
      'mensaje',       v_mensaje),
    -- Solo los EFECTIVOS: a la caja no le sirve saber qué está permitido pero apagado.
    'modulos', COALESCE(modulos_efectivos(p_tenant) -> 'efectivos', '{}'::jsonb),
    'limites', COALESCE(limites_efectivos(p_tenant), '{}'::jsonb),
    'avisos',  '[]'::jsonb,   -- entrega 3
    'version', '{}'::jsonb    -- entrega 4
  );
END;
$$;
COMMENT ON FUNCTION resolver_directivas(uuid, uuid) IS
  'Paquete que la caja obedece: acceso (con gracia), módulos efectivos, límites, avisos y versión (ADR 0014).';
REVOKE EXECUTE ON FUNCTION resolver_directivas(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolver_directivas(uuid, uuid) TO service_role;

-- ── Latido ──────────────────────────────────────────────────────────────────
-- Solo la Edge Function la llama, con el caja_id sacado del JWT del dispositivo. Los textos se
-- recortan aquí además de validarse en la función: la base es la última línea de defensa.
CREATE OR REPLACE FUNCTION caja_latido(
  p_caja uuid, p_version text DEFAULT NULL, p_so text DEFAULT NULL, p_ip inet DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_tenant uuid;
BEGIN
  UPDATE cajas
     SET ultimo_latido = now(),
         version_app   = COALESCE(left(p_version, 20), version_app),
         so            = COALESCE(left(p_so, 80), so),
         ultima_ip     = COALESCE(p_ip, ultima_ip)
   WHERE id = p_caja AND deleted_at IS NULL
   RETURNING tenant_id INTO v_tenant;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  RETURN resolver_directivas(v_tenant, p_caja);
END;
$$;
COMMENT ON FUNCTION caja_latido(uuid, text, text, inet) IS
  'Sella que la caja está viva, guarda su versión y devuelve sus directivas (ADR 0014).';
REVOKE EXECUTE ON FUNCTION caja_latido(uuid, text, text, inet) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION caja_latido(uuid, text, text, inet) TO service_role;

-- ── Las mismas directivas para el POS web y el admin, bajo RLS ──────────────
-- No lleva caja, así que no sella nada: es solo lectura del propio tenant.
CREATE OR REPLACE FUNCTION mi_acceso()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT resolver_directivas(current_tenant_id(), NULL); $$;
COMMENT ON FUNCTION mi_acceso() IS
  'Directivas del tenant de la sesión. Lo llaman el POS web y el admin del dueño (ADR 0014).';
REVOKE EXECUTE ON FUNCTION mi_acceso() FROM public, anon;
GRANT EXECUTE ON FUNCTION mi_acceso() TO authenticated, service_role;

-- ── Límite de sucursales, con el mismo criterio que el de cajas (0103) ──────
CREATE OR REPLACE FUNCTION sucursales_verificar_limite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max integer;
  v_n   integer;
BEGIN
  IF NOT (NEW.activa AND NEW.deleted_at IS NULL) THEN RETURN NEW; END IF;
  SELECT (limites_efectivos(NEW.tenant_id)->>'max_sucursales')::integer INTO v_max;
  IF v_max IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_n FROM sucursales
   WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND activa = true AND id <> NEW.id;
  IF v_n >= v_max THEN
    RAISE EXCEPTION 'Tu plan permite % sucursal(es). Pide a VIM ampliar el límite.', v_max
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION sucursales_verificar_limite() FROM public;
CREATE TRIGGER trg_sucursales_limite
  BEFORE INSERT OR UPDATE OF activa, deleted_at ON sucursales
  FOR EACH ROW EXECUTE FUNCTION sucursales_verificar_limite();
```

- [ ] **Step 4: Aplicar en local y correr la prueba**

```bash
docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 < supabase/migrations/0105_caja_latido_y_bloqueo.sql
docker exec supabase_db_vim-pos psql -U postgres -d postgres -Atc "insert into supabase_migrations.schema_migrations (version, name) values ('0105','caja_latido_y_bloqueo') on conflict do nothing"
supabase test db
```
Expected: `0011_latido_y_directivas.test.sql` 13/13 y el resto en verde. **Si `0002_rls_cobertura` o alguna prueba de delivery falla por el trigger de sucursales, es el mismo caso que la 0103 con las cajas:** darle a esa prueba su excepción explícita en `tenant_limites`, no debilitar el trigger.

- [ ] **Step 5: Regenerar tipos y confirmar**

```bash
pnpm db:types
git add supabase/migrations/0105_caja_latido_y_bloqueo.sql supabase/tests/0011_latido_y_directivas.test.sql packages/db/src/database.types.ts
git commit -m "db: latido de la caja, directivas y límite de sucursales (0105, ADR 0014)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Edge Function `caja-latido`

**Files:**
- Create: `supabase/functions/_shared/latido.ts`
- Create: `supabase/functions/_shared/latido.test.ts`
- Create: `supabase/functions/caja-latido/index.ts`
- Modify: `package.json` (añadir el archivo al script `test:functions`)

**Interfaces:**
- Produces: `cajaIdDeEmail(email: string): string | null`; `validarCuerpo(x: unknown): { version: string | null; so: string | null; avisos_vistos: string[] }`; `POST /functions/v1/caja-latido` → `{ directivas }`.
- Consumes: `caja_latido(...)` (Task 1).

- [ ] **Step 1: Escribir la prueba del módulo puro**

`supabase/functions/_shared/latido.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cajaIdDeEmail, validarCuerpo } from "./latido.ts";

test("saca el caja_id del correo sintético del dispositivo", () => {
  assert.equal(
    cajaIdDeEmail("caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.mx"),
    "99999999-0000-0000-0000-0000000000cc",
  );
});

test("rechaza un correo que no es de dispositivo", () => {
  assert.equal(cajaIdDeEmail("dueno@negocio.mx"), null);
  assert.equal(cajaIdDeEmail(""), null);
});

test("acepta un cuerpo válido", () => {
  const r = validarCuerpo({ version: "0.4.60", so: "Windows 11", avisos_vistos: [] });
  assert.equal(r.version, "0.4.60");
  assert.equal(r.so, "Windows 11");
});

test("un cuerpo vacío es válido: el latido sirve aunque no reporte nada", () => {
  const r = validarCuerpo({});
  assert.equal(r.version, null);
  assert.deepEqual(r.avisos_vistos, []);
});

test("recorta textos largos en vez de rechazar el latido", () => {
  const r = validarCuerpo({ version: "9".repeat(50), so: "x".repeat(200) });
  assert.equal(r.version!.length, 20);
  assert.equal(r.so!.length, 80);
});

test("descarta avisos que no son uuid y limita la lista", () => {
  const r = validarCuerpo({ avisos_vistos: ["no-uuid", "99999999-0000-0000-0000-0000000000cc"] });
  assert.deepEqual(r.avisos_vistos, ["99999999-0000-0000-0000-0000000000cc"]);
});
```

- [ ] **Step 2: Correr y ver que falla**

```bash
node --test --experimental-strip-types supabase/functions/_shared/latido.test.ts
```
Expected: FAIL, no encuentra `./latido.ts`.

- [ ] **Step 3: Escribir el módulo puro**

`supabase/functions/_shared/latido.ts`:

```ts
// Validación del latido, aparte del handler para poder probarla con `node --test` (supabase/
// functions es Deno y no está en el workspace de pnpm; mismo patrón que _shared/pac).

const EMAIL_DISPOSITIVO = /^caja-([0-9a-f-]{36})@dispositivos\.vimpos\.mx$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El dispositivo ES una caja: su id va en el correo sintético (1F §1.1, desktop/src/auth.mjs). */
export function cajaIdDeEmail(email: string | null | undefined): string | null {
  const m = EMAIL_DISPOSITIVO.exec(String(email ?? ""));
  return m ? m[1]!.toLowerCase() : null;
}

export type CuerpoLatido = { version: string | null; so: string | null; avisos_vistos: string[] };

/**
 * Nada del cuerpo llega a SQL sin pasar por aquí. Recorta en vez de rechazar: un SO con un
 * nombre raro no debe costar el latido, que es lo que mantiene viva la señal de la caja.
 */
export function validarCuerpo(x: unknown): CuerpoLatido {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const texto = (v: unknown, max: number): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
  };
  const vistos = Array.isArray(o.avisos_vistos) ? o.avisos_vistos : [];
  return {
    version: texto(o.version, 20),
    so: texto(o.so, 80),
    avisos_vistos: vistos.filter((v): v is string => typeof v === "string" && UUID.test(v)).slice(0, 50),
  };
}
```

- [ ] **Step 4: Correr la prueba, pasa**

```bash
node --test --experimental-strip-types supabase/functions/_shared/latido.test.ts
```
Expected: 6 passed.

- [ ] **Step 5: Escribir la Edge Function**

`supabase/functions/caja-latido/index.ts`:

```ts
// Edge Function: caja-latido (ADR 0014, entrega 2)
// La caja llama cada ~10 minutos, haya o no ventas: sella que está viva, reporta su versión y
// recibe las DIRECTIVAS que debe obedecer (acceso con gracia, módulos, límites).
//
// Llamada: POST /functions/v1/caja-latido  (Authorization: Bearer <JWT del dispositivo>)
//   body: { version?, so?, avisos_vistos?: uuid[] }
// Respuesta: { directivas }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { cajaIdDeEmail, validarCuerpo } from "../_shared/latido.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function leerClaims(token: string): Record<string, unknown> {
  try {
    const p = token.split(".")[1];
    return p ? JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))) : {};
  } catch {
    return {};
  }
}

/** Primera IP de x-forwarded-for, o null. Solo se guarda para soporte. */
function ipDe(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0]!.trim() : req.headers.get("x-real-ip");
  return ip && /^[0-9a-f.:]+$/i.test(ip) ? ip : null;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_INVALIDA" }, 401);

  const claims = leerClaims(token);
  if (claims.tipo_identidad !== "DISPOSITIVO") return json({ error: "NO_ES_DISPOSITIVO" }, 403);

  // El caja_id sale del correo del dispositivo, NUNCA del cuerpo: si viniera de fuera, una caja
  // podría sellar el latido de otra y leer sus directivas.
  const cajaId = cajaIdDeEmail(u.user.email);
  if (!cajaId) return json({ error: "DISPOSITIVO_SIN_CAJA" }, 403);

  let cuerpo;
  try {
    cuerpo = validarCuerpo(await req.json().catch(() => ({})));
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }

  const { data, error } = await admin.rpc("caja_latido", {
    p_caja: cajaId,
    p_version: cuerpo.version,
    p_so: cuerpo.so,
    p_ip: ipDe(req),
  });
  if (error) return json({ error: "RPC_ERROR", detalle: error.message }, 500);
  if (!data) return json({ error: "CAJA_NO_EXISTE" }, 404);

  return json({ directivas: data });
});
```

- [ ] **Step 6: Añadir la prueba al script del monorepo**

En `package.json`, en `test:functions`, agregar `supabase/functions/_shared/latido.test.ts` a la lista de archivos.

- [ ] **Step 7: Verificar en local y confirmar**

```bash
supabase functions serve caja-latido --no-verify-jwt --env-file supabase/functions/.env &
pnpm test:functions
```
Expected: las pruebas de funciones en verde (incluida `latido.test.ts`).

```bash
git add supabase/functions package.json
git commit -m "db: Edge Function caja-latido con validación del cuerpo aparte y probada

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Escritorio — almacén de directivas

**Files:**
- Create: `desktop/src/directivas.mjs`
- Create: `desktop/src/directivas.test.mjs`

**Interfaces:**
- Produces: `DIRECTIVAS_VACIAS`; `normalizar(x)`; `crearAlmacenDirectivas({ archivo, fs, ahora })` → `{ guardar(d), leer() }` donde `leer()` devuelve `{ directivas, recibidoIso }`.
- No importa Electron: el archivo se inyecta, así que se prueba con un fs falso.

- [ ] **Step 1: Escribir la prueba**

`desktop/src/directivas.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAlmacenDirectivas, normalizar, DIRECTIVAS_VACIAS } from "./directivas.mjs";

/** fs falso en memoria: la prueba no toca disco. */
function fsFalso(inicial = null) {
  let contenido = inicial;
  return {
    existsSync: () => contenido !== null,
    readFileSync: () => { if (contenido === null) throw new Error("ENOENT"); return contenido; },
    writeFileSync: (_p, txt) => { contenido = txt; },
    get contenido() { return contenido; },
  };
}

test("sin archivo devuelve directivas vacías que NO bloquean", () => {
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs: fsFalso() });
  const { directivas, recibidoIso } = a.leer();
  assert.equal(directivas.acceso.bloqueado, false);
  assert.equal(recibidoIso, null);
});

test("un archivo corrupto se trata como ausencia, no como bloqueo", () => {
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs: fsFalso("{no es json") });
  assert.equal(a.leer().directivas.acceso.bloqueado, false);
});

test("guarda y devuelve lo guardado, con la hora de recepción", () => {
  const fs = fsFalso();
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs, ahora: () => "2026-09-05T12:00:00.000Z" });
  a.guardar({ acceso: { estado: "SUSPENDIDO", bloqueado: true, bloquea_desde: null, mensaje: "Paga" }, modulos: { kds: true } });
  const { directivas, recibidoIso } = a.leer();
  assert.equal(directivas.acceso.bloqueado, true);
  assert.equal(directivas.acceso.mensaje, "Paga");
  assert.equal(directivas.modulos.kds, true);
  assert.equal(recibidoIso, "2026-09-05T12:00:00.000Z");
});

test("normalizar rellena lo que la nube no mandó", () => {
  const d = normalizar({ acceso: { bloqueado: true } });
  assert.equal(d.acceso.bloqueado, true);
  assert.deepEqual(d.modulos, {});
  assert.deepEqual(d.avisos, []);
});

test("normalizar nunca inventa un bloqueo con basura", () => {
  assert.equal(normalizar(null).acceso.bloqueado, false);
  assert.equal(normalizar({ acceso: { bloqueado: "sí" } }).acceso.bloqueado, false);
  assert.deepEqual(normalizar(undefined), DIRECTIVAS_VACIAS);
});
```

- [ ] **Step 2: Correr y ver que falla**

```bash
node --test desktop/src/directivas.test.mjs
```
Expected: FAIL, no encuentra `./directivas.mjs`.

- [ ] **Step 3: Escribir el módulo**

`desktop/src/directivas.mjs`:

```js
// Directivas que la caja obedece (ADR 0014, entrega 2).
//
// Vive fuera de main.mjs porque ahí no se puede probar: ese módulo importa Electron. El archivo
// y el reloj se inyectan, así que todo el comportamiento se verifica sin levantar la app.
//
// REGLA DURA: solo bloquea una directiva que diga `bloqueado: true`. Sin archivo, con el archivo
// corrupto o con un JSON incompleto, la caja SIGUE VENDIENDO. Una instalación nueva sin red, o
// un disco con un JSON a medias, no puede dejar a un negocio sin cobrar.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const DIRECTIVAS_VACIAS = Object.freeze({
  servidor_hora: null,
  acceso: Object.freeze({ estado: null, bloqueado: false, bloquea_desde: null, mensaje: null }),
  modulos: Object.freeze({}),
  limites: Object.freeze({}),
  avisos: Object.freeze([]),
  version: Object.freeze({}),
});

/** Deja el JSON de la nube en una forma con la que el resto puede contar sin comprobar nada. */
export function normalizar(x) {
  if (!x || typeof x !== "object") return DIRECTIVAS_VACIAS;
  const a = x.acceso && typeof x.acceso === "object" ? x.acceso : {};
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  return {
    servidor_hora: typeof x.servidor_hora === "string" ? x.servidor_hora : null,
    acceso: {
      estado: typeof a.estado === "string" ? a.estado : null,
      // `=== true` a propósito: cualquier otra cosa (una cadena, un 1, undefined) no bloquea.
      bloqueado: a.bloqueado === true,
      bloquea_desde: typeof a.bloquea_desde === "string" ? a.bloquea_desde : null,
      mensaje: typeof a.mensaje === "string" ? a.mensaje : null,
    },
    modulos: obj(x.modulos),
    limites: obj(x.limites),
    avisos: Array.isArray(x.avisos) ? x.avisos : [],
    version: obj(x.version),
  };
}

export function crearAlmacenDirectivas({
  archivo,
  fs = { existsSync, readFileSync, writeFileSync },
  ahora = () => new Date().toISOString(),
  log = () => {},
}) {
  return {
    guardar(directivas) {
      try {
        fs.writeFileSync(archivo, JSON.stringify({ recibido: ahora(), directivas: normalizar(directivas) }), "utf8");
      } catch (e) {
        log(`no se pudieron guardar las directivas: ${e?.message ?? e}`);
      }
    },
    leer() {
      try {
        if (!fs.existsSync(archivo)) return { directivas: DIRECTIVAS_VACIAS, recibidoIso: null };
        const j = JSON.parse(fs.readFileSync(archivo, "utf8"));
        return { directivas: normalizar(j?.directivas), recibidoIso: typeof j?.recibido === "string" ? j.recibido : null };
      } catch {
        // Archivo a medias o ilegible: se trata como ausencia. Nunca como bloqueo.
        return { directivas: DIRECTIVAS_VACIAS, recibidoIso: null };
      }
    },
  };
}
```

- [ ] **Step 4: Correr la prueba, pasa**

```bash
node --test desktop/src/directivas.test.mjs
```
Expected: 5 passed.

- [ ] **Step 5: Confirmar**

```bash
git add desktop/src/directivas.mjs desktop/src/directivas.test.mjs
git commit -m "escritorio: almacén de directivas que nunca bloquea por falta de datos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Escritorio — el latido en el ciclo y `/__directivas`

**Files:**
- Modify: `desktop/src/sync-ciclo.mjs`
- Modify: `desktop/src/sync-ciclo.test.mjs`
- Modify: `desktop/src/main.mjs`
- Modify: `desktop/src/ui-server.mjs`
- Modify: `desktop/package.json` (versión 0.4.60)

**Interfaces:**
- Consumes: `crearAlmacenDirectivas` (Task 3), `tokenDeNube()` de `main.mjs`, la Edge Function (Task 2).
- Produces: `crearCicloSync({ antesDeCadaCiclo })`; `GET /__directivas` → `{ disponible: true, recibido, directivas }`.

- [ ] **Step 1: Prueba del ciclo (falla)**

Añadir a `desktop/src/sync-ciclo.test.mjs`:

```js
test("el latido corre en cada ciclo, incluso cuando el push falla", async () => {
  let latidos = 0;
  const ciclo = crearCicloSync({
    antesDeCadaCiclo: async () => { latidos++; },
    ejecutar: async () => false,          // el push falla siempre
    setTimeoutFn: () => 1, clearTimeoutFn: () => {},
  });
  ciclo.iniciar();
  await new Promise((r) => setImmediate(r));
  assert.equal(latidos, 1, "el latido corrió aunque el push fallara");
});

test("un latido que revienta no cuenta como fallo del ciclo ni frena el push", async () => {
  let pushes = 0;
  const ciclo = crearCicloSync({
    antesDeCadaCiclo: async () => { throw new Error("sin red"); },
    ejecutar: async () => { pushes++; return true; },
    setTimeoutFn: () => 1, clearTimeoutFn: () => {},
  });
  ciclo.iniciar();
  await new Promise((r) => setImmediate(r));
  assert.equal(pushes, 1, "el push corrió igual");
  assert.equal(ciclo.estado().fallos, 0, "el ciclo se contó como exitoso");
});
```

- [ ] **Step 2: Correr y ver que falla**

```bash
node --test desktop/src/sync-ciclo.test.mjs
```
Expected: FAIL — `antesDeCadaCiclo` no existe, así que `latidos` sigue en 0.

- [ ] **Step 3: Añadir el gancho al ciclo**

En `desktop/src/sync-ciclo.mjs`, agregar `antesDeCadaCiclo = async () => {}` a los parámetros de `crearCicloSync` y, dentro de `tick()`, justo después de `enCurso = true;`:

```js
    // El latido va PRIMERO y siempre, haya o no ventas que subir: es lo que prueba que la caja
    // está encendida y lo que trae las directivas. Su fallo se registra y no toca al ciclo: si
    // un latido caído contara como fallo, una nube intermitente frenaría la subida de ventas,
    // que es exactamente lo contrario de lo que queremos.
    try {
      await antesDeCadaCiclo();
    } catch (e) {
      log(`latido omitido: ${e?.message ?? e}`);
    }
```

- [ ] **Step 4: Correr la prueba, pasa**

```bash
node --test desktop/src/sync-ciclo.test.mjs
```
Expected: todas en verde, incluidas las dos nuevas.

- [ ] **Step 5: Cablear el latido en `main.mjs`**

Importar arriba:

```js
import os from "node:os";
import { crearAlmacenDirectivas } from "./directivas.mjs";
```

Junto a las demás rutas de `userData` (donde se resuelve la config de nube), crear el almacén:

```js
const directivas = crearAlmacenDirectivas({
  archivo: path.join(app.getPath("userData"), "directivas.json"),
  log: (m) => console.log("· [directivas]", m),
});
```

Añadir la función del latido (junto a `consultarFolios`, que ya usa `tokenDeNube`):

```js
/**
 * Latido: le dice a la nube que esta caja está viva y recoge lo que debe obedecer.
 *
 * Se llama en CADA ciclo, aunque no haya nada que subir. Ese era el hueco que la migración 0073
 * dejó escrito: `ultima_conexion` solo se sellaba al subir ventas, así que una caja encendida en
 * un día flojo envejecía en el panel hasta parecer caída.
 *
 * Si falla, no se toca lo guardado: la caja sigue con la última directiva conocida.
 */
async function latir() {
  const opts = await tokenDeNube();
  if (!opts) return;   // sin vincular: no hay a quién latir
  const r = await fetch(`${opts.cloudUrl}/functions/v1/caja-latido`, {
    method: "POST",
    headers: {
      apikey: opts.anonKey,
      Authorization: `Bearer ${opts.deviceToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ version: app.getVersion(), so: `${os.type()} ${os.release()}` }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`caja-latido HTTP ${r.status}`);
  const j = await r.json();
  if (j?.directivas) directivas.guardar(j.directivas);
}
```

En `crearCicloSync({ ... })` agregar `antesDeCadaCiclo: () => latir(),` junto a `ejecutar`.

En las opciones de `startUiServer`, agregar:

```js
      directivas: () => {
        const { directivas: d, recibidoIso } = directivas.leer();
        return { disponible: true, recibido: recibidoIso, directivas: d };
      },
```

- [ ] **Step 6: Servir `/__directivas`**

En `desktop/src/ui-server.mjs`, junto a la ruta de `/__estado-sync`:

```js
      // CAJA: lo que la nube dice que este negocio puede hacer (ADR 0014). Va por HTTP y no por
      // IPC por lo mismo que el estado de sync: la 2ª caja carga la interfaz desde este servidor
      // y no tiene preload. Solo lo que el cajero ya vería en pantalla; nada del negocio.
      if (!kds && req.method === "GET" && req.url.startsWith("/__directivas")) {
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        return res.end(JSON.stringify(opts.directivas ? opts.directivas() : { disponible: false }));
      }
```

- [ ] **Step 7: Subir la versión**

En `desktop/package.json`, `"version": "0.4.60"`.

- [ ] **Step 8: Verificar contra la nube local y confirmar**

Levantar el escritorio en modo desarrollo contra la Supabase local, vincular la caja de pruebas y comprobar:

```bash
curl -s http://localhost:5173/__directivas | python -m json.tool | head -20
```
Expected: `disponible: true`, `recibido` con fecha reciente y `acceso.bloqueado: false`. En la base, `select version_app, ultimo_latido from cajas` muestra `0.4.60` y una hora de hace segundos.

```bash
node --test desktop/src/*.test.mjs
git add desktop/
git commit -m "escritorio: latido en cada ciclo, /__directivas y versión 0.4.60

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: POS — leer directivas y decidir el nivel de acceso

**Files:**
- Create: `apps/pos/app/lib/directivas.ts`
- Create: `apps/pos/app/lib/__tests__/directivas.test.ts`

**Interfaces:**
- Produces: `type Directivas`; `type NivelAcceso = "ok" | "gracia" | "bloqueado"`; `evaluarAcceso(d, ahora?): { nivel, mensaje, desde }`; `leerDirectivas(): Promise<Directivas | null>`.
- Consumes: `/__directivas` (Task 4) y, en el POS web, `supabase.rpc("mi_acceso")` (Task 1).

- [ ] **Step 1: Escribir la prueba**

`apps/pos/app/lib/__tests__/directivas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluarAcceso, type Directivas } from "../directivas";

const AHORA = new Date("2026-09-05T18:00:00Z");
const con = (acceso: Partial<Directivas["acceso"]>): Directivas => ({
  servidor_hora: null,
  acceso: { estado: null, bloqueado: false, bloquea_desde: null, mensaje: null, ...acceso },
  modulos: {}, limites: {}, avisos: [], version: {},
});

describe("evaluarAcceso", () => {
  it("sin directivas deja operar: la falta de datos nunca bloquea una caja", () => {
    expect(evaluarAcceso(null, AHORA).nivel).toBe("ok");
  });

  it("un tenant activo opera normal", () => {
    expect(evaluarAcceso(con({ estado: "ACTIVO" }), AHORA).nivel).toBe("ok");
  });

  it("suspendido con fecha futura está en gracia y lleva el mensaje", () => {
    const r = evaluarAcceso(con({ estado: "SUSPENDIDO", bloquea_desde: "2026-09-08T12:00:00Z", mensaje: "Paga antes del 8" }), AHORA);
    expect(r.nivel).toBe("gracia");
    expect(r.mensaje).toBe("Paga antes del 8");
  });

  it("bloqueado cuando el servidor lo dice", () => {
    expect(evaluarAcceso(con({ estado: "SUSPENDIDO", bloqueado: true }), AHORA).nivel).toBe("bloqueado");
  });

  it("NO bloquea por su cuenta si la fecha pasó pero el servidor dice que no", () => {
    // Directiva vieja de una caja sin internet: sigue vendiendo. Es la invariante §3.
    const r = evaluarAcceso(con({ estado: "SUSPENDIDO", bloqueado: false, bloquea_desde: "2026-09-01T12:00:00Z" }), AHORA);
    expect(r.nivel).toBe("gracia");
  });

  it("un tenant en prueba o interno nunca entra en gracia", () => {
    expect(evaluarAcceso(con({ estado: "TRIAL", bloquea_desde: "2026-09-08T12:00:00Z" }), AHORA).nivel).toBe("ok");
    expect(evaluarAcceso(con({ estado: "INTERNO" }), AHORA).nivel).toBe("ok");
  });

  it("da un mensaje por defecto si el operador no escribió ninguno", () => {
    const r = evaluarAcceso(con({ estado: "SUSPENDIDO", bloqueado: true }), AHORA);
    expect(r.mensaje.length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

```bash
pnpm --filter @vim/pos test -- directivas
```
Expected: FAIL, no encuentra `../directivas`.

- [ ] **Step 3: Escribir el módulo**

`apps/pos/app/lib/directivas.ts`:

```ts
"use client";
import { supabase } from "./supabase";

/**
 * Lo que la nube dice que este negocio puede hacer (ADR 0014).
 *
 * En la caja instalada lo sirve el escritorio en `/__directivas`, alimentado por el latido cada
 * 10 minutos. En el POS web no hay escritorio, así que se pregunta directo con `mi_acceso()`.
 */
export type Directivas = {
  servidor_hora: string | null;
  acceso: { estado: string | null; bloqueado: boolean; bloquea_desde: string | null; mensaje: string | null };
  modulos: Record<string, boolean>;
  limites: Record<string, number | null>;
  avisos: unknown[];
  version: Record<string, unknown>;
};

export type NivelAcceso = "ok" | "gracia" | "bloqueado";

const MENSAJE_POR_DEFECTO =
  "Tu servicio de VIM POS está suspendido. Ponte en contacto con VIM para reactivarlo.";

/**
 * Qué debe hacer el POS. FUNCIÓN PURA.
 *
 * REGLA DURA (spec §3): solo bloquea una directiva que diga `bloqueado: true`. Si la fecha de
 * bloqueo ya pasó pero el servidor todavía no lo dice —una caja sin internet con una directiva
 * vieja—, la caja SIGUE VENDIENDO. Perder ventas por un corte de red es peor que cobrarle un día
 * de más a alguien que dejó de pagar.
 */
export function evaluarAcceso(
  d: Directivas | null,
  ahora: Date = new Date(),
): { nivel: NivelAcceso; mensaje: string; desde: string | null } {
  const a = d?.acceso;
  if (!a) return { nivel: "ok", mensaje: "", desde: null };
  const mensaje = a.mensaje?.trim() || MENSAJE_POR_DEFECTO;

  if (a.bloqueado === true) return { nivel: "bloqueado", mensaje, desde: a.bloquea_desde };

  // La gracia solo aplica a quien de verdad está de baja: un TRIAL o un tenant INTERNO nunca
  // debe ver la banda (§6.2).
  const deBaja = a.estado === "SUSPENDIDO" || a.estado === "CANCELADO";
  if (deBaja) return { nivel: "gracia", mensaje, desde: a.bloquea_desde };

  void ahora;
  return { nivel: "ok", mensaje: "", desde: null };
}

/** `/__directivas` si hay escritorio; si no, `mi_acceso()`. `null` = no se pudo saber. */
export async function leerDirectivas(): Promise<Directivas | null> {
  try {
    const r = await fetch("/__directivas", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { disponible?: boolean; directivas?: Directivas };
      if (j.disponible && j.directivas) return j.directivas;
    }
  } catch {
    // En el POS web esa ruta no existe: no es un error, se pregunta a la nube.
  }
  try {
    const { data, error } = await supabase.rpc("mi_acceso");
    if (error || !data) return null;
    return data as unknown as Directivas;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Correr la prueba, pasa**

```bash
pnpm --filter @vim/pos test -- directivas
```
Expected: 7 passed.

- [ ] **Step 5: Confirmar**

```bash
pnpm --filter @vim/pos typecheck
git add apps/pos/app/lib
git commit -m "feat(pos): lectura de directivas y evaluación pura del nivel de acceso

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: POS — banda de gracia y pantalla de bloqueo

**Files:**
- Create: `apps/pos/app/components/banda-acceso.tsx`
- Create: `apps/pos/app/components/pantalla-bloqueada.tsx`
- Modify: `apps/pos/app/page.tsx`
- Modify: `apps/pos/app/components/pantalla-inicio.tsx`

**Interfaces:**
- Consumes: `evaluarAcceso`, `leerDirectivas` (Task 5).
- Produces: `BandaAcceso({ mensaje, desde })`, `PantallaBloqueada({ mensaje, negocio })`, y el hook `useAcceso()` exportado desde `banda-acceso.tsx`.

- [ ] **Step 1: Hook y banda**

`apps/pos/app/components/banda-acceso.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { evaluarAcceso, leerDirectivas, type NivelAcceso } from "../lib/directivas";

/** Reevalúa cada 60 s: la directiva la refresca el latido cada 10 min, esto solo la relee. */
export function useAcceso(): { nivel: NivelAcceso; mensaje: string; desde: string | null } {
  const [r, setR] = useState<{ nivel: NivelAcceso; mensaje: string; desde: string | null }>({
    nivel: "ok", mensaje: "", desde: null,
  });
  useEffect(() => {
    let vivo = true;
    const cargar = () => { leerDirectivas().then((d) => { if (vivo) setR(evaluarAcceso(d)); }).catch(() => {}); };
    cargar();
    const id = setInterval(cargar, 60_000);
    return () => { vivo = false; clearInterval(id); };
  }, []);
  return r;
}

/** Fecha larga en hora de México; el cajero necesita el día, no una marca ISO. */
function dia(iso: string | null): string {
  if (!iso) return "";
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(f);
}

/** Banda de gracia: avisa sin estorbar. El cajero puede seguir cobrando. */
export function BandaAcceso({ mensaje, desde }: { mensaje: string; desde: string | null }) {
  const f = dia(desde);
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-2 bg-[#F6EEDD] px-4 py-2 text-center text-[13px] font-semibold text-warning">
      <span>{mensaje}</span>
      {f && <span className="font-normal text-ink-2">La caja dejará de vender el {f}.</span>}
    </div>
  );
}
```

- [ ] **Step 2: Pantalla de bloqueo**

`apps/pos/app/components/pantalla-bloqueada.tsx`:

```tsx
"use client";
import { LogoVim } from "@vim/ui/styles";

const TELEFONO_SOPORTE = "477 123 4567";   // soporte de VIM

/**
 * Pantalla de bloqueo. Sin salida y antes del PIN: el cajero no puede cobrar.
 *
 * Lo que NO hace: detener la sincronización. Las ventas que ya están en esta computadora se
 * siguen subiendo, para que un cliente que se ponga al corriente no haya perdido nada.
 */
export function PantallaBloqueada({ mensaje, negocio }: { mensaje: string; negocio?: string }) {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 bg-sel px-8 text-center">
      <LogoVim className="h-12 w-12" />
      {negocio && <div className="font-display text-[15px] font-semibold text-ink-2">{negocio}</div>}
      <h1 className="font-display text-[26px] font-bold tracking-tight text-danger">Esta caja no puede vender</h1>
      <p className="max-w-md text-[15px] leading-relaxed text-ink-2">{mensaje}</p>
      <div className="mt-2 rounded-lg border border-line-strong bg-surface px-5 py-3">
        <div className="text-[12px] font-bold uppercase tracking-wide text-ink-3">Llama a VIM</div>
        <div className="font-display text-[20px] font-bold tabular-nums">{TELEFONO_SOPORTE}</div>
      </div>
      <p className="max-w-md text-[12.5px] text-ink-3">
        Tus ventas anteriores están a salvo y se siguen respaldando en la nube.
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Puerta de bloqueo en el POS**

En `apps/pos/app/page.tsx`, importar `useAcceso` y `PantallaBloqueada`, llamar el hook junto a los demás estados y, **justo antes del `switch (estado.paso)`**, insertar:

```tsx
  // Puerta de acceso: va antes del switch para que ninguna pantalla del POS quede detrás. Se
  // deja pasar `boot` y `vincular` a propósito: una caja sin vincular no tiene directivas, y
  // atraparla aquí impediría vincularla para siempre.
  if (acceso.nivel === "bloqueado" && estado.paso !== "boot" && estado.paso !== "vincular") {
    return <PantallaBloqueada mensaje={acceso.mensaje} />;
  }
```

- [ ] **Step 4: Banda de gracia en la pantalla de inicio**

En `apps/pos/app/components/pantalla-inicio.tsx`, importar `useAcceso` y `BandaAcceso`, y renderizar la banda como primer hijo del contenedor raíz:

```tsx
  const acceso = useAcceso();
  // …
      {acceso.nivel === "gracia" && <BandaAcceso mensaje={acceso.mensaje} desde={acceso.desde} />}
```

- [ ] **Step 5: Verificar en el navegador**

Con el POS de desarrollo apuntando a la Supabase local:

1. Suspender el tenant de pruebas desde el panel con 2 días de gracia → recargar el POS → **banda amarilla** con el mensaje y la fecha; se puede seguir operando.
2. En la base, `update tenants set bloqueo_desde = now() - interval '1 minute'` → esperar el siguiente latido (o recargar) → **pantalla de bloqueo**, sin acceso al PIN.
3. Reactivar desde el panel → tras el siguiente latido, el POS vuelve a la normalidad.

```bash
pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test
git add apps/pos
git commit -m "feat(pos): banda de gracia y pantalla de bloqueo por directivas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Admin del dueño — aviso, solo lectura y límite de usuarios

**Files:**
- Create: `apps/admin/app/lib/acceso-tenant.ts`
- Modify: `apps/admin/app/components/admin-shell.tsx`
- Modify: `supabase/functions/crear-empleado/index.ts`

**Interfaces:**
- Consumes: `mi_acceso()` (Task 1), `limites_efectivos` (0103).
- Produces: `leerAcceso(): Promise<Acceso>`; contexto `useAccesoTenant()` con `{ nivel, mensaje, desde, soloLectura }`.

- [ ] **Step 1: Módulo de acceso del admin**

`apps/admin/app/lib/acceso-tenant.ts`:

```ts
"use client";
import { supabase } from "./supabase";

export type NivelAcceso = "ok" | "gracia" | "bloqueado";
export type Acceso = { nivel: NivelAcceso; mensaje: string; desde: string | null };

const POR_DEFECTO = "Tu servicio de VIM POS está suspendido. Ponte en contacto con VIM.";

/**
 * Las mismas directivas que obedece la caja, para el dueño (ADR 0014).
 *
 * Bloqueado NO cierra el admin: lo deja en solo lectura. El dueño necesita sus reportes y sus
 * datos fiscales precisamente para pagar y para cerrar su contabilidad; cerrarle la puerta le
 * impediría resolver justo lo que le pedimos que resuelva.
 */
export async function leerAcceso(): Promise<Acceso> {
  try {
    const { data, error } = await supabase.rpc("mi_acceso");
    if (error || !data) return { nivel: "ok", mensaje: "", desde: null };
    const a = (data as { acceso?: { estado?: string; bloqueado?: boolean; bloquea_desde?: string | null; mensaje?: string | null } }).acceso;
    if (!a) return { nivel: "ok", mensaje: "", desde: null };
    const mensaje = a.mensaje?.trim() || POR_DEFECTO;
    if (a.bloqueado === true) return { nivel: "bloqueado", mensaje, desde: a.bloquea_desde ?? null };
    if (a.estado === "SUSPENDIDO" || a.estado === "CANCELADO") return { nivel: "gracia", mensaje, desde: a.bloquea_desde ?? null };
    return { nivel: "ok", mensaje: "", desde: null };
  } catch {
    return { nivel: "ok", mensaje: "", desde: null };
  }
}
```

- [ ] **Step 2: Banda en el shell**

En `apps/admin/app/components/admin-shell.tsx`: estado `const [acceso, setAcceso] = useState<Acceso>({ nivel: "ok", mensaje: "", desde: null });`, un `useEffect` que llame `leerAcceso()` al montar y cada 10 minutos, y encima del `<main>`:

```tsx
      {acceso.nivel !== "ok" && (
        <div
          role="status"
          className={[
            "px-5 py-2.5 text-center text-[13px] font-semibold",
            acceso.nivel === "bloqueado" ? "bg-[#FBECEA] text-danger" : "bg-[#F6EEDD] text-warning",
          ].join(" ")}
        >
          {acceso.mensaje}
          {acceso.nivel === "bloqueado" && (
            <span className="ml-2 font-normal text-ink-2">Tu panel quedó en solo lectura hasta que se reactive.</span>
          )}
        </div>
      )}
```

Exportar `useAccesoTenant()` desde el mismo archivo (mismo patrón que `usePerfil`) para que las pantallas de alta puedan deshabilitar sus botones cuando `nivel === "bloqueado"`.

- [ ] **Step 3: Límite de usuarios en `crear-empleado`**

En `supabase/functions/crear-empleado/index.ts`, antes de crear el usuario:

```ts
  // Límite de usuarios del plan (ADR 0014). Se comprueba aquí y no en el navegador porque esta
  // función es la única puerta por la que se crean empleados.
  const { data: lim } = await admin.rpc("limites_efectivos", { p_tenant: tenantId });
  const max = (lim as { max_usuarios?: number | null } | null)?.max_usuarios ?? null;
  if (max !== null) {
    const { count } = await admin
      .from("usuarios_acceso")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);
    if ((count ?? 0) >= max) {
      return json({ error: "LIMITE_USUARIOS", detalle: `Tu plan permite ${max} usuarios. Pide a VIM ampliar el límite.` }, 409);
    }
  }
```

Ajustar los nombres (`admin`, `json`, `tenantId`) a los que ya use ese archivo; si la tabla de accesos tiene otro nombre, usar el del esquema real.

- [ ] **Step 4: Verificar y confirmar**

En el navegador (`localhost:3001`): con el tenant suspendido en gracia, banda amarilla; con `bloqueo_desde` en el pasado, banda roja y "solo lectura". Crear un empleado por encima del límite devuelve el mensaje del plan.

```bash
pnpm --filter @vim/admin typecheck && pnpm --filter @vim/admin test
git add apps/admin supabase/functions/crear-empleado
git commit -m "feat(admin): aviso de suspensión, solo lectura al bloquear y límite de usuarios

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Panel — el latido en el semáforo, y versión por caja

**Files:**
- Modify: `apps/platform/app/lib/senal-caja.ts`
- Modify: `apps/platform/app/lib/__tests__/senal-caja.test.ts`
- Modify: `apps/platform/app/api/tenants/[id]/salud/route.ts`
- Modify: `apps/platform/app/lib/tipos.ts`
- Modify: `apps/platform/app/components/salud-tenant.tsx`

**Interfaces:**
- Consumes: `cajas.ultimo_latido`, `cajas.version_app`, `cajas.so` (Task 1).
- Produces: `señalDeCaja` acepta `ultimoLatido` y devuelve `origen: "latido" | "conexion" | "sync" | "venta"`; `CajaSalud` gana `versionApp` y `so`.

- [ ] **Step 1: Ampliar la prueba (falla)**

Añadir a `apps/platform/app/lib/__tests__/senal-caja.test.ts`:

```ts
  it("el latido manda sobre todas las demás señales", () => {
    const r = señalDeCaja(
      { ultimoLatido: haceHoras(1), ultimaConexion: haceHoras(5), ultimoSync: haceHoras(6), ultimaVenta: haceHoras(2) },
      AHORA,
    );
    expect(r.origen).toBe("latido");
    expect(r.horas).toBe(1);
  });

  it("sin latido se cae al criterio anterior (cajas sin actualizar)", () => {
    expect(señalDeCaja({ ultimaConexion: haceHoras(3) }, AHORA).origen).toBe("conexion");
  });
```

- [ ] **Step 2: Correr y ver que falla**

```bash
pnpm --filter @vim/platform test -- senal-caja
```
Expected: FAIL — `origen` es `"conexion"`, no `"latido"`.

- [ ] **Step 3: Añadir la fuente**

En `apps/platform/app/lib/senal-caja.ts`, añadir `"latido"` a `OrigenSenal`, aceptar `ultimoLatido` en `fuentes` y ponerlo **primero** en las dos cadenas de `??`, con este comentario:

```ts
 *   · `latido`   — la caja llamó a `caja_latido` (0105). La señal más honesta: prueba que está
 *                  encendida aunque no haya vendido ni tenido nada que subir. Desde 0.4.60.
```

En `salud-tenant.tsx`, traducir el origen nuevo: `c.origenSenal === "latido" ? "" : …` (el latido es el caso normal, así que **no** lleva aclaración; las demás sí la conservan).

- [ ] **Step 4: Exponer versión y SO**

En el `select` de cajas de `salud/route.ts` añadir `ultimo_latido, version_app, so`; pasar `ultimoLatido: c.ultimo_latido` a `señalDeCaja`; devolver `versionApp: c.version_app` y `so: c.so`. Añadir ambos a `CajaSalud` en `tipos.ts`.

En la tabla de `salud-tenant.tsx`, una columna "Versión":

```tsx
                  <td className="p-2 text-ink-2">
                    {c.versionApp ?? <span className="text-ink-3">anterior a 0.4.60</span>}
                  </td>
```

Con cabecera `<th className="p-2 text-left font-semibold">Versión</th>`. Una caja sin versión se muestra **en gris**, nunca en rojo (§7): no está caída, solo sin actualizar.

- [ ] **Step 5: Correr, verificar y confirmar**

```bash
pnpm --filter @vim/platform test && pnpm --filter @vim/platform typecheck
```
En el navegador, la ficha del cliente de pruebas muestra la caja con versión `0.4.60` y "Conectada" apoyada en el latido.

```bash
git add apps/platform
git commit -m "feat(platform): el semáforo usa el latido y la ficha muestra versión y SO por caja

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Cierre — pruebas, seguridad, documentación y publicación

**Files:**
- Modify: `docs/diseno/platform.md`, `docs/diseno/pos.md`
- Modify: `../MEMORY.md`

- [ ] **Step 1: Suite completa**

```bash
pnpm turbo run typecheck
pnpm turbo run test
pnpm test:functions
node --test desktop/src/*.test.mjs
supabase test db
```
Expected: todo en verde.

- [ ] **Step 2: Prueba de extremo a extremo del ciclo**

Con la caja de desarrollo vinculada al tenant de pruebas:

1. Suspender con 1 día de gracia desde el panel → antes de 10 minutos el POS muestra la banda.
2. `update tenants set bloqueo_desde = now() - interval '1 minute'` → siguiente latido → pantalla de bloqueo.
3. Comprobar que **el sync sigue subiendo** las ventas pendientes con la caja bloqueada.
4. Reactivar → el POS vuelve a operar.
5. Apagar la red de la caja con `bloqueo_desde` futura y adelantar la fecha en la base: la caja **no** debe bloquear (invariante §3).

- [ ] **Step 3: Revisión de seguridad**

Invocar `security-review` sobre la rama. Debe quedar limpio: el `caja_id` sale del token; `resolver_directivas` y `caja_latido` sin `GRANT` a `anon`/`authenticated`; `mi_acceso()` solo devuelve el tenant de la sesión; el cuerpo del latido validado antes de tocar SQL; `/__directivas` sin datos del negocio. Corregir lo que salga antes de seguir.

- [ ] **Step 4: Documentación**

En `docs/diseno/platform.md`, en la sección de la ficha, añadir que la columna Versión distingue las cajas anteriores a 0.4.60 en gris. En `docs/diseno/pos.md`, documentar los dos estados nuevos (banda de gracia y pantalla de bloqueo) y la regla de que la falta de datos nunca bloquea.

```bash
git add docs/
git commit -m "docs(diseno): banda de gracia y bloqueo en el POS, versión de caja en el panel

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Publicar**

Con el visto bueno de Fermín y **avisando antes a Knock-Out**, que es el piloto:

```bash
supabase db push                                    # 0105, desde ESTE worktree
supabase functions deploy caja-latido
git push -u origin platform-latido
gh pr create --base main --title "Panel: latido de la caja y bloqueo real (ADR 0014, entrega 2)" --body-file <cuerpo>
```

Tras el merge, publicar el escritorio **0.4.60** (`npm run dist` tarda más de 10 minutos: lanzarlo en segundo plano y verificar la fecha del `.exe` antes de publicar), subir `latest.json` con el `curl` de `reference_publicar_latest_json` y crear el release.

- [ ] **Step 6: Vigilar el primer ciclo**

A la mañana siguiente, en el panel: las cajas actualizadas deben mostrar versión `0.4.60` y "Conectada" por latido. Las que sigan en gris son las que no se han actualizado — es lo que la entrega 4 viene a resolver.

- [ ] **Step 7: Memoria**

Actualizar `../MEMORY.md` y la memoria del proyecto (`project_platform_centro_control.md`) con la entrega 2 en producción, la versión 0.4.60 y qué queda de las entregas 3 y 4.

---

## Self-review (hecho al escribir)

- **Cobertura de la spec §6-7:** 6.1 migración y funciones → Task 1; 6.2 qué hace suspender → ya implementado en la entrega 1, aquí solo se lee; 6.3 Edge Function → Task 2; 6.4 escritorio → Tasks 3 y 4; 6.5 POS → Tasks 5 y 6; 6.6 admin → Task 7; §7 compatibilidad → Task 8 (gris, no rojo) y la Task 4 (una caja vieja no llama y no bloquea). §10 seguridad → Task 9 paso 3. §11 pruebas → Tasks 1, 2, 3, 5 y el paso 2 de la 9. §12 paso 2 → Task 9 paso 5.
- **Añadido respecto a la spec, a propósito:** el trigger de sucursales (Task 1) y el límite de usuarios en `crear-empleado` (Task 7). La spec decía "en las pantallas de alta"; hacerlo en la base y en la Edge Function es más fuerte y consistente con el candado de cajas de la 0103.
- **Consistencia de nombres:** `evaluarAcceso` devuelve `{ nivel, mensaje, desde }` en Tasks 5, 6 y 7; `normalizar`/`crearAlmacenDirectivas` de la Task 3 se consumen en la 4; `antesDeCadaCiclo` se define en la Task 4 paso 3 y se prueba en el paso 1; `origen: "latido"` se añade en la Task 8 y se traduce en el mismo paso.
- **Riesgo asumido:** el trigger de sucursales puede romper pruebas ajenas igual que pasó con el de cajas en la entrega 1; el paso 4 de la Task 1 dice explícitamente cómo resolverlo (excepción en la prueba, no debilitar el trigger).
