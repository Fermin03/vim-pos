// Fase 3 · Actualizador in-app (Opción B — sin firma). La app revisa un manifiesto JSON en un
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

/** Lee el manifiesto del feed y decide si hay actualización respecto a `versionActual`. */
export async function buscarActualizacion(feedUrl, versionActual) {
  const r = await fetch(feedUrl, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!r.ok) throw new Error(`feed respondió ${r.status}`);
  const m = await r.json();
  if (!m || !m.version || !m.url) throw new Error("manifiesto inválido (falta version/url)");
  return { version: m.version, url: m.url, sha512: m.sha512 || null, notas: m.notas || "", fecha: m.fecha || null, hay: esMasNueva(m.version, versionActual) };
}

/**
 * Descarga el instalador a `destPath` verificando su SHA-512 (hex). Si no coincide, borra el
 * archivo y lanza — así nunca se instala una descarga corrupta o alterada. `onProgreso(0..1)`.
 */
export async function descargarInstalador(url, sha512Esperado, destPath, onProgreso = () => {}) {
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
  if (sha512Esperado && suma.toLowerCase() !== String(sha512Esperado).toLowerCase()) {
    try { rmSync(destPath, { force: true }); } catch { /* */ }
    throw new Error("el SHA-512 no coincide — descarga corrupta o alterada; se descartó");
  }
  return { path: destPath, sha512: suma, verificado: !!sha512Esperado };
}
