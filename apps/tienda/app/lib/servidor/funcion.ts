// El cliente de la Edge Function `tienda`. SOLO servidor: aquí vive el secreto `x-vim-tienda`, y
// `server-only` hace que el build falle si un componente de cliente lo importa.
//
// Los secretos se leen al ATENDER, nunca al importar: la app compila sin ellos (el CI construye sin
// `VIM_TIENDA_SECRET`) y, si faltan en producción, la tienda contesta 503 en vez de no arrancar.
import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { FORMA_SLUG, FORMA_UUID, menuDe, negocioDe, type Menu, type Negocio } from "../contrato";
import { ipDe } from "./ip";

export type RespuestaDeTienda = { estado: number; json: unknown };

const NO_DISPONIBLE = { error: "SERVICIO_NO_DISPONIBLE" } as const;
/** No se supo qué pasó del otro lado: en `pedir`, el pedido PUDO haber entrado. */
const SIN_RESPUESTA = { ...NO_DISPONIBLE, detalle: "SIN_RESPUESTA" } as const;
/** Lo que la función contesta a propósito (anexo §1.3). Cualquier otro estado es un fallo nuestro. */
const ESTADOS_CONOCIDOS = new Set([200, 400, 403, 404, 409, 413, 429, 503]);
const LIMITE_MS = 10_000;

/**
 * Llama a la función con el secreto y la IP real del cliente. Nunca lanza.
 *  · 200 y los rechazos conocidos (400, 403, 404, 409, 413, 429, 503) salen con su estado y su JSON.
 *  · Cualquier otro estado sale como 503 y queda en el registro del servidor SIN el cuerpo (trae
 *    datos del cliente y códigos de seguimiento). Un 401 es el secreto mal puesto.
 *  · Sin secreto o sin URL: 503 sin llamar.
 *  · 503 con `detalle: "SIN_RESPUESTA"` cuando no se supo qué pasó del otro lado: la función no
 *    contestó (red o 10 s), contestó un 5xx que no es suyo (500, 502, 504, 546: el worker pudo morir
 *    a medias) o un cuerpo que no es JSON. En `pedir` eso significa que el pedido PUDO haber
 *    entrado: quien llama no debe reintentar solo. Un 4xx inesperado no lo lleva: ahí no se creó nada.
 */
export async function llamarTienda(cuerpo: unknown, ip: string): Promise<RespuestaDeTienda> {
  const secreto = (process.env.VIM_TIENDA_SECRET ?? "").trim();
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  if (!secreto || !base) {
    console.error("[tienda] falta VIM_TIENDA_SECRET o la URL de Supabase: la tienda no puede atender.");
    return { estado: 503, json: NO_DISPONIBLE };
  }
  let r: Response;
  try {
    r = await fetch(`${base}/functions/v1/tienda`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-vim-tienda": secreto, "x-tienda-ip": ip },
      body: JSON.stringify(cuerpo),
      cache: "no-store",
      signal: AbortSignal.timeout(LIMITE_MS),
    });
  } catch (e) {
    console.error(`[tienda] la función no contestó: ${e instanceof Error ? e.name : "error"}`);
    return { estado: 503, json: SIN_RESPUESTA };
  }
  if (!ESTADOS_CONOCIDOS.has(r.status)) {
    console.error(`[tienda] la función respondió ${r.status}${r.status === 401 ? " (revisa VIM_TIENDA_SECRET)" : ""}`);
    return { estado: 503, json: r.status >= 500 ? SIN_RESPUESTA : NO_DISPONIBLE };
  }
  try {
    return { estado: r.status, json: await r.json() };
  } catch {
    console.error(`[tienda] la función respondió ${r.status} sin JSON`);
    return { estado: 503, json: SIN_RESPUESTA };
  }
}

/** `no-existe` → `notFound()`; `no-disponible` → la pantalla de «vuelve a intentar». */
export type Leido<T> = { estado: "ok"; datos: T } | { estado: "no-existe" } | { estado: "no-disponible" };

const SEGUNDOS = 30;
class SinRespuestaUtil extends Error {}

/**
 * Una lectura con la caché de datos de Next (`unstable_cache`, Next 15.5), 30 s por clave.
 *  · Se guarda lo que la función DEVUELVE: el dato bueno y el 404. Un fallo (503, 429, forma
 *    inesperada) LANZA dentro de la caché, que así no lo guarda, y aquí afuera se vuelve
 *    `no-disponible`: el siguiente visitante vuelve a preguntar.
 *  · `unstable_cache` no caduca: pasado el plazo entrega lo VIEJO y refresca por detrás. En una
 *    tienda con una visita cada hora eso sería enseñar «cerrado» a quien llega con la tienda ya
 *    abierta. Por eso cada entrada lleva su hora: si tiene más de 30 s se pregunta directo.
 *  · La IP entra por la clausura, no como argumento: la entrada es del negocio, no del visitante.
 */
async function leer<T>(clave: string[], cuerpo: Record<string, string>, lector: (x: unknown) => T | null): Promise<Leido<T>> {
  const ip = ipDe(await headers());   // fuera de la caché: dentro no se pueden leer cabeceras
  const consultar = async (): Promise<{ leido: Leido<T>; cuando: number }> => {
    const r = await llamarTienda(cuerpo, ip);
    if (r.estado === 404) return { leido: { estado: "no-existe" }, cuando: Date.now() };
    const datos = r.estado === 200 ? lector(r.json) : null;
    if (datos === null) throw new SinRespuestaUtil();
    return { leido: { estado: "ok", datos }, cuando: Date.now() };
  };
  try {
    let g = await unstable_cache(consultar, clave, { revalidate: SEGUNDOS })();
    if (Date.now() - g.cuando > SEGUNDOS * 1000) g = await consultar();
    return g.leido;
  } catch (e) {
    if (e instanceof SinRespuestaUtil) return { estado: "no-disponible" };
    throw e;
  }
}

/** Los datos públicos del negocio de esa dirección. Solo en componentes de servidor. */
export async function leerNegocio(slug: string): Promise<Leido<Negocio>> {
  if (!FORMA_SLUG.test(slug)) return { estado: "no-existe" };
  return leer(["tienda-negocio", slug], { accion: "negocio", negocio: slug }, negocioDe);
}

/**
 * `leerNegocio` una sola vez por petición: el `layout`, la página y sus metadatos lo piden los tres, y
 * con la caché de datos fría saldrían tres lecturas del cupo del visitante.
 */
export const negocioDeLaPeticion = cache(leerNegocio);

/** El menú de una sucursal del negocio. Solo en componentes de servidor. */
export async function leerMenu(slug: string, sucursalId: string): Promise<Leido<Menu>> {
  if (!FORMA_SLUG.test(slug) || !FORMA_UUID.test(sucursalId)) return { estado: "no-existe" };
  const sucursal = sucursalId.toLowerCase();
  return leer(["tienda-menu", slug, sucursal], { accion: "menu", negocio: slug, sucursal_id: sucursal }, menuDe);
}
