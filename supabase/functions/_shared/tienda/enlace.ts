// El código de seguimiento de un pedido, cifrado para guardarlo en la base (tienda_enlaces, 0176).
//
// Por qué existe: los correos de estado salen minutos u horas después de `pedir`, desde una función
// que ya no tiene el código (en la base solo está su huella). Para que lleven el MISMO enlace que el
// correo de confirmación, `pedir` deja el código cifrado y `tienda-correos` lo descifra al mandar.
//
// La regla de seguimiento.ts se mantiene: quien lea la base no puede abrir el seguimiento de nadie.
// La llave no está en la base: es HMAC-SHA256(VIM_TIENDA_SECRET, etiqueta), y el secreto vive solo
// en las Edge Functions. AES-256-GCM con IV al azar; la huella del pedido va como dato autenticado,
// así que un cifrado copiado al renglón de otro pedido no abre.
// WebCrypto existe igual en Deno y en Node: se prueba con Node (enlace.test.ts).
import { esCodigo, huellaDe } from "./seguimiento.ts";

const ETIQUETA = "vim-pos:tienda:enlace-de-correo:v1";
const enc = new TextEncoder();

const aBase64url = (bytes: Uint8Array): string => {
  let b = "";
  for (const x of bytes) b += String.fromCharCode(x);
  return btoa(b).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};
const deBase64url = (s: string): Uint8Array =>
  Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));

async function llaveDe(secreto: string): Promise<CryptoKey> {
  if (!secreto) throw new Error("enlace: falta el secreto");
  const hmac = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", hmac, enc.encode(ETIQUETA));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** El código, cifrado y atado a la huella de su pedido. Texto base64url (IV + cifrado). */
export async function cifrarCodigo(secreto: string, codigo: string, huella: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(huella) }, await llaveDe(secreto), enc.encode(codigo));
  const todo = new Uint8Array(12 + cifrado.byteLength);
  todo.set(iv);
  todo.set(new Uint8Array(cifrado), 12);
  return aBase64url(todo);
}

/**
 * El código de vuelta, o null si no se puede confiar en él: otro secreto, texto tocado, el cifrado
 * de otro pedido, o un resultado que no es un código cuya huella sea la del pedido. Nunca lanza:
 * sin enlace el correo sale igual, sin botón.
 */
export async function descifrarCodigo(secreto: string, cifrado: string | null | undefined, huella: string | null | undefined): Promise<string | null> {
  if (!secreto || !cifrado || !huella) return null;
  try {
    const todo = deBase64url(cifrado);
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: todo.slice(0, 12), additionalData: enc.encode(huella) }, await llaveDe(secreto), todo.slice(12));
    const codigo = new TextDecoder().decode(claro);
    return esCodigo(codigo) && (await huellaDe(codigo)) === huella ? codigo : null;
  } catch {
    return null;
  }
}
