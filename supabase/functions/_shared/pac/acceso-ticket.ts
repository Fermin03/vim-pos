// Quién puede ver y facturar un ticket en el portal público de autofactura. Módulo puro.
//
// El QR del ticket era `/{negocio}?folio={folio}` y los folios son secuenciales: cualquiera podía
// recorrerlos, ver fecha y total de cada venta y timbrarla a un RFC inventado — gastando folios del
// negocio y dejando al cliente real con "ya facturado" (auditoría 30/09/2026, C1-4).
//
// Ahora el QR lleva además un token por ticket: base64url(HMAC-SHA256(secreto, ticket_id))[:16],
// 96 bits. El secreto vive solo en la base (`cfdi_autofactura_secreto`, 0135) y el token lo calcula
// `autofactura_token()`; `autofacturar` lo pide a la base y lo compara aquí. Sin token —tickets ya
// impresos, cajas de escritorio sin secreto, o quien teclea el folio a mano— se exige el total
// exacto del ticket como segundo factor: el folio va impreso, pero adivinar el total al centavo
// de una venta ajena no sale gratis, y el portal no lo revela antes de acertarlo.

/** 16 caracteres base64url. */
export const TOKEN_AUTOFACTURA = /^[A-Za-z0-9_-]{16}$/;

export function normalizarToken(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return TOKEN_AUTOFACTURA.test(t) ? t : null;
}

/**
 * El total que escribe el comensal, en centavos. Acepta "$1,234.50", "1234.5", "1234". Devuelve
 * null si no es un importe (y nunca pasa por float para comparar: se compara en enteros).
 */
export function aCentavos(v: unknown): number | null {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) return null;
    return Math.round(v * 100);
  }
  if (typeof v !== "string") return null;
  const limpio = v.replace(/[\s$,]/g, "");
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(limpio);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

/** Comparación en tiempo constante (misma idea que delivery/firma.ts, sin depender de ella). */
export function igualesSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * ¿Quien pregunta demostró tener el ticket en la mano? Vale el token del QR o el total exacto.
 * Un token que no coincide no descalifica si además trae el total correcto (un QR de una caja con
 * otro secreto, por ejemplo): el total por sí solo ya es el factor aceptado.
 */
export function accesoAlTicket(p: {
  tokenRecibido: string | null;
  tokenEsperado: string | null;
  totalRecibidoCentavos: number | null;
  totalTicketMxn: number | string;
}): boolean {
  if (p.tokenRecibido && p.tokenEsperado && igualesSeguro(p.tokenRecibido, p.tokenEsperado)) return true;
  if (p.totalRecibidoCentavos === null) return false;
  const total = aCentavos(typeof p.totalTicketMxn === "number" ? p.totalTicketMxn : String(p.totalTicketMxn));
  return total !== null && total === p.totalRecibidoCentavos;
}

/**
 * El mismo cálculo que `autofactura_token()` en SQL. No lo usa ninguna función en producción —el
 * secreto no sale de la base—; existe para fijar el formato con una prueba y para poder generar
 * tokens en scripts de soporte con el secreto en la mano.
 */
export async function calcularTokenAutofactura(secreto: Uint8Array, ticketId: string): Promise<string> {
  const raw = new ArrayBuffer(secreto.length);
  new Uint8Array(raw).set(secreto);
  const llave = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", llave, new TextEncoder().encode(ticketId)));
  let bin = "";
  for (const b of firma) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 16);
}
