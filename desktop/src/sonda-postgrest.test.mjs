// El contrato de la sonda de PostgREST (la que decide si el watchdog reinicia la caja).
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { sondearPostgrest, RUTA_SONDA, explicarError } from "./sonda-postgrest.mjs";

async function conServidor(manejar, fn) {
  const pedidas = [];
  const server = http.createServer((req, res) => { pedidas.push(`${req.method} ${req.url}`); manejar(req, res); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try { await fn(server.address().port, pedidas); } finally { server.close(); server.closeAllConnections(); }
}
const contesta = (status, cuerpo = "") => (req, res) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(cuerpo); };

test("sonda: pide una lectura mínima a una tabla, nunca «/» (la descripción de todo el esquema)", async () => {
  await conServidor(contesta(401, '{"code":"42501"}'), async (port, pedidas) => {
    await sondearPostgrest(port);
    assert.deepEqual(pedidas, [`GET ${RUTA_SONDA}`]);
    assert.notEqual(RUTA_SONDA, "/");
  });
});

test("sonda: sano = PostgREST contesta por debajo de 500 (401 de anon, 200, o 404 si la tabla dejara de exponerse)", async () => {
  for (const status of [401, 200, 403, 404]) {
    await conServidor(contesta(status, "{}"), async (port) => {
      assert.deepEqual(await sondearPostgrest(port), { ok: true, status }, `estado ${status}`);
    });
  }
});

test("sonda: 503 = PostgREST sin base o sin esquema; el motivo trae el código", async () => {
  await conServidor(contesta(503, '{"code":"PGRST002","message":"Could not query the database for the schema cache. Retrying."}'), async (port) => {
    const r = await sondearPostgrest(port);
    assert.equal(r.ok, false);
    assert.equal(r.status, 503);
    assert.equal(r.error, "PostgREST contestó 503 (PGRST002)");
  });
  await conServidor(contesta(500, "no es json"), async (port) => {
    assert.equal((await sondearPostgrest(port)).error, "PostgREST contestó 500");
  });
});

test("sonda: el 400 SIN código de PostgREST justo después de morir Postgres no cuenta como sano; un 400 con código sí", async () => {
  // Medido contra PostgREST 14.14 real (verify:parada): +300 ms tras matar Postgres.
  await conServidor(contesta(400, '{"code":"","details":null,"hint":null,"message":""}'), async (port) => {
    assert.deepEqual(await sondearPostgrest(port), { ok: false, status: 400, error: "PostgREST perdió la conexión con la base (400 sin código)" });
  });
  await conServidor(contesta(400, '{"code":"PGRST100","message":"parse error"}'), async (port) => {
    assert.deepEqual(await sondearPostgrest(port), { ok: true, status: 400 });
  });
});

test("sonda: un PostgREST que acepta y no contesta falla en su tope y lo dice; un puerto cerrado también", async () => {
  await conServidor(() => { /* se queda callado */ }, async (port) => {
    const t = Date.now();
    const r = await sondearPostgrest(port, { timeoutMs: 150 });
    assert.deepEqual(r, { ok: false, error: "PostgREST no contestó en 150 ms" });
    assert.ok(Date.now() - t < 1500);
  });
  const libre = http.createServer(() => {});
  await new Promise((r) => libre.listen(0, "127.0.0.1", r));
  const puerto = libre.address().port;
  await new Promise((r) => libre.close(r));
  const r = await sondearPostgrest(puerto, { timeoutMs: 2000 });
  assert.equal(r.ok, false);
  assert.match(r.error, /PostgREST inalcanzable \(ECONNREFUSED\)/);
});

test("explicarError: saca un motivo aunque el error venga sin mensaje", () => {
  assert.equal(explicarError(Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } })), "ECONNREFUSED");
  assert.equal(explicarError(Object.assign(new AggregateError([Object.assign(new Error("x"), { code: "ECONNREFUSED" })], ""), {})), "ECONNREFUSED");
  assert.equal(explicarError(new Error("pool roto")), "pool roto");
});
