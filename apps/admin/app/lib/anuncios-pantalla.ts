"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";
import { reescalarImagen } from "./imagen";

/**
 * Anuncios de la pantalla del cliente (0150): las imágenes que el segundo monitor de la caja
 * enseña cuando nadie está capturando.
 *
 * La imagen va al almacén público `anuncios`; la fila de `anuncios_pantalla` es la lista que baja
 * a la caja, y la caja descarga cada imagen una sola vez. La baja es lógica (`deleted_at`): el
 * pull de la caja no se entera de una fila borrada, pero sí de una marcada.
 */

export const MAX_ANUNCIOS = 10;
export const ANUNCIO_LADO_MAX = 1920;
/** Tras reducir en el navegador. El almacén acepta hasta 1 MB. */
export const ANUNCIO_MAX_BYTES = 800 * 1024;
const ALMACEN = "anuncios";

/** `segundos` null = este anuncio usa el tiempo general. */
export type Anuncio = { id: string; ruta: string; url: string; orden: number; activo: boolean; segundos: number | null };

export const segundosSchema = z.coerce.number().int("Usa un número entero").min(3, "Mínimo 3 segundos").max(60, "Máximo 60 segundos");

const SOLO_ADMIN = "Solo el dueño o un administrador puede cambiar los anuncios.";
const TOPE_ANUNCIOS = "Ya hay 10 anuncios. Quita uno para subir otro.";
const LISTA_CAMBIO = "La lista de anuncios cambió. Recarga la página.";

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  return s.tenantId;
}

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
type Tipo = keyof typeof EXT;

/**
 * El data URI que devuelve `reescalarImagen`, como archivo para subir. PURA.
 *
 * Lanza si no es una imagen permitida o si pasa de `ANUNCIO_MAX_BYTES`. `reescalarImagen` ya
 * reduce por debajo de ese tope (su `maxBytes` mide el texto en base64, que es 4/3 del archivo);
 * esto es el cinturón: que nunca salga hacia el almacén algo que este vaya a rechazar.
 */
export function dataUriAArchivo(dataUri: string): { blob: Blob; ext: (typeof EXT)[Tipo]; tipo: Tipo } {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUri);
  if (!m) throw new Error("El archivo no es una imagen válida. Usa una imagen JPG, PNG o WebP.");
  const tipo = m[1] as Tipo;
  const binario = atob(m[2]!);
  if (binario.length > ANUNCIO_MAX_BYTES) throw new Error(MUY_PESADA);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return { blob: new Blob([bytes], { type: tipo }), ext: EXT[tipo], tipo };
}

const MUY_PESADA = "La imagen pesa demasiado, incluso después de reducirla. Prueba con una más sencilla o de menor resolución.";

/** El orden de los ids después de mover uno un lugar. PURA. */
export function ordenTrasMover(ids: string[], id: string, hacia: "arriba" | "abajo"): string[] {
  const i = ids.indexOf(id);
  const j = hacia === "arriba" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const r = [...ids];
  [r[i], r[j]] = [r[j]!, r[i]!];
  return r;
}

const SEGUNDOS_SUGERIDOS = [5, 8, 10, 15, 20, 30, 45, 60];

/** Los tiempos que ofrece el selector de un anuncio; si el suyo no está en la lista, se agrega. PURA. */
export function opcionesSegundos(actual: number | null): number[] {
  if (actual === null || SEGUNDOS_SUGERIDOS.includes(actual)) return SEGUNDOS_SUGERIDOS;
  return [...SEGUNDOS_SUGERIDOS, actual].sort((a, b) => a - b);
}

/**
 * Quita una imagen del almacén sin hacer fallar la acción del dueño: una imagen sin fila nadie la
 * enseña. supabase-js NO lanza cuando el almacén rechaza (contesta `{ error }`), así que un
 * `.catch` solo no se enteraba nunca; se lee `error` y se deja en la consola con contexto.
 */
async function quitarDelAlmacen(ruta: string, motivo: string): Promise<void> {
  try {
    const { error } = await supabase.storage.from(ALMACEN).remove([ruta]);
    if (error) console.warn(`[anuncios] no se pudo quitar ${ruta} del almacén (${motivo}):`, error.message);
  } catch (e) {
    console.warn(`[anuncios] no se pudo quitar ${ruta} del almacén (${motivo}):`, e instanceof Error ? e.message : e);
  }
}

const urlPublica = (ruta: string) => supabase.storage.from(ALMACEN).getPublicUrl(ruta).data.publicUrl;

export async function listarAnuncios(): Promise<Anuncio[]> {
  const { data, error } = await supabase
    .from("anuncios_pantalla")
    .select("id, ruta, orden, activo, segundos")
    .is("deleted_at", null)
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((a) => ({
    id: String(a.id), ruta: String(a.ruta), url: urlPublica(String(a.ruta)), orden: Number(a.orden) || 0, activo: a.activo !== false,
    segundos: a.segundos == null ? null : Number(a.segundos),
  }));
}

/** Reduce la imagen en el navegador, la sube al almacén y la da de alta al final de la lista. */
export async function subirAnuncio(archivo: File): Promise<void> {
  const tid = await tenantId();
  // Antes de reducir y subir nada: con dos pestañas abiertas la segunda llenaba el almacén para que
  // la base rechazara la fila después. La regla de verdad sigue siendo el disparador de la base
  // (más abajo se limpia si aun así rechaza); esto solo evita el trabajo y la subida en balde.
  const { count, error: errConteo } = await supabase.from("anuncios_pantalla").select("id", { count: "exact", head: true }).is("deleted_at", null);
  if (errConteo) throw new Error(traducir(errConteo.message));
  if ((count ?? 0) >= MAX_ANUNCIOS) throw new Error(TOPE_ANUNCIOS);
  let dataUri: string;
  try {
    // `maxBytes` es el largo del data URI (base64): 4 caracteres por cada 3 bytes del archivo.
    dataUri = await reescalarImagen(archivo, { ladoMax: ANUNCIO_LADO_MAX, maxBytes: Math.floor(ANUNCIO_MAX_BYTES * 4 / 3) });
  } catch (e) {
    throw new Error(traducir(e instanceof Error ? e.message : ""));
  }
  const { blob, ext, tipo } = dataUriAArchivo(dataUri);
  const id = crypto.randomUUID();
  // Exactamente <negocio>/<uuid>.<ext>: la base rechaza cualquier otra forma (anuncios_pantalla_ruta_chk).
  const ruta = `${tid}/${id}.${ext}`;

  const { data: ultimo, error: errOrden } = await supabase.from("anuncios_pantalla").select("orden").is("deleted_at", null).order("orden", { ascending: false }).limit(1);
  if (errOrden) throw new Error(traducir(errOrden.message));
  const orden = ((ultimo?.[0] as { orden?: number } | undefined)?.orden ?? -10) + 10;

  const subida = await supabase.storage.from(ALMACEN).upload(ruta, blob, { contentType: tipo, cacheControl: "31536000", upsert: false });
  if (subida.error) throw new Error(traducir(subida.error.message));

  const { error } = await supabase.from("anuncios_pantalla").insert({ id, tenant_id: tid, ruta, orden, bytes: blob.size });
  if (error) {
    // La fila no entró (el tope de 10, por ejemplo): la imagen recién subida se quedaría huérfana.
    await quitarDelAlmacen(ruta, "la fila no entró");
    throw new Error(traducir(error.message));
  }
}

/**
 * Cambia un anuncio y comprueba que el cambio ENTRÓ.
 *
 * A quien no es dueño ni administrador la base no le contesta con un error: el UPDATE simplemente
 * no encuentra la fila y regresa "todo bien, cero cambios". Sin pedir la fila de vuelta, la página
 * diría que guardó algo que no se guardó.
 */
async function actualizar(id: string, cambios: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.from("anuncios_pantalla").update(cambios).eq("id", id).select("id");
  if (error) throw new Error(traducir(error.message));
  if (!data || data.length === 0) throw new Error(SOLO_ADMIN);
}

export async function setActivoAnuncio(id: string, activo: boolean): Promise<void> {
  await actualizar(id, { activo });
}

/** Tiempo propio de un anuncio; null lo devuelve al tiempo general. */
export async function setSegundosAnuncio(id: string, segundos: number | null): Promise<void> {
  const valor = segundos === null ? null : segundosSchema.parse(segundos);
  await actualizar(id, { segundos: valor });
}

/**
 * Mueve un anuncio un lugar.
 *
 * Manda la lista completa en el orden nuevo a `reordenar_anuncios` (0151), que la reescribe en UNA
 * sola sentencia: antes eran varias escrituras sueltas y un corte de internet entre dos dejaba el
 * orden a medias, o dos pestañas lo mezclaban. Si el id no se movió (extremo de la lista) no hay
 * nada que escribir.
 */
export async function moverAnuncio(anuncios: Anuncio[], id: string, hacia: "arriba" | "abajo"): Promise<void> {
  const antes = anuncios.map((a) => a.id);
  const despues = ordenTrasMover(antes, id, hacia);
  if (despues.every((x, i) => x === antes[i])) return;
  const { error } = await supabase.rpc("reordenar_anuncios", { p_ids: despues });
  if (error) {
    // El código manda sobre el texto: la base puede cambiar su redacción, no su SQLSTATE.
    if (error.code === "P0002") throw new Error(LISTA_CAMBIO);
    if (error.code === "42501") throw new Error(SOLO_ADMIN);
    throw new Error(traducir(error.message));
  }
}

/** Baja lógica (es la que viaja a la caja) y, después, la imagen del almacén. */
export async function eliminarAnuncio(a: Anuncio): Promise<void> {
  await actualizar(a.id, { deleted_at: new Date().toISOString(), activo: false });
  // Si esto falla queda una imagen sin fila, que nadie enseña: no es motivo para decirle al dueño que falló.
  await quitarDelAlmacen(a.ruta, "baja del anuncio");
}

export async function leerSegundos(): Promise<number> {
  const tid = await tenantId();
  const { data, error } = await supabase.from("configuracion_tenant").select("pantalla_cliente_segundos").eq("tenant_id", tid).maybeSingle();
  if (error) throw new Error(error.message);
  return Number((data as { pantalla_cliente_segundos?: number } | null)?.pantalla_cliente_segundos) || 8;
}

export async function guardarSegundos(n: number): Promise<void> {
  const tid = await tenantId();
  const valor = segundosSchema.parse(n);
  const { error } = await supabase.from("configuracion_tenant").upsert({ tenant_id: tid, pantalla_cliente_segundos: valor }, { onConflict: "tenant_id" });
  if (error) throw new Error(traducir(error.message));
}

/**
 * Los rechazos de la base y del almacén llegan en jerga; aquí se dice lo que pasó. Lo que no se
 * reconoce sale tal cual, para que `mensajeError` de la página traduzca lo general (sin internet,
 * sesión vencida). PURA.
 */
export function traducir(mensaje: string): string {
  if (mensaje.includes("Ya hay 10 anuncios")) return TOPE_ANUNCIOS;
  if (mensaje.includes("La lista de anuncios cambió")) return LISTA_CAMBIO;
  if (/row-level security|permission denied|unauthorized|not authorized|42501|solo el dueño/i.test(mensaje)) return SOLO_ADMIN;
  if (/exceeded the maximum allowed size|payload too large|entity too large|demasiado pesada/i.test(mensaje)) return MUY_PESADA;
  if (/mime type|invalid_mime_type|no es una imagen/i.test(mensaje)) return "Ese archivo no se puede usar. Sube una imagen JPG, PNG o WebP.";
  if (/no se pudo leer la imagen/i.test(mensaje)) return "No se pudo leer la imagen. Prueba con otro archivo JPG, PNG o WebP.";
  return mensaje;
}
