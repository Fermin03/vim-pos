# Delivery F1b — Conectar tienda de Uber Eats desde el admin — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el dueño conecte su tienda de Uber Eats a una sucursal desde `/configuracion/integraciones` (OAuth → elegir sucursal → activar), y pueda pausar, comprobar y desconectar.

**Architecture:** El admin manda al dueño a autorizar en Uber y recibe el `code` en un callback; la Edge Function `delivery-uber-conexion` (JWT del admin, jerarquía ≥ 4) canjea el code, guarda el token del dueño en `delivery_autorizaciones` (deny-all), lista sus tiendas y activa la integración con `POST /pos_data`, creando la fila de `delivery_conexiones`. La lógica pura vive en `_shared/delivery/uber-activacion.ts`; el cliente HTTP en `_shared/delivery/uber.ts` se amplía con las llamadas de activación.

**Tech Stack:** Postgres/Supabase (migración + pgTAP), Deno Edge Function (probada con `node --test --experimental-strip-types`), Next 15 / React 19 en `apps/admin` (vitest), Tailwind con tokens del núcleo.

**Spec:** `docs/superpowers/specs/2026-09-02-delivery-f1b-conectar-uber-design.md`

## Global Constraints

- RLS sagrado: la tabla nueva lleva `tenant_id`, RLS activo y **sin políticas** (solo service_role). El admin nunca usa `service_role`.
- Español en el dominio, `snake_case` en SQL, `kebab-case` en archivos, `PascalCase` en componentes. Sin `any`.
- Migración aditiva `0092`; después `pnpm db:types`.
- Callback: `https://admin.vimpos.com.mx/configuracion/integraciones/uber/callback` (dev: `http://localhost:3001/configuracion/integraciones/uber/callback`).
- Solo jerarquía ≥ 4 (Administrador, Dueño) conecta/pausa/desconecta. Una tienda de Uber por sucursal.
- El client secret de Uber nunca sale de Supabase. `NEXT_PUBLIC_UBER_CLIENT_ID` sí es público.
- Cuerpo de `POST /pos_data`: `integrator_store_id = uuid de la sucursal`, `integrator_brand_id = "vimpos"`, `is_order_manager = true`, `require_manual_acceptance = !autoAceptar`, `allowed_customer_requests = { allow_special_instruction_requests: true, allow_single_use_items_requests: false }`, `webhooks_config = { webhooks_version: "1.0.0", order_release_webhooks: { is_enabled: false }, schedule_order_webhooks: { is_enabled: true }, delivery_status_webhooks: { is_enabled: true } }`.
- Comandos: pgTAP `supabase test db`; funciones `pnpm test:functions`; admin `pnpm --filter admin test` y `pnpm --filter admin typecheck` (si el filtro no existe, `cd apps/admin && pnpm vitest run` / `pnpm tsc --noEmit`). Nunca `next build` con el dev server arriba.
- Rama de trabajo: `delivery-f1b-uber-conexion` desde `main`.

---

### Task 1: Migración `0092_delivery_autorizaciones` + pgTAP

**Files:**
- Create: `supabase/migrations/0092_delivery_autorizaciones.sql`
- Create: `supabase/tests/0005_delivery_autorizaciones.test.sql`
- Modify: `packages/db/src/database.types.ts` (regenerado)

**Interfaces:**
- Produces: tabla `delivery_autorizaciones(id, tenant_id, app, entorno, access_token, vence_at, creado_por, created_at)` con `UNIQUE (tenant_id, app, entorno)`; solo `service_role`.

- [ ] **Step 1: Crear la rama**

```bash
git checkout -b delivery-f1b-uber-conexion main
```

- [ ] **Step 2: Escribir la prueba pgTAP (falla porque la tabla no existe)**

```sql
-- supabase/tests/0005_delivery_autorizaciones.test.sql
-- Token temporal del dueño para activar tiendas (spec F1b). Deny-all para authenticated.
begin;
select plan(4);

select has_table('delivery_autorizaciones');

insert into tenants (id, codigo, nombre_comercial, vertical_principal)
values ('cccccccc-0000-0000-0000-00000000000c', 'rls-autoriz-c', 'Tenant C', 'QUICK_SERVICE')
on conflict (id) do nothing;

-- Como service_role (postgres) sí se escribe.
insert into delivery_autorizaciones (tenant_id, app, entorno, access_token, vence_at, creado_por)
values ('cccccccc-0000-0000-0000-00000000000c', 'APP_UBEREATS', 'sandbox', 'tok', now() + interval '1 day',
        '99999999-0000-0000-0000-000000000001');
select results_eq(
  $$ select count(*)::int from delivery_autorizaciones where tenant_id = 'cccccccc-0000-0000-0000-00000000000c' $$,
  $$ values (1) $$, 'service_role escribe y lee');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-000000000001',
                    'tenant_id', 'cccccccc-0000-0000-0000-00000000000c',
                    'role', 'authenticated')::text, true);

select throws_ok($$ select 1 from delivery_autorizaciones $$, '42501', NULL,
  'authenticated no lee autorizaciones ni de su propio tenant');
select throws_ok(
  $$ insert into delivery_autorizaciones (tenant_id, app, entorno, access_token, vence_at, creado_por)
     values ('cccccccc-0000-0000-0000-00000000000c', 'APP_UBEREATS', 'sandbox', 'x', now(), '99999999-0000-0000-0000-000000000001') $$,
  '42501', NULL, 'authenticated no escribe autorizaciones');

select * from finish();
rollback;
```

- [ ] **Step 3: Correr y ver que falla**

Run: `supabase test db 2>&1 | tail -15`
Expected: `0005_delivery_autorizaciones` falla en `has_table`.

- [ ] **Step 4: Escribir la migración**

```sql
-- supabase/migrations/0092_delivery_autorizaciones.sql
-- ============================================================================
-- 0092 — Token temporal del dueño para activar tiendas de apps (spec F1b, ADR 0011).
-- El dueño autoriza a VIM con OAuth (scope eats.pos_provisioning en Uber); el token resultante
-- solo sirve para listar sus tiendas y asociarlas. Vive aquí mientras dura el asistente y lo usa
-- únicamente la Edge Function delivery-uber-conexion (service_role). Nadie más lo lee.
-- ============================================================================
CREATE TABLE delivery_autorizaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app           modo_servicio NOT NULL CHECK (app IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI')),
  entorno       text NOT NULL CHECK (entorno IN ('sandbox', 'produccion')),
  access_token  text NOT NULL,
  vence_at      timestamptz NOT NULL,
  creado_por    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, app, entorno)
);
COMMENT ON TABLE delivery_autorizaciones IS
  'Token OAuth del dueño para activar tiendas de apps de delivery. Temporal; solo service_role.';

ALTER TABLE delivery_autorizaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON delivery_autorizaciones FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_autorizaciones TO service_role;
```

- [ ] **Step 5: Aplicar en local y correr pgTAP**

Run: `supabase db reset 2>&1 | tail -3 && supabase test db 2>&1 | tail -15`
Expected: los 5 archivos de pruebas en `PASS` (0001–0005).

- [ ] **Step 6: Regenerar tipos**

Run: `pnpm db:types && git diff --stat packages/db/src/database.types.ts`
Expected: el diff muestra `delivery_autorizaciones`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0092_delivery_autorizaciones.sql supabase/tests/0005_delivery_autorizaciones.test.sql packages/db/src/database.types.ts
git commit -m "feat(delivery): tabla delivery_autorizaciones (token temporal del dueño, solo service_role)"
```

---

### Task 2: Módulo puro `uber-activacion.ts`

**Files:**
- Create: `supabase/functions/_shared/delivery/uber-activacion.ts`
- Test: `supabase/functions/_shared/delivery/uber-activacion.test.ts`

**Interfaces:**
- Produces:
  - `urlAutorizacionUber(cfg: { entorno: "sandbox" | "produccion"; clientId: string; redirectUri: string; state: string }): string`
  - `type TiendaUber = { id: string; nombre: string; direccion: string; ciudad: string }`
  - `normalizarTiendasUber(respuesta: unknown): TiendaUber[]` (lee `stores[]`)
  - `cuerpoPosData(cfg: { sucursalId: string; autoAceptar: boolean }): Record<string, unknown>`
  - `type EstadoConexion = "SIN_CONECTAR" | "PENDIENTE" | "ACTIVA" | "PAUSADA" | "ERROR" | "DESCONECTADA"`
  - `type AccionConexion = "activar" | "pausar" | "reanudar" | "desconectar"`
  - `transicionConexion(actual: EstadoConexion | null, accion: AccionConexion): EstadoConexion` (lanza `Error("TRANSICION_INVALIDA:<actual>:<accion>")`)

- [ ] **Step 1: Escribir las pruebas**

```ts
// supabase/functions/_shared/delivery/uber-activacion.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { urlAutorizacionUber, normalizarTiendasUber, cuerpoPosData, transicionConexion } from "./uber-activacion.ts";

test("urlAutorizacionUber: sandbox y producción usan su dominio y llevan state y scope", () => {
  const u = new URL(urlAutorizacionUber({ entorno: "sandbox", clientId: "cid", redirectUri: "http://localhost:3001/cb", state: "abc" }));
  assert.equal(u.origin, "https://sandbox-login.uber.com");
  assert.equal(u.pathname, "/oauth/v2/authorize");
  assert.equal(u.searchParams.get("client_id"), "cid");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("redirect_uri"), "http://localhost:3001/cb");
  assert.equal(u.searchParams.get("scope"), "eats.pos_provisioning");
  assert.equal(u.searchParams.get("state"), "abc");
  const p = new URL(urlAutorizacionUber({ entorno: "produccion", clientId: "cid", redirectUri: "https://admin.vimpos.com.mx/cb", state: "s" }));
  assert.equal(p.origin, "https://auth.uber.com");
});

test("normalizarTiendasUber: toma id, nombre y dirección; tolera campos faltantes", () => {
  const t = normalizarTiendasUber({ stores: [
    { id: "s1", name: "KOB Centro", location: { street_address_line_one: "Madero 12", unit_number: "L-3", city: "León" } },
    { id: "s2" },
    { name: "sin id" },
  ] });
  assert.deepEqual(t, [
    { id: "s1", nombre: "KOB Centro", direccion: "Madero 12, L-3", ciudad: "León" },
    { id: "s2", nombre: "s2", direccion: "", ciudad: "" },
  ]);
  assert.deepEqual(normalizarTiendasUber(null), []);
});

test("cuerpoPosData: el JSON exacto que espera POST /pos_data", () => {
  assert.deepEqual(cuerpoPosData({ sucursalId: "suc-1", autoAceptar: true }), {
    integrator_store_id: "suc-1",
    integrator_brand_id: "vimpos",
    is_order_manager: true,
    require_manual_acceptance: false,
    allowed_customer_requests: { allow_special_instruction_requests: true, allow_single_use_items_requests: false },
    webhooks_config: {
      webhooks_version: "1.0.0",
      order_release_webhooks: { is_enabled: false },
      schedule_order_webhooks: { is_enabled: true },
      delivery_status_webhooks: { is_enabled: true },
    },
  });
  assert.equal(cuerpoPosData({ sucursalId: "s", autoAceptar: false }).require_manual_acceptance, true);
});

test("transicionConexion: tabla de estados", () => {
  assert.equal(transicionConexion(null, "activar"), "ACTIVA");
  assert.equal(transicionConexion("SIN_CONECTAR", "activar"), "ACTIVA");
  assert.equal(transicionConexion("DESCONECTADA", "activar"), "ACTIVA");
  assert.equal(transicionConexion("ERROR", "activar"), "ACTIVA");
  assert.throws(() => transicionConexion("ACTIVA", "activar"), /TRANSICION_INVALIDA:ACTIVA:activar/);
  assert.equal(transicionConexion("ACTIVA", "pausar"), "PAUSADA");
  assert.throws(() => transicionConexion("PAUSADA", "pausar"), /TRANSICION_INVALIDA/);
  assert.equal(transicionConexion("PAUSADA", "reanudar"), "ACTIVA");
  assert.throws(() => transicionConexion("ACTIVA", "reanudar"), /TRANSICION_INVALIDA/);
  for (const e of ["ACTIVA", "PAUSADA", "ERROR"] as const) assert.equal(transicionConexion(e, "desconectar"), "DESCONECTADA");
  assert.throws(() => transicionConexion("DESCONECTADA", "desconectar"), /TRANSICION_INVALIDA/);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test --experimental-strip-types supabase/functions/_shared/delivery/uber-activacion.test.ts`
Expected: falla al importar `./uber-activacion.ts`.

- [ ] **Step 3: Implementar**

```ts
// supabase/functions/_shared/delivery/uber-activacion.ts
// Lógica pura de la activación de tiendas de Uber (spec F1b). Sin I/O: se prueba con node --test.
// Doc: docs/integraciones/delivery/03-uber-eats-resumen.md §3-4.

const AUTH = { sandbox: "https://sandbox-login.uber.com", produccion: "https://auth.uber.com" } as const;

export function urlAutorizacionUber(cfg: { entorno: "sandbox" | "produccion"; clientId: string; redirectUri: string; state: string }): string {
  const u = new URL("/oauth/v2/authorize", AUTH[cfg.entorno]);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("scope", "eats.pos_provisioning");
  u.searchParams.set("state", cfg.state);
  return u.toString();
}

export type TiendaUber = { id: string; nombre: string; direccion: string; ciudad: string };

type Dict = Record<string, unknown>;
const obj = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Respuesta de GET /v1/delivery/stores → lista plana. Las tiendas sin id se descartan. */
export function normalizarTiendasUber(respuesta: unknown): TiendaUber[] {
  const stores = obj(respuesta).stores;
  if (!Array.isArray(stores)) return [];
  const out: TiendaUber[] = [];
  for (const s of stores) {
    const t = obj(s);
    const id = str(t.id);
    if (!id) continue;
    const loc = obj(t.location);
    const direccion = [str(loc.street_address_line_one), str(loc.unit_number)].filter((x) => x !== "").join(", ");
    out.push({ id, nombre: str(t.name) || id, direccion, ciudad: str(loc.city) });
  }
  return out;
}

/** Cuerpo de POST /v1/eats/stores/{id}/pos_data. integrator_store_id = uuid de la sucursal en VIM. */
export function cuerpoPosData(cfg: { sucursalId: string; autoAceptar: boolean }): Record<string, unknown> {
  return {
    integrator_store_id: cfg.sucursalId,
    integrator_brand_id: "vimpos",
    is_order_manager: true,
    require_manual_acceptance: !cfg.autoAceptar,
    allowed_customer_requests: { allow_special_instruction_requests: true, allow_single_use_items_requests: false },
    webhooks_config: {
      webhooks_version: "1.0.0",
      order_release_webhooks: { is_enabled: false },
      schedule_order_webhooks: { is_enabled: true },
      delivery_status_webhooks: { is_enabled: true },
    },
  };
}

export type EstadoConexion = "SIN_CONECTAR" | "PENDIENTE" | "ACTIVA" | "PAUSADA" | "ERROR" | "DESCONECTADA";
export type AccionConexion = "activar" | "pausar" | "reanudar" | "desconectar";

const DESDE: Record<AccionConexion, { desde: (EstadoConexion | null)[]; a: EstadoConexion }> = {
  activar: { desde: [null, "SIN_CONECTAR", "DESCONECTADA", "ERROR"], a: "ACTIVA" },
  pausar: { desde: ["ACTIVA"], a: "PAUSADA" },
  reanudar: { desde: ["PAUSADA"], a: "ACTIVA" },
  desconectar: { desde: ["ACTIVA", "PAUSADA", "ERROR"], a: "DESCONECTADA" },
};

export function transicionConexion(actual: EstadoConexion | null, accion: AccionConexion): EstadoConexion {
  const regla = DESDE[accion];
  if (!regla.desde.includes(actual)) throw new Error(`TRANSICION_INVALIDA:${actual ?? "null"}:${accion}`);
  return regla.a;
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `node --test --experimental-strip-types supabase/functions/_shared/delivery/uber-activacion.test.ts`
Expected: 4 pass. (El script `test:functions` del `package.json` raíz ya incluye `supabase/functions/_shared/delivery/*.test.ts`, así que `pnpm test:functions` también lo corre.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/delivery/uber-activacion.ts supabase/functions/_shared/delivery/uber-activacion.test.ts
git commit -m "feat(delivery): lógica pura de activación de tiendas Uber (url OAuth, tiendas, pos_data, transiciones)"
```

---

### Task 3: Ampliar el cliente `uber.ts` con las llamadas de activación

**Files:**
- Modify: `supabase/functions/_shared/delivery/uber.ts` (tipo `ClienteUber` y `crearClienteUber`)
- Test: `supabase/functions/_shared/delivery/uber.test.ts` (añadir al final)

**Interfaces:**
- Consumes: nada nuevo.
- Produces, en `ClienteUber`:
  - `canjearCodigo(code: string, redirectUri: string): Promise<{ accessToken: string; venceAt: Date }>`
  - `listarTiendas(tokenDueno: string): Promise<unknown[]>` (concatena `stores` de todas las páginas; devuelve los objetos crudos)
  - `posData(tiendaId: string): { crear(tokenDueno: string, cuerpo: unknown): Promise<void>; actualizar(cuerpo: unknown): Promise<void>; leer(): Promise<unknown>; borrar(): Promise<void> }`
  - `estadoTienda(tiendaId: string): Promise<unknown>`

- [ ] **Step 1: Añadir pruebas**

```ts
// al final de supabase/functions/_shared/delivery/uber.test.ts
function fetchGrabador(respuestas: (url: string, init: RequestInit) => Response) {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const fetchFn: typeof fetch = async (url, init) => { const i = init ?? {}; llamadas.push({ url: String(url), init: i }); return respuestas(String(url), i); };
  return { fetchFn, llamadas };
}

test("canjearCodigo: grant authorization_code contra el dominio de auth, con redirect_uri", async () => {
  const { fetchFn, llamadas } = fetchGrabador(() => new Response(JSON.stringify({ access_token: "USER", expires_in: 2592000 }), { status: 200 }));
  const c = crearClienteUber({ entorno: "sandbox", clientId: "i", clientSecret: "s", fetchFn });
  const r = await c.canjearCodigo("CODE1", "http://localhost:3001/cb");
  assert.equal(r.accessToken, "USER");
  assert.ok(r.venceAt.getTime() > Date.now() + 29 * 86_400_000);
  assert.equal(llamadas[0].url, "https://sandbox-login.uber.com/oauth/v2/token");
  const body = llamadas[0].init.body as URLSearchParams;
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "CODE1");
  assert.equal(body.get("redirect_uri"), "http://localhost:3001/cb");
  assert.equal(body.get("client_secret"), "s");
});

test("canjearCodigo: error de Uber se reporta como UBER_CANJE_<status>", async () => {
  const { fetchFn } = fetchGrabador(() => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
  const c = crearClienteUber({ entorno: "sandbox", clientId: "i", clientSecret: "s", fetchFn });
  await assert.rejects(() => c.canjearCodigo("x", "u"), /UBER_CANJE_400/);
});

test("listarTiendas: usa el token del dueño y sigue next_page_token", async () => {
  const { fetchFn, llamadas } = fetchGrabador((url) =>
    url.includes("next_page_token=p2")
      ? new Response(JSON.stringify({ stores: [{ id: "s2" }], pagination_data: {} }), { status: 200 })
      : new Response(JSON.stringify({ stores: [{ id: "s1" }], pagination_data: { next_page_token: "p2" } }), { status: 200 }));
  const c = crearClienteUber({ entorno: "sandbox", clientId: "i", clientSecret: "s", fetchFn });
  const t = await c.listarTiendas("USER");
  assert.deepEqual(t.map((x) => (x as { id: string }).id), ["s1", "s2"]);
  assert.equal(llamadas.length, 2, "no pidió token de aplicación");
  assert.equal((llamadas[0].init.headers as Record<string, string>).Authorization, "Bearer USER");
  assert.ok(llamadas[0].url.startsWith("https://test-api.uber.com/v1/delivery/stores"));
});

test("posData: crear va con token del dueño; leer/actualizar/borrar con token de aplicación", async () => {
  const { fetchFn, llamadas } = fetchGrabador((url) =>
    url.endsWith("/token") ? new Response(JSON.stringify({ access_token: "APP", expires_in: 2592000 }), { status: 200 })
      : new Response(JSON.stringify({ integration_enabled: true }), { status: 200 }));
  const c = crearClienteUber({ entorno: "sandbox", clientId: "i", clientSecret: "s", fetchFn });
  const pd = c.posData("st-1");
  await pd.crear("USER", { integrator_store_id: "suc" });
  assert.equal(llamadas[0].url, "https://test-api.uber.com/v1/eats/stores/st-1/pos_data");
  assert.equal(llamadas[0].init.method, "POST");
  assert.equal((llamadas[0].init.headers as Record<string, string>).Authorization, "Bearer USER");
  const leido = await pd.leer();
  assert.equal(llamadas[1].url, "https://sandbox-login.uber.com/oauth/v2/token");
  assert.equal(llamadas[2].init.method, "GET");
  assert.equal((llamadas[2].init.headers as Record<string, string>).Authorization, "Bearer APP");
  assert.deepEqual(leido, { integration_enabled: true });
  await pd.actualizar({ integration_enabled: false });
  assert.equal(llamadas[3].init.method, "PATCH");
  await pd.borrar();
  assert.equal(llamadas[4].init.method, "DELETE");
  await c.estadoTienda("st-1");
  assert.equal(llamadas[5].url, "https://test-api.uber.com/v1/delivery/store/st-1/status");
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test --experimental-strip-types supabase/functions/_shared/delivery/uber.test.ts 2>&1 | tail -20`
Expected: las 4 pruebas nuevas fallan (`canjearCodigo is not a function`, etc.).

- [ ] **Step 3: Implementar en `uber.ts`**

Sustituir el tipo `ClienteUber` y el `return` de `crearClienteUber` por:

```ts
export type PosDataUber = {
  crear(tokenDueno: string, cuerpo: unknown): Promise<void>;
  actualizar(cuerpo: unknown): Promise<void>;
  leer(): Promise<unknown>;
  borrar(): Promise<void>;
};

export type ClienteUber = {
  obtenerToken(): Promise<string>;
  obtenerOrden(id: string): Promise<unknown>;
  aceptar(id: string, readyTime: string, folio: string): Promise<void>;
  rechazar(id: string, cuerpo: unknown): Promise<void>;
  marcarLista(id: string): Promise<void>;
  canjearCodigo(code: string, redirectUri: string): Promise<{ accessToken: string; venceAt: Date }>;
  listarTiendas(tokenDueno: string): Promise<unknown[]>;
  posData(tiendaId: string): PosDataUber;
  estadoTienda(tiendaId: string): Promise<unknown>;
};
```

y, dentro de `crearClienteUber`, generalizar `llamar` para aceptar un token explícito y más métodos:

```ts
  type Metodo = "GET" | "POST" | "PATCH" | "DELETE";
  const llamar = async (metodo: Metodo, ruta: string, cuerpo?: unknown, tokenExplicito?: string): Promise<Response> => {
    const token = tokenExplicito ?? await obtenerToken();
    const r = await f(`${dom.api}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    if (r.status === 409) throw new Error(`YA_PROCESADA:${ruta}`);
    if (!r.ok) throw new Error(`UBER_HTTP_${r.status}:${ruta}:${(await r.text()).slice(0, 300)}`);
    return r;
  };

  const canjearCodigo = async (code: string, redirectUri: string) => {
    const body = new URLSearchParams({
      client_id: cfg.clientId, client_secret: cfg.clientSecret,
      grant_type: "authorization_code", code, redirect_uri: redirectUri,
    });
    const r = await f(`${dom.auth}/oauth/v2/token`, { method: "POST", body });
    if (!r.ok) throw new Error(`UBER_CANJE_${r.status}:${(await r.text()).slice(0, 300)}`);
    const j = obj(await r.json());
    const accessToken = str(j.access_token);
    if (!accessToken) throw new Error("UBER_CANJE_SIN_ACCESS_TOKEN");
    return { accessToken, venceAt: new Date(Date.now() + Math.max(60, num(j.expires_in)) * 1000) };
  };

  const listarTiendas = async (tokenDueno: string): Promise<unknown[]> => {
    const todas: unknown[] = [];
    let pagina: string | null = null;
    for (let i = 0; i < 20; i++) {
      const q = pagina ? `?page_size=50&next_page_token=${encodeURIComponent(pagina)}` : "?page_size=50";
      const j = obj(await (await llamar("GET", `/v1/delivery/stores${q}`, undefined, tokenDueno)).json());
      todas.push(...arr(j.stores));
      pagina = str(obj(j.pagination_data).next_page_token);
      if (!pagina) break;
    }
    return todas;
  };

  const posData = (tiendaId: string): PosDataUber => {
    const ruta = `/v1/eats/stores/${encodeURIComponent(tiendaId)}/pos_data`;
    return {
      crear: async (tokenDueno, cuerpo) => { await llamar("POST", ruta, cuerpo, tokenDueno); },
      actualizar: async (cuerpo) => { await llamar("PATCH", ruta, cuerpo); },
      leer: async () => (await llamar("GET", ruta)).json(),
      borrar: async () => { await llamar("DELETE", ruta); },
    };
  };

  return {
    obtenerToken,
    obtenerOrden: async (id) => (await llamar("GET", `/v1/delivery/order/${encodeURIComponent(id)}?expand=carts,deliveries,payment`)).json(),
    aceptar: async (id, readyTime, folio) => {
      await llamar("POST", `/v1/delivery/order/${encodeURIComponent(id)}/accept`, { ready_for_pickup_time: readyTime, external_reference_id: folio });
    },
    rechazar: async (id, cuerpo) => { await llamar("POST", `/v1/delivery/order/${encodeURIComponent(id)}/deny`, cuerpo); },
    marcarLista: async (id) => { await llamar("POST", `/v1/delivery/order/${encodeURIComponent(id)}/ready`, {}); },
    canjearCodigo,
    listarTiendas,
    posData,
    estadoTienda: async (tiendaId) => (await llamar("GET", `/v1/delivery/store/${encodeURIComponent(tiendaId)}/status`)).json(),
  };
```

- [ ] **Step 4: Correr todas las pruebas de funciones**

Run: `pnpm test:functions 2>&1 | tail -8`
Expected: todas pass (49 previas + 4 de Task 2 + 4 nuevas = 57). Las pruebas de `procesar-uber.test.ts` que construyen un `ClienteUber` falso pueden fallar por tipo si el objeto literal no tiene los métodos nuevos: si pasa, añadir `canjearCodigo`, `listarTiendas`, `posData`, `estadoTienda` como `async () => { throw new Error("no usado"); }` (y `posData: () => { throw ... }`) en ese fake.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/delivery/uber.ts supabase/functions/_shared/delivery/uber.test.ts supabase/functions/_shared/delivery/procesar-uber.test.ts
git commit -m "feat(delivery): cliente Uber con canje de código, tiendas del dueño y pos_data"
```

---

### Task 4: Edge Function `delivery-uber-conexion`

**Files:**
- Create: `supabase/functions/delivery-uber-conexion/index.ts`
- Modify: `supabase/functions/README.md` (sección nueva)
- Modify: `supabase/functions/.env.delivery.local` (añadir `UBER_REDIRECT_URI`; archivo git-ignored, solo local)

**Interfaces:**
- Consumes: Task 2 (`normalizarTiendasUber`, `cuerpoPosData`, `transicionConexion`), Task 3 (`ClienteUber`), tabla de Task 1.
- Produces: `POST /functions/v1/delivery-uber-conexion` con `Authorization: Bearer <JWT admin>` y cuerpo `{ accion, ... }`. Respuestas y códigos de error exactamente los del spec (`intercambiar`, `tiendas`, `activar`, `pausar`, `reanudar`, `desconectar`, `verificar`).

- [ ] **Step 1: Escribir la función**

```ts
// supabase/functions/delivery-uber-conexion/index.ts
// Conectar/pausar/desconectar tiendas de Uber Eats desde el admin (spec F1b, ADR 0011).
// El dueño autoriza en Uber; aquí se canjea el code (el client secret nunca sale de Supabase),
// se listan sus tiendas y se activa la integración con integrator_store_id = uuid de la sucursal.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { crearClienteUber } from "../_shared/delivery/uber.ts";
import { cuerpoPosData, normalizarTiendasUber, transicionConexion, type EstadoConexion } from "../_shared/delivery/uber-activacion.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const ENTORNO = (Deno.env.get("UBER_ENTORNO") ?? "sandbox") === "produccion" ? "produccion" : "sandbox";
const REDIRECT_URI = Deno.env.get("UBER_REDIRECT_URI") ?? "";
const uber = crearClienteUber({
  entorno: ENTORNO,
  clientId: Deno.env.get("UBER_CLIENT_ID") ?? "",
  clientSecret: Deno.env.get("UBER_CLIENT_SECRET") ?? "",
  tokenCache: {
    leer: async () => {
      const { data } = await admin.from("delivery_credenciales_app").select("access_token, vence_at")
        .eq("app", "APP_UBEREATS").eq("entorno", ENTORNO).maybeSingle();
      const f = data as { access_token: string; vence_at: string } | null;
      return f && new Date(f.vence_at) > new Date() ? f.access_token : null;
    },
    guardar: async (token, venceAt) => {
      await admin.from("delivery_credenciales_app").upsert({
        app: "APP_UBEREATS", entorno: ENTORNO, access_token: token,
        vence_at: venceAt.toISOString(), updated_at: new Date().toISOString(),
      });
    },
  },
});

type Cuerpo = {
  accion?: string; code?: string; tienda_id?: string; sucursal_id?: string; conexion_id?: string;
  auto_aceptar?: boolean; tiempo_prep_min?: number; terminos_aceptados?: boolean;
};
type Conexion = {
  id: string; tenant_id: string; sucursal_id: string; estado: EstadoConexion;
  tienda_id_externo: string | null; tienda_nombre_app: string | null; config: Record<string, unknown>;
};
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const JERARQUIA_MINIMA = 4;

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  // 1) JWT del admin → tenant y jerarquía del rol.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: userResp, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);
  const usuarioId = userResp.user.id;
  const { data: acceso } = await admin.from("usuarios_acceso").select("tenant_id, rol:roles(jerarquia)")
    .eq("usuario_id", usuarioId).eq("activo", true).limit(1).maybeSingle();
  if (!acceso) return json({ error: "SIN_TENANT" }, 403);
  const tenantId = (acceso as { tenant_id: string }).tenant_id;
  const jerarquia = Number((acceso as { rol?: { jerarquia?: number } | { jerarquia?: number }[] }).rol && (Array.isArray((acceso as { rol: unknown }).rol)
    ? ((acceso as { rol: { jerarquia?: number }[] }).rol[0]?.jerarquia ?? 0)
    : ((acceso as { rol: { jerarquia?: number } }).rol.jerarquia ?? 0)));
  if (jerarquia < JERARQUIA_MINIMA) return json({ error: "SIN_PERMISO" }, 403);

  let body: Cuerpo;
  try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
  if (!body.accion) return json({ error: "FALTAN_CAMPOS" }, 400);

  const registrar = async (tipo: string, ok: boolean, detalle: unknown, conexionId: string | null, tiendaId: string | null, httpStatus = 200) => {
    await admin.from("delivery_eventos").insert({
      tenant_id: tenantId, conexion_id: conexionId, app: "APP_UBEREATS", direccion: "SALIDA", tipo,
      id_externo: tiendaId, procesado: ok, respuesta: ok ? detalle : null, error: ok ? null : String(detalle),
      http_status: ok ? httpStatus : null,
    });
  };

  const leerAutorizacion = async (): Promise<string | null> => {
    const { data } = await admin.from("delivery_autorizaciones").select("access_token, vence_at")
      .eq("tenant_id", tenantId).eq("app", "APP_UBEREATS").eq("entorno", ENTORNO).maybeSingle();
    const f = data as { access_token: string; vence_at: string } | null;
    return f && new Date(f.vence_at) > new Date() ? f.access_token : null;
  };

  const tiendasConEstado = async (tokenDueno: string) => {
    const tiendas = normalizarTiendasUber({ stores: await uber.listarTiendas(tokenDueno) });
    const { data: cxs } = await admin.from("delivery_conexiones")
      .select("tienda_id_externo, sucursal_id, estado, sucursal:sucursales(nombre)")
      .eq("tenant_id", tenantId).eq("app", "APP_UBEREATS").in("estado", ["ACTIVA", "PAUSADA", "ERROR"]);
    const porTienda = new Map<string, { sucursal_id: string; sucursal_nombre: string }>();
    for (const c of (cxs ?? []) as unknown as { tienda_id_externo: string | null; sucursal_id: string; sucursal: { nombre: string } | { nombre: string }[] | null }[]) {
      if (!c.tienda_id_externo) continue;
      const s = Array.isArray(c.sucursal) ? c.sucursal[0] : c.sucursal;
      porTienda.set(c.tienda_id_externo, { sucursal_id: c.sucursal_id, sucursal_nombre: s?.nombre ?? "" });
    }
    return tiendas.map((t) => ({ ...t, conectada_a: porTienda.get(t.id) ?? null }));
  };

  const conexionDelTenant = async (id: string | undefined): Promise<Conexion | null> => {
    if (!id) return null;
    const { data } = await admin.from("delivery_conexiones")
      .select("id, tenant_id, sucursal_id, estado, tienda_id_externo, tienda_nombre_app, config").eq("id", id).maybeSingle();
    const c = data as Conexion | null;
    return c && c.tenant_id === tenantId ? c : null;
  };

  try {
    switch (body.accion) {
      case "intercambiar": {
        if (!body.code) return json({ error: "FALTAN_CAMPOS" }, 400);
        if (!REDIRECT_URI) return json({ error: "UBER_ERROR", detalle: "UBER_REDIRECT_URI no configurado" }, 502);
        let canje: { accessToken: string; venceAt: Date };
        try { canje = await uber.canjearCodigo(body.code, REDIRECT_URI); }
        catch (e) { await registrar("oauth_canje", false, msg(e), null, null); return json({ error: "UBER_ERROR", detalle: msg(e) }, 502); }
        await admin.from("delivery_autorizaciones").upsert({
          tenant_id: tenantId, app: "APP_UBEREATS", entorno: ENTORNO, access_token: canje.accessToken,
          vence_at: canje.venceAt.toISOString(), creado_por: usuarioId, created_at: new Date().toISOString(),
        }, { onConflict: "tenant_id,app,entorno" });
        const tiendas = await tiendasConEstado(canje.accessToken);
        await registrar("oauth_canje", true, { tiendas: tiendas.length }, null, null);
        return json({ tiendas });
      }
      case "tiendas": {
        const tok = await leerAutorizacion();
        if (!tok) return json({ error: "SIN_AUTORIZACION" }, 409);
        return json({ tiendas: await tiendasConEstado(tok) });
      }
      case "activar": {
        if (!body.tienda_id || !body.sucursal_id) return json({ error: "FALTAN_CAMPOS" }, 400);
        if (body.terminos_aceptados !== true) return json({ error: "TERMINOS_NO_ACEPTADOS" }, 400);
        const tok = await leerAutorizacion();
        if (!tok) return json({ error: "SIN_AUTORIZACION" }, 409);
        const { data: suc } = await admin.from("sucursales").select("id, tenant_id, nombre").eq("id", body.sucursal_id).is("deleted_at", null).maybeSingle();
        const sucursal = suc as { id: string; tenant_id: string; nombre: string } | null;
        if (!sucursal || sucursal.tenant_id !== tenantId) return json({ error: "SUCURSAL_NO_EXISTE" }, 404);
        const { data: existente } = await admin.from("delivery_conexiones").select("id, estado, tienda_id_externo")
          .eq("sucursal_id", sucursal.id).eq("app", "APP_UBEREATS").maybeSingle();
        const cx = existente as { id: string; estado: EstadoConexion; tienda_id_externo: string | null } | null;
        let nuevoEstado: EstadoConexion;
        try { nuevoEstado = transicionConexion(cx?.estado ?? null, "activar"); }
        catch { return json({ error: "SUCURSAL_YA_CONECTADA", estado: cx?.estado }, 409); }
        const { data: otra } = await admin.from("delivery_conexiones").select("id").eq("app", "APP_UBEREATS")
          .eq("tienda_id_externo", body.tienda_id).in("estado", ["ACTIVA", "PAUSADA", "ERROR"]).neq("sucursal_id", sucursal.id).limit(1);
        if ((otra ?? []).length > 0) return json({ error: "TIENDA_YA_CONECTADA" }, 409);

        const autoAceptar = body.auto_aceptar !== false;
        const prep = Math.min(180, Math.max(1, Number(body.tiempo_prep_min) || 15));
        const cuerpo = cuerpoPosData({ sucursalId: sucursal.id, autoAceptar });
        try { await uber.posData(body.tienda_id).crear(tok, cuerpo); }
        catch (e) {
          // 409 = ya estaba asociada a nuestra app: se toma como éxito y se sigue.
          if (!msg(e).startsWith("YA_PROCESADA")) { await registrar("pos_data_crear", false, msg(e), cx?.id ?? null, body.tienda_id); return json({ error: "UBER_ERROR", detalle: msg(e) }, 502); }
        }
        const tiendas = normalizarTiendasUber({ stores: await uber.listarTiendas(tok).catch(() => []) });
        const nombre = tiendas.find((t) => t.id === body.tienda_id)?.nombre ?? body.tienda_id;
        const ahora = new Date().toISOString();
        const fila = {
          tenant_id: tenantId, sucursal_id: sucursal.id, app: "APP_UBEREATS", estado: nuevoEstado,
          tienda_id_externo: body.tienda_id, tienda_nombre_app: nombre, auto_aceptar: autoAceptar, tiempo_prep_min: prep,
          conectada_at: ahora, desconectada_at: null, ultimo_error: null, updated_by: usuarioId,
          config: { terminos_aceptados_at: ahora, terminos_aceptados_por: usuarioId, webhooks_version: "1.0.0" },
        };
        const { data: guardada, error: errCx } = cx
          ? await admin.from("delivery_conexiones").update(fila).eq("id", cx.id).select("id").single()
          : await admin.from("delivery_conexiones").insert({ ...fila, created_by: usuarioId }).select("id").single();
        if (errCx) return json({ error: "INTERNO", detalle: errCx.message }, 500);
        const conexionId = (guardada as { id: string }).id;
        await registrar("pos_data_crear", true, cuerpo, conexionId, body.tienda_id);
        return json({ conexion_id: conexionId });
      }
      case "pausar":
      case "reanudar": {
        const cx = await conexionDelTenant(body.conexion_id);
        if (!cx || !cx.tienda_id_externo) return json({ error: "CONEXION_NO_EXISTE" }, 404);
        let nuevo: EstadoConexion;
        try { nuevo = transicionConexion(cx.estado, body.accion); } catch { return json({ error: "ACCION_INVALIDA", estado: cx.estado }, 409); }
        const habilitar = body.accion === "reanudar";
        try { await uber.posData(cx.tienda_id_externo).actualizar({ integration_enabled: habilitar }); }
        catch (e) { await registrar("pos_data_actualizar", false, msg(e), cx.id, cx.tienda_id_externo); return json({ error: "UBER_ERROR", detalle: msg(e) }, 502); }
        await admin.from("delivery_conexiones").update({ estado: nuevo, ultimo_evento_at: new Date().toISOString(), ultimo_error: null, updated_by: usuarioId }).eq("id", cx.id);
        await registrar("pos_data_actualizar", true, { integration_enabled: habilitar }, cx.id, cx.tienda_id_externo);
        return json({ estado: nuevo });
      }
      case "desconectar": {
        const cx = await conexionDelTenant(body.conexion_id);
        if (!cx || !cx.tienda_id_externo) return json({ error: "CONEXION_NO_EXISTE" }, 404);
        let nuevo: EstadoConexion;
        try { nuevo = transicionConexion(cx.estado, "desconectar"); } catch { return json({ error: "ACCION_INVALIDA", estado: cx.estado }, 409); }
        try { await uber.posData(cx.tienda_id_externo).borrar(); }
        catch (e) {
          // 404 = Uber ya no la tiene asociada: desconectada igual.
          if (!msg(e).startsWith("UBER_HTTP_404")) { await registrar("pos_data_borrar", false, msg(e), cx.id, cx.tienda_id_externo); return json({ error: "UBER_ERROR", detalle: msg(e) }, 502); }
        }
        await admin.from("delivery_conexiones").update({ estado: nuevo, desconectada_at: new Date().toISOString(), updated_by: usuarioId }).eq("id", cx.id);
        await registrar("pos_data_borrar", true, {}, cx.id, cx.tienda_id_externo);
        return json({ estado: nuevo });
      }
      case "verificar": {
        const cx = await conexionDelTenant(body.conexion_id);
        if (!cx || !cx.tienda_id_externo) return json({ error: "CONEXION_NO_EXISTE" }, 404);
        let pos: Record<string, unknown> = {};
        let status: Record<string, unknown> = {};
        try {
          pos = (await uber.posData(cx.tienda_id_externo).leer()) as Record<string, unknown>;
          status = (await uber.estadoTienda(cx.tienda_id_externo)) as Record<string, unknown>;
        } catch (e) {
          await admin.from("delivery_conexiones").update({ ultimo_error: msg(e), ultimo_evento_at: new Date().toISOString() }).eq("id", cx.id);
          await registrar("verificar", false, msg(e), cx.id, cx.tienda_id_externo);
          return json({ error: "UBER_ERROR", detalle: msg(e) }, 502);
        }
        const integracionActiva = pos.integration_enabled === true && pos.integrator_store_id === cx.sucursal_id;
        const tiendaOnline = status.status === "ONLINE";
        const detalle = integracionActiva ? null
          : pos.integrator_store_id !== cx.sucursal_id ? `integrator_store_id de Uber (${String(pos.integrator_store_id)}) no es esta sucursal`
          : "La integración está apagada en Uber";
        await admin.from("delivery_conexiones").update({
          ultimo_evento_at: new Date().toISOString(), ultimo_error: detalle,
          estado: integracionActiva ? (cx.estado === "ERROR" ? "ACTIVA" : cx.estado) : "ERROR",
        }).eq("id", cx.id);
        await registrar("verificar", true, { integracionActiva, tiendaOnline, offline_reason: status.offline_reason ?? null }, cx.id, cx.tienda_id_externo);
        return json({ integracion_activa: integracionActiva, tienda_online: tiendaOnline, offline_reason: status.offline_reason ?? null, detalle });
      }
      default:
        return json({ error: "ACCION_DESCONOCIDA" }, 400);
    }
  } catch (e) {
    return json({ error: "INTERNO", detalle: msg(e) }, 500);
  }
});
```

- [ ] **Step 2: Probar en local con credenciales falsas**

Añadir `UBER_REDIRECT_URI=http://localhost:3001/configuracion/integraciones/uber/callback` a `supabase/functions/.env.delivery.local` y a `.env.local-todo`. Levantar:

```bash
docker rm -f supabase_edge_runtime_vim-pos 2>/dev/null; supabase functions serve --env-file supabase/functions/.env.local-todo --no-verify-jwt
```

En otra terminal, obtener un JWT del admin local (usuario dueño del tenant de pruebas; el correo/contraseña están en `supabase/seed.sql` o en `docs/operacion/`), y:

```bash
# sin auth → 401 NO_AUTH
curl -s -X POST http://localhost:54321/functions/v1/delivery-uber-conexion -H "Content-Type: application/json" -d '{"accion":"tiendas"}'
# con JWT de dueño → 409 SIN_AUTORIZACION
curl -s -X POST http://localhost:54321/functions/v1/delivery-uber-conexion -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"accion":"tiendas"}'
# intercambiar con code falso → 502 UBER_ERROR (UBER_CANJE_4xx) y fila SALIDA oauth_canje en delivery_eventos
curl -s -X POST http://localhost:54321/functions/v1/delivery-uber-conexion -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"accion":"intercambiar","code":"falso"}'
# acción desconocida → 400
curl -s -X POST http://localhost:54321/functions/v1/delivery-uber-conexion -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"accion":"x"}'
```

Expected: exactamente esos códigos. Con un JWT de cajero (jerarquía 2) → 403 `SIN_PERMISO`.

- [ ] **Step 3: Documentar en `supabase/functions/README.md`**

Añadir tras la sección de `delivery-accion`:

```markdown
### `delivery-uber-conexion` — conectar tiendas de Uber Eats desde el admin (F1b)

JWT del admin (jerarquía ≥ 4). Cuerpo `{ accion, ... }` con `intercambiar` (code OAuth → token del
dueño en `delivery_autorizaciones` + lista de tiendas), `tiendas`, `activar` (`tienda_id`,
`sucursal_id`, `auto_aceptar`, `tiempo_prep_min`, `terminos_aceptados`), `pausar`, `reanudar`,
`desconectar`, `verificar` (`conexion_id`). Secrets: los de F1 más `UBER_REDIRECT_URI` (la URL de
callback registrada en la app de Uber: `https://admin.vimpos.com.mx/configuracion/integraciones/uber/callback`).
Errores: `SIN_PERMISO` 403, `SIN_AUTORIZACION` 409, `SUCURSAL_YA_CONECTADA` / `TIENDA_YA_CONECTADA` 409,
`TERMINOS_NO_ACEPTADOS` 400, `UBER_ERROR` 502. Spec: `docs/superpowers/specs/2026-09-02-delivery-f1b-conectar-uber-design.md`.
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/delivery-uber-conexion/index.ts supabase/functions/README.md
git commit -m "feat(delivery): Edge Function delivery-uber-conexion (canje OAuth, tiendas, activar, pausar, desconectar, verificar)"
```

---

### Task 5: Admin — `lib/integraciones.ts` con pruebas

**Files:**
- Create: `apps/admin/app/lib/integraciones.ts`
- Test: `apps/admin/app/lib/__tests__/integraciones.test.ts`

**Interfaces:**
- Consumes: `supabase`, `leerSesion` de `./supabase`; tabla `delivery_conexiones` (SELECT/UPDATE bajo RLS); Task 4.
- Produces:
  - `type ConexionApp = { id: string; sucursal_id: string; sucursal_nombre: string; app: "APP_UBEREATS" | "APP_DIDI" | "APP_RAPPI"; estado: EstadoConexion; tienda_nombre_app: string | null; auto_aceptar: boolean; tiempo_prep_min: number; ultimo_error: string | null; conectada_at: string | null }`
  - `type EstadoConexion = "SIN_CONECTAR" | "PENDIENTE" | "ACTIVA" | "PAUSADA" | "ERROR" | "DESCONECTADA"`
  - `listarConexiones(): Promise<ConexionApp[]>`
  - `actualizarConexion(id: string, cambios: { auto_aceptar?: boolean; tiempo_prep_min?: number }): Promise<void>`
  - `urlConexionUber(cfg: { entorno: string; clientId: string; redirectUri: string; state: string }): string`
  - `generarState(): string` (32 hex)
  - `iniciarConexionUber(): string` (guarda state en sessionStorage, devuelve la URL)
  - `validarState(recibido: string | null): boolean` (compara y borra)
  - `type TiendaUber = { id: string; nombre: string; direccion: string; ciudad: string; conectada_a: { sucursal_id: string; sucursal_nombre: string } | null }`
  - `accionConexion(accion: "intercambiar", campos: { code: string }): Promise<{ tiendas: TiendaUber[] }>` y sobrecargas para `tiendas`, `activar` (→ `{ conexion_id }`), `pausar`/`reanudar`/`desconectar` (→ `{ estado }`), `verificar` (→ `{ integracion_activa: boolean; tienda_online: boolean; offline_reason: string | null; detalle: string | null }`). Lanza `Error(codigo)` con el `error` de la función.
  - `mensajeErrorIntegracion(e: unknown): string`
  - `etiquetaEstado(estado: EstadoConexion): string`

- [ ] **Step 1: Escribir las pruebas**

```ts
// apps/admin/app/lib/__tests__/integraciones.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { urlConexionUber, generarState, iniciarConexionUber, validarState, mensajeErrorIntegracion, etiquetaEstado } from "../integraciones";

describe("urlConexionUber", () => {
  it("arma la URL de autorización con scope eats.pos_provisioning y state", () => {
    const u = new URL(urlConexionUber({ entorno: "sandbox", clientId: "cid", redirectUri: "http://localhost:3001/configuracion/integraciones/uber/callback", state: "s1" }));
    expect(u.origin).toBe("https://sandbox-login.uber.com");
    expect(u.searchParams.get("scope")).toBe("eats.pos_provisioning");
    expect(u.searchParams.get("state")).toBe("s1");
    expect(u.searchParams.get("redirect_uri")).toContain("/configuracion/integraciones/uber/callback");
  });
  it("producción usa auth.uber.com", () => {
    expect(urlConexionUber({ entorno: "produccion", clientId: "c", redirectUri: "r", state: "s" })).toMatch(/^https:\/\/auth\.uber\.com\//);
  });
});

describe("state anti-CSRF", () => {
  beforeEach(() => sessionStorage.clear());
  it("generarState da 32 hex distintos cada vez", () => {
    const a = generarState(), b = generarState();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
  it("iniciarConexionUber guarda el state y validarState lo acepta una sola vez", () => {
    const url = iniciarConexionUber();
    const state = new URL(url).searchParams.get("state")!;
    expect(validarState(state)).toBe(true);
    expect(validarState(state)).toBe(false);
  });
  it("un state ajeno o nulo no pasa", () => {
    iniciarConexionUber();
    expect(validarState("otro")).toBe(false);
    expect(validarState(null)).toBe(false);
  });
});

describe("mensajeErrorIntegracion", () => {
  it("traduce los códigos de la función", () => {
    expect(mensajeErrorIntegracion(new Error("SIN_AUTORIZACION"))).toMatch(/vuelve a conectar/i);
    expect(mensajeErrorIntegracion(new Error("TIENDA_YA_CONECTADA"))).toMatch(/otra sucursal/i);
    expect(mensajeErrorIntegracion(new Error("SIN_PERMISO"))).toMatch(/administrador/i);
    expect(mensajeErrorIntegracion(new Error("UBER_ERROR"))).toMatch(/Uber/);
  });
});

describe("etiquetaEstado", () => {
  it("tiene texto para cada estado", () => {
    for (const e of ["SIN_CONECTAR", "PENDIENTE", "ACTIVA", "PAUSADA", "ERROR", "DESCONECTADA"] as const) expect(etiquetaEstado(e).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/admin && pnpm vitest run app/lib/__tests__/integraciones.test.ts`
Expected: falla por módulo inexistente. (Si vitest no tiene entorno `jsdom`/`happy-dom` y `sessionStorage` no existe, revisar `apps/admin/vitest.config.*`; añadir `// @vitest-environment jsdom` al inicio del archivo de prueba si el paquete `jsdom` está disponible; si no, instalar `pnpm --filter admin add -D jsdom`.)

- [ ] **Step 3: Implementar**

```ts
// apps/admin/app/lib/integraciones.ts
"use client";
import { supabase, leerSesion } from "./supabase";

// Apps de delivery (spec F1b): estado de las conexiones por sucursal y el flujo OAuth con Uber.
// El admin nunca ve el client secret: el code se canjea en la Edge Function delivery-uber-conexion.

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const CLIENT_ID = process.env.NEXT_PUBLIC_UBER_CLIENT_ID ?? "";
const ENTORNO = process.env.NEXT_PUBLIC_UBER_ENTORNO ?? "sandbox";
const RUTA_CALLBACK = "/configuracion/integraciones/uber/callback";
const CLAVE_STATE = "vimpos.uber.state";

export type EstadoConexion = "SIN_CONECTAR" | "PENDIENTE" | "ACTIVA" | "PAUSADA" | "ERROR" | "DESCONECTADA";
export type AppDelivery = "APP_UBEREATS" | "APP_DIDI" | "APP_RAPPI";

export type ConexionApp = {
  id: string; sucursal_id: string; sucursal_nombre: string; app: AppDelivery; estado: EstadoConexion;
  tienda_nombre_app: string | null; auto_aceptar: boolean; tiempo_prep_min: number;
  ultimo_error: string | null; conectada_at: string | null;
};

type Fila = Omit<ConexionApp, "sucursal_nombre"> & { sucursal: { nombre: string } | { nombre: string }[] | null };

export async function listarConexiones(): Promise<ConexionApp[]> {
  const { data, error } = await supabase.from("delivery_conexiones")
    .select("id, sucursal_id, app, estado, tienda_nombre_app, auto_aceptar, tiempo_prep_min, ultimo_error, conectada_at, sucursal:sucursales(nombre)")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Fila[]).map((f) => {
    const s = Array.isArray(f.sucursal) ? f.sucursal[0] : f.sucursal;
    return { ...f, sucursal_nombre: s?.nombre ?? "" };
  });
}

export async function actualizarConexion(id: string, cambios: { auto_aceptar?: boolean; tiempo_prep_min?: number }): Promise<void> {
  const { error } = await supabase.from("delivery_conexiones").update(cambios).eq("id", id);
  if (error) throw new Error(error.message);
}

const AUTH = { sandbox: "https://sandbox-login.uber.com", produccion: "https://auth.uber.com" } as const;

export function urlConexionUber(cfg: { entorno: string; clientId: string; redirectUri: string; state: string }): string {
  const u = new URL("/oauth/v2/authorize", cfg.entorno === "produccion" ? AUTH.produccion : AUTH.sandbox);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("scope", "eats.pos_provisioning");
  u.searchParams.set("state", cfg.state);
  return u.toString();
}

export function generarState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Guarda un state nuevo y devuelve la URL a la que hay que mandar al dueño. */
export function iniciarConexionUber(): string {
  const state = generarState();
  sessionStorage.setItem(CLAVE_STATE, state);
  const redirectUri = window.location.origin + RUTA_CALLBACK;
  return urlConexionUber({ entorno: ENTORNO, clientId: CLIENT_ID, redirectUri, state });
}

/** Compara con el state guardado y lo consume (una sola vez). */
export function validarState(recibido: string | null): boolean {
  const guardado = sessionStorage.getItem(CLAVE_STATE);
  sessionStorage.removeItem(CLAVE_STATE);
  return Boolean(recibido) && guardado !== null && recibido === guardado;
}

export type TiendaUber = {
  id: string; nombre: string; direccion: string; ciudad: string;
  conectada_a: { sucursal_id: string; sucursal_nombre: string } | null;
};
export type Verificacion = { integracion_activa: boolean; tienda_online: boolean; offline_reason: string | null; detalle: string | null };

export async function accionConexion(accion: "intercambiar", campos: { code: string }): Promise<{ tiendas: TiendaUber[] }>;
export async function accionConexion(accion: "tiendas", campos?: Record<never, never>): Promise<{ tiendas: TiendaUber[] }>;
export async function accionConexion(accion: "activar", campos: { tienda_id: string; sucursal_id: string; auto_aceptar: boolean; tiempo_prep_min: number; terminos_aceptados: boolean }): Promise<{ conexion_id: string }>;
export async function accionConexion(accion: "pausar" | "reanudar" | "desconectar", campos: { conexion_id: string }): Promise<{ estado: EstadoConexion }>;
export async function accionConexion(accion: "verificar", campos: { conexion_id: string }): Promise<Verificacion>;
export async function accionConexion(accion: string, campos: Record<string, unknown> = {}): Promise<unknown> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("SESION_INVALIDA");
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("SESION_INVALIDA");
  let r: Response;
  try {
    r = await fetch(`${URL_SB}/functions/v1/delivery-uber-conexion`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ accion, ...campos }),
    });
  } catch { throw new Error("SIN_RED"); }
  const j = (await r.json().catch(() => ({}))) as { error?: string; detalle?: string };
  if (!r.ok) { const e = new Error(j.error ?? `HTTP_${r.status}`); (e as Error & { detalle?: string }).detalle = j.detalle; throw e; }
  return j;
}

const MENSAJES: Record<string, string> = {
  SIN_RED: "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.",
  SESION_INVALIDA: "Tu sesión expiró. Vuelve a iniciar sesión.",
  NO_AUTH: "Tu sesión expiró. Vuelve a iniciar sesión.",
  AUTH_INVALIDA: "Tu sesión expiró. Vuelve a iniciar sesión.",
  SIN_PERMISO: "Solo un administrador o el dueño puede conectar apps de delivery.",
  SIN_AUTORIZACION: "La autorización de Uber venció o no existe. Vuelve a conectar con Uber Eats.",
  SUCURSAL_NO_EXISTE: "Esa sucursal ya no existe.",
  SUCURSAL_YA_CONECTADA: "Esa sucursal ya tiene una tienda de Uber Eats conectada. Desconéctala primero.",
  TIENDA_YA_CONECTADA: "Esa tienda de Uber ya está conectada a otra sucursal.",
  TERMINOS_NO_ACEPTADOS: "Debes autorizar a VIM POS para continuar.",
  CONEXION_NO_EXISTE: "Esa conexión ya no existe.",
  ACCION_INVALIDA: "Esa acción no aplica en el estado actual de la conexión.",
  UBER_ERROR: "Uber no respondió como se esperaba. Inténtalo de nuevo en unos minutos.",
};

export function mensajeErrorIntegracion(e: unknown): string {
  const codigo = e instanceof Error ? e.message : String(e);
  return MENSAJES[codigo] ?? "Algo salió mal con la conexión. Inténtalo de nuevo.";
}

export function etiquetaEstado(estado: EstadoConexion): string {
  return { SIN_CONECTAR: "Sin conectar", PENDIENTE: "Pendiente", ACTIVA: "Activa", PAUSADA: "Pausada", ERROR: "Con error", DESCONECTADA: "Desconectada" }[estado];
}

export function etiquetaApp(app: AppDelivery): string {
  return { APP_UBEREATS: "Uber Eats", APP_DIDI: "DiDi Food", APP_RAPPI: "Rappi" }[app];
}
```

- [ ] **Step 4: Correr las pruebas y el typecheck**

Run: `cd apps/admin && pnpm vitest run app/lib/__tests__/integraciones.test.ts && pnpm tsc --noEmit`
Expected: 8 pass; typecheck limpio (si `delivery_conexiones` no aparece en los tipos generados, volver a `pnpm db:types`).

- [ ] **Step 5: Añadir las variables públicas**

En `apps/admin/.env.local` (git-ignored) añadir `NEXT_PUBLIC_UBER_CLIENT_ID=wx152HzVuqgaoXH6V4GXskfZrAUwKxMq` y `NEXT_PUBLIC_UBER_ENTORNO=sandbox`. Anotar las dos en `docs/operacion/delivery-uber-sandbox.md §2` (Task 8) como variables de Vercel del admin.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/lib/integraciones.ts apps/admin/app/lib/__tests__/integraciones.test.ts
git commit -m "feat(admin): lib de integraciones de delivery (conexiones, OAuth Uber con state, acciones)"
```

---

### Task 6: Admin — página `/configuracion/integraciones`

**Files:**
- Create: `apps/admin/app/(panel)/configuracion/integraciones/page.tsx`
- Modify: `apps/admin/app/components/config-sidenav.tsx` (sección "Operación", después de "Marcas virtuales")

**Interfaces:**
- Consumes: Task 5 (`listarConexiones`, `actualizarConexion`, `iniciarConexionUber`, `accionConexion`, `mensajeErrorIntegracion`, `etiquetaEstado`), `listarSucursales` de `../../../lib/configuracion`, `PageHeader`/`PageBody`, `Button`/`Modal` de `@vim/ui/styles`.

- [ ] **Step 1: Añadir el enlace al sidenav**

En `SECCIONES`, sección `Operación`, tras `{ label: "Marcas virtuales", href: "/configuracion/marcas" }`:

```ts
    { label: "Apps de delivery", href: "/configuracion/integraciones" },
```

- [ ] **Step 2: Escribir la página**

```tsx
// apps/admin/app/(panel)/configuracion/integraciones/page.tsx
"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { listarSucursales, type Sucursal } from "../../../lib/configuracion";
import {
  accionConexion, actualizarConexion, etiquetaEstado, iniciarConexionUber, listarConexiones,
  mensajeErrorIntegracion, type ConexionApp, type EstadoConexion, type Verificacion,
} from "../../../lib/integraciones";
import { mensajeError } from "../../../lib/errores";

/** Spec F1b: conexiones de apps de delivery por sucursal. Solo Uber Eats por ahora. */
export default function IntegracionesPage() {
  const [sucursales, setSucursales] = useState<Sucursal[] | null>(null);
  const [conexiones, setConexiones] = useState<ConexionApp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);   // id de conexión con acción en curso
  const [desconectar, setDesconectar] = useState<ConexionApp | null>(null);

  async function recargar() {
    setError(null);
    try {
      const [s, c] = await Promise.all([listarSucursales(), listarConexiones()]);
      setSucursales(s); setConexiones(c);
    } catch (e) { setError(mensajeError(e, "No se pudo cargar")); }
  }
  useEffect(() => { recargar(); }, []);

  const uberDe = (sucursalId: string) => conexiones?.find((c) => c.sucursal_id === sucursalId && c.app === "APP_UBEREATS") ?? null;

  async function correr(cx: ConexionApp, accion: "pausar" | "reanudar" | "desconectar" | "verificar") {
    setOcupada(cx.id); setError(null); setAviso(null);
    try {
      if (accion === "verificar") {
        const v: Verificacion = await accionConexion("verificar", { conexion_id: cx.id });
        setAviso(v.integracion_activa
          ? `Conexión correcta. La tienda en Uber está ${v.tienda_online ? "en línea" : "fuera de línea" + (v.offline_reason ? ` (${v.offline_reason})` : "")}.`
          : `Hay un problema: ${v.detalle ?? "la integración no está activa en Uber"}.`);
      } else {
        await accionConexion(accion, { conexion_id: cx.id });
        setAviso(accion === "pausar" ? "Integración pausada: los pedidos de Uber no entrarán al POS hasta reanudar."
          : accion === "reanudar" ? "Integración reanudada." : "Tienda desconectada.");
      }
      await recargar();
    } catch (e) { setError(mensajeErrorIntegracion(e)); }
    finally { setOcupada(null); setDesconectar(null); }
  }

  async function cambiar(cx: ConexionApp, cambios: { auto_aceptar?: boolean; tiempo_prep_min?: number }) {
    setError(null);
    try { await actualizarConexion(cx.id, cambios); await recargar(); }
    catch (e) { setError(mensajeError(e, "No se pudo guardar")); }
  }

  const th = "border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3";

  return (
    <>
      <PageHeader
        titulo="Apps de delivery"
        subtitulo="Conecta tus tiendas de las apps de reparto para que los pedidos entren solos al POS."
        migas={[{ label: "Configuración" }, { label: "Apps de delivery" }]}
        right={<Button onClick={() => { window.location.href = iniciarConexionUber(); }}>Conectar con Uber Eats</Button>}
      />
      <PageBody>
        {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {aviso && <p className="mb-4 text-sm font-medium text-success">{aviso}</p>}
        {(sucursales === null || conexiones === null) && <p className="text-sm text-ink-3">Cargando…</p>}

        {sucursales !== null && conexiones !== null && (
          <div className="tabla-caja overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Sucursal</th>
                  <th className={th}>Uber Eats</th>
                  <th className={`${th} w-[120px]`}>Auto-aceptar</th>
                  <th className={`${th} w-[110px]`}>Prep (min)</th>
                  <th className={`${th} w-[300px]`}></th>
                </tr>
              </thead>
              <tbody>
                {sucursales.map((s) => {
                  const cx = uberDe(s.id);
                  const conectada = cx !== null && (cx.estado === "ACTIVA" || cx.estado === "PAUSADA" || cx.estado === "ERROR");
                  const trabajando = cx !== null && ocupada === cx.id;
                  return (
                    <tr key={s.id} className="border-b border-line last:border-none">
                      <td className="px-4 py-3.5"><div className="text-[15px] font-semibold">{s.nombre}</div></td>
                      <td className="px-4 py-3.5">
                        <Estado estado={cx?.estado ?? "SIN_CONECTAR"} />
                        {conectada && cx?.tienda_nombre_app && <div className="mt-1 text-[13px] text-ink-2">{cx.tienda_nombre_app}</div>}
                        {cx?.estado === "ERROR" && cx.ultimo_error && <div className="mt-1 text-[12.5px] text-danger">{cx.ultimo_error}</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        {conectada && cx && (
                          <label className="inline-flex items-center gap-2 text-[13px]">
                            <input type="checkbox" checked={cx.auto_aceptar} onChange={(e) => cambiar(cx, { auto_aceptar: e.target.checked })} className="h-4 w-4 accent-accent" />
                            {cx.auto_aceptar ? "Sí" : "No"}
                          </label>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {conectada && cx && (
                          <input type="number" min={1} max={180} defaultValue={cx.tiempo_prep_min}
                            onBlur={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= 180 && v !== cx.tiempo_prep_min) cambiar(cx, { tiempo_prep_min: v }); }}
                            className="h-9 w-[76px] rounded border border-line bg-surface px-2 text-right text-[13.5px] tabular-nums" />
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {!conectada && <Button variant="ghost" onClick={() => { window.location.href = iniciarConexionUber(); }}>Conectar</Button>}
                        {conectada && cx && (
                          <span className="inline-flex flex-wrap justify-end gap-1.5">
                            <Button variant="ghost" disabled={trabajando} onClick={() => correr(cx, "verificar")}>Comprobar</Button>
                            {cx.estado === "ACTIVA" && <Button variant="ghost" disabled={trabajando} onClick={() => correr(cx, "pausar")}>Pausar</Button>}
                            {cx.estado === "PAUSADA" && <Button variant="ghost" disabled={trabajando} onClick={() => correr(cx, "reanudar")}>Reanudar</Button>}
                            <Button variant="ghost" disabled={trabajando} onClick={() => setDesconectar(cx)}>Desconectar</Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sucursales.length === 0 && (
              <div className="px-6 py-12 text-center text-sm text-ink-2">Primero crea una sucursal en Configuración › Sucursales.</div>
            )}
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:max-w-[720px]">
          {["DiDi Food", "Rappi"].map((n) => (
            <div key={n} className="rounded-lg border border-dashed border-line bg-surface px-4 py-3 text-[13px] text-ink-3">
              <span className="font-semibold text-ink-2">{n}</span> · Próximamente
            </div>
          ))}
        </div>
      </PageBody>

      {desconectar && (
        <Modal open onClose={() => setDesconectar(null)} title="Desconectar Uber Eats" className="w-full max-w-[420px] rounded-lg border border-line bg-surface p-6 shadow-xl">
          <p className="text-sm text-ink-2">
            Los pedidos de Uber Eats de <b className="text-ink">{desconectar.sucursal_nombre}</b> dejarán de llegar al POS.
            La tienda sigue existiendo en Uber y podrás volver a conectarla.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDesconectar(null)} disabled={ocupada !== null}>Cancelar</Button>
            <Button variant="danger" onClick={() => correr(desconectar, "desconectar")} disabled={ocupada !== null}>
              {ocupada ? "Desconectando…" : "Desconectar"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Estado({ estado }: { estado: EstadoConexion }) {
  const activa = estado === "ACTIVA";
  const alerta = estado === "ERROR";
  const pausada = estado === "PAUSADA";
  const clase = activa ? "bg-[#EAF3EE] text-success" : alerta ? "bg-danger-soft text-danger" : pausada ? "bg-[#F6EEDD] text-warning" : "bg-hover text-ink-3";
  const punto = activa ? "bg-success" : alerta ? "bg-danger" : pausada ? "bg-warning" : "bg-ink-3";
  return (
    <span className={["inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-[12.5px] font-semibold", clase].join(" ")}>
      <span className={["h-1.5 w-1.5 rounded-full", punto].join(" ")} />
      {etiquetaEstado(estado)}
    </span>
  );
}
```

Si `Button` no tiene `variant="danger"`, revisar `packages/ui/src/components/button.tsx` y usar la variante destructiva que exista (o `ghost` con `className="text-danger"`). Si el token `bg-danger-soft` no existe en el admin, usar `bg-[#FBE9E7]`.

- [ ] **Step 3: Typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: limpio.

- [ ] **Step 4: Verificar en el navegador**

Con Supabase local arriba (`supabase start`) y `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321` en `apps/admin/.env.local`, abrir el admin con `preview_start` (configuración `admin` en `.claude/launch.json`; si no existe, crearla con `pnpm --filter admin dev`, puerto 3001), entrar como dueño del tenant de pruebas, ir a Configuración › Apps de delivery. Comprobar: aparecen las sucursales con "Sin conectar", el botón "Conectar con Uber Eats" existe y su `href` al hacer clic (inspeccionar `iniciarConexionUber()` desde la consola importando nada: basta con ver que la navegación va a `sandbox-login.uber.com/oauth/v2/authorize?...&state=...`). Insertar a mano una conexión ACTIVA con el SQL del runbook §3 para ver la fila con acciones; "Comprobar" con credenciales falsas debe mostrar el mensaje de `UBER_ERROR`. Captura de pantalla para el reporte.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/app/(panel)/configuracion/integraciones/page.tsx" apps/admin/app/components/config-sidenav.tsx
git commit -m "feat(admin): pantalla Apps de delivery con conexiones de Uber Eats por sucursal"
```

---

### Task 7: Admin — callback y asistente de activación

**Files:**
- Create: `apps/admin/app/(panel)/configuracion/integraciones/uber/callback/page.tsx`

**Interfaces:**
- Consumes: Task 5 (`validarState`, `accionConexion`, `mensajeErrorIntegracion`, `TiendaUber`), `listarSucursales`.

- [ ] **Step 1: Escribir la página**

```tsx
// apps/admin/app/(panel)/configuracion/integraciones/uber/callback/page.tsx
"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../../../components/page-header";
import { listarSucursales, type Sucursal } from "../../../../../lib/configuracion";
import { accionConexion, mensajeErrorIntegracion, validarState, type TiendaUber } from "../../../../../lib/integraciones";

type Fase = { tipo: "validando" } | { tipo: "error"; mensaje: string } | { tipo: "tiendas"; tiendas: TiendaUber[] };
type Asignacion = { sucursal_id: string; auto_aceptar: boolean; tiempo_prep_min: number; resultado: "pendiente" | "activando" | "ok" | string };

export default function CallbackUberPage() {
  return <Suspense fallback={<PageBody><p className="text-sm text-ink-3">Cargando…</p></PageBody>}><Callback /></Suspense>;
}

function Callback() {
  const params = useSearchParams();
  const [fase, setFase] = useState<Fase>({ tipo: "validando" });
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [asig, setAsig] = useState<Record<string, Asignacion>>({});
  const [terminos, setTerminos] = useState(false);

  useEffect(() => {
    const err = params.get("error");
    const code = params.get("code");
    const state = params.get("state");
    if (err) { setFase({ tipo: "error", mensaje: err === "access_denied" ? "No autorizaste el acceso en Uber. Puedes volver a intentarlo cuando quieras." : `Uber devolvió un error (${err}).` }); return; }
    if (!validarState(state)) { setFase({ tipo: "error", mensaje: "La sesión de conexión no es válida. Vuelve a empezar desde Apps de delivery." }); return; }
    if (!code) { setFase({ tipo: "error", mensaje: "Uber no devolvió el código de autorización. Vuelve a intentarlo." }); return; }
    (async () => {
      try {
        const [r, s] = await Promise.all([accionConexion("intercambiar", { code }), listarSucursales()]);
        setSucursales(s.filter((x) => x.activa));
        const inicial: Record<string, Asignacion> = {};
        for (const t of r.tiendas) inicial[t.id] = { sucursal_id: "", auto_aceptar: true, tiempo_prep_min: 15, resultado: "pendiente" };
        setAsig(inicial);
        setFase({ tipo: "tiendas", tiendas: r.tiendas });
      } catch (e) { setFase({ tipo: "error", mensaje: mensajeErrorIntegracion(e) }); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pon = (id: string, cambios: Partial<Asignacion>) => setAsig((a) => ({ ...a, [id]: { ...a[id], ...cambios } }));

  async function activar(t: TiendaUber) {
    const a = asig[t.id];
    if (!a?.sucursal_id) return;
    pon(t.id, { resultado: "activando" });
    try {
      await accionConexion("activar", { tienda_id: t.id, sucursal_id: a.sucursal_id, auto_aceptar: a.auto_aceptar, tiempo_prep_min: a.tiempo_prep_min, terminos_aceptados: terminos });
      pon(t.id, { resultado: "ok" });
    } catch (e) { pon(t.id, { resultado: mensajeErrorIntegracion(e) }); }
  }

  const usadas = new Set(Object.values(asig).map((a) => a.sucursal_id).filter(Boolean));

  return (
    <>
      <PageHeader titulo="Conectar Uber Eats" subtitulo="Elige a qué sucursal de VIM corresponde cada tienda de Uber." migas={[{ label: "Configuración" }, { label: "Apps de delivery", href: "/configuracion/integraciones" }, { label: "Conectar Uber Eats" }]} />
      <PageBody>
        {fase.tipo === "validando" && <p className="text-sm text-ink-3">Consultando tus tiendas en Uber…</p>}

        {fase.tipo === "error" && (
          <div className="max-w-[560px] rounded-lg border border-line bg-surface p-5">
            <p className="text-sm font-medium text-danger" role="alert">{fase.mensaje}</p>
            <div className="mt-4"><Link href="/configuracion/integraciones"><Button variant="ghost">Volver a Apps de delivery</Button></Link></div>
          </div>
        )}

        {fase.tipo === "tiendas" && fase.tiendas.length === 0 && (
          <div className="max-w-[560px] rounded-lg border border-line bg-surface p-5 text-sm text-ink-2">
            Tu cuenta de Uber no tiene tiendas. Si eres el dueño, entra con la cuenta que administra el restaurante en Uber Eats Manager.
          </div>
        )}

        {fase.tipo === "tiendas" && fase.tiendas.length > 0 && (
          <div className="max-w-[820px]">
            <div className="tabla-caja overflow-hidden rounded-lg border border-line bg-surface">
              <table className="w-full border-collapse">
                <thead><tr>
                  {["Tienda en Uber", "Sucursal en VIM", "Auto-aceptar", "Prep (min)", ""].map((h) => (
                    <th key={h} className="border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {fase.tiendas.map((t) => {
                    const a = asig[t.id];
                    const ya = t.conectada_a !== null;
                    return (
                      <tr key={t.id} className="border-b border-line last:border-none">
                        <td className="px-4 py-3.5">
                          <div className="text-[15px] font-semibold">{t.nombre}</div>
                          <div className="text-[13px] text-ink-3">{[t.direccion, t.ciudad].filter(Boolean).join(", ") || "Sin dirección"}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          {ya ? <span className="text-[13px] text-ink-2">Conectada a <b>{t.conectada_a!.sucursal_nombre}</b></span> : (
                            <select value={a.sucursal_id} onChange={(e) => pon(t.id, { sucursal_id: e.target.value })} disabled={a.resultado === "ok" || a.resultado === "activando"}
                              className="h-9 w-full rounded border border-line bg-surface px-2 text-[13.5px]">
                              <option value="">No conectar</option>
                              {sucursales.map((s) => <option key={s.id} value={s.id} disabled={usadas.has(s.id) && a.sucursal_id !== s.id}>{s.nombre}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3.5">{!ya && <input type="checkbox" checked={a.auto_aceptar} onChange={(e) => pon(t.id, { auto_aceptar: e.target.checked })} className="h-4 w-4 accent-accent" />}</td>
                        <td className="px-4 py-3.5">{!ya && <input type="number" min={1} max={180} value={a.tiempo_prep_min} onChange={(e) => pon(t.id, { tiempo_prep_min: Number(e.target.value) || 15 })} className="h-9 w-[76px] rounded border border-line bg-surface px-2 text-right text-[13.5px] tabular-nums" />}</td>
                        <td className="px-4 py-3.5 text-right">
                          {!ya && a.resultado === "ok" && <span className="text-[13px] font-semibold text-success">Conectada</span>}
                          {!ya && a.resultado !== "ok" && (
                            <Button disabled={!a.sucursal_id || !terminos || a.resultado === "activando"} onClick={() => activar(t)}>
                              {a.resultado === "activando" ? "Activando…" : "Activar"}
                            </Button>
                          )}
                          {!ya && a.resultado !== "ok" && a.resultado !== "pendiente" && a.resultado !== "activando" && (
                            <div className="mt-1 text-[12.5px] text-danger" role="alert">{a.resultado}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <label className="mt-4 flex items-start gap-2.5 text-[13px] text-ink-2">
              <input type="checkbox" checked={terminos} onChange={(e) => setTerminos(e.target.checked)} className="mt-0.5 h-4 w-4 accent-accent" />
              <span>Autorizo a VIM POS a recibir en mi nombre los pedidos y datos de mis tiendas de Uber Eats y a usarlos únicamente para operar y reportar mis ventas.</span>
            </label>

            <div className="mt-6"><Link href="/configuracion/integraciones"><Button variant="ghost">Ir a Apps de delivery</Button></Link></div>
          </div>
        )}
      </PageBody>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/admin && pnpm tsc --noEmit`
Expected: limpio.

- [ ] **Step 3: Verificar en el navegador**

Con el admin local: abrir `/configuracion/integraciones/uber/callback?error=access_denied` → mensaje "No autorizaste…"; `/configuracion/integraciones/uber/callback?code=x&state=nada` → "La sesión de conexión no es válida"; desde Apps de delivery pulsar Conectar (guarda el state), volver atrás y abrir el callback con ese mismo `state` (leerlo en DevTools › Application › Session Storage) y `code=falso` → con la función local en marcha se muestra el mensaje de `UBER_ERROR`. Capturas.

- [ ] **Step 4: Commit**

```bash
git add "apps/admin/app/(panel)/configuracion/integraciones/uber/callback/page.tsx"
git commit -m "feat(admin): callback OAuth de Uber y asistente para asignar tiendas a sucursales"
```

---

### Task 8: Documentación, pruebas completas y despliegue

**Files:**
- Modify: `docs/operacion/delivery-uber-sandbox.md` (§2 secrets/variables, §3 pasa a "desde el admin")
- Modify: `docs/integraciones/delivery/uber-eats/contrato/README.md` (A5 y B3 → ✅)
- Modify: `docs/decisiones/0011-integracion-apps-de-delivery.md` (enlace al spec F1b bajo "Qué hacemos ahora", punto 1)
- Modify: `docs/producto/roadmap-a-100.md` (B2b: marcar F1b)

- [ ] **Step 1: Runbook §2 y §3**

En §2 añadir `UBER_REDIRECT_URI=https://admin.vimpos.com.mx/configuracion/integraciones/uber/callback` a la lista de secrets, y las variables de Vercel del admin `NEXT_PUBLIC_UBER_CLIENT_ID` y `NEXT_PUBLIC_UBER_ENTORNO`. En §3 reemplazar el encabezado por "## 3. Vincular la tienda a la sucursal (desde el admin)" con los pasos: Configuración › Apps de delivery › Conectar con Uber Eats › entrar con la cuenta del dueño en Uber › elegir sucursal por tienda › aceptar la autorización › Activar. Mover los `curl` y el `INSERT` a un sub-apartado "Respaldo manual (si el admin no está disponible)". Añadir en Uber dashboard → Setup → Redirect URIs las dos URLs (producción y localhost).

- [ ] **Step 2: Contrato README**

Cambiar A5 a `✅ | Edge Function delivery-uber-conexion: activar / verificar (GET pos_data) / desconectar` y B3 a `✅ | Checkbox obligatorio en el asistente; fecha y usuario en delivery_conexiones.config.terminos_aceptados_*`. Ajustar la lista final: tachar el punto 2 (la cláusula en términos de servicio sigue pendiente; solo se cubre el registro de aceptación) y el 6 en la parte de A5.

- [ ] **Step 3: Suite completa**

Run: `pnpm test 2>&1 | tail -20 && pnpm test:functions 2>&1 | tail -5 && supabase test db 2>&1 | tail -8`
Expected: todo en verde.

- [ ] **Step 4: Commit y terminar la rama**

```bash
git add docs/operacion/delivery-uber-sandbox.md docs/integraciones/delivery/uber-eats/contrato/README.md docs/decisiones/0011-integracion-apps-de-delivery.md docs/producto/roadmap-a-100.md
git commit -m "docs(delivery): F1b — runbook desde el admin, contrato A5/B3 cubiertos"
```

Luego `superpowers:finishing-a-development-branch` (fusionar a `main` si Fermín lo aprueba).

- [ ] **Step 5: Despliegue (tras la fusión, con confirmación de Fermín)**

```bash
supabase db push
supabase functions deploy delivery-uber-conexion
```

Fermín añade en el dashboard de Supabase el secret `UBER_REDIRECT_URI`, en Vercel (proyecto admin) `NEXT_PUBLIC_UBER_CLIENT_ID` y `NEXT_PUBLIC_UBER_ENTORNO=sandbox`, y en la app de Uber las Redirect URIs. Verificar: `curl -X POST …/functions/v1/delivery-uber-conexion` sin JWT → 401.

---

## Self-review

- **Cobertura del spec:** tabla 0092 (T1); módulo puro con las 4 funciones (T2); cliente con canje/tiendas/posData/estado (T3); las 7 acciones y códigos de error (T4); lib del admin con state, acciones y mensajes (T5); pantalla con tabla, switch, prep, acciones, confirmación y "Próximamente" (T6); callback con los 3 errores, lista, selector, checkbox, Activar (T7); docs y despliegue (T8). Gap conocido: la cláusula en los términos de servicio de VIM POS no es código y queda como pendiente del contrato README.
- **Placeholders:** ninguno; cada paso trae código o comando.
- **Consistencia de tipos:** `EstadoConexion` definido igual en `uber-activacion.ts` y `integraciones.ts`; `accionConexion` devuelve exactamente lo que la función responde (`{ tiendas }`, `{ conexion_id }`, `{ estado }`, `Verificacion`); `TiendaUber` del admin añade `conectada_a` a la del módulo puro, que es lo que `tiendasConEstado` produce.
