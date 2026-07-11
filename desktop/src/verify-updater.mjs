// Fase 3 · Verificación headless del actualizador (Opción B): detección de versión, descarga y
// verificación SHA-512, y rechazo de una descarga con hash equivocado. Sirve un feed + instalador
// falsos desde un http local.
import http from "node:http";
import crypto from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { buscarActualizacion, descargarInstalador, esMasNueva } from "./updater.mjs";

const contenido = Buffer.from("INSTALADOR FALSO ".repeat(2000)); // ~34 KB
const sha = crypto.createHash("sha512").update(contenido).digest("hex");
let manifest;

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/latest.json")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(manifest)); }
  if (req.url.startsWith("/installer.exe")) { res.writeHead(200, { "content-type": "application/octet-stream", "content-length": String(contenido.length) }); return res.end(contenido); }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const feed = `http://127.0.0.1:${port}/latest.json`;
manifest = { version: "9.9.9", url: `http://127.0.0.1:${port}/installer.exe`, sha512: sha, notas: "test", fecha: "2026-07-11" };

let ok = true;
const fail = (m) => { ok = false; console.error("❌", m); };
const dest = path.join(os.tmpdir(), "vim-updater-test.exe");

try {
  // esMasNueva (semver)
  if (!esMasNueva("0.2.0", "0.1.0")) fail("0.2.0 debería ser > 0.1.0");
  if (esMasNueva("0.1.0", "0.1.0")) fail("igual no es más nueva");
  if (esMasNueva("0.1.0", "0.2.0")) fail("0.1.0 no es > 0.2.0");
  if (!esMasNueva("1.0.0", "0.9.9")) fail("1.0.0 debería ser > 0.9.9");
  console.log("· esMasNueva OK");

  // detección
  const info = await buscarActualizacion(feed, "0.1.0");
  if (!info.hay || info.version !== "9.9.9") fail("no detectó la actualización"); else console.log("· detecta v9.9.9 sobre v0.1.0 ✓");
  const info2 = await buscarActualizacion(feed, "9.9.9");
  if (info2.hay) fail("no debería reportar update en la misma versión"); else console.log("· al día no reporta update ✓");

  // descarga + SHA-512 correcto
  try { rmSync(dest, { force: true }); } catch { /* */ }
  await descargarInstalador(manifest.url, sha, dest);
  if (!existsSync(dest)) fail("no descargó el instalador"); else console.log("· descarga + SHA-512 correcto ✓");

  // hash MALO → rechaza + borra
  try { rmSync(dest, { force: true }); } catch { /* */ }
  let rechazado = false;
  try { await descargarInstalador(manifest.url, "deadbeef00", dest); } catch { rechazado = true; }
  if (!rechazado) fail("no rechazó el hash equivocado");
  else if (existsSync(dest)) fail("no borró la descarga corrupta");
  else console.log("· hash equivocado RECHAZADO + archivo borrado ✓");

  console.log(ok ? "\n✅ UPDATER OK — detección + descarga verificada + rechazo de corrupción." : "\n❌ UPDATER con fallos.");
} catch (e) {
  fail(`excepción: ${e.message}`); console.error(e);
} finally {
  try { rmSync(dest, { force: true }); } catch { /* */ }
  server.close();
  process.exitCode = ok ? 0 : 1;
}
