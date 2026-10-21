import test from "node:test";
import assert from "node:assert/strict";
import { arrancarConReintentos, crearCapturaDeLog, diagnosticar, esperarPostgrest, reintentarBackend } from "./arranque-reintentos.mjs";

test("diagnosticar: reconoce puerto ocupado, candado, memoria compartida y permisos", () => {
  assert.match(diagnosticar('LOG:  could not bind IPv4 address "127.0.0.1": Address already in use'), /puerto/);
  assert.match(diagnosticar('FATAL:  lock file "postmaster.pid" already exists'), /candado/);
  assert.match(diagnosticar("FATAL:  pre-existing shared memory block (key 1234) is still in use"), /memoria compartida/);
  assert.match(diagnosticar("FATAL:  could not open file: Permission denied"), /permisos/);
  assert.equal(diagnosticar("algo raro"), null);
});

test("crearCapturaDeLog: guarda las últimas líneas y las vacía entre intentos", () => {
  const c = crearCapturaDeLog(3);
  c.onLog("a\nb\n");
  c.onLog("c");
  c.onLog("d");
  assert.equal(c.texto(), "b\nc\nd");
  c.vaciar();
  assert.equal(c.texto(), "");
});

test("arrancarConReintentos: falla dos veces (rechazo sin motivo, como embedded-postgres) y arranca a la tercera, limpiando entre intentos", async () => {
  const captura = crearCapturaDeLog();
  let llamadas = 0;
  const limpiezas = [];
  const logs = [];
  const arrancar = async () => {
    llamadas++;
    if (llamadas < 3) { captura.onLog('LOG:  could not bind IPv4 address "127.0.0.1": Address already in use'); return Promise.reject(undefined); }
  };
  const r = await arrancarConReintentos({ arrancar, limpiar: (i) => limpiezas.push(i), captura, intentos: 3, esperaMs: 1, log: (m) => logs.push(m) });
  assert.deepEqual(r, { intentos: 3 });
  assert.equal(llamadas, 3);
  assert.deepEqual(limpiezas, [1, 2], "limpia antes de cada reintento, no antes del primero ni después del éxito");
  assert.ok(logs.some((l) => /intento 1\/3.*puerto/.test(l)), "el log dice el motivo");
  assert.ok(logs.some((l) => /arrancó al intento 3/.test(l)));
});

test("arrancarConReintentos: si nunca arranca, lanza un Error con motivo y las líneas de Postgres", async () => {
  const captura = crearCapturaDeLog();
  const arrancar = async () => { captura.onLog('FATAL:  lock file "postmaster.pid" already exists'); throw undefined; };
  await assert.rejects(
    () => arrancarConReintentos({ arrancar, captura, intentos: 2, esperaMs: 1 }),
    (e) => e instanceof Error && /2 intentos/.test(e.message) && /candado/.test(e.message) && /postmaster\.pid/.test(e.message),
  );
});

test("arrancarConReintentos: arranca a la primera → un solo intento y sin limpiezas", async () => {
  let limpiezas = 0;
  const r = await arrancarConReintentos({ arrancar: async () => {}, limpiar: () => { limpiezas++; }, captura: crearCapturaDeLog(), esperaMs: 1 });
  assert.deepEqual(r, { intentos: 1 });
  assert.equal(limpiezas, 0);
});

// ── PostgREST: saber que murió, y volver a intentarlo ───────────────────────────────────────
//
// El fallo que esto blinda (cinco veces en el log de una caja entre agosto y octubre de 2026):
// Postgres arranca bien, PostgREST escribe «Starting» y «API server listening»… y deja de existir.
// La caja no se enteraba: esperaba 60 s a ciegas, decía «PostgREST no respondió» y se cerraba. Al
// abrirla otra vez, funcionaba.

const sinEspera = async () => {};
const rechazada = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });

test("esperarPostgrest: listo en cuanto contesta bien, aunque antes rechace o diga 503", async () => {
  const respuestas = [() => { throw rechazada(); }, () => ({ ok: false, status: 503 }), () => ({ ok: true, status: 200 })];
  let n = 0;
  const r = await esperarPostgrest({ sondear: async () => respuestas[n++](), espera: sinEspera });
  assert.equal(r.listo, true);
  assert.equal(n, 3);
});

test("esperarPostgrest: si el proceso se cerró lo dice YA, con su código, sin agotar la espera", async () => {
  let sondeos = 0;
  const r = await esperarPostgrest({
    sondear: async () => { sondeos++; throw rechazada(); },
    salida: () => (sondeos === 0 ? null : { code: 1, signal: null }), // vive hasta el primer sondeo
    vueltas: 120, espera: sinEspera,
  });
  assert.equal(r.listo, false);
  assert.equal(r.motivo, "salio");
  assert.equal(sondeos, 1, "no sigue sondeando a un proceso que ya no existe");
  assert.match(r.detalle, /se cerró/);
  assert.match(r.detalle, /código 1/);
});

test("esperarPostgrest: vivo pero sin contestar nunca → «mudo», y cuenta qué pasó en cada sondeo", async () => {
  const r = await esperarPostgrest({ sondear: async () => { throw rechazada(); }, vueltas: 4, espera: sinEspera });
  assert.equal(r.motivo, "mudo");
  assert.deepEqual(r.sondeos, { ECONNREFUSED: 4 });
  assert.match(r.detalle, /ECONNREFUSED ×4/);
});

test("esperarPostgrest: contesta 503 hasta el final → «sin-esquema»: está vivo, lo que no carga es la base", async () => {
  const r = await esperarPostgrest({ sondear: async () => ({ ok: false, status: 503 }), vueltas: 3, espera: sinEspera });
  assert.equal(r.motivo, "sin-esquema");
  assert.deepEqual(r.sondeos, { "HTTP 503": 3 });
});

test("esperarPostgrest: si la que muere es la base, tampoco espera el minuto contestando 503", async () => {
  let sondeos = 0;
  const r = await esperarPostgrest({
    sondear: async () => { sondeos++; return { ok: false, status: 503 }; },
    baseViva: () => sondeos < 2, // Postgres desaparece tras el segundo sondeo
    vueltas: 120, espera: sinEspera,
  });
  assert.equal(r.motivo, "sin-base");
  assert.equal(sondeos, 2);
  assert.match(r.detalle, /Postgres/);
});

test("reintentarBackend: un arranque que se puede reintentar se repite solo; el siguiente abre", async () => {
  const logs = [];
  const intentos = [];
  const r = await reintentarBackend(async (i) => {
    intentos.push(i);
    if (i === 1) throw Object.assign(new Error("PostgREST se cerró solo (código 1)"), { reintentable: true });
    return "backend";
  }, { esperaMs: 1, espera: sinEspera, log: (m) => logs.push(m) });
  assert.equal(r, "backend");
  assert.deepEqual(intentos, [1, 2]);
  assert.ok(logs.some((l) => l.includes("intento 1/3") && l.includes("se cerró solo")), "el log dice qué pasó en el intento fallido");
});

test("reintentarBackend: lo que no se arregla repitiendo (permisos, base rota) falla a la primera", async () => {
  let n = 0;
  await assert.rejects(
    reintentarBackend(async () => { n++; throw new Error("EPERM: operation not permitted"); }, { espera: sinEspera }),
    /EPERM/,
  );
  assert.equal(n, 1);
});

test("reintentarBackend: si ningún intento abre, lanza el último error tras agotar los intentos", async () => {
  let n = 0;
  await assert.rejects(
    reintentarBackend(async () => { n++; throw Object.assign(new Error(`fallo ${n}`), { reintentable: true }); }, { intentos: 3, espera: sinEspera }),
    /fallo 3/,
  );
  assert.equal(n, 3);
});
