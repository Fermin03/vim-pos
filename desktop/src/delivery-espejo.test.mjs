import test from "node:test";
import assert from "node:assert/strict";
import { crearEspejo } from "./delivery-espejo.mjs";

const CAJA = "cccccccc-0000-0000-0000-0000000000cc";
const NUBE = { cloudUrl: "https://nube.test", anonKey: "anon", deviceToken: "DEV" };

/** Base local de mentira: registra SQL y responde lo mínimo que usa el agente. */
function poolFalso({ turnoAbierto = true, locales = [], fallaTicket = null, fallaEspejoLocal = false } = {}) {
  const sql = [];
  const query = async (texto, params) => {
    sql.push({ texto, params });
    if (fallaEspejoLocal && texto.startsWith("INSERT INTO delivery_pedidos")) throw new Error("disco lleno");
    if (texto.startsWith("SELECT id, ticket_id, estado FROM delivery_pedidos")) return { rows: locales };
    if (texto.startsWith("SELECT 1 FROM turnos")) return { rows: turnoAbierto ? [{}] : [] };
    if (texto.startsWith("SELECT crear_ticket_desde_app")) { if (fallaTicket) throw new Error(fallaTicket); return { rows: [{ crear_ticket_desde_app: "tk-local" }] }; }
    return { rows: [] };
  };
  return { sql, query, connect: async () => ({ query, release() {} }) };
}

/** Nube de mentira: responde delivery-espejo y delivery-accion y registra las llamadas. */
function nubeFalsa({ pedidos, conexiones = [{ id: "cx1", auto_aceptar: true, tiempo_prep_min: 12, config: {} }], reclamoOk = true, aceptarStatus = 200, siguienteEnMs = 10_000 }) {
  const llamadas = [];
  const fetchFn = async (url, init) => {
    const body = JSON.parse(init.body);
    llamadas.push({ url: String(url), auth: init.headers.Authorization, body });
    const resp = (status, obj) => new Response(JSON.stringify(obj), { status });
    if (String(url).endsWith("/delivery-espejo")) return resp(200, { ahora: "2026-09-03T10:00:00Z", caja_id: CAJA, sucursal_id: "s", conexiones, pedidos, siguiente_en_ms: siguienteEnMs });
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

test("tras un 401 pide token nuevo con forzar y reintenta; el log dice vigencia y sesión, no el token", async () => {
  const { resumenToken } = await import("./delivery-espejo.mjs");
  const carga = Buffer.from(JSON.stringify({ exp: 1_000_000_000 + 3600, iat: 1_000_000_000, session_id: "abcdef12-0000", sub: "secreto" })).toString("base64url");
  const jwt = `h.${carga}.f`;
  const r = resumenToken(jwt, 1_000_000_000 * 1000 + 60_000);
  assert.match(r, /emitido hace 60s, vence en 3540s, sesión abcdef12/);
  assert.doesNotMatch(r, /secreto/);

  const pool = poolFalso();
  const pedidos = [];
  let llamadasNube = 0;
  const forzados = [];
  const nube = async ({ forzar } = {}) => { llamadasNube++; forzados.push(forzar === true); return { ...NUBE, deviceToken: jwt }; };
  let respuestas = 0;
  const fetchFn = async () => {
    respuestas++;
    return respuestas === 1
      ? new Response(JSON.stringify({ error: "AUTH_INVALIDA", detalle: "session not found" }), { status: 401 })
      : new Response(JSON.stringify({ ahora: "x", caja_id: CAJA, sucursal_id: "s", conexiones: [], pedidos }), { status: 200 });
  };
  const logs = [];
  const agente = crearEspejo({ pool, nube, cajaId: CAJA, fetchFn, log: (m) => logs.push(m) });
  const r1 = await agente.tick();
  assert.equal(r1.error, 401);
  assert.ok(logs.some((m) => /token rechazado \(session not found\)/.test(m) && /sesión abcdef12/.test(m) && !m.includes(jwt)));
  const r2 = await agente.tick();
  assert.equal(r2.error, undefined);
  assert.equal(llamadasNube, 2, "el segundo tick volvió a pedir token");
  assert.deepEqual(forzados, [false, true], "el segundo login fue forzado");
});

// ── Delta y ritmo (optimización 2026-09-09) ──────────────────────────────────
// El agente sondeaba cada 10 s y se traía TODOS los pedidos de las últimas 24 h en cada vuelta,
// tuviera el cliente delivery o no. Ahora pide solo lo que cambió y el servidor le dice cuándo
// volver.

/** Captura las esperas que programa el agente, sin relojes de verdad. */
function relojFalso() {
  const esperas = [];
  return {
    esperas,
    setTimeoutFn: (fn, ms) => { esperas.push(ms); return { unref() {} }; },
    clearTimeoutFn: () => {},
  };
}
const centro = () => 0.5; // jitter neutro

test("el primer sondeo va sin cursor; el siguiente pide solo lo que cambió", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [pedido({ updated_at: "2026-09-03T10:00:05Z" })] });
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn });
  await agente.tick();
  await agente.tick();
  const sondeos = nube.llamadas.filter((l) => l.url.endsWith("/delivery-espejo"));
  assert.equal(sondeos[0].body.desde, undefined, "el primero va en frío");
  assert.equal(sondeos[1].body.desde, "2026-09-03T10:00:05Z", "el segundo lleva el cursor");
});

test("sin pedidos que espejar no se toca la tabla local de pedidos, pero las conexiones sí", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [] });
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn });
  const r = await agente.tick();
  assert.equal(r.espejados, 0);
  assert.ok(!pool.sql.some((q) => q.texto.startsWith("SELECT id, ticket_id, estado FROM delivery_pedidos")));
  assert.ok(!pool.sql.some((q) => q.texto.startsWith("SELECT 1 FROM turnos")), "ni siquiera pregunta por el turno");
  assert.ok(!pool.sql.some((q) => q.texto.startsWith("INSERT INTO delivery_pedidos")));
  assert.ok(pool.sql.some((q) => q.texto.startsWith("INSERT INTO delivery_conexiones")), "las conexiones sí se espejan");
});

test("la caja obedece la cadencia que manda el servidor", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [], siguienteEnMs: 300_000 });
  const reloj = relojFalso();
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn, aleatorio: centro, ...reloj });
  await agente.vuelta();
  assert.equal(reloj.esperas.at(-1), 300_000);
});

test("un servidor que no manda cadencia deja el ritmo de siempre: no rompe con nubes viejas", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [], siguienteEnMs: null });
  const reloj = relojFalso();
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn, aleatorio: centro, ...reloj });
  await agente.vuelta();
  assert.equal(reloj.esperas.at(-1), 10_000);
});

test("tras un sondeo fallido la caja espera más, en vez de martillear cada 10 s", async () => {
  const pool = poolFalso();
  const reloj = relojFalso();
  const agente = crearEspejo({
    pool, nube: async () => NUBE, cajaId: CAJA, aleatorio: centro, ...reloj,
    fetchFn: async () => { throw new Error("sin red"); },
  });
  await agente.vuelta();
  assert.equal(reloj.esperas.at(-1), 20_000, "primer fallo: el doble");
  await agente.vuelta();
  assert.equal(reloj.esperas.at(-1), 40_000, "segundo fallo: el doble otra vez");
});

test("un sondeo bueno después de fallar borra el backoff", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [], siguienteEnMs: 30_000 });
  const reloj = relojFalso();
  let rompe = true;
  const agente = crearEspejo({
    pool, nube: async () => NUBE, cajaId: CAJA, aleatorio: centro, ...reloj,
    fetchFn: async (...a) => { if (rompe) throw new Error("sin red"); return nube.fetchFn(...a); },
  });
  await agente.vuelta();
  rompe = false;
  await agente.vuelta();
  assert.equal(reloj.esperas.at(-1), 30_000);
});

test("con un ticket local pendiente la caja no se duerme aunque el servidor mande reposo", async () => {
  const pool = poolFalso({ fallaTicket: "SIN_TURNO_ABIERTO" }); // el ticket no se pudo crear: queda pendiente
  const nube = nubeFalsa({ pedidos: [pedido({ estado: "ACEPTADO" })], siguienteEnMs: 300_000 });
  const reloj = relojFalso();
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn, aleatorio: centro, ...reloj });
  await agente.vuelta();
  assert.equal(reloj.esperas.at(-1), 10_000);
});

test("si el espejo local falla, el cursor no avanza: la vuelta siguiente vuelve a pedir lo mismo", async () => {
  const pool = poolFalso({ fallaEspejoLocal: true });
  const nube = nubeFalsa({ pedidos: [pedido({ updated_at: "2026-09-03T10:00:05Z" })] });
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn });
  const r = await agente.tick();
  assert.ok(r.error, "la vuelta falló");
  await agente.tick();
  const sondeos = nube.llamadas.filter((l) => l.url.endsWith("/delivery-espejo"));
  assert.equal(sondeos[1].body.desde, undefined, "sigue en frío hasta que el espejo local cuaje");
});
