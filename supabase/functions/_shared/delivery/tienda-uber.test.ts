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
  // 23:30 local del día 2 sigue siendo el día 2.
  assert.equal(finDelDia(new Date("2026-09-03T05:30:00.000Z"), "America/Mexico_City").toISOString(), "2026-09-03T05:59:59.000Z");
  // 00:30 local del día 3 → fin del día 3.
  assert.equal(finDelDia(new Date("2026-09-03T06:30:00.000Z"), "America/Mexico_City").toISOString(), "2026-09-04T05:59:59.000Z");
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
