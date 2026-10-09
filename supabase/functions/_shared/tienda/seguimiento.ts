// El código de seguimiento de un pedido de la tienda: 128 bits al azar que solo conoce el cliente.
// En la base se guarda su huella (SHA-256), nunca el código: quien lea la tabla no puede abrir el
// seguimiento de nadie. WebCrypto existe igual en Deno y en Node, así que esto se prueba con Node.

const FORMA = /^[A-Za-z0-9_-]{22}$/;

export function nuevoCodigo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let b = "";
  for (const x of bytes) b += String.fromCharCode(x);
  return btoa(b).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function esCodigo(x: unknown): x is string {
  return typeof x === "string" && FORMA.test(x);
}

export async function huellaDe(codigo: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codigo));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
