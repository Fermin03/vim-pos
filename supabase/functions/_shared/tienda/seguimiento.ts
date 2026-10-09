// El código de seguimiento de un pedido de la tienda: 128 bits al azar que solo conoce el cliente.
// En la base se guarda su huella (SHA-256), nunca el código: quien lea la tabla no puede abrir el
// seguimiento de nadie. WebCrypto existe igual en Deno y en Node, así que esto se prueba con Node.

const FORMA = /^[A-Za-z0-9_-]{22}$/;

const base64url = (bytes: Uint8Array): string => {
  let b = "";
  for (const x of bytes) b += String.fromCharCode(x);
  return btoa(b).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

export function nuevoCodigo(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * El código de seguimiento de un pedido que llegó con `clave` (la llave que el navegador genera por
 * intento de compra; entrega 7): HMAC-SHA256(secreto, "<slug>:<clave>") en base64url, recortado a
 * los 22 caracteres de siempre (132 bits del resumen). El mismo intento da siempre el mismo código
 * —y la misma huella, que es con lo que la base reconoce el reintento— y sin el secreto nadie lo
 * saca de la clave. El slug va dentro para que una clave repetida en dos negocios no dé el mismo.
 */
export async function codigoDeClave(secreto: string, slug: string, clave: string): Promise<string> {
  if (!secreto) throw new Error("codigoDeClave: falta el secreto");
  const enc = new TextEncoder();
  const llave = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", llave, enc.encode(`${slug}:${clave}`));
  return base64url(new Uint8Array(firma)).slice(0, 22);
}

export function esCodigo(x: unknown): x is string {
  return typeof x === "string" && FORMA.test(x);
}

export async function huellaDe(codigo: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codigo));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
