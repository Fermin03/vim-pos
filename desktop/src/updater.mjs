// Fase 3 · Actualizador in-app (Opción B — sin certificado; el manifiesto SÍ va firmado). La app revisa un manifiesto JSON en un
// hosting (bucket público de Supabase Storage por defecto), compara versiones y, si hay una nueva,
// avisa y ofrece descargar el instalador verificando su SHA-512 (integridad garantizada aunque no
// haya certificado de firma). El main lo instala cerrando la app y lanzando el instalador NSIS.
//
// Formato de latest.json:
//   { "version": "0.2.0", "url": "https://…/VIM POS Setup 0.2.0.exe", "sha512": "<hex>",
//     "notas": "texto opcional", "fecha": "2026-07-11" }
import crypto from "node:crypto";
import { createWriteStream, rmSync } from "node:fs";

/** ¿`remota` es una versión semver mayor que `actual`? (comparación numérica x.y.z). */
export function esMasNueva(remota, actual) {
  const pr = String(remota).split(".").map((n) => parseInt(n, 10) || 0);
  const pa = String(actual).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pr[i] || 0) > (pa[i] || 0)) return true;
    if ((pr[i] || 0) < (pa[i] || 0)) return false;
  }
  return false;
}

// ── Auditoría integral 30/09/2026, D10 ─────────────────────────────────────────────────────────
// El manifiesto no está firmado y trae la URL y el sha512 juntos: quien pueda escribir latest.json
// (el bucket) controla las dos mitades. Mientras no haya firma, al menos:
//   · la versión tiene que ser x.y.z estricto: se usa para nombrar el archivo temporal, y algo como
//     "1.0.0/../../Startup/x" escribía el .exe donde quisiera quien controle el manifiesto;
//   · la URL tiene que ser https: por http, cualquiera en la red del local cambia el binario Y,
//     si alguien sirviera también el manifiesto por http, el hash.
// Y queda preparada la firma Ed25519 del manifiesto (ver RUNBOOK.md, "Firmar latest.json"): en
// cuanto LLAVE_PUBLICA_ACTUALIZACIONES tenga una llave, un manifiesto sin firma válida se rechaza.

/**
 * Llave pública Ed25519 (PEM, SPKI) con la que VIM firma latest.json. Activada el 1 oct 2026
 * (0.4.103): desde esta versión, un manifiesto sin firma válida se rechaza. La privada vive FUERA
 * del repo, en la máquina que publica (RUNBOOK.md, "Firmar latest.json"). La misma llave pública
 * está en apps/platform/app/lib/llave-actualizaciones.ts; una prueba comprueba que coinciden.
 */
export const LLAVE_PUBLICA_ACTUALIZACIONES = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAuhG8DQnYVNubeVr1xwovi9ulC9M9L3GHtuqEnZJ2tCQ=
-----END PUBLIC KEY-----
`;

const VERSION_ESTRICTA = /^\d+\.\d+\.\d+$/;

/** Nombre del instalador descargado. Solo con una versión x.y.z: nunca una ruta. */
export function nombreInstaladorTemporal(version) {
  if (!VERSION_ESTRICTA.test(String(version))) throw new Error(`versión inválida en el manifiesto: ${JSON.stringify(version)}`);
  return `VIM-POS-Setup-${version}.exe`;
}

/**
 * Lo que se firma: una línea por campo, en orden fijo. No se firma el JSON tal cual porque su
 * serialización (espacios, orden de claves) cambia con la herramienta que lo escriba.
 */
export function mensajeAFirmar({ version, url, sha512 }) {
  return `vim-pos-actualizacion\nversion=${version}\nurl=${url}\nsha512=${String(sha512).toLowerCase()}\n`;
}

/** ¿`firma` (base64) es una firma Ed25519 válida del manifiesto con `llavePublicaPem`? */
export function firmaValida(m, llavePublicaPem) {
  if (typeof m?.firma !== "string" || !m.firma) return false;
  try {
    const llave = crypto.createPublicKey(llavePublicaPem);
    return crypto.verify(null, Buffer.from(mensajeAFirmar(m), "utf8"), llave, Buffer.from(m.firma, "base64"));
  } catch {
    return false;
  }
}

function exigirHttps(url, permitirHttp, que) {
  let u;
  try { u = new URL(url); } catch { throw new Error(`${que}: URL inválida`); }
  if (u.protocol === "https:") return;
  if (permitirHttp && u.protocol === "http:") return;
  throw new Error(`${que}: solo se aceptan URLs https (llegó ${u.protocol})`);
}

/**
 * Lee el manifiesto del feed y decide si hay actualización respecto a `versionActual`.
 * `opciones.llavePublica` (PEM) exige firma; por defecto, LLAVE_PUBLICA_ACTUALIZACIONES.
 * `opciones.permitirHttp` solo para las pruebas headless contra un servidor local.
 */
export async function buscarActualizacion(feedUrl, versionActual, opciones = {}) {
  const { llavePublica = LLAVE_PUBLICA_ACTUALIZACIONES, permitirHttp = false } = opciones;
  const r = await fetch(feedUrl, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!r.ok) throw new Error(`feed respondió ${r.status}`);
  const m = await r.json();
  if (!m || !m.version || !m.url) throw new Error("manifiesto inválido (falta version/url)");
  if (!VERSION_ESTRICTA.test(String(m.version))) throw new Error(`manifiesto inválido: versión ${JSON.stringify(m.version)} no es x.y.z`);
  exigirHttps(m.url, permitirHttp, "manifiesto inválido");
  // SEC CN-008 — el sha512 era OPCIONAL: un manifiesto sin ese campo hacía que se descargara y
  // ejecutara CUALQUIER binario sin verificar nada. Ahora falta el campo = no hay actualización.
  // Sigue sin ser una defensa completa (el hash viaja en el mismo manifiesto que la URL, así que
  // quien controle el bucket controla las dos mitades); lo que cierra es el agujero de "sin hash,
  // barra libre". La firma asimétrica del manifiesto queda pendiente — ver el encabezado.
  if (!m.sha512 || !/^[0-9a-f]{128}$/i.test(String(m.sha512))) {
    throw new Error("manifiesto sin un sha512 válido: no se instala nada sin poder verificarlo");
  }
  if (llavePublica && !firmaValida(m, llavePublica)) {
    throw new Error("manifiesto sin firma válida de VIM: no se instala");
  }
  return { version: m.version, url: m.url, sha512: m.sha512, notas: m.notas || "", fecha: m.fecha || null, hay: esMasNueva(m.version, versionActual) };
}

/**
 * Descarga el instalador a `destPath` verificando su SHA-512 (hex). Si no coincide, borra el
 * archivo y lanza — así nunca se instala una descarga corrupta o alterada. `onProgreso(0..1)`.
 */
export async function descargarInstalador(url, sha512Esperado, destPath, onProgreso = () => {}, { permitirHttp = false } = {}) {
  exigirHttps(url, permitirHttp, "descarga");
  const r = await fetch(url, { signal: AbortSignal.timeout(600000) });
  if (!r.ok || !r.body) throw new Error(`descarga falló (${r.status})`);
  const total = Number(r.headers.get("content-length") || 0);
  const hash = crypto.createHash("sha512");
  const out = createWriteStream(destPath);
  let bajado = 0;
  try {
    const reader = r.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const buf = Buffer.from(value);
      hash.update(buf);
      if (!out.write(buf)) await new Promise((res) => out.once("drain", res));
      bajado += buf.length;
      if (total) onProgreso(bajado / total);
    }
    await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
  } catch (e) {
    try { out.destroy(); rmSync(destPath, { force: true }); } catch { /* */ }
    throw e;
  }
  const suma = hash.digest("hex");
  // SEC CN-008 — sin hash esperado NO se instala. Antes `sha512Esperado` podía ser null y este
  // if se saltaba entero, devolviendo `verificado: false` que nadie miraba.
  if (!sha512Esperado) {
    try { rmSync(destPath, { force: true }); } catch { /* */ }
    throw new Error("descarga sin SHA-512 de referencia: se descartó sin instalar");
  }
  if (suma.toLowerCase() !== String(sha512Esperado).toLowerCase()) {
    try { rmSync(destPath, { force: true }); } catch { /* */ }
    throw new Error("el SHA-512 no coincide — descarga corrupta o alterada; se descartó");
  }
  return { path: destPath, sha512: suma, verificado: true };
}
