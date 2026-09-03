import test from "node:test";
import assert from "node:assert/strict";
import { arrancarConReintentos, crearCapturaDeLog, diagnosticar } from "./arranque-reintentos.mjs";

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
