# Delivery A6 — Estado de tienda, prep en Uber y pedidos expirados — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la caja pause/reanude la tienda de Uber y ajuste el tiempo de preparación desde "Pedidos de apps", que el admin sincronice minutos a Uber, y que los pedidos vencidos pasen a EXPIRADO con alerta en POS y admin.

**Architecture:** Módulo puro `_shared/delivery/tienda-uber.ts` (cuerpos y normalización) + orquestación compartida `tienda-uber-acciones.ts` (cache 60 s en `delivery_conexiones.config.tienda`, eventos) usada por `delivery-accion` (POS) y `delivery-uber-conexion` (admin). Migración 0093: `delivery_marcar_expirados()` + `pg_cron` protegido + vista `vw_delivery_expirados_hoy`. POS: barra de tienda en la pantalla de pedidos y banner de expirados en el inicio. Admin: chip de tienda, columna Expirados hoy, prep vía función.

**Tech Stack:** Deno Edge Functions probadas con `node --test --experimental-strip-types`, Postgres/pgTAP, Next 15 en `apps/pos` y `apps/admin` (vitest).

**Spec:** `docs/superpowers/specs/2026-09-02-delivery-a6-tienda-uber-y-expirados-design.md`

## Global Constraints

- RLS sagrado; POS y admin solo hablan con Edge Functions o con tablas bajo RLS. La vista nueva lleva `security_invoker = on` (la prueba `0002_rls_cobertura` lo exige para `vw_*`).
- Dinero no aplica aquí; minutos son `integer` 1..180; Uber recibe segundos (`default_prep_time ≤ 10 800`).
- Español en el dominio; sin `any`; `kebab-case` en archivos.
- `pg_cron` **solo si existe** (`pg_available_extensions`): el Postgres embebido de escritorio no lo tiene.
- Uber 403 `resource_update_not_allowed` al cambiar estado ⇒ `TIENDA_ESTRATEGIA_UBER` (no es error de conexión).
- Rama: `delivery-a6-tienda-uber` (ya creada desde `main`).
- Comandos: `pnpm test:functions`, `supabase test db`, `cd apps/pos && pnpm vitest run && pnpm tsc --noEmit`, `cd apps/admin && pnpm vitest run && pnpm tsc --noEmit`. Los heredocs bash largos fallan en esta máquina: escribir scripts a archivo y ejecutarlos.

---

### Task 1: Módulo puro `tienda-uber.ts`

**Files:**
- Create: `supabase/functions/_shared/delivery/tienda-uber.ts`
- Test: `supabase/functions/_shared/delivery/tienda-uber.test.ts`

**Interfaces (produce):**
- `type EstadoTienda = { estado: "EN_LINEA" | "PAUSADA" | "DESCONOCIDO"; hasta: string | null; motivo: string | null; consultado_at: string }`
- `type DuracionPausa = "30m" | "1h" | "dia"`
- `normalizarEstadoTienda(respuesta: unknown, ahora: Date): EstadoTienda`
- `estadoCacheVigente(config: unknown, ahora: Date, maxSeg = 60): EstadoTienda | null`
- `cuerpoPausarTienda(ahora: Date, duracion: DuracionPausa, zonaHoraria = "America/Mexico_City", motivo = "Pausada desde el POS"): { status: "OFFLINE"; is_offline_until: string; reason: string }`
- `cuerpoReanudarTienda(): { status: "ONLINE" }`
- `cuerpoPrepTime(minutos: number): { default_prep_time: number }` — lanza `Error("PREP_FUERA_DE_RANGO")` fuera de 1..180
- `esErrorEstrategiaExterna(mensaje: string): boolean`
- `finDelDia(ahora: Date, zonaHoraria: string): Date` — 23:59:59 local de ese día

- [ ] **Step 1: Pruebas**

```ts
// supabase/functions/_shared/delivery/tienda-uber.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizarEstadoTienda, estadoCacheVigente, cuerpoPausarTienda, cuerpoReanudarTienda, cuerpoPrepTime,
  esErrorEstrategiaExterna, finDelDia,
} from "./tienda-uber.ts";

const AHORA = new Date("2026-09-02T18:10:00.000Z"); // 12:10 en León (UTC-6)

test("normalizarEstadoTienda: ONLINE, OFFLINE con hasta/motivo, y desconocido", () => {
  assert.deepEqual(normalizarEstadoTienda({ status: "ONLINE" }, AHORA),
    { estado: "EN_LINEA", hasta: null, motivo: null, consultado_at: AHORA.toISOString() });
  assert.deepEqual(normalizarEstadoTienda({ status: "OFFLINE", is_offline_until: "2026-09-02T18:40:00Z", offline_reason: "PAUSED_BY_RESTAURANT" }, AHORA),
    { estado: "PAUSADA", hasta: "2026-09-02T18:40:00Z", motivo: "PAUSED_BY_RESTAURANT", consultado_at: AHORA.toISOString() });
  assert.equal(normalizarEstadoTienda(null, AHORA).estado, "DESCONOCIDO");
  assert.equal(normalizarEstadoTienda({ status: "RARO" }, AHORA).estado, "DESCONOCIDO");
});

test("estadoCacheVigente: vale 60 s, luego null; tolera config sin tienda", () => {
  const t = { estado: "EN_LINEA", hasta: null, motivo: null, consultado_at: "2026-09-02T18:09:30.000Z" };
  assert.deepEqual(estadoCacheVigente({ tienda: t }, AHORA), t);
  assert.equal(estadoCacheVigente({ tienda: { ...t, consultado_at: "2026-09-02T18:08:00.000Z" } }, AHORA), null);
  assert.equal(estadoCacheVigente({}, AHORA), null);
  assert.equal(estadoCacheVigente(null, AHORA), null);
  assert.equal(estadoCacheVigente({ tienda: { estado: "X" } }, AHORA), null);
});

test("finDelDia: 23:59:59 hora local de la sucursal", () => {
  assert.equal(finDelDia(AHORA, "America/Mexico_City").toISOString(), "2026-09-03T05:59:59.000Z");
  // Justo después de medianoche local sigue siendo el mismo día local.
  assert.equal(finDelDia(new Date("2026-09-03T05:30:00.000Z"), "America/Mexico_City").toISOString(), "2026-09-03T05:59:59.000Z");
});

test("cuerpoPausarTienda: 30m, 1h y resto del día", () => {
  assert.deepEqual(cuerpoPausarTienda(AHORA, "30m"), { status: "OFFLINE", is_offline_until: "2026-09-02T18:40:00.000Z", reason: "Pausada desde el POS" });
  assert.equal(cuerpoPausarTienda(AHORA, "1h").is_offline_until, "2026-09-02T19:10:00.000Z");
  assert.equal(cuerpoPausarTienda(AHORA, "dia").is_offline_until, "2026-09-03T05:59:59.000Z");
  assert.equal(cuerpoPausarTienda(AHORA, "30m", "America/Mexico_City", "Cocina saturada").reason, "Cocina saturada");
  assert.deepEqual(cuerpoReanudarTienda(), { status: "ONLINE" });
});

test("cuerpoPrepTime: minutos → segundos, rango 1..180", () => {
  assert.deepEqual(cuerpoPrepTime(15), { default_prep_time: 900 });
  assert.deepEqual(cuerpoPrepTime(180), { default_prep_time: 10800 });
  for (const m of [0, 181, -5, Number.NaN, 12.5]) assert.throws(() => cuerpoPrepTime(m), /PREP_FUERA_DE_RANGO/);
});

test("esErrorEstrategiaExterna: solo el 403 de resource_update_not_allowed", () => {
  assert.equal(esErrorEstrategiaExterna("UBER_HTTP_403:/v1/delivery/store/x/update-store-status:{\"code\":\"resource_update_not_allowed\"}"), true);
  assert.equal(esErrorEstrategiaExterna("UBER_HTTP_403:/x:{\"code\":\"forbidden\"}"), false);
  assert.equal(esErrorEstrategiaExterna("UBER_HTTP_500:/x:resource_update_not_allowed"), false);
});
```

- [ ] **Step 2: Correr y ver que falla** — `node --test --experimental-strip-types supabase/functions/_shared/delivery/tienda-uber.test.ts` → módulo no encontrado.

- [ ] **Step 3: Implementar**

```ts
// supabase/functions/_shared/delivery/tienda-uber.ts
// Lógica pura del estado de tienda y tiempo de preparación en Uber (spec A6). Sin I/O.

export type EstadoTienda = {
  estado: "EN_LINEA" | "PAUSADA" | "DESCONOCIDO";
  hasta: string | null;
  motivo: string | null;
  consultado_at: string;
};
export type DuracionPausa = "30m" | "1h" | "dia";

type Dict = Record<string, unknown>;
const obj = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** GET /v1/delivery/store/{id}/status → estado normalizado. */
export function normalizarEstadoTienda(respuesta: unknown, ahora: Date): EstadoTienda {
  const r = obj(respuesta);
  const base = { hasta: null, motivo: null, consultado_at: ahora.toISOString() };
  if (r.status === "ONLINE") return { estado: "EN_LINEA", ...base };
  if (r.status === "OFFLINE") return { estado: "PAUSADA", hasta: str(r.is_offline_until), motivo: str(r.offline_reason), consultado_at: base.consultado_at };
  return { estado: "DESCONOCIDO", ...base };
}

/** Lee `config.tienda` si tiene forma válida y no es más viejo que maxSeg. */
export function estadoCacheVigente(config: unknown, ahora: Date, maxSeg = 60): EstadoTienda | null {
  const t = obj(obj(config).tienda);
  const estado = t.estado;
  const consultado = str(t.consultado_at);
  if (!consultado || (estado !== "EN_LINEA" && estado !== "PAUSADA" && estado !== "DESCONOCIDO")) return null;
  const edad = (ahora.getTime() - new Date(consultado).getTime()) / 1000;
  if (!Number.isFinite(edad) || edad < 0 || edad > maxSeg) return null;
  return { estado, hasta: str(t.hasta), motivo: str(t.motivo), consultado_at: consultado };
}

/** 23:59:59 del día local de la sucursal, en UTC. */
export function finDelDia(ahora: Date, zonaHoraria: string): Date {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: zonaHoraria, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(ahora).reduce<Record<string, number>>((acc, p) => { if (p.type !== "literal") acc[p.type] = Number(p.value); return acc; }, {});
  // Desplazamiento de la zona en ese instante: (hora local interpretada como UTC) - instante real.
  const localComoUtc = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute, partes.second);
  const offsetMs = localComoUtc - ahora.getTime();
  const finLocalComoUtc = Date.UTC(partes.year, partes.month - 1, partes.day, 23, 59, 59);
  return new Date(finLocalComoUtc - offsetMs);
}

export function cuerpoPausarTienda(ahora: Date, duracion: DuracionPausa, zonaHoraria = "America/Mexico_City", motivo = "Pausada desde el POS") {
  const hasta = duracion === "30m" ? new Date(ahora.getTime() + 30 * 60_000)
    : duracion === "1h" ? new Date(ahora.getTime() + 60 * 60_000)
    : finDelDia(ahora, zonaHoraria);
  return { status: "OFFLINE" as const, is_offline_until: hasta.toISOString(), reason: motivo };
}

export function cuerpoReanudarTienda() {
  return { status: "ONLINE" as const };
}

export function cuerpoPrepTime(minutos: number) {
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > 180) throw new Error("PREP_FUERA_DE_RANGO");
  return { default_prep_time: minutos * 60 };
}

/** Uber: la tienda no tiene estrategia de estado "external"; solo se pausa desde Uber Eats Manager. */
export function esErrorEstrategiaExterna(mensaje: string): boolean {
  return mensaje.startsWith("UBER_HTTP_403") && mensaje.includes("resource_update_not_allowed");
}
```

- [ ] **Step 4: Correr** → 6 pass. `git add … && git commit -m "feat(delivery): lógica pura de estado de tienda y prep en Uber"`.

---

### Task 2: Cliente Uber + orquestación compartida `tienda-uber-acciones.ts`

**Files:**
- Modify: `supabase/functions/_shared/delivery/uber.ts` (`ClienteUber` + 2 métodos)
- Create: `supabase/functions/_shared/delivery/tienda-uber-acciones.ts`
- Test: `supabase/functions/_shared/delivery/tienda-uber-acciones.test.ts`

**Interfaces (produce):**
- `ClienteUber.actualizarEstadoTienda(tiendaId, cuerpo): Promise<unknown>`; `ClienteUber.actualizarPrepTienda(tiendaId, cuerpo): Promise<unknown>`
- `type ConexionTienda = { id: string; tenant_id: string; sucursal_id: string; tienda_id_externo: string; tiempo_prep_min: number; config: unknown }`
- `type DepsTienda = { db: DbMinima; uber: ClienteUber; ahora: () => Date; zonaHoraria?: string }`
- `consultarEstadoTienda(deps, cx, forzar = false): Promise<EstadoTienda>`
- `pausarTienda(deps, cx, duracion): Promise<EstadoTienda>` — lanza `Error("TIENDA_ESTRATEGIA_UBER")` o re-lanza el error de Uber
- `reanudarTienda(deps, cx): Promise<EstadoTienda>`
- `cambiarPrepTienda(deps, cx, minutos): Promise<{ tiempo_prep_min: number }>`

- [ ] **Step 1: Ampliar `uber.ts`** (tipo y retorno):

```ts
  actualizarEstadoTienda(tiendaId: string, cuerpo: unknown): Promise<unknown>;
  actualizarPrepTienda(tiendaId: string, cuerpo: unknown): Promise<unknown>;
// …
    actualizarEstadoTienda: async (tiendaId, cuerpo) => (await llamar("POST", `/v1/delivery/store/${encodeURIComponent(tiendaId)}/update-store-status`, cuerpo)).json(),
    actualizarPrepTienda: async (tiendaId, cuerpo) => (await llamar("POST", `/v1/delivery/store/${encodeURIComponent(tiendaId)}/update-store-prep-time`, cuerpo)).json(),
```
Añadir al fake de `procesar-uber.test.ts` si el typecheck de node lo pide (node no chequea tipos: solo si falla en runtime).

- [ ] **Step 2: Pruebas de la orquestación**

```ts
// supabase/functions/_shared/delivery/tienda-uber-acciones.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { consultarEstadoTienda, pausarTienda, reanudarTienda, cambiarPrepTienda, type ConexionTienda, type DepsTienda } from "./tienda-uber-acciones.ts";
import type { ClienteUber } from "./uber.ts";
import type { DbMinima } from "./procesar-uber.ts";

const AHORA = new Date("2026-09-02T18:10:00.000Z");
function cx(config: unknown = {}): ConexionTienda {
  return { id: "cx1", tenant_id: "t1", sucursal_id: "s1", tienda_id_externo: "st-1", tiempo_prep_min: 15, config };
}
function armar(uberParcial: Partial<ClienteUber>) {
  const updates: { tabla: string; cambios: Record<string, unknown> }[] = [];
  const inserts: Record<string, unknown>[] = [];
  const db = {
    from: (tabla: string) => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }), limit: async () => ({ data: [], error: null }) }), in: async () => ({ data: [], error: null }), maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: (fila: Record<string, unknown>) => { inserts.push({ tabla, ...fila }); return { select: () => ({ single: async () => ({ data: { id: "ev" }, error: null }) }) }; },
      update: (cambios: Record<string, unknown>) => ({ eq: async () => { updates.push({ tabla, cambios }); return { error: null }; } }),
    }),
    rpc: async () => ({ data: null, error: null }),
  } as unknown as DbMinima;
  const llamadas: string[] = [];
  const uber = {
    estadoTienda: async () => { llamadas.push("estado"); return { status: "ONLINE" }; },
    actualizarEstadoTienda: async (_id: string, cuerpo: unknown) => { llamadas.push("estado:" + JSON.stringify(cuerpo)); return { status: (cuerpo as { status: string }).status, is_offline_until: (cuerpo as { is_offline_until?: string }).is_offline_until }; },
    actualizarPrepTienda: async (_id: string, cuerpo: unknown) => { llamadas.push("prep:" + JSON.stringify(cuerpo)); return { prep_times: { default_value: (cuerpo as { default_prep_time: number }).default_prep_time } }; },
    ...uberParcial,
  } as unknown as ClienteUber;
  const deps: DepsTienda = { db, uber, ahora: () => AHORA };
  return { deps, updates, inserts, llamadas };
}

test("consultarEstadoTienda: usa el cache si es reciente; forzar va a Uber y guarda", async () => {
  const cache = { tienda: { estado: "PAUSADA", hasta: "2026-09-02T18:40:00Z", motivo: null, consultado_at: "2026-09-02T18:09:40.000Z" } };
  const a = armar({});
  const r1 = await consultarEstadoTienda(a.deps, cx(cache));
  assert.equal(r1.estado, "PAUSADA");
  assert.deepEqual(a.llamadas, []);
  const r2 = await consultarEstadoTienda(a.deps, cx(cache), true);
  assert.equal(r2.estado, "EN_LINEA");
  assert.deepEqual(a.llamadas, ["estado"]);
  assert.equal(a.updates.length, 1);
  assert.equal((a.updates[0].cambios.config as { tienda: { estado: string } }).tienda.estado, "EN_LINEA");
  assert.equal(a.inserts.filter((i) => i.tipo === "tienda_estado").length, 1);
});

test("pausarTienda: manda OFFLINE con hasta, guarda cache y evento", async () => {
  const a = armar({});
  const r = await pausarTienda(a.deps, cx(), "30m");
  assert.equal(r.estado, "PAUSADA");
  assert.equal(r.hasta, "2026-09-02T18:40:00.000Z");
  assert.ok(a.llamadas[0].startsWith("estado:{\"status\":\"OFFLINE\""));
  assert.equal(a.inserts.filter((i) => i.tipo === "tienda_pausar" && i.procesado === true).length, 1);
});

test("pausarTienda: 403 de estrategia → TIENDA_ESTRATEGIA_UBER, evento con error, sin ultimo_error en la conexión", async () => {
  const a = armar({ actualizarEstadoTienda: async () => { throw new Error("UBER_HTTP_403:/x:{\"code\":\"resource_update_not_allowed\"}"); } });
  await assert.rejects(() => pausarTienda(a.deps, cx(), "1h"), /TIENDA_ESTRATEGIA_UBER/);
  assert.equal(a.inserts.filter((i) => i.tipo === "tienda_pausar" && i.procesado === false).length, 1);
  assert.equal(a.updates.length, 0);
});

test("reanudarTienda: manda ONLINE", async () => {
  const a = armar({});
  const r = await reanudarTienda(a.deps, cx());
  assert.equal(r.estado, "EN_LINEA");
  assert.equal(a.llamadas[0], "estado:{\"status\":\"ONLINE\"}");
});

test("cambiarPrepTienda: Uber primero; si responde, escribe tiempo_prep_min", async () => {
  const a = armar({});
  const r = await cambiarPrepTienda(a.deps, cx(), 20);
  assert.deepEqual(r, { tiempo_prep_min: 20 });
  assert.equal(a.llamadas[0], "prep:{\"default_prep_time\":1200}");
  assert.equal(a.updates[0].cambios.tiempo_prep_min, 20);
});

test("cambiarPrepTienda: si Uber falla no se toca la BD; fuera de rango ni se llama", async () => {
  const a = armar({ actualizarPrepTienda: async () => { throw new Error("UBER_HTTP_500:/x:boom"); } });
  await assert.rejects(() => cambiarPrepTienda(a.deps, cx(), 20), /UBER_HTTP_500/);
  assert.equal(a.updates.length, 0);
  await assert.rejects(() => cambiarPrepTienda(a.deps, cx(), 500), /PREP_FUERA_DE_RANGO/);
  assert.equal(a.llamadas.length, 1);
});
```

- [ ] **Step 3: Implementar**

```ts
// supabase/functions/_shared/delivery/tienda-uber-acciones.ts
// Orquestación con I/O del estado de tienda y prep (spec A6). La usan delivery-accion (POS) y
// delivery-uber-conexion (admin). Cache de 60 s en delivery_conexiones.config.tienda.
import type { ClienteUber } from "./uber.ts";
import type { DbMinima } from "./procesar-uber.ts";
import {
  cuerpoPausarTienda, cuerpoPrepTime, cuerpoReanudarTienda, esErrorEstrategiaExterna, estadoCacheVigente,
  normalizarEstadoTienda, type DuracionPausa, type EstadoTienda,
} from "./tienda-uber.ts";

export type ConexionTienda = { id: string; tenant_id: string; sucursal_id: string; tienda_id_externo: string; tiempo_prep_min: number; config: unknown };
export type DepsTienda = { db: DbMinima; uber: ClienteUber; ahora: () => Date; zonaHoraria?: string };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

async function evento(deps: DepsTienda, cx: ConexionTienda, tipo: string, ok: boolean, detalle: unknown) {
  await deps.db.from("delivery_eventos").insert({
    tenant_id: cx.tenant_id, conexion_id: cx.id, app: "APP_UBEREATS", direccion: "SALIDA", tipo,
    id_externo: cx.tienda_id_externo, procesado: ok, respuesta: ok ? detalle : null, error: ok ? null : String(detalle),
    http_status: ok ? 200 : null,
  }).select("id").single();
}

async function guardarCache(deps: DepsTienda, cx: ConexionTienda, tienda: EstadoTienda) {
  await deps.db.from("delivery_conexiones").update({ config: { ...obj(cx.config), tienda }, ultimo_evento_at: deps.ahora().toISOString() }).eq("id", cx.id);
}

export async function consultarEstadoTienda(deps: DepsTienda, cx: ConexionTienda, forzar = false): Promise<EstadoTienda> {
  if (!forzar) { const c = estadoCacheVigente(cx.config, deps.ahora()); if (c) return c; }
  try {
    const tienda = normalizarEstadoTienda(await deps.uber.estadoTienda(cx.tienda_id_externo), deps.ahora());
    await guardarCache(deps, cx, tienda);
    await evento(deps, cx, "tienda_estado", true, tienda);
    return tienda;
  } catch (e) {
    await evento(deps, cx, "tienda_estado", false, msg(e));
    throw e;
  }
}

async function cambiarEstado(deps: DepsTienda, cx: ConexionTienda, tipo: "tienda_pausar" | "tienda_reanudar", cuerpo: unknown): Promise<EstadoTienda> {
  try {
    const r = await deps.uber.actualizarEstadoTienda(cx.tienda_id_externo, cuerpo);
    const tienda = normalizarEstadoTienda(r, deps.ahora());
    await guardarCache(deps, cx, tienda);
    await evento(deps, cx, tipo, true, cuerpo);
    return tienda;
  } catch (e) {
    await evento(deps, cx, tipo, false, msg(e));
    if (esErrorEstrategiaExterna(msg(e))) throw new Error("TIENDA_ESTRATEGIA_UBER");
    throw e;
  }
}

export function pausarTienda(deps: DepsTienda, cx: ConexionTienda, duracion: DuracionPausa): Promise<EstadoTienda> {
  return cambiarEstado(deps, cx, "tienda_pausar", cuerpoPausarTienda(deps.ahora(), duracion, deps.zonaHoraria ?? "America/Mexico_City"));
}

export function reanudarTienda(deps: DepsTienda, cx: ConexionTienda): Promise<EstadoTienda> {
  return cambiarEstado(deps, cx, "tienda_reanudar", cuerpoReanudarTienda());
}

export async function cambiarPrepTienda(deps: DepsTienda, cx: ConexionTienda, minutos: number): Promise<{ tiempo_prep_min: number }> {
  const cuerpo = cuerpoPrepTime(minutos);   // valida rango antes de tocar Uber
  try {
    await deps.uber.actualizarPrepTienda(cx.tienda_id_externo, cuerpo);
  } catch (e) {
    await evento(deps, cx, "tienda_prep", false, msg(e));
    throw e;
  }
  await deps.db.from("delivery_conexiones").update({ tiempo_prep_min: minutos, ultimo_evento_at: deps.ahora().toISOString() }).eq("id", cx.id);
  await evento(deps, cx, "tienda_prep", true, cuerpo);
  return { tiempo_prep_min: minutos };
}
```

Nota: `DbMinima.insert` devuelve `{ select().single() }`; por eso `evento` encadena `.select("id").single()`. Si `DbMinima` no tipa `update` con `config` → es `Dict`, va bien.

- [ ] **Step 4: Correr `pnpm test:functions`** → 57 + 6 + 6 = 69 pass. Commit: `feat(delivery): orquestación de estado de tienda y prep en Uber (cache 60 s, eventos)`.

---

### Task 3: Migración 0093 (expirados + vista) con pgTAP

**Files:**
- Create: `supabase/migrations/0093_delivery_expirados.sql`
- Create: `supabase/tests/0006_delivery_expirados.test.sql`
- Modify: `packages/db/src/database.types.ts` (regenerado)

- [ ] **Step 1: pgTAP**

```sql
-- supabase/tests/0006_delivery_expirados.test.sql
begin;
select plan(7);
select has_function('delivery_marcar_expirados');
select has_view('vw_delivery_expirados_hoy');

insert into tenants (id, codigo, nombre_comercial, vertical_principal)
values ('dddddddd-0000-0000-0000-00000000000d', 'exp-d', 'Tenant D', 'QUICK_SERVICE') on conflict (id) do nothing;
insert into sucursales (id, tenant_id, codigo, nombre)
values ('dddddddd-0000-0000-0000-0000000000d1', 'dddddddd-0000-0000-0000-00000000000d', 'D1', 'Suc D') on conflict (id) do nothing;
insert into delivery_conexiones (id, tenant_id, sucursal_id, app, estado, tienda_id_externo)
values ('dddddddd-0000-0000-0000-0000000000c1', 'dddddddd-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-0000000000d1', 'APP_UBEREATS', 'ACTIVA', 'store-d');
insert into delivery_pedidos (id, tenant_id, sucursal_id, conexion_id, app, id_externo, estado, vence_aceptacion, recibido_at) values
  ('dddddddd-0000-0000-0000-0000000000p1', 'dddddddd-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-0000000000d1', 'dddddddd-0000-0000-0000-0000000000c1', 'APP_UBEREATS', 'u-vencido',  'RECIBIDO', now() - interval '1 minute', now() - interval '12 minutes'),
  ('dddddddd-0000-0000-0000-0000000000p2', 'dddddddd-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-0000000000d1', 'dddddddd-0000-0000-0000-0000000000c1', 'APP_UBEREATS', 'u-vigente',  'RECIBIDO', now() + interval '5 minutes', now()),
  ('dddddddd-0000-0000-0000-0000000000p3', 'dddddddd-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-0000000000d1', 'dddddddd-0000-0000-0000-0000000000c1', 'APP_UBEREATS', 'u-aceptado', 'ACEPTADO', now() - interval '1 minute', now() - interval '12 minutes');

select is(delivery_marcar_expirados(), 1, 'marca exactamente el vencido');
select results_eq(
  $$ select id_externo from delivery_pedidos where estado = 'EXPIRADO' and tenant_id = 'dddddddd-0000-0000-0000-00000000000d' $$,
  $$ values ('u-vencido') $$, 'el vigente y el aceptado no se tocan');
select results_eq(
  $$ select count(*)::int from delivery_eventos where tipo = 'expirado' and id_externo = 'u-vencido' $$,
  $$ values (1) $$, 'deja evento');
select results_eq(
  $$ select n_expirados::int from vw_delivery_expirados_hoy where sucursal_id = 'dddddddd-0000-0000-0000-0000000000d1' $$,
  $$ values (1) $$, 'la vista cuenta el expirado de hoy');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-000000000001', 'tenant_id', 'aaaaaaaa-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select is_empty($$ select * from vw_delivery_expirados_hoy where sucursal_id = 'dddddddd-0000-0000-0000-0000000000d1' $$, 'otro tenant no ve los expirados por la vista (RLS heredado)');

select * from finish();
rollback;
```

(`has_function`/`has_view` son de pgTAP. `authenticated` no ejecuta la función: la prueba `0003_grants_secdef` ya verifica que ninguna SECURITY DEFINER quede con EXECUTE a PUBLIC/authenticated; si no la cubre, añadir un `throws_ok(select delivery_marcar_expirados(), '42501', NULL, …)` como 8.ª aserción y `plan(8)`.)

- [ ] **Step 2: Migración**

```sql
-- supabase/migrations/0093_delivery_expirados.sql
-- ============================================================================
-- 0093 — Pedidos de apps expirados (spec A6). Un pedido RECIBIDO cuya ventana de aceptación
-- pasó sin respuesta se marca EXPIRADO (la app ya lo canceló de su lado). Barrido cada minuto
-- con pg_cron SOLO donde exista la extensión (nube); el Postgres embebido de escritorio no la
-- tiene y tampoco recibe pedidos de apps.
-- ============================================================================
CREATE OR REPLACE FUNCTION delivery_marcar_expirados() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
  WITH exp AS (
    UPDATE delivery_pedidos
    SET estado = 'EXPIRADO', cancelado_at = now(), motivo_cancelacion = 'Venció la ventana de aceptación'
    WHERE estado = 'RECIBIDO' AND vence_aceptacion IS NOT NULL AND vence_aceptacion < now()
    RETURNING id, tenant_id, conexion_id, app, id_externo
  ), ev AS (
    INSERT INTO delivery_eventos (tenant_id, conexion_id, app, direccion, tipo, id_externo, procesado, error)
    SELECT tenant_id, conexion_id, app, 'SALIDA', 'expirado', id_externo, true, 'Pedido expirado sin aceptar' FROM exp
    RETURNING conexion_id
  )
  UPDATE delivery_conexiones c
  SET ultimo_error = 'Pedidos expirados sin aceptar: revisar la caja', ultimo_evento_at = now()
  WHERE c.id IN (SELECT conexion_id FROM ev);
  GET DIAGNOSTICS v_n = ROW_COUNT;   -- conexiones tocadas; se recalcula abajo por pedidos
  SELECT count(*) INTO v_n FROM delivery_pedidos
  WHERE estado = 'EXPIRADO' AND cancelado_at >= now() - interval '2 seconds' AND motivo_cancelacion = 'Venció la ventana de aceptación';
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION delivery_marcar_expirados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_marcar_expirados() TO service_role;
COMMENT ON FUNCTION delivery_marcar_expirados IS 'Marca EXPIRADO los pedidos de apps RECIBIDOS cuya ventana venció. Cron cada minuto (nube).';

CREATE OR REPLACE VIEW vw_delivery_expirados_hoy WITH (security_invoker = on) AS
SELECT tenant_id, sucursal_id, count(*)::integer AS n_expirados, max(cancelado_at) AS ultimo_expirado_at
FROM delivery_pedidos
WHERE estado = 'EXPIRADO' AND cancelado_at::date = CURRENT_DATE
GROUP BY tenant_id, sucursal_id;
GRANT SELECT ON vw_delivery_expirados_hoy TO authenticated, service_role;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delivery-expirados') THEN
      PERFORM cron.unschedule('delivery-expirados');
    END IF;
    PERFORM cron.schedule('delivery-expirados', '* * * * *', 'SELECT delivery_marcar_expirados()');
  END IF;
END $$;
```

Simplificar el conteo si al probar la primera versión de `v_n` es confusa: la forma más limpia es contar `exp` en la propia CTE (`SELECT count(*) FROM exp` en un `INSERT … RETURNING`/`SELECT INTO`); lo que importa es que la prueba `is(delivery_marcar_expirados(), 1)` pase y no cuente expirados de otros tenants (usar el filtro de tiempo de 2 s solo si no hay forma mejor; preferible `WITH exp AS (…) , ev AS (…), cx AS (…) SELECT count(*) INTO v_n FROM exp;` — Postgres permite `SELECT INTO` con CTE modificadora en plpgsql).

- [ ] **Step 3: `supabase db reset`, `supabase test db`, `pnpm db:types`.** Si `0002_rls_cobertura` se queja por la vista, verificar que `security_invoker=on` quedó en `reloptions`. Commit: `feat(delivery): pedidos de apps expirados (función, cron protegido, vista)`.

---

### Task 4: `delivery-accion` (POS) y `delivery-uber-conexion` (admin)

**Files:**
- Modify: `supabase/functions/delivery-accion/index.ts`
- Modify: `supabase/functions/delivery-uber-conexion/index.ts`
- Modify: `supabase/functions/README.md`

- [ ] **Step 1: `delivery-accion`** — antes de exigir `pedido_id`, atender las acciones de tienda:

```ts
import { cambiarPrepTienda, consultarEstadoTienda, pausarTienda, reanudarTienda, type ConexionTienda } from "../_shared/delivery/tienda-uber-acciones.ts";
import type { DbMinima } from "../_shared/delivery/procesar-uber.ts";
// Cuerpo: añadir sucursal_id?: string; duracion?: string; minutos?: number; forzar?: boolean
const ACCIONES_TIENDA = ["tienda_estado", "tienda_pausar", "tienda_reanudar", "tienda_prep"];
// …tras validar body.accion:
  if (ACCIONES_TIENDA.includes(body.accion)) {
    if (!body.sucursal_id) return json({ error: "FALTAN_CAMPOS" }, 400);
    const { data: cxData } = await admin.from("delivery_conexiones")
      .select("id, tenant_id, sucursal_id, tienda_id_externo, tiempo_prep_min, config, estado")
      .eq("sucursal_id", body.sucursal_id).eq("app", "APP_UBEREATS").maybeSingle();
    const cx = cxData as (ConexionTienda & { estado: string }) | null;
    if (!cx || cx.tenant_id !== tenantId || !cx.tienda_id_externo || !["ACTIVA", "PAUSADA", "ERROR"].includes(cx.estado)) return json({ error: "SIN_CONEXION_UBER" }, 404);
    const deps = { db: admin as unknown as DbMinima, uber, ahora: () => new Date() };
    try {
      switch (body.accion) {
        case "tienda_estado": return json({ ok: true, tienda: await consultarEstadoTienda(deps, cx, body.forzar === true), tiempo_prep_min: cx.tiempo_prep_min });
        case "tienda_pausar": {
          const d = body.duracion === "1h" || body.duracion === "dia" ? body.duracion : "30m";
          return json({ ok: true, tienda: await pausarTienda(deps, cx, d) });
        }
        case "tienda_reanudar": return json({ ok: true, tienda: await reanudarTienda(deps, cx) });
        case "tienda_prep": return json({ ok: true, ...(await cambiarPrepTienda(deps, cx, Number(body.minutos))) });
      }
    } catch (e) {
      const m = msg(e);
      if (m === "TIENDA_ESTRATEGIA_UBER") return json({ error: "TIENDA_ESTRATEGIA_UBER" }, 409);
      if (m === "PREP_FUERA_DE_RANGO") return json({ error: "PREP_FUERA_DE_RANGO" }, 400);
      return json({ error: "UBER_ERROR", detalle: m }, 502);
    }
  }
  if (!body.pedido_id) return json({ error: "FALTAN_CAMPOS" }, 400);
```
(La comprobación actual `if (!body.pedido_id || !body.accion)` se divide: `accion` primero, `pedido_id` después del bloque de tienda.)

- [ ] **Step 2: `delivery-uber-conexion`** — acción `prep` y `verificar` con estado normalizado:

```ts
import { cambiarPrepTienda, consultarEstadoTienda, type ConexionTienda } from "../_shared/delivery/tienda-uber-acciones.ts";
import type { DbMinima } from "../_shared/delivery/procesar-uber.ts";
// case "prep":
      case "prep": {
        const cx = await conexionDelTenant(body.conexion_id);
        if (!cx || !cx.tienda_id_externo) return json({ error: "CONEXION_NO_EXISTE" }, 404);
        const { data: fila } = await admin.from("delivery_conexiones").select("tiempo_prep_min").eq("id", cx.id).maybeSingle();
        const ct: ConexionTienda = { id: cx.id, tenant_id: cx.tenant_id, sucursal_id: cx.sucursal_id, tienda_id_externo: cx.tienda_id_externo, tiempo_prep_min: Number((fila as { tiempo_prep_min?: number } | null)?.tiempo_prep_min ?? 15), config: cx.config };
        try { return json(await cambiarPrepTienda({ db: admin as unknown as DbMinima, uber, ahora: () => new Date() }, ct, Number(body.minutos))); }
        catch (e) { const m = msg(e); return m === "PREP_FUERA_DE_RANGO" ? json({ error: "PREP_FUERA_DE_RANGO" }, 400) : json({ error: "UBER_ERROR", detalle: m }, 502); }
      }
```
En `verificar`, sustituir la lectura cruda de `status` por `consultarEstadoTienda(deps, ct, true)` y devolver `tienda` además de `tienda_online` (= `tienda.estado === "EN_LINEA"`). `Cuerpo` gana `minutos?: number`.

- [ ] **Step 3: Probar en local** (`supabase functions serve … --no-verify-jwt`, JWT de `dueno@knockout.dev` para `delivery-uber-conexion`; para `delivery-accion` sirve el mismo JWT porque solo exige tenant): con una conexión ACTIVA insertada a mano (`tienda_id_externo='store-demo-1'`): `tienda_estado` → 502 `UBER_ERROR` (credenciales falsas) y fila `tienda_estado` con `procesado=false` en `delivery_eventos`; `tienda_prep` con `minutos: 500` → 400 `PREP_FUERA_DE_RANGO` sin llamar a Uber; sucursal sin conexión → 404 `SIN_CONEXION_UBER`; `prep` en el admin con 20 → 502 (Uber falso) y `tiempo_prep_min` intacto.

- [ ] **Step 4: README de funciones** (acciones nuevas en ambas secciones) y commit: `feat(delivery): acciones de tienda (estado, pausar, reanudar, prep) en delivery-accion y delivery-uber-conexion`.

---

### Task 5: POS — lib + barra de tienda + banner de expirados

**Files:**
- Modify: `apps/pos/app/lib/pedidos-apps.ts`
- Modify: `apps/pos/app/lib/__tests__/pedidos-apps.test.ts`
- Modify: `apps/pos/app/components/pantalla-pedidos-apps.tsx`
- Modify: `apps/pos/app/components/home-pos.tsx` (polling y prop nueva)
- Modify: `apps/pos/app/components/pantalla-inicio.tsx` (prop `expiradosApps` + banner)

- [ ] **Step 1: lib** — añadir a `pedidos-apps.ts`:

```ts
export type EstadoTiendaApp = { estado: "EN_LINEA" | "PAUSADA" | "DESCONOCIDO"; hasta: string | null; motivo: string | null; consultado_at: string };
export type DuracionPausa = "30m" | "1h" | "dia";
type RespTienda = { ok?: boolean; tienda?: EstadoTiendaApp; tiempo_prep_min?: number; error?: string; detalle?: string };

async function llamarAccion(token: string, cuerpo: Record<string, unknown>): Promise<RespTienda & { status: number }> {
  try {
    const r = await fetch(`${URL}/functions/v1/delivery-accion`, {
      method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
    });
    const j = (await r.json().catch(() => ({}))) as RespTienda;
    return { ...j, status: r.status, error: r.ok ? undefined : (j.error ?? `HTTP_${r.status}`) };
  } catch (e) { return { status: 0, error: "SIN_RED", detalle: e instanceof Error ? e.message : String(e) }; }
}

export type ResultadoTienda = { ok: true; tienda: EstadoTiendaApp; tiempoPrepMin?: number } | { ok: false; error: string; detalle?: string };
export async function leerTiendaUber(token: string, sucursalId: string, forzar = false): Promise<ResultadoTienda> {
  const r = await llamarAccion(token, { accion: "tienda_estado", sucursal_id: sucursalId, forzar });
  return r.error || !r.tienda ? { ok: false, error: r.error ?? "SIN_DATOS", detalle: r.detalle } : { ok: true, tienda: r.tienda, tiempoPrepMin: r.tiempo_prep_min };
}
export async function pausarTiendaUber(token: string, sucursalId: string, duracion: DuracionPausa): Promise<ResultadoTienda> {
  const r = await llamarAccion(token, { accion: "tienda_pausar", sucursal_id: sucursalId, duracion });
  return r.error || !r.tienda ? { ok: false, error: r.error ?? "SIN_DATOS", detalle: r.detalle } : { ok: true, tienda: r.tienda };
}
export async function reanudarTiendaUber(token: string, sucursalId: string): Promise<ResultadoTienda> {
  const r = await llamarAccion(token, { accion: "tienda_reanudar", sucursal_id: sucursalId });
  return r.error || !r.tienda ? { ok: false, error: r.error ?? "SIN_DATOS", detalle: r.detalle } : { ok: true, tienda: r.tienda };
}
export async function cambiarPrepUber(token: string, sucursalId: string, minutos: number): Promise<{ ok: true; tiempoPrepMin: number } | { ok: false; error: string; detalle?: string }> {
  const r = await llamarAccion(token, { accion: "tienda_prep", sucursal_id: sucursalId, minutos });
  return r.error || r.tiempo_prep_min === undefined ? { ok: false, error: r.error ?? "SIN_DATOS", detalle: r.detalle } : { ok: true, tiempoPrepMin: r.tiempo_prep_min };
}

export async function leerExpiradosHoy(token: string, sucursalId: string): Promise<{ n: number; ultimo: string | null }> {
  const { data, error } = await employeeClient(token).from("vw_delivery_expirados_hoy").select("n_expirados, ultimo_expirado_at").eq("sucursal_id", sucursalId).maybeSingle();
  if (error) throw new Error(error.message);
  const f = data as { n_expirados: number; ultimo_expirado_at: string | null } | null;
  return { n: f?.n_expirados ?? 0, ultimo: f?.ultimo_expirado_at ?? null };
}

const CLAVE_VISTO = "vimpos.apps.vistoExpirados";
export function marcarExpiradosVistos(hasta: string | null): void {
  try { localStorage.setItem(CLAVE_VISTO, hasta ?? new Date().toISOString()); } catch { /* sin storage */ }
}
export function hayExpiradosSinVer(ultimo: string | null): boolean {
  if (!ultimo) return false;
  try { const visto = localStorage.getItem(CLAVE_VISTO); return !visto || visto < ultimo; } catch { return true; }
}

export function horaCorta(iso: string | null, zona = "America/Mexico_City"): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat("es-MX", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}
export function etiquetaTienda(t: EstadoTiendaApp | null): string {
  if (!t || t.estado === "DESCONOCIDO") return "Uber: sin datos";
  if (t.estado === "EN_LINEA") return "Uber: en línea";
  const h = horaCorta(t.hasta);
  return h ? `Uber: pausada hasta ${h}` : "Uber: pausada";
}
export const OPCIONES_PAUSA: { codigo: DuracionPausa; label: string }[] = [
  { codigo: "30m", label: "30 minutos" }, { codigo: "1h", label: "1 hora" }, { codigo: "dia", label: "Resto del día" },
];
export function mensajeErrorTienda(codigo: string, detalle?: string): string {
  switch (codigo) {
    case "SIN_CONEXION_UBER": return "Esta sucursal no tiene conectada su tienda de Uber Eats.";
    case "TIENDA_ESTRATEGIA_UBER": return "Esta tienda solo se pausa desde Uber Eats Manager (Uber no permite hacerlo desde el POS).";
    case "PREP_FUERA_DE_RANGO": return "El tiempo de preparación debe estar entre 1 y 180 minutos.";
    case "SIN_RED": return "Sin conexión con la nube. Reintenta en unos segundos.";
    case "UBER_ERROR": return `Uber Eats no respondió${detalle ? ` (${detalle})` : ""}. Reintenta en un momento.`;
    default: return detalle ? `${codigo}: ${detalle}` : codigo;
  }
}
```

Pruebas nuevas en `pedidos-apps.test.ts`: `etiquetaTienda` (en línea / pausada hasta 12:40 para `hasta="2026-09-02T18:40:00Z"` / sin datos), `hayExpiradosSinVer` con `localStorage` simulado (definir `globalThis.localStorage` como Map en `beforeAll`, igual que en el admin), `mensajeErrorTienda` para los 3 códigos nuevos, `OPCIONES_PAUSA.length === 3`.

- [ ] **Step 2: Barra de tienda en `pantalla-pedidos-apps.tsx`** — estado `tienda: EstadoTiendaApp | null`, `prep: number | null`, `sinConexion: boolean`, `menuPausa: boolean`; `recargarTienda()` llama `leerTiendaUber` (sin forzar) en el mismo `setInterval` (cada 6.º tick = 60 s; o un `setInterval` propio de 60 s) y en el montaje; si responde `SIN_CONEXION_UBER` → `sinConexion = true` y la barra no se pinta. Markup debajo del `<header>`:

```tsx
{!sinConexion && (
  <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
    <span className={`inline-flex items-center gap-1.5 text-[13.5px] font-semibold ${tienda?.estado === "EN_LINEA" ? "text-success" : tienda?.estado === "PAUSADA" ? "text-warning" : "text-ink-3"}`}>
      <span className={`h-2 w-2 rounded-full ${tienda?.estado === "EN_LINEA" ? "bg-success" : tienda?.estado === "PAUSADA" ? "bg-warning" : "bg-ink-3"}`} />
      {etiquetaTienda(tienda)}
    </span>
    {prep !== null && (
      <span className="ml-3 inline-flex items-center gap-1 text-[13.5px] text-ink-2">
        Prep:
        <button type="button" aria-label="Menos 5 minutos" disabled={ocupadoTienda} onClick={() => cambiarPrep(prep - 5)} className="h-11 w-11 rounded border border-line-strong text-[16px] font-semibold text-ink disabled:opacity-50">−5</button>
        <span className="w-[64px] text-center font-semibold text-ink">{prep} min</span>
        <button type="button" aria-label="Más 5 minutos" disabled={ocupadoTienda} onClick={() => cambiarPrep(prep + 5)} className="h-11 w-11 rounded border border-line-strong text-[16px] font-semibold text-ink disabled:opacity-50">+5</button>
      </span>
    )}
    <span className="ml-auto flex gap-2">
      {tienda?.estado === "PAUSADA" ? (
        <button type="button" disabled={ocupadoTienda} onClick={reanudar} className="h-11 rounded bg-accent px-4 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50">Reanudar</button>
      ) : (
        <button type="button" disabled={ocupadoTienda || tienda === null} onClick={() => setMenuPausa(true)} className="h-11 rounded border border-line-strong px-4 text-[14px] font-semibold text-ink hover:bg-hover disabled:opacity-50">Pausar…</button>
      )}
    </span>
  </div>
)}
```
Menú de pausa: mismo patrón que el diálogo de rechazo (`role="dialog"`), con las tres opciones de `OPCIONES_PAUSA` y texto "Uber dejará de mandar pedidos a esta sucursal durante ese tiempo." `cambiarPrep(n)` clampa a 1..180 y llama `cambiarPrepUber`; los errores van al mismo `setError` con `mensajeErrorTienda`. Al entrar a la pantalla, `marcarExpiradosVistos(null)` (el usuario ya está viendo la lista; los EXPIRADOS aparecen en gris con "Expirado").

- [ ] **Step 3: Banner de expirados** — en `home-pos.tsx`, en el mismo efecto de polling de 10 s, además `leerExpiradosHoy(token, caja.sucursal_id).then(({ n, ultimo }) => setExpiradosApps(hayExpiradosSinVer(ultimo) ? n : 0)).catch(() => {})`; estado `const [expiradosApps, setExpiradosApps] = useState(0)`; pasar `expiradosApps={expiradosApps}` a `PantallaInicio`. En `pantalla-inicio.tsx`, prop `expiradosApps?: number` y, justo arriba del grid de accesos (donde empieza el bloque de `<Acceso label="Comedor"`; buscar el contenedor padre), un aviso:

```tsx
{expiradosApps > 0 && onPedidosApps && (
  <button type="button" onClick={onPedidosApps} role="alert"
    className="mx-4 mt-3 flex items-center gap-2 rounded border border-danger bg-danger-soft px-3 py-2.5 text-left text-[14px] font-semibold text-danger">
    <span className="h-2.5 w-2.5 rounded-full bg-danger" />
    {expiradosApps === 1 ? "Se venció 1 pedido de app sin aceptar." : `Se vencieron ${expiradosApps} pedidos de apps sin aceptar.`} Toca para ver Pedidos de apps.
  </button>
)}
```

- [ ] **Step 4: `cd apps/pos && pnpm vitest run && pnpm tsc --noEmit`** → verde. Commit: `feat(pos): barra de tienda Uber (pausar, reanudar, prep) y aviso de pedidos expirados`.

---

### Task 6: Admin — chip de tienda, Expirados hoy, prep vía función

**Files:**
- Modify: `apps/admin/app/lib/integraciones.ts`
- Modify: `apps/admin/app/(panel)/configuracion/integraciones/page.tsx`
- Modify: `apps/admin/app/lib/__tests__/integraciones.test.ts`

- [ ] **Step 1: lib** — `ConexionApp` gana `tienda: { estado: "EN_LINEA" | "PAUSADA" | "DESCONOCIDO"; hasta: string | null } | null` (leído de `config.tienda`; `select` añade `config`); `listarExpiradosHoy(): Promise<Record<string, number>>` (vista → mapa `sucursal_id → n`); sobrecarga `accionConexion("prep", { conexion_id, minutos })` → `{ tiempo_prep_min }`; `Verificacion` gana `tienda?`; `etiquetaTienda(t)` igual que en el POS ("En línea" / "Pausada hasta 12:40" / "Sin datos"); `MENSAJES.PREP_FUERA_DE_RANGO`.

- [ ] **Step 2: página** — columna "Expirados hoy" (número en `text-danger` si > 0, `—` si 0), chip de tienda bajo el nombre de la tienda, y `Prep (min)` `onBlur` → `accionConexion("prep", …)`; si falla, `e.target.value = String(cx.tiempo_prep_min)` y `setError(mensajeErrorIntegracion(e))`. Quitar `tiempo_prep_min` de `actualizarConexion` (queda solo `auto_aceptar`).

- [ ] **Step 3: pruebas** — `etiquetaTienda` (3 casos) y `mensajeErrorIntegracion(new Error("PREP_FUERA_DE_RANGO"))`. `cd apps/admin && pnpm vitest run && pnpm tsc --noEmit`. Commit: `feat(admin): estado de tienda, expirados hoy y prep sincronizado a Uber`.

---

### Task 7: Verificación en navegador, docs, suite completa

- [ ] **Step 1: POS en navegador** (`preview_start` `pos`, Supabase local, `delivery-accion` servida con credenciales falsas, conexión demo ACTIVA en la sucursal `…bb`): entrar con PIN 1234 (María) → Pedidos de apps → barra muestra "Uber: sin datos" y al pulsar Pausar → 30 minutos aparece el error amable de Uber; `+5` muestra el error igual y el número no cambia. Forzar un expirado en SQL (`insert delivery_pedidos RECIBIDO con vence_aceptacion = now() - 1 min; select delivery_marcar_expirados();`) → en el inicio aparece el banner; entrar a Pedidos de apps lo apaga. Capturas.
- [ ] **Step 2: Admin en navegador**: fila con chip "Sin datos", columna Expirados hoy = 1, cambiar Prep → error de Uber y valor restaurado.
- [ ] **Step 3: docs** — contrato README A6 → ✅ (`delivery-accion` tienda_* y `delivery-uber-conexion` prep/verificar; expirados por cron); runbook: sección "Pausar / prep / expirados"; `supabase/functions/README.md` ya en Task 4.
- [ ] **Step 4: `pnpm test && pnpm test:functions && supabase test db`** en verde. Commit docs. Luego `superpowers:finishing-a-development-branch`.
- [ ] **Step 5: Despliegue tras fusión (con confirmación de Fermín)**: `supabase db push` (0093 crea el cron en la nube), `supabase functions deploy delivery-accion` y `delivery-uber-conexion`, `git push origin main` (Vercel POS y admin). Verificar en la nube: `select jobname, schedule from cron.job` desde el SQL editor del dashboard.

---

## Self-review

- Cobertura: módulo puro (T1), cliente + orquestación con cache/eventos/403 (T2), migración + cron protegido + vista + pgTAP (T3), acciones en ambas funciones (T4), POS barra + banner + lib + tests (T5), admin chip/expirados/prep (T6), navegador/docs/despliegue (T7). Push a dispositivos queda fuera por decisión.
- Tipos: `EstadoTienda` en funciones ≡ `EstadoTiendaApp` en POS y `tienda` en admin (mismas 4 claves). `DuracionPausa` igual en los tres. Respuestas de `delivery-accion` para tienda: `{ ok, tienda, tiempo_prep_min }` y el POS las lee así.
- Sin placeholders: cada paso trae código o comando; los puntos de inserción en `home-pos.tsx` y `pantalla-inicio.tsx` se ubican por los anclajes citados (efecto de polling de 10 s; bloque de `<Acceso label="Comedor"`).
