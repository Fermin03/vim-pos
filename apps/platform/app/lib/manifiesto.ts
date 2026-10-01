/**
 * Validación del manifiesto de actualización (ADR 0014, entrega 4).
 *
 * El manifiesto es lo único que decide qué binario instalan TODAS las cajas, así que aquí no se
 * confía en nada. Dos comprobaciones que parecen de más y no lo son:
 *
 *   · la url tiene que contener la versión — pegar el `latest.json` de otra compilación es el
 *     error fácil de cometer a las once de la noche, y publicaría un instalador viejo como si
 *     fuera nuevo, a todos los clientes a la vez;
 *   · la url tiene que empezar por el prefijo EXACTO de nuestros releases. Comprobar solo el
 *     host no sirve: en `github.com` publica cualquiera, así que "está en GitHub" no es "es
 *     nuestro". Se compara contra `origin + pathname`, ya normalizado por `URL`, para que ni un
 *     `https://github.com@otro-sitio/…` ni un `..` en la ruta cuelen.
 *
 * El sha512 no es negociable (SEC CN-008): sin él la caja instalaría cualquier cosa sin poder
 * verificarla. Función PURA, para probarla sin red ni base.
 */

import { createPublicKey, verify } from "node:crypto";
import { LLAVE_PUBLICA_ACTUALIZACIONES } from "./llave-actualizaciones";

/** El mismo mensaje que firma `desktop/scripts/release-manifest.mjs` (ver `mensajeAFirmar`). */
export function mensajeAFirmar(m: { version: string; url: string; sha512: string }): string {
  return `vim-pos-actualizacion
version=${m.version}
url=${m.url}
sha512=${m.sha512.toLowerCase()}
`;
}

function firmaValida(m: { version: string; url: string; sha512: string }, firmaB64: string, llavePem: string): boolean {
  try {
    return verify(null, Buffer.from(mensajeAFirmar(m), "utf8"), createPublicKey(llavePem), Buffer.from(firmaB64, "base64"));
  } catch {
    return false;
  }
}

export type Manifiesto = {
  version: string;
  url: string;
  sha512: string;
  notas: string;
  fecha: string | null;
  /** Firma Ed25519 (base64) de version+url+sha512. Las cajas ≥ 0.4.103 no instalan sin ella. */
  firma: string;
};

export type ResultadoManifiesto =
  | { ok: true; manifiesto: Manifiesto }
  | { ok: false; error: string };

const SEMVER = /^\d+\.\d+\.\d+$/;
const SHA512 = /^[0-9a-f]{128}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function validarManifiesto(
  texto: string,
  prefijoPermitido: string,
  llavePublicaPem: string = LLAVE_PUBLICA_ACTUALIZACIONES,
): ResultadoManifiesto {
  let j: unknown;
  try {
    j = JSON.parse(texto);
  } catch {
    return { ok: false, error: "Eso no es un JSON válido. Pega el contenido de desktop/dist/latest.json." };
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) {
    return { ok: false, error: "El manifiesto debe ser un objeto JSON." };
  }
  const o = j as Record<string, unknown>;

  const version = typeof o.version === "string" ? o.version.trim() : "";
  if (!SEMVER.test(version)) {
    return { ok: false, error: "La versión debe ser tres números separados por puntos, como 0.4.62." };
  }

  const url = typeof o.url === "string" ? o.url.trim() : "";
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, error: "La url del instalador no es una dirección válida." };
  }
  if (u.protocol !== "https:") {
    return { ok: false, error: "La url del instalador debe ser https." };
  }
  if (!(u.origin + u.pathname).startsWith(prefijoPermitido)) {
    return { ok: false, error: `La url del instalador tiene que empezar por ${prefijoPermitido}` };
  }
  if (!url.includes(version)) {
    return {
      ok: false,
      error: `La url no menciona la versión ${version}: parece el manifiesto de otra compilación.`,
    };
  }

  const sha512 = typeof o.sha512 === "string" ? o.sha512.trim() : "";
  if (!SHA512.test(sha512)) {
    return { ok: false, error: "El sha512 debe ser de 128 caracteres hexadecimales. Sin él no se instala nada." };
  }

  const fecha = o.fecha == null ? null : String(o.fecha).trim();
  if (fecha !== null && !FECHA.test(fecha)) {
    return { ok: false, error: "La fecha debe tener el formato 2026-09-06." };
  }

  // La firma: sin ella las cajas rechazan la actualización, y publicar un manifiesto sin firmar
  // dejaría a TODAS sin poder actualizarse sin que nada lo delate. Se verifica aquí con la misma
  // llave pública que llevan las cajas y sobre el mismo mensaje (`mensajeAFirmar` en updater.mjs).
  const firma = typeof o.firma === "string" ? o.firma.trim() : "";
  if (!firma) {
    return { ok: false, error: "El manifiesto no trae firma. Genéralo con `npm run release-manifest` en la máquina que tiene la llave." };
  }
  if (!firmaValida({ version, url, sha512 }, firma, llavePublicaPem)) {
    return { ok: false, error: "La firma no es válida para esta versión, url y sha512: el manifiesto se alteró después de firmarlo, o se firmó con otra llave." };
  }

  return {
    ok: true,
    manifiesto: {
      version,
      url,
      sha512: sha512.toLowerCase(),
      notas: typeof o.notas === "string" ? o.notas : "",
      fecha,
      firma,
    },
  };
}
