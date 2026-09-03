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
    actualizarEstadoTienda: async (_id: string, cuerpo: unknown) => {
      llamadas.push("estado:" + JSON.stringify(cuerpo));
      const c = cuerpo as { status: string; is_offline_until?: string };
      return { status: c.status, is_offline_until: c.is_offline_until };
    },
    actualizarPrepTienda: async (_id: string, cuerpo: unknown) => {
      llamadas.push("prep:" + JSON.stringify(cuerpo));
      return { prep_times: { default_value: (cuerpo as { default_prep_time: number }).default_prep_time } };
    },
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

test("consultarEstadoTienda: cache viejo → Uber; si Uber falla, evento con error y se propaga", async () => {
  const viejo = { tienda: { estado: "EN_LINEA", hasta: null, motivo: null, consultado_at: "2026-09-02T17:00:00.000Z" } };
  const a = armar({ estadoTienda: async () => { throw new Error("UBER_TOKEN_401"); } });
  await assert.rejects(() => consultarEstadoTienda(a.deps, cx(viejo)), /UBER_TOKEN_401/);
  assert.equal(a.inserts.filter((i) => i.tipo === "tienda_estado" && i.procesado === false).length, 1);
  assert.equal(a.updates.length, 0);
});

test("pausarTienda: manda OFFLINE con hasta, guarda cache y evento", async () => {
  const a = armar({});
  const r = await pausarTienda(a.deps, cx(), "30m");
  assert.equal(r.estado, "PAUSADA");
  assert.equal(r.hasta, "2026-09-02T18:40:00.000Z");
  assert.ok(a.llamadas[0].startsWith("estado:{\"status\":\"OFFLINE\""));
  assert.equal(a.inserts.filter((i) => i.tipo === "tienda_pausar" && i.procesado === true).length, 1);
  assert.equal(a.updates.length, 1);
});

test("pausarTienda: 403 de estrategia → TIENDA_ESTRATEGIA_UBER, evento con error, sin tocar la conexión", async () => {
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
  assert.equal(a.inserts.filter((i) => i.tipo === "tienda_prep" && i.procesado === true).length, 1);
});

test("cambiarPrepTienda: si Uber falla no se toca la BD; fuera de rango ni se llama", async () => {
  const a = armar({ actualizarPrepTienda: async () => { throw new Error("UBER_HTTP_500:/x:boom"); } });
  await assert.rejects(() => cambiarPrepTienda(a.deps, cx(), 20), /UBER_HTTP_500/);
  assert.equal(a.updates.length, 0);
  await assert.rejects(() => cambiarPrepTienda(a.deps, cx(), 500), /PREP_FUERA_DE_RANGO/);
  // El fake que falla no registra llamada; el fuera de rango tampoco llega a Uber ni deja evento.
  assert.equal(a.llamadas.length, 0);
  assert.equal(a.inserts.filter((i) => i.tipo === "tienda_prep").length, 1, "solo el fallo de Uber deja evento");
});
