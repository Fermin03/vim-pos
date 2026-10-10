// El actualizador: la firma del manifiesto (activada en 0.4.103) y, contra un feed y un instalador
// falsos servidos por http local, la detección de versión y la descarga verificada con SHA-512.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { LLAVE_PUBLICA_ACTUALIZACIONES, firmaValida, mensajeAFirmar, buscarActualizacion, descargarInstalador, esMasNueva } from "./updater.mjs";

const M = { version: "0.4.103", url: "https://github.com/Fermin03/vim-pos-descargas/releases/download/v0.4.103/VIM.POS.Setup.0.4.103.exe", sha512: "a".repeat(128) };

test("la llave pública de las cajas es una llave Ed25519 válida", () => {
  const llave = crypto.createPublicKey(LLAVE_PUBLICA_ACTUALIZACIONES);
  assert.equal(llave.asymmetricKeyType, "ed25519");
});

test("un manifiesto sin firma, o firmado con otra llave, no pasa", () => {
  assert.equal(firmaValida(M, LLAVE_PUBLICA_ACTUALIZACIONES), false);
  const ajena = crypto.generateKeyPairSync("ed25519").privateKey;
  const firma = crypto.sign(null, Buffer.from(mensajeAFirmar(M), "utf8"), ajena).toString("base64");
  assert.equal(firmaValida({ ...M, firma }, LLAVE_PUBLICA_ACTUALIZACIONES), false);
});

test("la firma cubre versión, url y sha512: cambiar cualquiera la invalida", () => {
  const par = crypto.generateKeyPairSync("ed25519");
  const pub = par.publicKey.export({ type: "spki", format: "pem" }).toString();
  const firma = crypto.sign(null, Buffer.from(mensajeAFirmar(M), "utf8"), par.privateKey).toString("base64");
  assert.equal(firmaValida({ ...M, firma }, pub), true);
  assert.equal(firmaValida({ ...M, firma, url: M.url + "x" }, pub), false);
  assert.equal(firmaValida({ ...M, firma, sha512: "b".repeat(128) }, pub), false);
  assert.equal(firmaValida({ ...M, firma, version: "0.4.104" }, pub), false);
  // Notas y fecha no van firmadas: son texto para el cajero y no deciden qué se instala.
  assert.equal(firmaValida({ ...M, firma, notas: "otra cosa" }, pub), true);
});

// ── Feed e instalador falsos ─────────────────────────────────────────────────────────────────

const contenido = Buffer.from("INSTALADOR FALSO ".repeat(2000)); // ~34 KB
const sha = crypto.createHash("sha512").update(contenido).digest("hex");
const llaves = crypto.generateKeyPairSync("ed25519");
const llavePublica = llaves.publicKey.export({ type: "spki", format: "pem" }).toString();
let manifiesto;

const servidor = http.createServer((req, res) => {
  if (req.url.startsWith("/latest.json")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(manifiesto)); }
  if (req.url.startsWith("/installer.exe")) { res.writeHead(200, { "content-type": "application/octet-stream", "content-length": String(contenido.length) }); return res.end(contenido); }
  res.writeHead(404); res.end();
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const feed = `${base}/latest.json`;
manifiesto = { version: "9.9.9", url: `${base}/installer.exe`, sha512: sha, notas: "test", fecha: "2026-07-11" };
manifiesto.firma = crypto.sign(null, Buffer.from(mensajeAFirmar(manifiesto), "utf8"), llaves.privateKey).toString("base64");
const destino = path.join(os.tmpdir(), `vim-updater-test-${process.pid}.exe`);
after(() => { rmSync(destino, { force: true }); servidor.close(); });

test("esMasNueva compara x.y.z como números", () => {
  assert.equal(esMasNueva("0.2.0", "0.1.0"), true);
  assert.equal(esMasNueva("0.1.0", "0.1.0"), false);
  assert.equal(esMasNueva("0.1.0", "0.2.0"), false);
  assert.equal(esMasNueva("1.0.0", "0.9.9"), true);
  assert.equal(esMasNueva("0.10.0", "0.9.0"), true);
});

test("el feed: detecta una versión nueva, al día no reporta nada, y sin la firma de VIM no pasa", async () => {
  const info = await buscarActualizacion(feed, "0.1.0", { permitirHttp: true, llavePublica });
  assert.equal(info.hay, true);
  assert.equal(info.version, "9.9.9");
  assert.equal((await buscarActualizacion(feed, "9.9.9", { permitirHttp: true, llavePublica })).hay, false);
  // Con la llave de verdad (la que traen las cajas), este manifiesto firmado con otra se rechaza.
  await assert.rejects(buscarActualizacion(feed, "0.1.0", { permitirHttp: true }), /firma/);
  // Y por http, sin el permiso de las pruebas, ni se mira.
  await assert.rejects(buscarActualizacion(feed, "0.1.0", { llavePublica }), /https/);
});

test("la descarga verifica el SHA-512; con un hash equivocado se rechaza y se borra", async () => {
  const r = await descargarInstalador(manifiesto.url, sha, destino, undefined, { permitirHttp: true });
  assert.equal(r.verificado, true);
  assert.equal(existsSync(destino), true);
  rmSync(destino, { force: true });
  await assert.rejects(descargarInstalador(manifiesto.url, "deadbeef00", destino, undefined, { permitirHttp: true }), /SHA-512/);
  assert.equal(existsSync(destino), false, "no borró la descarga corrupta");
});
