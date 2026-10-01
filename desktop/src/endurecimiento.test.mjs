// Auditoría integral 30/09/2026 — piezas puras del endurecimiento del escritorio (D3, D4, D6, D9,
// D10, D11). Lo que toca red o Postgres está en gateway.test, ui-server.test, auth.test y
// privilegios.test.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hostsPropios, hostPermitido } from "./hosts-propios.mjs";
import { crearLimitador } from "./limitador.mjs";
import { crearCacheCorta } from "./cache-corta.mjs";
import { poolVigente } from "./pool-vigente.mjs";
import { origenesDe, navegacionPermitida, abrirFueraPermitido } from "./navegacion.mjs";
import { buscarActualizacion, descargarInstalador, nombreInstaladorTemporal, mensajeAFirmar, firmaValida } from "./updater.mjs";
import { matarHuerfanos, conectarSuperusuario } from "./runtime.mjs";

// ── D3 · hosts propios ───────────────────────────────────────────────────────
test("D3: solo cuentan como propios loopback, las IP de la máquina y su nombre de equipo", () => {
  const hosts = hostsPropios({
    interfaces: { eth0: [{ family: "IPv4", address: "192.168.1.50" }, { family: "IPv6", address: "fe80::1%eth0" }] },
    nombreEquipo: "CAJA-PC", extra: "caja.lan",
  });
  for (const h of ["localhost:54350", "127.0.0.1:54360", "[::1]:54350", "192.168.1.50:54350", "caja-pc:54360", "caja-pc.local", "CAJA.LAN:1", "[fe80::1]:54350"]) {
    assert.equal(hostPermitido(h, hosts), true, h);
  }
  for (const h of ["evil.example:54350", "192.168.1.51:54350", "127.0.0.1.nip.io:54350", "localhost.evil.example", "a b"]) {
    assert.equal(hostPermitido(h, hosts), false, h);
  }
  assert.equal(hostPermitido(undefined, hosts), true, "sin Host (proceso local, no un navegador)");
});

// ── D2 · limitador ───────────────────────────────────────────────────────────
test("D2: el limitador bloquea al llegar al máximo dentro de la ventana, y un éxito limpia la cuenta", () => {
  let t = 0;
  const l = crearLimitador({ max: 3, ventanaMs: 1000, bloqueoMs: 5000, ahora: () => t });
  l.fallo("a"); l.fallo("a");
  assert.equal(l.restante("a"), 0);
  t = 1500; // los dos primeros ya salieron de la ventana
  l.fallo("a"); l.fallo("a");
  assert.equal(l.restante("a"), 0);
  l.fallo("a");
  assert.equal(l.restante("a"), 5000);
  t += 5001;
  assert.equal(l.restante("a"), 0);
  l.fallo("b"); l.fallo("b"); l.exito("b"); l.fallo("b"); l.fallo("b");
  assert.equal(l.restante("b"), 0, "el éxito reinició la cuenta");
});

// ── D4 · caché de /__folios ──────────────────────────────────────────────────
test("D4: la consulta de folios va a la nube una vez por minuto, pidan cuantos pidan", async () => {
  let t = 0;
  let llamadas = 0;
  const c = crearCacheCorta({ ttlMs: 60_000, ahora: () => t });
  const consulta = async () => { llamadas++; await new Promise((r) => setTimeout(r, 5)); return { ok: true, n: llamadas }; };
  const juntas = await Promise.all(Array.from({ length: 50 }, () => c.obtener(consulta)));
  assert.equal(llamadas, 1, "50 peticiones simultáneas = 1 consulta");
  assert.ok(juntas.every((r) => r.n === 1));
  t = 59_000; await c.obtener(consulta); assert.equal(llamadas, 1);
  t = 60_001; await c.obtener(consulta); assert.equal(llamadas, 2);
});

// ── D6 · pool vigente ────────────────────────────────────────────────────────
test("D6: el espejo usa el pool del backend VIGENTE, también tras un reinicio", async () => {
  const hacerPool = (nombre) => {
    let cerrado = false;
    return {
      nombre, end() { cerrado = true; },
      async query() { if (cerrado) throw new Error("Cannot use a pool after calling end on the pool"); return { rows: [{ nombre }] }; },
      async connect() { if (cerrado) throw new Error("cerrado"); return { nombre }; },
    };
  };
  let backend = { pool: hacerPool("uno") };
  const pool = poolVigente(() => backend?.pool);
  assert.equal((await pool.query("SELECT 1")).rows[0].nombre, "uno");
  // reiniciarBackend: stop() cierra el pool viejo y entra uno nuevo.
  backend.pool.end();
  backend = null;
  await assert.rejects(pool.query("SELECT 1"), /reiniciando/, "a medio reinicio: error claro, no un pool muerto");
  await assert.rejects(pool.query("SELECT 1").catch((e) => { throw e; }), /reiniciando/, "y encadenable con .catch()");
  backend = { pool: hacerPool("dos") };
  assert.equal((await pool.query("SELECT 1")).rows[0].nombre, "dos");
  assert.equal((await pool.connect()).nombre, "dos");
});

// ── D9 · navegación de la ventana ────────────────────────────────────────────
test("D9: la ventana solo navega a sus orígenes; window.open solo abre https fuera", () => {
  const o = origenesDe(["http://localhost:54360", "http://127.0.0.1:54360", undefined, "https://pos.vimpos.com.mx", "no es url"]);
  assert.equal(navegacionPermitida("http://localhost:54360/?kds", o), true);
  assert.equal(navegacionPermitida("https://pos.vimpos.com.mx/cobro", o), true);
  assert.equal(navegacionPermitida("http://localhost:54350/rest/v1/", o), false, "otro puerto, otro origen");
  assert.equal(navegacionPermitida("https://evil.example/", o), false);
  assert.equal(navegacionPermitida("file:///C:/Windows/", o), false);
  assert.equal(abrirFueraPermitido("https://vimpos.com.mx/ayuda"), true);
  assert.equal(abrirFueraPermitido("file:///C:/x.exe"), false);
  assert.equal(abrirFueraPermitido("javascript:alert(1)"), false);
});

// ── D10 · actualizador ───────────────────────────────────────────────────────
async function conFeed(manifest, fn) {
  const server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(manifest)); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try { await fn(`http://127.0.0.1:${server.address().port}/latest.json`); } finally { await new Promise((r) => server.close(r)); }
}
const SHA = "a".repeat(128);

test("D10: el nombre del instalador solo admite x.y.z (nada de rutas)", () => {
  assert.equal(nombreInstaladorTemporal("0.4.99"), "VIM-POS-Setup-0.4.99.exe");
  for (const v of ["1.0.0/../../Startup/x", "1.0.0\\..\\x", "1.0", "1.0.0-beta", "", null]) {
    assert.throws(() => nombreInstaladorTemporal(v), /versión inválida/, String(v));
  }
});

test("D10: el manifiesto exige versión x.y.z y URL https", async () => {
  await conFeed({ version: "9.9.9\\..\\x", url: "https://x/y.exe", sha512: SHA }, async (feed) => {
    await assert.rejects(buscarActualizacion(feed, "0.1.0"), /x\.y\.z/);
  });
  await conFeed({ version: "9.9.9", url: "http://x/y.exe", sha512: SHA }, async (feed) => {
    await assert.rejects(buscarActualizacion(feed, "0.1.0"), /https/);
  });
  await conFeed({ version: "9.9.9", url: "https://x/y.exe", sha512: SHA }, async (feed) => {
    // Desde la 0.4.103 la caja trae llave: un manifiesto sin firma se rechaza por omisión…
    await assert.rejects(buscarActualizacion(feed, "0.1.0"), /firma/);
    // …y solo sin llave (pruebas, o una caja anterior) se acepta sin firmar.
    assert.equal((await buscarActualizacion(feed, "0.1.0", { llavePublica: null })).hay, true);
  });
  await assert.rejects(descargarInstalador("http://x/y.exe", SHA, path.join(tmpdir(), "no")), /https/);
});

test("D10: con llave pública configurada, solo pasa un manifiesto firmado por su privada", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pub = publicKey.export({ type: "spki", format: "pem" });
  const base = { version: "9.9.9", url: "https://x/y.exe", sha512: SHA };
  const firma = crypto.sign(null, Buffer.from(mensajeAFirmar(base)), privateKey).toString("base64");
  assert.equal(firmaValida({ ...base, firma }, pub), true);
  assert.equal(firmaValida({ ...base, firma, url: "https://evil/y.exe" }, pub), false, "cambiar la URL rompe la firma");
  assert.equal(firmaValida({ ...base, firma, sha512: "b".repeat(128) }, pub), false, "cambiar el hash rompe la firma");
  assert.equal(firmaValida(base, pub), false, "sin firma");
  await conFeed({ ...base, firma }, async (feed) => {
    assert.equal((await buscarActualizacion(feed, "0.1.0", { llavePublica: pub })).hay, true);
  });
  await conFeed(base, async (feed) => {
    await assert.rejects(buscarActualizacion(feed, "0.1.0", { llavePublica: pub }), /firma/);
  });
});

// ── D11 · huérfanos y contraseña ─────────────────────────────────────────────
test("D11: tras un corte de luz no se mata un PID reciclado por otro programa", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vim-huerfanos-"));
  const pidfile = path.join(dir, ".pids.json");
  try {
    writeFileSync(pidfile, JSON.stringify({ pids: [101, 102, 103] }));
    writeFileSync(path.join(dir, "postmaster.pid"), "104\n");
    const muertos = [];
    const nombres = () => new Map([[101, "postgrest.exe"], [102, "explorer.exe"], [104, "postgres.exe"]]); // 103 ya no existe
    matarHuerfanos(dir, () => {}, pidfile, { nombres, matar: (p) => muertos.push(p) });
    assert.deepEqual(muertos.sort(), [101, 104]);
    assert.equal(existsSync(pidfile), false);
    assert.equal(existsSync(path.join(dir, "postmaster.pid")), false, "el candado se retira siempre");
    // Si el sistema no deja preguntar (CIM caído), se conserva el comportamiento anterior.
    writeFileSync(pidfile, JSON.stringify({ pids: [201] }));
    const m2 = [];
    matarHuerfanos(dir, () => {}, pidfile, { nombres: () => null, matar: (p) => m2.push(p) });
    assert.deepEqual(m2, [201]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("D11: un respaldo con la contraseña de fábrica abre y se vuelve a rotar a la de la instalación", async () => {
  const hechas = [];
  const clienteFalso = (claveReal) => (pw) => ({
    async connect() { if (pw !== claveReal) { const e = new Error("password authentication failed"); e.code = "28P01"; throw e; } },
    async query(sql) { hechas.push(sql); },
    async end() {},
  });
  const r = await conectarSuperusuario(clienteFalso("postgres"), "nueva-clave-de-la-caja-123456");
  assert.equal(r.rotada, true);
  assert.match(hechas[0], /ALTER ROLE postgres PASSWORD 'nueva-clave-de-la-caja-123456'/);
  const ok = await conectarSuperusuario(clienteFalso("buena"), "buena");
  assert.equal(ok.rotada, false);
  await assert.rejects(conectarSuperusuario(clienteFalso("otra"), "buena"), /password authentication failed/);
});
