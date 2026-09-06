# Onboarding por invitación — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un dueño invitado llegue desde el enlace hasta su primera venta real —con la caja instalada y vinculada por él mismo— sin que VIM toque nada.

**Architecture:** `/bienvenida` deja de ser un banner y pasa a ser la pantalla de aterrizaje mientras el tenant no esté en `GO_LIVE`. Sus pasos se miden con señales reales: el de la caja pasa de `count(cajas) > 0` a `cajas.ultimo_latido IS NOT NULL`, y se añade el de la primera venta. La vinculación deja de ser teclear un correo sintético y una contraseña de 16 caracteres: una tabla nueva de códigos de 6 dígitos hasheados y de un solo uso, un RPC que los emite desde el admin y una Edge Function pública que los canjea por las credenciales del dispositivo. El instalador que descarga el dueño sale de `versiones_caja` (ADR 0014, entrega 4), no de un enlace escrito a mano.

**Tech Stack:** Postgres/plpgsql (`SECURITY DEFINER` con `search_path` fijo, pgcrypto en el esquema `extensions`), Edge Functions en Deno, Next 15 + React 19 en `apps/admin` y `apps/platform`, Node ESM sin dependencias en `desktop/` (`node --test`), vitest para lógica pura, pgTAP para SQL.

**Spec:** `docs/superpowers/specs/2026-09-06-onboarding-invitado-design.md`

## Global Constraints

- **Carpeta y rama:** worktree `vim-pos-platform/`, rama nueva `onboarding-invitado` creada **desde `origin/main`** (`main` está checkouteado en `vim-pos/`, aquí no se puede `git checkout main`).
- **Numeración de migraciones — ha chocado TRES veces.** Este plan dice `0109`, pero eso se comprueba con `supabase migration list --linked` **antes de fijarlo y otra vez antes de publicar**. Un número ya presente en el historial remoto hace que `db push` **salte la migración en silencio**.
- **pgcrypto vive en el esquema `extensions`**, no en `public`. Toda función que use `digest()` o `gen_random_bytes()` necesita `SET search_path = public, extensions, pg_temp` y llamarlas sin prefijo. Sin eso fallan en tiempo de ejecución, no al crearse.
- **El código nunca se guarda en claro.** Solo su SHA-256. La función que lo emite lo devuelve una vez y no hay forma de volver a leerlo.
- **Los controles del canje no son opcionales** (spec §4.3): caducidad de 15 minutos, un solo uso, máximo 5 intentos por código, un código activo por caja, límite por IP, y **el mismo error** para código inexistente, caducado, quemado o equivocado.
- **`versiones_caja` sigue sin políticas de RLS.** El dueño no lee la tabla: lee `version_recomendada()`, que devuelve solo `version`, `url` y `fecha`.
- **`service_role` solo en Edge Functions y `apps/platform`.** Nada nuevo para `authenticated` salvo los dos RPC de este plan.
- **Sin `any`**; español en el dominio; archivos `kebab-case`, componentes `PascalCase`.
- Commits en español con prefijo, y al final:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0109_vinculacion_por_codigo.sql` | `codigos_vinculacion`, `emitir_codigo_vinculacion()`, `consumir_codigo_vinculacion()`, `version_recomendada()` |
| `supabase/tests/0014_vinculacion.test.sql` | pgTAP: caducidad, un solo uso, intentos, aislamiento entre tenants, qué NO devuelve `version_recomendada` |
| `supabase/functions/canjear-vinculacion/index.ts` | canje público: límite por IP, consume el código, provisiona el dispositivo |
| `apps/admin/app/lib/onboarding-pasos.ts` | `evaluarPasos(senales)` **pura** — qué pasos hay y cuándo se cierran |
| `apps/admin/app/lib/__tests__/onboarding-pasos.test.ts` | sus pruebas |
| `apps/admin/app/lib/onboarding.ts` | recoge las señales de la base y delega en `evaluarPasos` |
| `apps/admin/app/(panel)/bienvenida/page.tsx` | el paso de instalar y conectar la caja, con descarga y código |
| `apps/admin/app/components/admin-shell.tsx` | aterrizar en `/bienvenida` mientras no haya `GO_LIVE` |
| `apps/pos/app/components/vincular-dispositivo.tsx` | campo de 6 dígitos; credenciales plegadas debajo |
| `desktop/src/ui-server.mjs` | `/__vincular-nube` acepta `{ codigo }` |
| `desktop/src/main.mjs` | `vincularConNube` canjea el código antes de la ruta de siempre |
| `apps/platform/app/clientes/nuevo/page.tsx` | enlace de invitación copiable + si el correo salió |
| `apps/platform/app/api/provisionar/route.ts` | devolver el enlace de invitación al panel |
| `supabase/functions/provisionar-tenant/index.ts` | generar y devolver el enlace además de invitar |

---

### Task 0: Rama, numeración y línea base

- [ ] **Step 1: Rama nueva desde `origin/main`**

```bash
cd "D:/Users/usuario/Documents/VIM MARKETING/Vim-marketing managment/PROYECTOS/VIM POS/vim-pos-platform"
git fetch origin main && git checkout -b onboarding-invitado origin/main
pnpm install --frozen-lockfile
```

- [ ] **Step 2: Comprobar el número de migración libre**

```bash
supabase migration list --linked | tail -3
```
Expected: la última remota es `0108`. Si no, subir el número en todo este plan y en la spec.

- [ ] **Step 3: Línea base verde**

```bash
pnpm turbo run typecheck && pnpm turbo run test && pnpm test:functions
node --test desktop/src/*.test.mjs && supabase test db
```
Expected: todo en verde antes de tocar nada.

---

### Task 1: Migración 0109 — códigos de vinculación y versión recomendada

**Files:**
- Create: `supabase/migrations/0109_vinculacion_por_codigo.sql`
- Create: `supabase/tests/0014_vinculacion.test.sql`
- Modify: `supabase/tests/0002_rls_cobertura.test.sql` (añadir `codigos_vinculacion` a `_rls_exentas`)

**Interfaces:**
- Produces: `emitir_codigo_vinculacion(p_caja uuid) RETURNS jsonb` → `{ codigo, expira_en }` (para `authenticated`, DUEÑO/ADMIN del tenant de la caja); `consumir_codigo_vinculacion(p_codigo text) RETURNS jsonb` → `{ tenant_id, caja_id }` o `NULL` (solo `service_role`); `version_recomendada() RETURNS jsonb` → `{ version, url, fecha }` (para `authenticated`).
- Consumes: `es_admin_del_tenant(uuid)` y `current_tenant_id()`, ya existentes; `versiones_caja` de la migración 0108.

- [ ] **Step 1: Escribir la prueba pgTAP (falla porque no hay tabla)**

`supabase/tests/0014_vinculacion.test.sql`:

```sql
-- ============================================================================
-- Vinculación por código (spec 2026-09-06 §4, migración 0109).
--
-- Lo que se protege: que un código caduque, que se consuma UNA sola vez, que se queme a los 5
-- intentos, que emitir uno nuevo invalide el anterior, y que `version_recomendada` no filtre a
-- los clientes nada de lo que VIM guarda para sí.
--
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(11);

insert into tenants (id, codigo, nombre_comercial, vertical_principal, estado, plan_actual_id)
values ('aaaaaaaa-0000-0000-0000-0000000000c1', 'vinc-uno', 'Vinculación Uno', 'QUICK_SERVICE', 'ACTIVO',
        (select id from planes where codigo = 'NEGOCIO'))
on conflict (id) do nothing;
insert into configuracion_tenant (tenant_id) values ('aaaaaaaa-0000-0000-0000-0000000000c1')
on conflict (tenant_id) do nothing;
insert into sucursales (id, tenant_id, nombre, codigo)
values ('aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'Única', 'u1')
on conflict (id) do nothing;
insert into cajas (id, tenant_id, sucursal_id, numero, nombre)
values ('aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-0000000000c1',
        'aaaaaaaa-0000-0000-0000-0000000000d1', 1, 'Caja 1')
on conflict (id) do nothing;

-- Aislamiento: la base de desarrollo puede traer códigos y versiones de otras pruebas.
delete from codigos_vinculacion;
delete from versiones_caja;

-- #1 la tabla existe
select has_table('codigos_vinculacion');

-- #2 la tabla NO tiene políticas: solo se toca desde funciones definer
select is_empty(
  $$ select policyname from pg_policies where tablename = 'codigos_vinculacion' $$,
  'codigos_vinculacion no tiene políticas de RLS');

-- Se emite un código con service_role (el guard de rol se prueba aparte, en #9).
set local role postgres;
insert into codigos_vinculacion (tenant_id, caja_id, codigo_hash, expira_en)
values ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-0000000000e1',
        encode(extensions.digest('482193', 'sha256'), 'hex'), now() + interval '15 minutes');

-- #3 un código bueno devuelve su caja
select is((consumir_codigo_vinculacion('482193') ->> 'caja_id'),
          'aaaaaaaa-0000-0000-0000-0000000000e1', 'un código válido devuelve su caja');

-- #4 y ya no sirve una segunda vez
select ok(consumir_codigo_vinculacion('482193') is null, 'un código consumido ya no sirve');

-- #5 un código caducado no sirve
insert into codigos_vinculacion (tenant_id, caja_id, codigo_hash, expira_en)
values ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-0000000000e1',
        encode(extensions.digest('111111', 'sha256'), 'hex'), now() - interval '1 minute');
select ok(consumir_codigo_vinculacion('111111') is null, 'un código caducado no sirve');
delete from codigos_vinculacion;

-- #6 a los 5 intentos fallidos el código se quema aunque siga vigente
insert into codigos_vinculacion (tenant_id, caja_id, codigo_hash, expira_en)
values ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-0000000000e1',
        encode(extensions.digest('222222', 'sha256'), 'hex'), now() + interval '15 minutes');
select consumir_codigo_vinculacion('000000');
select consumir_codigo_vinculacion('000001');
select consumir_codigo_vinculacion('000002');
select consumir_codigo_vinculacion('000003');
select consumir_codigo_vinculacion('000004');
select ok(consumir_codigo_vinculacion('222222') is null,
          'a los 5 intentos fallidos el código se quema aunque sea el correcto');
delete from codigos_vinculacion;

-- #7 solo puede haber UN código activo por caja
insert into codigos_vinculacion (tenant_id, caja_id, codigo_hash, expira_en)
values ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-0000000000e1',
        encode(extensions.digest('333333', 'sha256'), 'hex'), now() + interval '15 minutes');
select throws_ok(
  $$ insert into codigos_vinculacion (tenant_id, caja_id, codigo_hash, expira_en)
     values ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-0000000000e1',
             encode(extensions.digest('444444', 'sha256'), 'hex'), now() + interval '15 minutes') $$,
  '23505', NULL, 'no puede haber dos códigos activos para la misma caja');
delete from codigos_vinculacion;

-- #8 el código no se guarda en claro
insert into codigos_vinculacion (tenant_id, caja_id, codigo_hash, expira_en)
values ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-0000000000e1',
        encode(extensions.digest('555555', 'sha256'), 'hex'), now() + interval '15 minutes');
select is_empty(
  $$ select codigo_hash from codigos_vinculacion where codigo_hash = '555555' $$,
  'el código se guarda hasheado, nunca en claro');
delete from codigos_vinculacion;

-- #9 `authenticated` no puede ejecutar el consumo (es de service_role)
select ok(
  not has_function_privilege('authenticated', 'consumir_codigo_vinculacion(text)', 'execute'),
  'authenticated no puede consumir códigos');

-- #10/#11 version_recomendada devuelve la url pero NO lo interno de VIM
insert into versiones_caja (version, url, sha512, notas, fecha, es_minima, bloquea_bajo_minima)
values ('0.4.62', 'https://github.com/x/y/releases/download/v0.4.62/a.exe', repeat('a', 128),
        'notas', '2026-09-06', true, true);
select is((version_recomendada() ->> 'version'), '0.4.62', 'devuelve la versión recomendada');
select ok(
  (version_recomendada() ? 'sha512') = false
  and (version_recomendada() ? 'bloquea_bajo_minima') = false
  and (version_recomendada() ? 'notas') = false,
  'no filtra sha512, notas ni el estado del bloqueo por versión');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y ver que falla**

```bash
supabase test db
```
Expected: falla en #1, `codigos_vinculacion` no existe.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/0109_vinculacion_por_codigo.sql`:

```sql
-- ============================================================================
-- 0109 — Vinculación de la caja con un código de 6 dígitos.
--
-- Vincular era teclear `caja-<uuid>@dispositivos.vimpos.mx` y una contraseña de 16 caracteres en
-- la PC de la caja, leyéndolos de otra pantalla. Es justo el punto donde el dueño llama por
-- teléfono, y este onboarding existe para que no tenga a quién llamar.
--
-- Seis dígitos son POCOS para un endpoint público que entrega credenciales, y lo que lo hace
-- aceptable son los controles, no el tamaño: caducidad corta, un solo uso, 5 intentos, un código
-- vivo por caja, y el mismo error para todos los fallos. Ver la spec §4.3.
--
-- Diseño: docs/superpowers/specs/2026-09-06-onboarding-invitado-design.md §4.
-- ============================================================================

CREATE TABLE codigos_vinculacion (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  caja_id     uuid NOT NULL REFERENCES cajas(id),
  -- SHA-256 en hex. Nunca el código: quien lea la tabla no debe poder vincular cajas ajenas.
  codigo_hash char(64) NOT NULL,
  expira_en   timestamptz NOT NULL,
  usado_en    timestamptz NULL,
  intentos    smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NULL
);
COMMENT ON TABLE codigos_vinculacion IS
  'Códigos de un solo uso para vincular una caja sin teclear credenciales (onboarding invitado).';
-- Un código vivo por caja: mantiene pequeño el conjunto de códigos adivinables a la vez.
CREATE UNIQUE INDEX uq_codigo_activo_por_caja ON codigos_vinculacion (caja_id) WHERE usado_en IS NULL;
CREATE INDEX idx_codigo_hash_activo ON codigos_vinculacion (codigo_hash) WHERE usado_en IS NULL;
ALTER TABLE codigos_vinculacion ENABLE ROW LEVEL SECURITY;  -- sin políticas: solo definer

-- ── Emitir ──────────────────────────────────────────────────────────────────
CREATE FUNCTION emitir_codigo_vinculacion(p_caja uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_tenant uuid;
  v_codigo text;
  v_expira timestamptz := now() + interval '15 minutes';
BEGIN
  SELECT c.tenant_id INTO v_tenant FROM cajas c WHERE c.id = p_caja AND c.deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'CAJA_NO_EXISTE'; END IF;
  -- Solo un DUEÑO/ADMIN del tenant DE ESA CAJA. Sin esto, cualquier empleado autenticado de
  -- cualquier negocio podría emitir un código para la caja de otro.
  IF NOT es_admin_del_tenant(v_tenant) THEN RAISE EXCEPTION 'SIN_PERMISO'; END IF;

  -- Emitir invalida el anterior: el índice único lo exige y además es lo que se espera al
  -- pulsar "genera otro" porque el primero se perdió.
  UPDATE codigos_vinculacion SET usado_en = now()
   WHERE caja_id = p_caja AND usado_en IS NULL;

  -- gen_random_bytes (pgcrypto), no random(): esto autoriza una caja.
  v_codigo := lpad((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');

  INSERT INTO codigos_vinculacion (tenant_id, caja_id, codigo_hash, expira_en, created_by)
  VALUES (v_tenant, p_caja, encode(digest(v_codigo, 'sha256'), 'hex'), v_expira, auth.uid());

  RETURN jsonb_build_object('codigo', v_codigo, 'expira_en', v_expira);
END;
$$;
COMMENT ON FUNCTION emitir_codigo_vinculacion(uuid) IS
  'Código de 6 dígitos, 15 minutos, un solo uso, para vincular una caja. Se devuelve UNA vez.';
REVOKE EXECUTE ON FUNCTION emitir_codigo_vinculacion(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION emitir_codigo_vinculacion(uuid) TO authenticated;

-- ── Consumir ────────────────────────────────────────────────────────────────
CREATE FUNCTION consumir_codigo_vinculacion(p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_fila codigos_vinculacion%ROWTYPE;
BEGIN
  IF p_codigo !~ '^[0-9]{6}$' THEN RETURN NULL; END IF;
  v_hash := encode(digest(p_codigo, 'sha256'), 'hex');

  -- Se marca usado en el MISMO UPDATE que lo valida: dos canjes simultáneos del mismo código no
  -- pueden ganar los dos.
  UPDATE codigos_vinculacion SET usado_en = now()
   WHERE codigo_hash = v_hash
     AND usado_en IS NULL
     AND expira_en > now()
     AND intentos < 5
  RETURNING * INTO v_fila;

  IF v_fila.id IS NOT NULL THEN
    RETURN jsonb_build_object('tenant_id', v_fila.tenant_id, 'caja_id', v_fila.caja_id);
  END IF;

  -- Fallo: se cuenta el intento contra TODOS los códigos vivos. No se sabe cuál intentaba
  -- adivinar, y esa es justo la razón por la que hay que encarecer el disparo a ciegas.
  UPDATE codigos_vinculacion SET intentos = intentos + 1
   WHERE usado_en IS NULL AND expira_en > now();
  RETURN NULL;
END;
$$;
COMMENT ON FUNCTION consumir_codigo_vinculacion(text) IS
  'Canjea un código. NULL para inexistente, caducado, quemado o equivocado: no se distingue.';
REVOKE EXECUTE ON FUNCTION consumir_codigo_vinculacion(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION consumir_codigo_vinculacion(text) TO service_role;

-- ── Qué versión debe instalar el dueño ──────────────────────────────────────
-- `versiones_caja` no tiene políticas y así se queda: lleva la historia comercial de las
-- publicaciones. Esto devuelve lo único que el navegador del dueño necesita para descargar.
CREATE FUNCTION version_recomendada()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('version', v.version, 'url', v.url, 'fecha', v.fecha)
       FROM versiones_caja v WHERE v.publicada
      ORDER BY string_to_array(v.version, '.')::int[] DESC LIMIT 1),
    '{}'::jsonb);
$$;
COMMENT ON FUNCTION version_recomendada() IS
  'Versión que debe instalar un cliente: solo version, url y fecha. Nada interno de VIM.';
REVOKE EXECUTE ON FUNCTION version_recomendada() FROM public, anon;
GRANT EXECUTE ON FUNCTION version_recomendada() TO authenticated;
```

- [ ] **Step 4: Declarar la tabla exenta de política**

En `supabase/tests/0002_rls_cobertura.test.sql`, dentro de `_rls_exentas`, cambiar la última línea a:

```sql
  ('avisos_lecturas'),         -- Acuses de esos avisos; los escriben caja_latido y marcar_aviso_visto, ambas definer (mig. 0106).
  ('codigos_vinculacion');     -- Códigos de un solo uso para vincular una caja; solo funciones definer (mig. 0109).
```

- [ ] **Step 5: Aplicar y correr las pruebas**

```bash
docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 < supabase/migrations/0109_vinculacion_por_codigo.sql
docker exec supabase_db_vim-pos psql -U postgres -d postgres -Atc "insert into supabase_migrations.schema_migrations (version, name) values ('0109','vinculacion_por_codigo') on conflict do nothing"
supabase test db
```
Expected: `0014_vinculacion.test.sql` 11/11 y el resto en verde.

- [ ] **Step 6: Regenerar tipos y confirmar**

```bash
pnpm db:types
git add supabase/ packages/db/src/database.types.ts
git commit -m "db: vinculacion de la caja con un codigo de 6 digitos (0109)

Seis digitos son pocos para un endpoint que entrega credenciales; lo que lo hace aceptable son
los controles: 15 minutos, un solo uso, 5 intentos, uno vivo por caja y el mismo error para
todos los fallos. El codigo se guarda hasheado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Edge Function `canjear-vinculacion`

**Files:**
- Create: `supabase/functions/canjear-vinculacion/index.ts`
- Create: `supabase/functions/canjear-vinculacion/limite.ts`
- Create: `supabase/functions/canjear-vinculacion/limite.test.ts`

**Interfaces:**
- Produces: `POST /functions/v1/canjear-vinculacion` con `{ codigo: "482193" }` → `200 { ok: true, identificador, clave, caja_nombre }` o `400 { ok: false, error: "CODIGO_INVALIDO" }`; `429` al pasarse del límite por IP. Y `permitir(ip, ahora): boolean` desde `limite.ts`.
- Consumes: `consumir_codigo_vinculacion(text)` (Task 1).

- [ ] **Step 1: Escribir la prueba del límite (pura, sin red)**

`supabase/functions/canjear-vinculacion/limite.test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert";
import { crearLimite } from "./limite.ts";

Deno.test("deja pasar los primeros intentos y corta después", () => {
  const l = crearLimite({ max: 10, ventanaMs: 60_000 });
  let t = 0;
  for (let i = 0; i < 10; i++) assertEquals(l.permitir("1.2.3.4", t), true);
  assertEquals(l.permitir("1.2.3.4", t), false);
});

Deno.test("el límite es por IP: una no afecta a la otra", () => {
  const l = crearLimite({ max: 2, ventanaMs: 60_000 });
  assertEquals(l.permitir("1.2.3.4", 0), true);
  assertEquals(l.permitir("1.2.3.4", 0), true);
  assertEquals(l.permitir("1.2.3.4", 0), false);
  assertEquals(l.permitir("5.6.7.8", 0), true);
});

Deno.test("pasada la ventana se vuelve a poder", () => {
  const l = crearLimite({ max: 1, ventanaMs: 60_000 });
  assertEquals(l.permitir("1.2.3.4", 0), true);
  assertEquals(l.permitir("1.2.3.4", 30_000), false);
  assertEquals(l.permitir("1.2.3.4", 60_001), true);
});

Deno.test("sin IP conocida se limita igual, bajo una sola clave", () => {
  // Preferimos limitar de más a dejar barra libre a quien no manda cabecera.
  const l = crearLimite({ max: 1, ventanaMs: 60_000 });
  assertEquals(l.permitir("", 0), true);
  assertEquals(l.permitir("", 0), false);
});
```

- [ ] **Step 2: Correr y ver que falla**

```bash
pnpm test:functions
```
Expected: FAIL, no existe `./limite.ts`.

- [ ] **Step 3: Implementar el límite**

`supabase/functions/canjear-vinculacion/limite.ts`:

```ts
/**
 * Límite de canjes por IP. En memoria a propósito: una dependencia externa para esto sería
 * desproporcionada, y el control DURO contra la fuerza bruta es el de la base (5 intentos por
 * código, spec §4.3). Esto encarece el disparo a ciegas.
 *
 * Límite conocido, el mismo que el del panel: en serverless el estado es POR INSTANCIA y se
 * pierde en cada arranque en frío.
 */
export function crearLimite({ max, ventanaMs }: { max: number; ventanaMs: number }) {
  const visto = new Map<string, { n: number; desde: number }>();
  return {
    permitir(ip: string, ahora: number): boolean {
      const clave = ip || "sin-ip";
      const e = visto.get(clave);
      if (!e || ahora - e.desde > ventanaMs) {
        visto.set(clave, { n: 1, desde: ahora });
        return true;
      }
      if (e.n >= max) return false;
      e.n += 1;
      return true;
    },
  };
}
```

- [ ] **Step 4: Correr, pasa**

```bash
pnpm test:functions
```
Expected: PASS (4 pruebas nuevas).

- [ ] **Step 5: Escribir la función**

`supabase/functions/canjear-vinculacion/index.ts`. Estructura, con los comentarios que deben quedar:

```ts
// Edge Function: canjear-vinculacion — el dueño teclea en su caja el código de 6 dígitos que le
// dio su panel, y a cambio recibe las credenciales del dispositivo. PÚBLICA (anon key): la caja
// recién instalada no tiene ninguna sesión todavía, y ese es justo el problema que resuelve.
//
// Es un endpoint que ENTREGA CREDENCIALES, así que:
//   · el código se valida y se consume en la base, en una sola sentencia (mig. 0109);
//   · el error es el mismo para inexistente, caducado, quemado o equivocado — nunca se confirma
//     que un código existe;
//   · hay límite por IP encima del límite por código de la base.
//
// El peor caso está acotado: quien acierte obtiene las credenciales de UNA caja de UN tenant. No
// obtiene el panel, ni el tenant, ni nada de otro cliente; y el dueño ve la caja vinculada.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { crearLimite } from "./limite.ts";

const limite = crearLimite({ max: 20, ventanaMs: 10 * 60_000 });
```

El cuerpo, en orden:

1. `OPTIONS` → cors; método distinto de `POST` → 405.
2. IP con `x-forwarded-for` (primer elemento) y `limite.permitir(ip, Date.now())`; si no → `429` con `Retry-After`.
3. Leer `{ codigo }`; si no casa con `/^[0-9]{6}$/` → `400 CODIGO_INVALIDO` (el mismo error que el resto).
4. `admin.rpc("consumir_codigo_vinculacion", { p_codigo: codigo })`; si devuelve `null` → `400 CODIGO_INVALIDO`.
5. Con `caja_id`, repetir el aprovisionamiento del dispositivo **exactamente igual que en `provisionar-dispositivo/index.ts` pasos 5-7**: cuenta sintética `caja-<caja_id>@dispositivos.vimpos.mx`, crear o rotar contraseña, `usuarios_perfil` upsert, `usuarios_acceso` con rol `DISPOSITIVO`.
6. Responder `{ ok: true, identificador, clave, caja_nombre }`.

- [ ] **Step 6: Confirmar**

```bash
pnpm test:functions
git add supabase/functions/canjear-vinculacion
git commit -m "feat(nube): canje del codigo de vinculacion por las credenciales de la caja

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Los pasos del onboarding, como función pura

**Files:**
- Create: `apps/admin/app/lib/onboarding-pasos.ts`
- Create: `apps/admin/app/lib/__tests__/onboarding-pasos.test.ts`
- Modify: `apps/admin/app/lib/onboarding.ts`

**Interfaces:**
- Produces: `type SenalesOnboarding = { tieneNegocio: boolean; tieneFiscal: boolean; productos: number; usuarios: number; cajasQueLaten: number; ventasCobradas: number }` y `evaluarPasos(s: SenalesOnboarding): { pasos: PasoOnboarding[]; obligatoriosHechos: number; obligatoriosTotal: number; listoParaVender: boolean }`.
- Consumes: nada. Función **pura**, para probarla sin base.

- [ ] **Step 1: Escribir la prueba**

`apps/admin/app/lib/__tests__/onboarding-pasos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluarPasos, type SenalesOnboarding } from "../onboarding-pasos";

const vacio: SenalesOnboarding = {
  tieneNegocio: false, tieneFiscal: false, productos: 0, usuarios: 1, cajasQueLaten: 0, ventasCobradas: 0,
};
const paso = (s: SenalesOnboarding, clave: string) =>
  evaluarPasos(s).pasos.find((p) => p.clave === clave)!;

describe("evaluarPasos", () => {
  it("un negocio recién creado no tiene nada hecho", () => {
    const r = evaluarPasos(vacio);
    expect(r.obligatoriosHechos).toBe(0);
    expect(r.listoParaVender).toBe(false);
  });

  it("una caja registrada NO cuenta: cuenta una caja que late", () => {
    // Antes bastaba con count(cajas) > 0, una fila en una tabla. Se podía llegar al 100% sin
    // nada con que cobrar.
    expect(paso({ ...vacio, cajasQueLaten: 0 }, "caja").completo).toBe(false);
    expect(paso({ ...vacio, cajasQueLaten: 1 }, "caja").completo).toBe(true);
  });

  it("la primera venta se marca al COBRAR, no al abrir una cuenta", () => {
    // `tickets` se crea al abrir la cuenta. Contar filas repetiria el error de contar cajas:
    // el paso se cerraria sin que hubiera entrado un peso. La senal es `fecha_pago`.
    expect(paso({ ...vacio, ventasCobradas: 0 }, "venta").completo).toBe(false);
    expect(paso({ ...vacio, ventasCobradas: 1 }, "venta").completo).toBe(true);
    expect(paso({ ...vacio, ventasCobradas: 1 }, "venta").opcional).toBe(false);
  });

  it("el equipo necesita a alguien MÁS que el dueño", () => {
    expect(paso({ ...vacio, usuarios: 1 }, "equipo").completo).toBe(false);
    expect(paso({ ...vacio, usuarios: 2 }, "equipo").completo).toBe(true);
  });

  it("lo fiscal es opcional y no bloquea el listo para vender", () => {
    expect(paso(vacio, "fiscal").opcional).toBe(true);
    const todo: SenalesOnboarding = {
      tieneNegocio: true, tieneFiscal: false, productos: 3, usuarios: 2, cajasQueLaten: 1, ventasCobradas: 1,
    };
    expect(evaluarPasos(todo).listoParaVender).toBe(true);
  });

  it("cuenta los obligatorios hechos, no los pasos hechos", () => {
    const conFiscal: SenalesOnboarding = { ...vacio, tieneFiscal: true };
    expect(evaluarPasos(conFiscal).obligatoriosHechos).toBe(0);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

```bash
pnpm --filter @vim/admin test -- onboarding-pasos
```
Expected: FAIL, no encuentra `../onboarding-pasos`.

- [ ] **Step 3: Implementar**

`apps/admin/app/lib/onboarding-pasos.ts` — mover aquí `PasoOnboarding` desde `onboarding.ts` y exportar `evaluarPasos`. Cinco pasos obligatorios (`negocio`, `catalogo`, `equipo`, `caja`, `venta`) y uno opcional (`fiscal`), con estos textos y destinos:

| clave | título | descripción | href |
|---|---|---|---|
| `negocio` | Datos del negocio | Nombre, zona horaria y hora de corte. | `/configuracion/negocio` |
| `catalogo` | Tu menú | Importa o captura tus productos y categorías. | `/catalogo/importar` |
| `equipo` | Tu equipo | Crea cajeros y cocina con su PIN. | `/usuarios` |
| `caja` | Instala y conecta tu caja | Descárgala, instálala en tu computadora y conéctala con un código. | `/configuracion/cajas` |
| `venta` | Tu primera venta | Abre turno en la caja y **cobra** algo, aunque sea una prueba. | `/dashboard` |
| `fiscal` | Datos fiscales | Solo si vas a facturar (CFDI). | `/configuracion/fiscal` |

Comentario que debe quedar escrito sobre el paso `caja`:

```ts
// `cajasQueLaten`, no `cajas`: hasta la entrega 2 del ADR 0014 esto se medía con count(cajas) > 0
// —una fila en una tabla—, así que se podía terminar el onboarding sin nada con que cobrar. Una
// caja que late es una caja que bajó el catálogo y habla con la nube. Consecuencia aceptada: una
// caja instalada sin internet no marca el paso, y es correcto, porque tampoco puede vender.
```

- [ ] **Step 4: Correr, pasa**

```bash
pnpm --filter @vim/admin test -- onboarding-pasos
```
Expected: PASS (6 pruebas).

- [ ] **Step 5: Conectar las señales reales**

En `apps/admin/app/lib/onboarding.ts`, `leerEstadoOnboarding()` deja de armar los pasos y solo recoge señales:

```ts
const [productos, usuarios, cajasQueLaten, ventasCobradas] = await Promise.all([
  contar("productos"),
  contar("usuarios_perfil"),
  contarCajasQueLaten(),
  contarVentasCobradas(),
]);
return { fase, ...evaluarPasos({ tieneNegocio, tieneFiscal, productos, usuarios, cajasQueLaten, ventasCobradas }) };
```

donde `contarCajasQueLaten()` es:

```ts
async function contarCajasQueLaten(): Promise<number> {
  const { count } = await supabase
    .from("cajas").select("id", { count: "exact", head: true })
    .is("deleted_at", null).eq("activa", true).not("ultimo_latido", "is", null);
  return count ?? 0;
}

/** Tickets COBRADOS. `tickets` se crea al abrir la cuenta, asi que contar filas marcaria el paso
 *  sin que hubiera entrado un peso: la senal de que hubo una venta es `fecha_pago`. */
async function contarVentasCobradas(): Promise<number> {
  const { count } = await supabase
    .from("tickets").select("id", { count: "exact", head: true })
    .is("deleted_at", null).not("fecha_pago", "is", null);
  return count ?? 0;
}
```

Y añadir la lectura de la versión recomendada, que la pantalla usará en la Task 4:

```ts
export type VersionCaja = { version: string; url: string; fecha: string | null };

/** Qué instalador debe descargar el dueño. Sale de `versiones_caja` (ADR 0014), no de un enlace
 *  escrito a mano que quedaría viejo en la siguiente publicación. */
export async function leerVersionRecomendada(): Promise<VersionCaja | null> {
  const { data, error } = await supabase.rpc("version_recomendada");
  if (error || !data) return null;
  const v = data as Partial<VersionCaja>;
  return v.version && v.url ? { version: v.version, url: v.url, fecha: v.fecha ?? null } : null;
}
```

- [ ] **Step 6: Confirmar**

```bash
pnpm --filter @vim/admin typecheck && pnpm --filter @vim/admin test
git add apps/admin/app/lib
git commit -m "feat(admin): el paso de la caja se mide por latido, y se anade el de la primera venta

La evaluacion de los pasos pasa a una funcion pura y probada. El paso de la caja se marcaba con
count(cajas) > 0 —una fila en una tabla—, asi que se podia terminar el onboarding sin nada con
que cobrar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: La pantalla — descargar la caja y conectarla

**Files:**
- Modify: `apps/admin/app/(panel)/bienvenida/page.tsx`
- Modify: `apps/admin/app/lib/configuracion.ts`
- Modify: `apps/admin/app/(panel)/configuracion/cajas/page.tsx`

**Interfaces:**
- Produces: `emitirCodigoVinculacion(cajaId: string): Promise<{ codigo: string; expira_en: string }>` en `configuracion.ts`.
- Consumes: `leerVersionRecomendada()` y `evaluarPasos` (Task 3); `emitir_codigo_vinculacion` (Task 1).

- [ ] **Step 1: El cliente del RPC**

En `apps/admin/app/lib/configuracion.ts`, junto a `provisionarDispositivo`:

```ts
export type CodigoVinculacion = { codigo: string; expira_en: string };

/** Código de 6 dígitos para conectar una caja. Se muestra UNA vez y caduca en 15 minutos. */
export async function emitirCodigoVinculacion(cajaId: string): Promise<CodigoVinculacion> {
  const { data, error } = await supabase.rpc("emitir_codigo_vinculacion", { p_caja: cajaId });
  if (error) throw new Error(error.message);
  const d = data as Partial<CodigoVinculacion>;
  if (!d?.codigo || !d.expira_en) throw new Error("No se pudo generar el código");
  return { codigo: d.codigo, expira_en: d.expira_en };
}
```

- [ ] **Step 2: El paso de la caja en `/bienvenida`**

El paso `caja` deja de ser una tarjeta con un enlace y se despliega, cuando no está completo, en tres cosas dentro de la misma tarjeta:

1. **Descargar**: botón a `version.url` (de `leerVersionRecomendada()`), con el texto "Descargar VIM POS {version} para Windows". Si `leerVersionRecomendada()` devuelve `null`, se muestra "Escríbenos por WhatsApp y te pasamos el instalador" en vez de un botón roto.
2. **Instalar**: una línea de texto, sin botón — "Ábrelo y sigue los pasos. Tarda unos minutos."
3. **Conectar**: botón "Generar código", que llama a `emitirCodigoVinculacion(caja.id)` y muestra el código **en grande, separado en pares** (`48 21 93`), con una cuenta atrás de 15 minutos y un botón de "Generar otro" cuando caduca.

Si el tenant todavía no tiene ninguna caja, el paso enlaza primero a `/configuracion/cajas` para crearla.

Texto que debe acompañar al código, porque es la duda inmediata:

> Tecléalo en la caja, en la pantalla que te pide conectarla. Caduca en 15 minutos y solo sirve una vez.

- [ ] **Step 3: El mismo botón en Configuración → Cajas**

En la fila de cada caja, junto a "Generar credenciales", un botón "Conectar con código" con el mismo componente. Las credenciales de dispositivo se quedan donde están: es la escalera de soporte.

- [ ] **Step 4: Verificar en el navegador**

Levantar el admin, entrar con un tenant de prueba sin caja latiendo y comprobar: el paso aparece incompleto; el botón de descarga apunta a la url de `versiones_caja`; "Generar código" muestra seis dígitos y la cuenta atrás; generar otro invalida el primero (comprobable en la tabla).

```bash
pnpm --filter @vim/admin typecheck && pnpm --filter @vim/admin test
git add apps/admin
git commit -m "feat(admin): descargar la caja e instalarla con un codigo, desde el onboarding

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Aterrizar en `/bienvenida` mientras no haya `GO_LIVE`

**Files:**
- Modify: `apps/admin/app/components/admin-shell.tsx`

- [ ] **Step 1: El redirect**

Dentro del `useEffect` que ya carga la sesión y el perfil (`admin-shell.tsx`, tras `setPerfil(await cargarPerfil())`), añadir:

```ts
// Un tenant que todavía no vende aterriza en su checklist, no en un panel vacío: es la peor
// primera impresión posible y era justo la queja del dashboard viejo. No es una jaula — el menú
// lateral sigue completo; solo cambia a dónde llegas por defecto.
const { fase } = await leerEstadoOnboarding();
if (fase !== "GO_LIVE" && (pathname === "/" || pathname === "/dashboard")) {
  router.replace("/bienvenida");
  return;
}
```

Importante: la condición mira **solo** `/` y `/dashboard`. Si mirara cualquier ruta, el dueño no podría abrir ninguna pantalla para completar los pasos — el checklist se comería a su propio onboarding.

- [ ] **Step 2: Verificar en el navegador**

Con un tenant en `EN_CONFIGURACION`: entrar lleva a `/bienvenida`; navegar a `/catalogo` funciona; pulsar "Panel" lleva a `/bienvenida`. Con un tenant en `GO_LIVE`: entrar lleva a `/dashboard` como siempre.

- [ ] **Step 3: Confirmar**

```bash
pnpm --filter @vim/admin typecheck
git add apps/admin/app/components/admin-shell.tsx
git commit -m "feat(admin): quien todavia no vende aterriza en su checklist, no en un panel vacio

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: La caja acepta un código de 6 dígitos

**Files:**
- Modify: `desktop/src/main.mjs`
- Modify: `desktop/src/ui-server.mjs`
- Modify: `apps/pos/app/lib/alta-nube.ts`
- Modify: `apps/pos/app/components/vincular-dispositivo.tsx`

**Interfaces:**
- Produces: `darDeAltaConCodigo(codigo: string): Promise<ResultadoAlta>` en `alta-nube.ts`; `POST /__vincular-nube` acepta `{ codigo }` además de `{ email, password }`.
- Consumes: `canjear-vinculacion` (Task 2).

- [ ] **Step 1: El escritorio canjea antes de la ruta de siempre**

En `desktop/src/main.mjs`, al principio de `vincularConNube`, antes de la comprobación de `email`/`password`:

```js
  // Camino nuevo (onboarding invitado): con un código, la nube nos da las credenciales y desde
  // ahí todo sigue igual. Se canjea aquí y no en el navegador para que las credenciales del
  // dispositivo no pasen nunca por la UI.
  if (codigo) {
    if (!CLOUD_ANON) return { ok: false, motivo: "SIN_CONFIG", error: "Esta instalación no trae la llave pública de la nube (VIM_CLOUD_ANON). Avisa a soporte de VIM." };
    try {
      const r = await fetch(`${CLOUD_URL}/functions/v1/canjear-vinculacion`, {
        method: "POST",
        headers: { apikey: CLOUD_ANON, "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
        signal: AbortSignal.timeout(15000),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.identificador || !j?.clave) {
        return { ok: false, motivo: "CREDENCIALES", error: "Ese código no sirve. Pide uno nuevo en tu panel, en Configuración → Cajas." };
      }
      email = j.identificador;
      password = j.clave;
    } catch (e) {
      return { ok: false, motivo: "RED", error: `No se pudo contactar la nube de VIM: ${e?.message ?? "sin conexión"}` };
    }
  }
```

Cambiar la firma a `async function vincularConNube({ email, password, codigo } = {})` y `email`/`password` a `let`.

- [ ] **Step 2: El ui-server pasa el código**

En `desktop/src/ui-server.mjs`, el handler de `/__vincular-nube` ya reenvía el cuerpo entero a `opts.onVincularNube(p)`. Comprobar que es así y, si filtra campos, añadir `codigo`. **No tocar las dos guardas** (`LOCALES.has(remoteAddress)` y `mismaProcedencia`).

- [ ] **Step 3: El POS manda el código**

En `apps/pos/app/lib/alta-nube.ts`, junto a `darDeAltaDesdeNube`:

```ts
/** Vincula la caja con el código de 6 dígitos que el dueño ve en su panel. */
export async function darDeAltaConCodigo(codigo: string): Promise<ResultadoAlta> {
  // Reutiliza el mismo endpoint: para el escritorio es la misma operación con otra entrada.
  return enviarVinculacion({ codigo });
}
```

extrayendo el `fetch` de `darDeAltaDesdeNube` a un `enviarVinculacion(cuerpo)` compartido.

- [ ] **Step 4: El campo de 6 dígitos**

En `apps/pos/app/components/vincular-dispositivo.tsx`, el código pasa a ser el camino **principal**: un campo grande de 6 dígitos (`inputMode="numeric"`, `maxLength={6}`, acepta pegar y descarta lo que no sea dígito) y un botón "Conectar". Debajo, un `<details>` plegado con "Tengo credenciales de dispositivo" que contiene el formulario actual de correo y contraseña.

Comentario que debe quedar escrito:

```tsx
// El formulario de correo y contraseña NO se quita: es la escalera de soporte cuando el código
// falla o cuando VIM entra a arreglar una caja. Se pliega porque ya no es el camino normal.
```

- [ ] **Step 5: Verificar de punta a punta en local**

Emitir un código desde el admin, teclearlo en la caja de desarrollo, comprobar que baja el catálogo y late. Después comprobar que el mismo código ya no sirve y que uno mal tecleado **no** desvincula lo que ya estaba.

- [ ] **Step 6: Confirmar**

```bash
node --test desktop/src/*.test.mjs && pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test
git add desktop apps/pos
git commit -m "feat(caja): vincular tecleando un codigo de 6 digitos

El correo sintetico y la contrasena de 16 caracteres se pliegan bajo 'Tengo credenciales de
dispositivo': siguen ahi para soporte, pero ya no son el camino normal.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: El enlace de invitación, copiable

**Files:**
- Modify: `supabase/functions/provisionar-tenant/index.ts`
- Modify: `apps/platform/app/api/provisionar/route.ts`
- Modify: `apps/platform/app/clientes/nuevo/page.tsx`

**Interfaces:**
- Produces: `provisionar-tenant` devuelve además `{ enlace_invitacion: string | null, correo_enviado: boolean }`.

- [ ] **Step 1: Generar el enlace además de invitar**

En `provisionar-tenant/index.ts`, después del `inviteUserByEmail` que ya existe, añadir:

```ts
  // El enlace se devuelve SIEMPRE, aunque el correo haya salido. `inviteUserByEmail` depende del
  // SMTP del proyecto Supabase (distinto de las variables VIM_SMTP_* que usa solicitar-demo), y
  // si no está configurado cae al remitente interno, con límites duros y entrega poco fiable.
  // Además, los clientes de VIM escriben por WhatsApp: los ocho CTA del sitio público van ahí.
  // Que el enlace se pueda pegar en un chat es la forma correcta de entregarlo, no un parche.
  const { data: enlace } = await admin.auth.admin.generateLink({
    type: "invite",
    email: email_owner,
    options: { redirectTo: `${adminUrl}/establecer-acceso` },
  });
```

y devolver `enlace_invitacion: enlace?.properties?.action_link ?? null` junto a `correo_enviado: !cErr`.

- [ ] **Step 2: Pasarlo por el route handler**

`apps/platform/app/api/provisionar/route.ts` reenvía el JSON tal cual; comprobar que no filtra campos y, si los filtra, añadir los dos nuevos.

- [ ] **Step 3: Mostrarlo en el panel**

Tras un alta correcta, `/clientes/nuevo` muestra una tarjeta con:

- el enlace en un campo de solo lectura y un botón **Copiar**;
- una línea de estado: "También se le envió por correo a ana@…" o, si `correo_enviado` es falso, "**El correo no salió.** Mándale el enlace tú.";
- el aviso de que caduca: "Caduca en 24 horas. Si expira, genera otro desde la ficha del cliente."

- [ ] **Step 4: Verificar en el navegador**

Dar de alta un tenant de prueba en local y comprobar que el enlace aparece, se copia, y que abrirlo lleva a `/establecer-acceso`.

- [ ] **Step 5: Confirmar**

```bash
pnpm --filter @vim/platform typecheck && pnpm test:functions
git add supabase/functions/provisionar-tenant apps/platform
git commit -m "feat(platform): el enlace de invitacion se muestra copiable, no solo por correo

El correo depende del SMTP del proyecto Supabase y los clientes de VIM escriben por WhatsApp.
El enlace es el producto; el correo, una comodidad.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Cierre — pruebas, seguridad, documentación y publicación

- [ ] **Step 1: Suite completa**

```bash
pnpm turbo run typecheck && pnpm turbo run test && pnpm test:functions
node --test desktop/src/*.test.mjs && node desktop/src/verify-sync-ciclo.mjs && supabase test db
```

- [ ] **Step 2: Recorrido completo, de verdad**

En local, con un tenant nuevo: alta desde `/platform` → copiar el enlace → establecer contraseña → aterrizar en `/bienvenida` → negocio → importar un menú → crear un cajero → descargar (comprobar la url) → generar código → vincular la caja de desarrollo → abrir turno y cobrar → comprobar que el checklist queda completo y la fase pasa a `GO_LIVE`.

- [ ] **Step 3: Revisión de seguridad**

Invocar `security-review`. Puntos a mirar: que `emitir_codigo_vinculacion` no deje a un empleado emitir para otro tenant; que `consumir_codigo_vinculacion` no distinga fallos ni sea ejecutable por `authenticated`; que el límite por IP no se pueda saltar con una cabecera; que `version_recomendada` no filtre `sha512` ni el estado del bloqueo; y que el redirect a `/bienvenida` no encierre al dueño.

- [ ] **Step 4: Documentación**

`docs/diseno/admin.md`: el checklist como pantalla de aterrizaje y el paso de la caja. `docs/diseno/pos.md`: la vinculación por código. `docs/diseno/platform.md`: el enlace copiable. Y un **ADR nuevo** (`0015-la-caja-se-vincula-con-un-codigo.md`) con la decisión, el porqué de los seis dígitos y los controles que la sostienen.

Actualizar `docs/bitacora/2026-08-analisis-brechas.md`: el onboarding sale de la lista de abierto, con la nota de que sigue siendo por invitación.

- [ ] **Step 5: Publicar**

**Comprobar otra vez el número de migración.** Después:

```bash
supabase db push
supabase functions deploy canjear-vinculacion
supabase functions deploy provisionar-tenant
git push -u origin onboarding-invitado
gh pr create --base main --title "Onboarding por invitacion: del enlace a la primera venta" --body-file <cuerpo>
```

Esperar a que **los tres chequeos terminen** antes de fusionar.

- [ ] **Step 6: Memoria**

`project_onboarding_invitado.md` nuevo, y actualizar `MEMORY.md`: qué queda del Tier 1 después de esto (la puerta pública y el cobro), y la trampa de `signup-tenant` con los planes retirados.

---

## Self-review (hecho al escribir)

- **Cobertura de la spec:** §2.1 enlace copiable → Task 7; §3 checklist como aterrizaje → Tasks 3 y 5; §3.1 pasos y señales → Task 3; §3.2 instalador desde `versiones_caja` → Tasks 1 y 4; §4 vinculación por código → Tasks 1, 2, 4 y 6; §4.3 controles → Tasks 1 y 2; §4.4 escritorio → Task 6; §5 errores → Tasks 4 y 6; §6 pruebas → repartidas; §7 riesgo de `signup-tenant` → Task 8 Step 6 (queda anotado, no se toca).
- **Diferencia con la spec, deliberada:** la spec numeraba `emitir`/`canjear`; aquí la segunda se llama `consumir_codigo_vinculacion` para que el nombre diga que el efecto es consumir, y `canjear-vinculacion` queda como el nombre de la Edge Function.
- **Riesgo principal, escrito y aceptado:** el contador de intentos de `consumir_codigo_vinculacion` sube en TODOS los códigos vivos ante un fallo, porque no se sabe cuál se intentaba adivinar. Efecto secundario: alguien que dispare a ciegas puede quemar el código de un dueño que está vinculando en ese momento. Se acepta porque el dueño genera otro con un clic, y la alternativa —contar solo contra el código acertado— haría el límite inútil.
- **Consistencia de nombres:** `evaluarPasos` y `SenalesOnboarding` se definen en la Task 3 y se usan en las Tasks 3 y 4; `emitirCodigoVinculacion` se define en la Task 4 Step 1 y se usa en los Steps 2 y 3; `darDeAltaConCodigo` se define en la Task 6 Step 3 y la consume el Step 4; `consumir_codigo_vinculacion` se define en la Task 1 y la llama la Task 2.
- **Orden obligatorio:** la migración (Task 1) va antes que la Edge Function (Task 2), y las dos antes que la pantalla (Task 4). Publicar la función antes que la migración dejaría el canje llamando a un RPC que no existe.
