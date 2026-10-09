// La sesión de una cuenta de la tienda: una cookie HttpOnly POR NEGOCIO (`vt_<slug>`) que solo lee
// y escribe este servidor. Su valor es el token de sesión; viaja a la función en `x-tienda-sesion`
// y nunca llega a JavaScript del navegador. Todas las tiendas viven en un mismo dominio, así que el
// negocio va en el NOMBRE: entrar en una tienda no abre sesión en otra.
//
// El slug ya viene validado por forma (`FORMA_SLUG`: a-z, 0-9 y guion), y ese alfabeto cabe entero
// en el de un nombre de cookie. El token solo se acepta con la forma de `nuevoCodigo()` (22
// caracteres de base64url): lo demás no es una sesión y no se reenvía.
import "server-only";
import { cookies } from "next/headers";
import { FORMA_CODIGO } from "../contrato";

const TREINTA_DIAS = 2_592_000;

export const nombreDeCookie = (slug: string): string => `vt_${slug}`;

/** El token de sesión de ESE negocio en la cabecera `Cookie`, o null. Nunca el de otro negocio. */
export function sesionDe(cabeceras: Headers, slug: string): string | null {
  const nombre = nombreDeCookie(slug);
  for (const par of (cabeceras.get("cookie") ?? "").split(";")) {
    const i = par.indexOf("=");
    if (i < 0 || par.slice(0, i).trim() !== nombre) continue;
    const valor = par.slice(i + 1).trim();
    return FORMA_CODIGO.test(valor) ? valor : null;
  }
  return null;
}

// `Secure` siempre, salvo en el `localhost` de desarrollo (http). `host` es el de la petición.
const atributos = (host: string, segundos: number): string =>
  `HttpOnly; ${/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "" : "Secure; "}SameSite=Lax; Path=/; Max-Age=${segundos}`;

/** El `Set-Cookie` que abre la sesión. `token` ya debe tener forma de token (lo comprueba la ruta). */
export const cookieDeSesion = (slug: string, token: string, host: string): string =>
  `${nombreDeCookie(slug)}=${token}; ${atributos(host, TREINTA_DIAS)}`;

/** El `Set-Cookie` que la borra (mismos atributos: si no, el navegador no la reconoce como la misma). */
export const cookieBorrada = (slug: string, host: string): string => `${nombreDeCookie(slug)}=; ${atributos(host, 0)}`;

/**
 * ¿Hay cookie de sesión de ese negocio? Para pintar «Entrar» o «Mi cuenta» en componentes de
 * servidor, sin llamada extra: si la sesión sigue viva lo decide la función cuando se usa.
 */
export async function haySesion(slug: string): Promise<boolean> {
  return FORMA_CODIGO.test((await cookies()).get(nombreDeCookie(slug))?.value ?? "");
}
