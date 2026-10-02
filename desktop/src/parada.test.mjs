// Detener el backend no puede quedarse colgado ni mentir sobre si Postgres quedó detenido.
// Incidente de Knock-Out Obregón (2 oct 2026). Aquí con dobles; con el backend de verdad, en
// `npm run verify:parada` (Windows, Postgres embebido).
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { EventEmitter } from "node:events";
import { detenerBackend } from "./backend.mjs";
import { detenerPostgres } from "./runtime.mjs";
import { crearKdsStream } from "./kds-stream.mjs";

const nunca = () => new Promise(() => {});

/** Cliente pg de mentira para el puente del KDS. */
function clienteFalso({ end = async () => {} } = {}) {
  const c = new EventEmitter();
  c.connect = async () => {};
  c.query = async () => ({ rows: [] });
  c.end = end;
  return c;
}

/** Respuesta HTTP de mentira: guarda lo que se le escribe. */
function resFalsa() {
  return { status: null, headers: null, cuerpo: "", terminada: false,
    writeHead(s, h) { this.status = s; this.headers = h; }, write(t) { this.cuerpo += t; }, end(t = "") { this.cuerpo += t; this.terminada = true; } };
}

test("stream del KDS: después de stop() no acepta streams nuevos (así se colaba el «KDS conectado» que colgaba el reinicio)", async () => {
  const lineas = [];
  const kds = await crearKdsStream({ pgPort: 1, crearCliente: () => clienteFalso(), log: (m) => lineas.push(m) });
  const url = new URL("http://x/kds/stream");
  const abierta = resFalsa();
  kds.handleSse(new EventEmitter(), abierta, url);
  assert.equal(abierta.status, 200);
  assert.equal(kds.nClientes, 1);

  await kds.stop();
  assert.equal(abierta.terminada, true, "stop() termina los streams abiertos");

  const tardia = resFalsa();
  kds.handleSse(new EventEmitter(), tardia, url, { Vary: "Origin" });
  assert.equal(tardia.status, 503);
  assert.equal(tardia.headers.Connection, "close", "sin dejar la conexión lista para reutilizar");
  assert.equal(tardia.headers.Vary, "Origin", "conserva las cabeceras CORS del gateway");
  assert.equal(tardia.terminada, true);
  assert.ok(!lineas.some((l) => /KDS conectado \(2/.test(l)));
});

test("stream del KDS: si Postgres muere, el 'error' de la conexión LISTEN se anota y no revienta el proceso", async () => {
  const lineas = [];
  let cliente;
  const kds = await crearKdsStream({ pgPort: 1, crearCliente: () => (cliente = clienteFalso()), log: (m) => lineas.push(m) });
  try {
    assert.doesNotThrow(() => cliente.emit("error", new Error("terminating connection due to unexpected postmaster exit")));
    assert.match(lineas.at(-1), /se perdió la conexión a Postgres .*postmaster exit/);
  } finally { await kds.stop(); }
});

test("detenerPostgres: si Postgres YA estaba muerto no espera un aviso que no va a llegar", async () => {
  let llamado = false, barrido = false, desarmado = false;
  const t = Date.now();
  const detenido = await detenerPostgres({
    pid: 4321, vivo: () => false,
    detener: () => { llamado = true; return nunca(); }, // así se colgaba: embedded-postgres espera 'exit'
    barrer: () => { barrido = true; },
    desarmar: () => { desarmado = true; },
  });
  assert.equal(detenido, true);
  assert.equal(llamado, false);
  assert.equal(barrido, true, "barre por si quedaron hijos sin padre");
  assert.equal(desarmado, true, "y suelta el PID viejo: al salir la app, embedded-postgres lo volvería a matar");
  assert.ok(Date.now() - t < 500);
});

test("detenerPostgres: lo normal — se detiene y lo dice; sin barrer nada", async () => {
  let barrido = false;
  assert.equal(await detenerPostgres({ pid: 4321, vivo: () => true, detener: async () => {}, barrer: () => { barrido = true; } }), true);
  assert.equal(barrido, false);
});

test("detenerPostgres: si no obedece, barre; y solo dice «detenido» si el proceso ya no existe", async () => {
  const lineas = [];
  let vivo = true;
  // El barrido lo mata:
  assert.equal(await detenerPostgres({ pid: 4321, vivo: () => vivo, detener: nunca, barrer: () => { vivo = false; }, topeMs: 40, log: (m) => lineas.push(m) }), true);
  // El barrido no puede con él: NO está detenido, y quien copie el pgdata tiene que saberlo.
  vivo = true;
  assert.equal(await detenerPostgres({ pid: 4321, vivo: () => vivo, detener: nunca, barrer: () => {}, topeMs: 40, log: (m) => lineas.push(m) }), false);
  assert.ok(lineas.some((l) => /SIGUE VIVO/.test(l)));
  // Sin PID no se puede comprobar: tampoco se da por detenido.
  assert.equal(await detenerPostgres({ pid: 0, detener: nunca, topeMs: 40 }), false);
  // Y un stop() que revienta no tumba la parada.
  assert.equal(await detenerPostgres({ pid: 4321, vivo: () => true, detener: async () => { throw new Error("taskkill"); }, barrer: () => {}, topeMs: 40 }), false);
});

test("detenerBackend: en orden — primero deja de atender, y solo entonces toca la base", async () => {
  const pasos = [];
  const server = http.createServer(() => {});
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const r = await detenerBackend({
    kds: { stop: async () => { pasos.push("kds"); } },
    gateway: server,
    runtime: { stop: async () => { pasos.push(server.listening ? "runtime-con-gateway-abierto" : "runtime"); return { postgresDetenido: true }; } },
  });
  assert.deepEqual(pasos, ["kds", "runtime"]);
  assert.deepEqual(r, { postgresDetenido: true });
});

test("detenerBackend: un puente del KDS que no cierra nunca no detiene la parada", async () => {
  const lineas = [];
  const server = http.createServer(() => {});
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const t = Date.now();
  const r = await detenerBackend({
    kds: { stop: nunca }, gateway: server, topeKdsMs: 60,
    runtime: { stop: async () => ({ postgresDetenido: true }) },
    log: (m) => lineas.push(m),
  });
  assert.equal(r.postgresDetenido, true);
  assert.ok(Date.now() - t < 1500);
  assert.ok(lineas.some((l) => /el stream del KDS no cerró a tiempo/.test(l)));
});

test("detenerBackend: sin confirmación de que Postgres se detuvo, lo dice (el respaldo no copia a ciegas)", async () => {
  const server = () => http.createServer(() => {});
  const lineas = [];
  for (const runtime of [
    { stop: async () => ({ postgresDetenido: false }) },
    { stop: async () => undefined },                       // un runtime viejo que no devolvía nada
    { stop: async () => { throw new Error("EPERM"); } },
  ]) {
    const s = server();
    await new Promise((r) => s.listen(0, "127.0.0.1", r));
    assert.deepEqual(await detenerBackend({ kds: { stop: async () => {} }, gateway: s, runtime, log: (m) => lineas.push(m) }), { postgresDetenido: false });
  }
  assert.ok(lineas.some((l) => /el runtime no se detuvo limpio \(EPERM\)/.test(l)));
});
