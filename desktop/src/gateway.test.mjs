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

// ── Incidente de Knock-Out Obregón (2 oct 2026) ──────────────────────────────────────────────
// La caja decía «Sin internet» y «Failed to fetch» con el internet bien. Dos fallos encadenados:
// la revisión de salud daba falso positivo en una PC lenta (el watchdog reiniciaba un backend
// sano cada minuto) y, de cada tantos reinicios, uno se quedaba colgado para siempre.

/** PostgREST de mentira. `raiz`: qué hace con "/" (el OpenAPI de todo el esquema, lo caro);
 *  `sonda`: estado y cuerpo con que contesta la consulta barata a una tabla. */
async function conPostgrestFalso({ raiz = "nunca", sonda = [401, '{"code":"42501"}'] } = {}, fn) {
  const pedidas = [];
  const server = http.createServer((req, res) => {
    pedidas.push(req.url);
    if (req.url === "/") {
      if (raiz === "nunca") return; // se queda colgada: una PC donde el OpenAPI tarda más que el tope
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end("{}");
    }
    res.writeHead(sonda[0], { "Content-Type": "application/json" });
    res.end(sonda[1]);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try { await fn(server.address().port, pedidas); } finally { server.close(); server.closeAllConnections(); }
}

test("salud: /health/deep no pide el OpenAPI de PostgREST — en una PC lenta la caja sigue sana", async () => {
  await conPostgrestFalso({ raiz: "nunca" }, async (restPort, pedidas) => {
    await conGateway({ restPort }, async (port) => {
      const t = Date.now();
      const r = await pedir(port, { path: "/health/deep" });
      assert.equal(r.status, 200, r.text);
      assert.ok(Date.now() - t < 1500, `tardó ${Date.now() - t} ms: la salud no puede depender de algo que tarda segundos`);
      assert.ok(!pedidas.includes("/"), "pidió «/», que genera el OpenAPI de todo el esquema (2 s en una laptop buena)");
    });
  });
});

test("salud: /health/deep dice POR QUÉ falla (PostgREST sin base, Postgres caído)", async () => {
  await conPostgrestFalso({ sonda: [503, '{"code":"PGRST002","message":"Could not query the database for the schema cache. Retrying."}'] }, async (restPort) => {
    await conGateway({ restPort }, async (port) => {
      const r = await pedir(port, { path: "/health/deep" });
      assert.equal(r.status, 503);
      assert.match(JSON.parse(r.text).error, /PostgREST.*503.*PGRST002/);
    });
    const poolCaido = { query: async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:54329"); } };
    await conGateway({ restPort, pool: poolCaido }, async (port) => {
      const r = await pedir(port, { path: "/health/deep" });
      assert.equal(r.status, 503);
      assert.match(JSON.parse(r.text).error, /Postgres.*ECONNREFUSED/);
    });
  });
});

test("cierre: el gateway se cierra aunque una consulta en vuelo deje viva su conexión y el stream reconecte por ella", async () => {
  const { detenerBackend } = await import("./backend.mjs");
  // PostgREST que tarda: la consulta del POS está EN VUELO cuando llega el reinicio.
  const lento = http.createServer((req, res) => setTimeout(() => { res.writeHead(200, { "Content-Type": "application/json" }); res.end("[]"); }, 300));
  await new Promise((r) => lento.listen(0, "127.0.0.1", r));
  // Stream calcado de kds-stream.mjs: no termina hasta que alguien lo cierra.
  const clientes = new Set();
  const kds = {
    get nClientes() { return clientes.size; },
    handleSse(req, res) {
      res.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive" });
      res.write("event: hola\ndata: {}\n\n");
      clientes.add(res);
      req.on("close", () => clientes.delete(res));
    },
    stop() { for (const res of clientes) res.end(); },
  };
  const server = crearGateway({ restPort: lento.address().port, secret: SECRET, pool: poolFalso(), kds, kdsExigeToken: false });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  // El «navegador»: conexiones keep-alive que se reutilizan, como hace Chromium.
  const agent = new http.Agent({ keepAlive: true });
  const get = (path) => new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path, agent }, (res) => { res.on("data", () => {}); res.on("end", () => resolve("fin")); res.on("error", () => resolve("cortada")); });
    req.on("error", (e) => resolve(e.code));
  });
  try {
    get("/kds/stream");
    get("/rest/v1/tickets");
    await new Promise((r) => setTimeout(r, 100));
    // Lo que hace backend.stop() de verdad (el runtime, de mentira: aquí importa el gateway).
    const t = Date.now();
    const r = await detenerBackend({ kds, gateway: server, runtime: { stop: async () => ({ postgresDetenido: true }) } });
    assert.ok(Date.now() - t < 1000, `detener tardó ${Date.now() - t} ms`);
    assert.equal(r.postgresDetenido, true);
    // El stream reconecta (EventSource lo hace solo a los 3 s): ya no hay por dónde colarse.
    const reconexion = await get("/kds/stream");
    assert.match(reconexion, /^ECONNRE(FUSED|SET)$/, "el gateway cerrado no puede seguir atendiendo peticiones");
    assert.equal(clientes.size, 0, "quedó un stream vivo: el reinicio se quedaría esperándolo para siempre");
    assert.equal(server.listening, false);
  } finally {
    agent.destroy();
    try { server.close(); } catch { /* ya cerrado */ }
    server.closeAllConnections();
    lento.close(); lento.closeAllConnections();
  }
});

test("cierre: cerrarServidor no se queda esperando si el servidor no avisa de que cerró", async () => {
  const { cerrarServidor } = await import("./gateway.mjs");
  // Un servidor cuyo close() nunca llama al callback (lo que pasaba con el stream reconectado).
  const terco = { close() { /* nunca avisa */ }, closeAllConnections() {} };
  const t = Date.now();
  await cerrarServidor(terco, { graciaMs: 50, topeMs: 150 });
  assert.ok(Date.now() - t >= 140 && Date.now() - t < 1000);
  // Y uno que ya estaba cerrado (close lanza ERR_SERVER_NOT_RUNNING) tampoco tumba la parada.
  const cerrado = http.createServer(() => {});
  await cerrarServidor(cerrado);
});

/** Servidor suelto que contesta 200 tras `ms`, y cuántas peticiones atendió. */
async function servidorQueTarda(ms) {
  let atendidas = 0;
  const server = http.createServer((req, res) => {
    atendidas++;
    const t = setTimeout(() => { res.writeHead(200); res.end("listo"); }, ms);
    req.socket.once("close", () => clearTimeout(t)); // si el cierre corta la conexión, no queda un reloj vivo
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: server.address().port, atendidas: () => atendidas };
}

test("cierre: lo que estaba en vuelo termina (un cobro a medio contestar no se corta); lo eterno se corta al acabar la gracia", async () => {
  const { cerrarServidor } = await import("./gateway.mjs");
  const corto = await servidorQueTarda(120);
  const enVuelo = pedir(corto.port, { path: "/cobro" });
  await new Promise((r) => setTimeout(r, 30));
  let t = Date.now();
  await cerrarServidor(corto.server, { graciaMs: 1000 });
  assert.ok(Date.now() - t < 700, `no hay que agotar la gracia si ya no queda nada: tardó ${Date.now() - t} ms`);
  assert.equal((await enVuelo).status, 200, "la petición en vuelo recibió su respuesta completa");

  const eterno = await servidorQueTarda(60_000);
  const colgada = pedir(eterno.port, { path: "/lenta" }).then(() => "contestó", (e) => e.code);
  await new Promise((r) => setTimeout(r, 30));
  t = Date.now();
  await cerrarServidor(eterno.server, { graciaMs: 200 });
  assert.ok(Date.now() - t >= 190 && Date.now() - t < 1500, `tardó ${Date.now() - t} ms`);
  assert.equal(await colgada, "ECONNRESET", "al vencer la gracia se corta");
});

test("cierre: una conexión abierta que no ha pedido nada (la que el navegador deja lista) no retiene el cierre ni sirve después", async () => {
  const { cerrarServidor } = await import("./gateway.mjs");
  const { default: net } = await import("node:net");
  const s = await servidorQueTarda(0);
  // Así se quedó 61 s colgado un reinicio en Obregón sin ningún stream abierto.
  const muda = net.connect(s.port, "127.0.0.1");
  await new Promise((r) => muda.once("connect", r));
  const cerrada = new Promise((r) => muda.once("close", r));
  muda.on("error", () => {});
  const t = Date.now();
  await cerrarServidor(s.server, { graciaMs: 150 });
  assert.ok(Date.now() - t < 1500, `tardó ${Date.now() - t} ms`);
  await cerrada;
  assert.equal(s.atendidas(), 0);
});

test("cierre: durante la gracia, una conexión que queda libre se cierra — nadie la reutiliza para una petición nueva", async () => {
  const { cerrarServidor } = await import("./gateway.mjs");
  const s = await servidorQueTarda(100);
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const get = () => new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: s.port, path: "/", agent }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
    req.on("error", (e) => resolve(e.code));
  });
  try {
    const primera = get();
    await new Promise((r) => setTimeout(r, 30));
    const cierre = cerrarServidor(s.server, { graciaMs: 2000 });
    assert.equal(await primera, 200);
    await new Promise((r) => setTimeout(r, 200)); // la conexión quedó libre: el barrido ya la cerró
    assert.match(String(await get()), /ECONNREFUSED|ECONNRESET/, "el servidor que se está cerrando no atiende peticiones nuevas");
    await cierre;
    assert.equal(s.atendidas(), 1);
  } finally { agent.destroy(); }
});

test("cierre: lo que EMPIEZA mientras el gateway se cierra se rechaza limpio (503), y lo que estaba en vuelo contesta sin dejar la conexión para reutilizar", async () => {
  const { cerrarServidor, MENSAJE_REINICIO } = await import("./gateway.mjs");
  const { default: net } = await import("node:net");
  // PostgREST que tarda 200 ms: la consulta del POS está en vuelo cuando empieza el cierre.
  const lento = http.createServer((req, res) => setTimeout(() => { res.writeHead(200, { "Content-Type": "application/json" }); res.end("[]"); }, 200));
  await new Promise((r) => lento.listen(0, "127.0.0.1", r));
  const server = crearGateway({ restPort: lento.address().port, secret: SECRET, pool: poolFalso() });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  // Una conexión abierta sin petición (las que el navegador deja listas): sobrevive al close().
  const muda = net.connect(port, "127.0.0.1");
  await new Promise((r) => muda.once("connect", r));
  let respuestaMuda = "";
  muda.on("data", (d) => { respuestaMuda += d; });
  muda.on("error", () => {});
  try {
    const enVuelo = pedir(port, { path: "/rest/v1/tickets" });
    await new Promise((r) => setTimeout(r, 50));
    const cierre = cerrarServidor(server, { graciaMs: 1500 });
    // Un cobro que llega por esa conexión ya durante el cierre.
    muda.write(`POST /rest/v1/rpc/aplicar_pago HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}`);
    const r = await enVuelo;
    assert.equal(r.status, 200, "lo que estaba en vuelo termina");
    assert.equal(r.headers.connection, "close", "y no deja la conexión para que el navegador meta otra petición");
    await new Promise((res) => setTimeout(res, 100));
    assert.match(respuestaMuda, /^HTTP\/1\.1 503/);
    assert.match(respuestaMuda, /connection: close/i);
    assert.ok(respuestaMuda.includes(MENSAJE_REINICIO), "con un mensaje que el POS puede enseñar");
    await cierre;
  } finally {
    muda.destroy();
    lento.close(); lento.closeAllConnections();
  }
});

test("arranque: un puerto ocupado RECHAZA (antes era una excepción sin capturar y un arranque que no terminaba)", async () => {
  const { escuchar } = await import("./gateway.mjs");
  const ocupante = http.createServer(() => {});
  await new Promise((r) => ocupante.listen(0, "127.0.0.1", r));
  const puerto = ocupante.address().port;
  const segundo = http.createServer(() => {});
  try {
    await assert.rejects(escuchar(segundo, puerto, "127.0.0.1"), (e) => e.code === "EADDRINUSE" && /no se pudo abrir el puerto/.test(e.message));
    const libre = http.createServer(() => {});
    await escuchar(libre, 0, "127.0.0.1");
    assert.equal(libre.listening, true);
    await new Promise((r) => libre.close(r));
  } finally { await new Promise((r) => ocupante.close(r)); }
});

test("salud: un Postgres que no contesta se dice en su tope, antes de que el watchdog aborte a los 6 s", async () => {
  await conPostgrestFalso({}, async (restPort) => {
    const poolColgado = { query: () => new Promise(() => {}) };
    await conGateway({ restPort, pool: poolColgado }, async (port) => {
      const t = Date.now();
      const r = await pedir(port, { path: "/health/deep" });
      assert.equal(r.status, 503);
      assert.match(JSON.parse(r.text).error, /Postgres no contestó en \d+ ms/);
      assert.ok(Date.now() - t < 3000, `tardó ${Date.now() - t} ms`);
    });
  });
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
