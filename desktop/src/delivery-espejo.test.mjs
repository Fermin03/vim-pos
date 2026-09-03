import test from "node:test";
import assert from "node:assert/strict";
import { crearEspejo } from "./delivery-espejo.mjs";

const CAJA = "cccccccc-0000-0000-0000-0000000000cc";
const NUBE = { cloudUrl: "https://nube.test", anonKey: "anon", deviceToken: "DEV" };

/** Base local de mentira: registra SQL y responde lo mínimo que usa el agente. */
function poolFalso({ turnoAbierto = true, locales = [], fallaTicket = null } = {}) {
  const sql = [];
  const query = async (texto, params) => {
    sql.push({ texto, params });
    if (texto.startsWith("SELECT id, ticket_id, estado FROM delivery_pedidos")) return { rows: locales };
    if (texto.startsWith("SELECT 1 FROM turnos")) return { rows: turnoAbierto ? [{}] : [] };
    if (texto.startsWith("SELECT crear_ticket_desde_app")) { if (fallaTicket) throw new Error(fallaTicket); return { rows: [{ crear_ticket_desde_app: "tk-local" }] }; }
    return { rows: [] };
  };
  return { sql, query, connect: async () => ({ query, release() {} }) };
}

/** Nube de mentira: responde delivery-espejo y delivery-accion y registra las llamadas. */
function nubeFalsa({ pedidos, conexiones = [{ id: "cx1", auto_aceptar: true, tiempo_prep_min: 12, config: {} }], reclamoOk = true, aceptarStatus = 200 }) {
  const llamadas = [];
  const fetchFn = async (url, init) => {
    const body = JSON.parse(init.body);
    llamadas.push({ url: String(url), auth: init.headers.Authorization, body });
    const resp = (status, obj) => new Response(JSON.stringify(obj), { status });
    if (String(url).endsWith("/delivery-espejo")) return resp(200, { ahora: "2026-09-03T10:00:00Z", caja_id: CAJA, sucursal_id: "s", conexiones, pedidos });
    if (body.accion === "reclamar") return reclamoOk ? resp(200, { ok: true }) : resp(409, { error: "RECLAMADO_POR_OTRA_CAJA" });
    if (body.accion === "aceptar") return aceptarStatus === 200 ? resp(200, { ok: true, gestion: "ESCRITORIO" }) : resp(aceptarStatus, { error: "UBER_ERROR" });
    return resp(400, { error: "ACCION_DESCONOCIDA" });
  };
  return { llamadas, fetchFn };
}

const pedido = (extra = {}) => ({
  id: "p1", tenant_id: "t", sucursal_id: "s", conexion_id: "cx1", app: "APP_UBEREATS", id_externo: "u-1", folio_corto: "2A003",
  estado: "RECIBIDO", gestion: "ESCRITORIO", gestion_caja_id: null, items: [], items_sin_mapear: null,
  vence_aceptacion: "2026-09-03T10:11:00Z", recibido_at: "2026-09-03T10:00:00Z", ...extra,
});

test("tick: espeja, reclama, crea el ticket local y acepta en Uber con el token de dispositivo", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [pedido()] });
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn });
  const r = await agente.tick();
  assert.deepEqual(r, { espejados: 1, creados: 1, aceptados: 1, avisos: 0 });
  assert.ok(pool.sql.some((q) => q.texto.startsWith("INSERT INTO delivery_conexiones")), "espeja conexiones");
  const up = pool.sql.find((q) => q.texto.startsWith("INSERT INTO delivery_pedidos"));
  assert.ok(up, "espeja pedidos");
  assert.ok(up.texto.includes('"ticket_id" = COALESCE(delivery_pedidos."ticket_id", EXCLUDED."ticket_id")'), "conserva el ticket local");
  assert.ok(pool.sql.some((q) => q.texto.startsWith("SELECT crear_ticket_desde_app") && q.params[0] === "p1"), "crea el ticket local");
  const acciones = nube.llamadas.filter((l) => l.url.endsWith("/delivery-accion")).map((l) => l.body.accion);
  assert.deepEqual(acciones, ["reclamar", "aceptar"]);
  assert.ok(nube.llamadas.every((l) => l.auth === "Bearer DEV"), "siempre con el token de dispositivo");
  assert.equal(nube.llamadas.at(-1).body.tiempo_prep_min, 12, "el accept lleva el prep de la conexión");
});

test("tick: si otra caja ya reclamó, no crea ticket ni acepta", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [pedido()], reclamoOk: false });
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn });
  const r = await agente.tick();
  assert.equal(r.creados, 0);
  assert.ok(!pool.sql.some((q) => q.texto.startsWith("SELECT crear_ticket_desde_app")));
  assert.deepEqual(nube.llamadas.filter((l) => l.url.endsWith("/delivery-accion")).map((l) => l.body.accion), ["reclamar"]);
});

test("tick: sin turno abierto solo espeja; el ticket local que falla deja ultimo_error", async () => {
  const sinTurno = poolFalso({ turnoAbierto: false });
  const n1 = nubeFalsa({ pedidos: [pedido()] });
  const r1 = await crearEspejo({ pool: sinTurno, nube: async () => NUBE, cajaId: CAJA, fetchFn: n1.fetchFn }).tick();
  assert.deepEqual(r1, { espejados: 1, creados: 0, aceptados: 0, avisos: 0 });

  const falla = poolFalso({ fallaTicket: "ITEM_SIN_MAPEAR: Malteada" });
  const n2 = nubeFalsa({ pedidos: [pedido({ estado: "ACEPTADO" })] });
  const r2 = await crearEspejo({ pool: falla, nube: async () => NUBE, cajaId: CAJA, fetchFn: n2.fetchFn }).tick();
  assert.equal(r2.creados, 0);
  const err = falla.sql.find((q) => q.texto.startsWith("UPDATE delivery_pedidos SET ultimo_error"));
  assert.ok(err && err.params[1] === "ITEM_SIN_MAPEAR", "deja el código en ultimo_error");
  assert.ok(!n2.llamadas.some((l) => l.body.accion === "aceptar"), "no acepta si no hay ticket");
});

test("tick: la app canceló un pedido con ticket local → aviso; sin nube → omitido", async () => {
  const pool = poolFalso({ locales: [{ id: "p1", ticket_id: "tk", estado: "ACEPTADO" }] });
  const nube = nubeFalsa({ pedidos: [pedido({ estado: "CANCELADO" })] });
  const r = await crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn }).tick();
  assert.equal(r.avisos, 1);
  const av = pool.sql.find((q) => q.texto.startsWith("UPDATE delivery_pedidos SET ultimo_error"));
  assert.ok(av && /cancel/i.test(av.params[1]));
  const sin = await crearEspejo({ pool: poolFalso(), nube: async () => null, cajaId: CAJA, fetchFn: nube.fetchFn }).tick();
  assert.deepEqual(sin, { omitido: "sin nube" });
});
