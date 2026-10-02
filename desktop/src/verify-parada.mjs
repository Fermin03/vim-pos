// Detener el backend NUNCA puede quedarse colgado — con el backend de verdad (Postgres embebido +
// PostgREST + gateway), no con dobles. Sale del incidente de Knock-Out Obregón (2 oct 2026):
//
//  A) SALUD: /health/deep contesta en milisegundos, no en los segundos que tarda el OpenAPI.
//  B) PARADA CON LA CAJA EN USO: una consulta en vuelo y el stream del KDS abiertos. Antes, el
//     stream reconectaba por la conexión que la consulta dejaba viva y `stop()` no volvía nunca.
//  C) PARADA CON POSTGRES YA MUERTO: el caso para el que existe el watchdog. Antes, `stop()`
//     esperaba un aviso de salida que ya había pasado.
//
// Entorno aislado (dataRoot temporal y puertos propios): no toca el backend de desarrollo.
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import http from "node:http";
import path from "node:path";
import { startBackend } from "./backend.mjs";
import { conTope } from "./tope.mjs";
import { sondearPostgrest } from "./sonda-postgrest.mjs";

const PUERTOS = { pgPort: 54386, restPort: 54387, gatewayPort: 54388 };
const GW = `http://127.0.0.1:${PUERTOS.gatewayPort}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(path.join(tmpdir(), "vim-parada-"));
let ok = true;
const fail = (m) => { ok = false; console.error("❌", m); };
const lineas = [];
const arrancar = () => startBackend({ dataRoot: dir, ...PUERTOS, host: "127.0.0.1", uiPorts: [54360], log: (m) => lineas.push(m) });
const escucha = () => new Promise((resolve) => {
  const req = http.get({ host: "127.0.0.1", port: PUERTOS.gatewayPort, path: "/health", agent: false }, (res) => { res.resume(); resolve(true); });
  req.on("error", () => resolve(false));
});

let backend = null;
try {
  process.env.VIM_KDS_STREAM_AUTH = "0"; // el stream sin token: aquí se prueba el cierre, no el acceso
  backend = await arrancar();
  console.log("· backend arriba");

  // ── A) SALUD ───────────────────────────────────────────────────────────────
  // El contrato de la sonda contra el PostgREST de verdad: anon lee `tenants` → 401 (42501).
  const sana = await sondearPostgrest(PUERTOS.restPort);
  if (!sana.ok || sana.status !== 401) fail(`A) la sonda esperaba 401 de anon y obtuvo ${JSON.stringify(sana)}`);
  else console.log("  ✓ A) la sonda contra PostgREST real: 401 de anon = sano");
  const tiempos = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    const r = await fetch(`${GW}/health/deep`);
    if (!r.ok) fail(`/health/deep contestó ${r.status}: ${await r.text()}`);
    tiempos.push(performance.now() - t);
  }
  const peor = Math.max(...tiempos);
  if (peor > 1000) fail(`/health/deep tardó ${peor.toFixed(0)} ms (tope de la sonda: 4000). Con «/» de PostgREST eran ~2200 en esta máquina.`);
  else console.log(`  ✓ A) /health/deep sano en ${peor.toFixed(0)} ms como máximo (5 pasadas)`);

  // ── B) PARADA CON LA CAJA EN USO ───────────────────────────────────────────
  const agent = new http.Agent({ keepAlive: true });
  const get = (ruta) => new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: PUERTOS.gatewayPort, path: ruta, agent }, (res) => { res.on("data", () => {}); res.on("end", () => resolve("fin")); res.on("error", () => resolve("cortada")); });
    req.on("error", (e) => resolve(e.code));
  });
  get("/kds/stream");
  get("/rest/v1/"); // el OpenAPI entero: la consulta más lenta que hay, en vuelo durante la parada
  await wait(300);
  if (backend.kds.nClientes !== 1) fail(`se esperaba 1 stream abierto, hay ${backend.kds.nClientes}`);
  let t = performance.now();
  // Lo que hacía EventSource a los 3 s: reconectar. Aquí se intenta sin parar durante la parada.
  let colados = 0;
  const insistir = setInterval(() => { get("/kds/stream").then((r) => { if (r === "fin" || r === "cortada") colados++; }); }, 50);
  const b = await conTope(backend.stop(), 30_000);
  clearInterval(insistir);
  agent.destroy();
  if (b.vencio) fail("B) stop() no volvió en 30 s con un stream y una consulta abiertos");
  else console.log(`  ✓ B) stop() con la caja en uso volvió en ${((performance.now() - t) / 1000).toFixed(1)} s (reconexiones atendidas durante la parada: ${colados})`);
  if (!b.vencio && b.valor?.postgresDetenido !== true) fail(`B) stop() no confirmó que Postgres se detuvo: ${JSON.stringify(b.valor)}`);
  if (await escucha()) fail("B) el gateway sigue aceptando conexiones después de stop()");
  backend = null;

  // ── C) PARADA CON POSTGRES YA MUERTO ───────────────────────────────────────
  backend = await arrancar();
  const pid = parseInt(readFileSync(path.join(backend.dataDir, "postmaster.pid"), "utf8").split("\n")[0], 10);
  process.kill(pid, "SIGKILL");
  await wait(1500);
  const salud = await fetch(`${GW}/health/deep`).then(async (r) => ({ status: r.status, cuerpo: await r.json() })).catch((e) => ({ status: 0, cuerpo: { error: String(e) } }));
  if (salud.status !== 503) fail(`C) con Postgres muerto /health/deep contestó ${salud.status}`);
  else console.log(`  ✓ C) con Postgres muerto la salud dice por qué: «${salud.cuerpo.error}»`);
  // El contrato de la sonda contra el PostgREST de verdad: sin base, NO es sano.
  const sonda = await sondearPostgrest(PUERTOS.restPort);
  if (sonda.ok) fail(`C) la sonda dio «sano» con Postgres muerto: ${JSON.stringify(sonda)}`);
  else console.log(`  ✓ C) la sonda de PostgREST tampoco lo da por sano: «${sonda.error}»`);
  t = performance.now();
  const c = await conTope(backend.stop(), 60_000);
  if (c.vencio) fail("C) stop() no volvió en 60 s con Postgres ya muerto: el watchdog no podría reiniciar nunca");
  else console.log(`  ✓ C) stop() con Postgres ya muerto volvió en ${((performance.now() - t) / 1000).toFixed(1)} s`);
  backend = null;

  // Y la caja vuelve a levantar sobre el mismo pgdata (lo que hace el watchdog después).
  backend = await arrancar();
  const r = await fetch(`${GW}/health/deep`);
  if (!r.ok) fail(`tras el reinicio /health/deep contestó ${r.status}`);
  else console.log("  ✓ el backend vuelve a levantar sobre el mismo pgdata y queda sano");

  console.log(ok ? "\n✅ PARADA OK — la salud es barata y detener el backend no se cuelga." : "\n❌ PARADA con fallos.");
} catch (e) {
  fail(`excepción: ${e?.message ?? e}`); console.error(e);
  console.error(lineas.slice(-15).join("\n"));
} finally {
  try { if (backend) await conTope(backend.stop(), 60_000); } catch { /* */ }
  await wait(1000);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows suelta el pgdata tarde */ }
  process.exit(ok ? 0 : 1);
}
