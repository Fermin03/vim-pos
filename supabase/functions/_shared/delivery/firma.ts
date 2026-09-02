// Firma de webhooks. Uber: X-Uber-Signature = HMAC-SHA256(client_secret, body) en hex minúsculas.
// Web Crypto está en Deno y en Node ≥ 20, así que el mismo módulo se prueba con node --test.
export async function hmacSha256Hex(secreto: string, cuerpo: string): Promise<string> {
  const enc = new TextEncoder();
  const llave = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", llave, enc.encode(cuerpo));
  return Array.from(new Uint8Array(firma)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Evita que el tiempo de comparación revele cuántos bytes coincidían. */
export function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
