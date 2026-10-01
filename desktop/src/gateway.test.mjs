// Pruebas del gateway local (Auditoría integral 30/09/2026, D2–D5). Sin Postgres: un pool falso
// basta para lo que se prueba aquí (el login contra la BD real está en auth.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import { crearGateway, TOPE_CUERPO_CORTO } from "./gateway.mjs";
import { crearLimitador } from "./limitador.mjs";
import { opcionesGateway } from "./backend.mjs";

const SECRET = "s".repeat(40);

/** Pool falso: nadie existe (todo login falla) salvo que se diga otra cosa. */
function poolFalso({ usuario = null } = {}) {
  return { query: async () => ({ rows: usuario ? [usuario] : [] }) };
}

async function conGateway(backend, fn) {
  const server = crearGateway({ restPort: 1, secret: SECRET, pool: poolFalso(), ...backend });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try { await fn(port); } finally { await new Promise((r) => server.close(r)); }
}

/** http.request (fetch no deja fijar Host). */
function pedir(port, { method = "GET", path = "/", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

// Una clave cualquiera que no es la de la caja (constante y no literal en el cuerpo: los escáneres
// de secretos marcan `password: "..."` aunque sea una prueba).
const CLAVE_EQUIVOCADA = "no-es-la-clave";

test("D3: el gateway rechaza un Host ajeno (DNS rebinding) y atiende localhost/127.0.0.1", async () => {
  await conGateway({}, async (port) => {
    assert.equal((await pedir(port, { path: "/health", headers: { Host: `evil.example:${port}` } })).status, 403);
    assert.equal((await pedir(port, { method: "OPTIONS", path: "/rest/v1/tickets", headers: { Host: `evil.example:${port}` } })).status, 403);
    assert.equal((await pedir(port, { path: "/health", headers: { Host: `localhost:${port}` } })).status, 200);
    assert.equal((await pedir(port, { path: "/health", headers: { Host: `127.0.0.1:${port}` } })).status, 200);
  });
});

test("D2: tras 10 contraseñas fallidas el login local contesta 429 (por IP y por cuenta)", async () => {
  let reloj = 1_000_000;
  const limitador = crearLimitador({ max: 10, ventanaMs: 300_000, bloqueoMs: 900_000, ahora: () => reloj });
  await conGateway({ limitador }, async (port) => {
    const intento = (email = "caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.com.mx") => pedir(port, {
      method: "POST", path: "/auth/v1/token?grant_type=password",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: CLAVE_EQUIVOCADA }),
    });
    for (let i = 0; i < 10; i++) assert.equal((await intento()).status, 400, `intento ${i + 1}`);
    const bloqueado = await intento();
    assert.equal(bloqueado.status, 429);
    assert.ok(Number(bloqueado.headers["retry-after"]) > 0);
    // Misma IP, otra cuenta: también bloqueada (la IP ya agotó sus intentos).
    assert.equal((await intento("dueno@knockout.dev")).status, 429);
    reloj += 900_001;
    assert.equal((await intento()).status, 400, "pasado el bloqueo vuelve a poder intentar");
  });
});

test("D4: un cuerpo por encima del tope se corta con 413 sin llegar al login", async () => {
  await conGateway({}, async (port) => {
    const r = await pedir(port, {
      method: "POST", path: "/auth/v1/token?grant_type=password",
      headers: { "Content-Type": "application/json" }, body: "x".repeat(TOPE_CUERPO_CORTO + 1),
    });
    assert.equal(r.status, 413);
  });
});

test("D4: /kds/stream tiene tope de clientes y exige token válido (salvo VIM_KDS_STREAM_AUTH=0)", async () => {
  const kds = { nClientes: 32, handleSse: (req, res) => { res.writeHead(200); res.end("sse"); } };
  await conGateway({ kds, kdsExigeToken: false }, async (port) => {
    assert.equal((await pedir(port, { path: "/kds/stream" })).status, 503, "lleno");
  });
  const kdsLibre = { nClientes: 0, handleSse: (req, res) => { res.writeHead(200); res.end("sse"); } };
  await conGateway({ kds: kdsLibre }, async (port) => {
    assert.equal((await pedir(port, { path: "/kds/stream" })).status, 401, "por defecto exige token");
  });
  await conGateway({ kds: kdsLibre, kdsExigeToken: false }, async (port) => {
    assert.equal((await pedir(port, { path: "/kds/stream" })).status, 200, "con la salida de emergencia, abierto");
  });
  const usuario = { id: "u1", email: "caja-x@dispositivos.vimpos.com.mx", tenant_id: "t", rol: "DISPOSITIVO" };
  await conGateway({ kds: kdsLibre, kdsExigeToken: true, pool: poolFalso({ usuario }) }, async (port) => {
    assert.equal((await pedir(port, { path: "/kds/stream" })).status, 401, "sin token");
    assert.equal((await pedir(port, { path: "/kds/stream?access_token=basura" })).status, 401, "token inválido");
    const tok = jwt.sign({ sub: "u1", role: "authenticated" }, SECRET, { algorithm: "HS256", expiresIn: 60 });
    assert.equal((await pedir(port, { path: `/kds/stream?access_token=${tok}` })).status, 200);
  });
});

test("D5: delivery-accion ve el proveedor de nube aunque se asigne DESPUÉS de crear el gateway", async () => {
  // Nube falsa que recibe el reenvío.
  const recibidas = [];
  const nube = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c));
    req.on("end", () => { recibidas.push({ url: req.url, auth: req.headers.authorization, b }); res.writeHead(200); res.end('{"ok":true}'); });
  });
  await new Promise((r) => nube.listen(0, "127.0.0.1", r));
  const cloudUrl = `http://127.0.0.1:${nube.address().port}`;
  const usuario = { id: "u1", email: "maria@x", tenant_id: "t", rol: "CAJERO" };
  // Como en backend.mjs: el objeto vivo es el que main.mjs muta.
  const vivo = { restPort: 1, secret: SECRET, pool: poolFalso({ usuario }) };
  const server = crearGateway(opcionesGateway(vivo, {}));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const tok = jwt.sign({ sub: "u1", role: "authenticated" }, SECRET, { algorithm: "HS256", expiresIn: 60 });
  const accion = () => pedir(port, {
    method: "POST", path: "/functions/v1/delivery-accion",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: '{"accion":"pausar"}',
  });
  try {
    assert.equal((await accion()).status, 503, "sin nube todavía");
    vivo.nube = async () => ({ cloudUrl, anonKey: "anon", deviceToken: "DEV" }); // main.mjs: backend.nube = …
    const r = await accion();
    assert.equal(r.status, 200, r.text);
    assert.equal(recibidas.length, 1);
    assert.equal(recibidas[0].auth, "Bearer DEV", "reenvía con el token de dispositivo");
    // Así era antes (backend.mjs pasaba una COPIA): la asignación posterior no llegaba nunca.
    const vivoViejo = { restPort: 1, secret: SECRET, pool: poolFalso({ usuario }) };
    const viejo = crearGateway({ ...vivoViejo, kds: null, uiPorts: [] });
    await new Promise((r) => viejo.listen(0, "127.0.0.1", r));
    vivoViejo.nube = vivo.nube;
    const rv = await pedir(viejo.address().port, {
      method: "POST", path: "/functions/v1/delivery-accion",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: "{}",
    });
    await new Promise((r) => viejo.close(r));
    assert.equal(rv.status, 503, "con la copia, el bug: FUNCION_REQUIERE_NUBE aunque haya nube");
  } finally {
    await new Promise((r) => server.close(r));
    await new Promise((r) => nube.close(r));
  }
});

test("respaldo diario: el gateway avisa cuando alguien OPERA la caja, no cuando el POS sondea", async () => {
  let avisos = 0;
  const vivo = { restPort: 1, secret: SECRET, pool: poolFalso() };
  // Como en backend.mjs: llega por opcionesGateway, igual que kds y uiPorts.
  const server = crearGateway(opcionesGateway(vivo, { alHaberActividad: () => { avisos++; } }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    await pedir(port, { path: "/health" });
    await pedir(port, { path: "/auth/v1/user" });
    await pedir(port, { method: "POST", path: "/auth/v1/token?grant_type=refresh_token", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(avisos, 0, "sondeos y refresco de sesión no son actividad");
    await pedir(port, { method: "POST", path: "/functions/v1/pin-login", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(avisos, 1, "un intento de entrar con PIN sí");
    // Un host ajeno (DNS rebinding) se rechaza ANTES: no cuenta como actividad de la caja.
    await pedir(port, { method: "POST", path: "/functions/v1/pin-login", headers: { Host: "malo.example", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(avisos, 1);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("durante el respaldo, el puerto del gateway contesta un 503 claro y reintentable, legible por el POS", async () => {
  const { crearGatewayDeEspera, MENSAJE_RESPALDO } = await import("./gateway.mjs");
  const server = crearGatewayDeEspera({ uiPorts: [54360] });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const r = await pedir(port, { method: "POST", path: "/rest/v1/rpc/abrir_turno", headers: { Origin: "http://localhost:54360", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(r.status, 503);
    assert.equal(r.headers["retry-after"], "5");
    assert.equal(r.headers["access-control-allow-origin"], "http://localhost:54360", "sin CORS el navegador solo ve «Failed to fetch»");
    const cuerpo = JSON.parse(r.text);
    assert.equal(cuerpo.message, MENSAJE_RESPALDO); // supabase-js enseña `message`
    assert.equal(cuerpo.error, "RESPALDO_EN_CURSO");
    assert.match(MENSAJE_RESPALDO, /respaldo diario; intenta en unos segundos/);
    assert.equal((await pedir(port, { method: "OPTIONS", path: "/rest/v1/tickets", headers: { Origin: "http://localhost:54360" } })).status, 204);
    assert.equal((await pedir(port, { path: "/health", headers: { Host: "malo.example" } })).status, 403);
  } finally { await new Promise((r) => server.close(r)); }
});
