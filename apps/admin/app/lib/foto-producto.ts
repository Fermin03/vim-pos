"use client";
// Fotos de productos y logo de la tienda en línea: las dos viven en el almacén público `productos`
// (0161), en la carpeta del negocio. Molde: anuncios-pantalla.ts.
//
// El almacén deja subir y borrar, NO reescribir: cada imagen es una ruta nueva y la anterior se borra
// después. El orden es siempre subir → escribir la fila → borrar la anterior; así, pase lo que pase a
// la mitad, la fila apunta a un archivo que existe.
import { supabase } from "./supabase";
import { tenantId } from "./datos";
import { reescalarImagen } from "./imagen";
import { dataUriAArchivo } from "./anuncios-pantalla";
import { mensajeTienda } from "./tienda-reglas";

export const FOTO_LADO_MAX = 1200;
/** El almacén `productos` acepta hasta 1 MB (1,048,576 bytes); se queda un poco por debajo. */
export const FOTO_MAX_BYTES = 1_000_000;
const ALMACEN = "productos";
const TIPOS = ["image/jpeg", "image/png", "image/webp"];
/** El nombre que este módulo le pone a todo lo que sube. La base exige lo mismo al logo (0163). */
const ARCHIVO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

const SOLO_ADMIN = "Solo el dueño o un administrador puede cambiar esto.";
const SOLO_ADMIN_FOTOS = "Solo el dueño o un administrador puede subir fotos.";
const NO_ES_IMAGEN = "Ese archivo no se puede usar. Sube una imagen JPG, PNG o WebP.";
const MUY_PESADA = "La imagen pesa demasiado, incluso después de reducirla. Prueba con una más sencilla o de menor resolución.";

/** Los rechazos del almacén y del reescalado, en palabras del dueño. Lo que no se reconoce sale tal cual. */
function traducir(mensaje: string): string {
  if (/row-level security|permission denied|unauthorized|not authorized|42501/i.test(mensaje)) return SOLO_ADMIN_FOTOS;
  if (/exceeded the maximum allowed size|payload too large|entity too large|demasiado pesada/i.test(mensaje)) return MUY_PESADA;
  if (/mime type|invalid_mime_type|no es una imagen/i.test(mensaje)) return NO_ES_IMAGEN;
  if (/no se pudo leer la imagen/i.test(mensaje)) return "No se pudo leer la imagen. Prueba con otro archivo JPG, PNG o WebP.";
  return mensaje;
}

const urlPublica = (ruta: string): string => supabase.storage.from(ALMACEN).getPublicUrl(ruta).data.publicUrl;

/** ¿Es exactamente `<este negocio>/<uuid>.<ext>`? Sin subcarpetas, sin `..`, sin nada después. PURA. */
function esRutaPropia(ruta: string, tenant: string): boolean {
  const partes = ruta.split("/");
  return tenant !== "" && partes.length === 2 && partes[0] === tenant && ARCHIVO.test(partes[1]!);
}

/**
 * De la URL pública a la ruta dentro del almacén. Devuelve la ruta SOLO si la URL es de este almacén
 * y de la carpeta de `tenant` (el negocio de la sesión), con la forma de nombre que aquí se sube.
 * Cualquier otra cosa —otro negocio, otro almacén, una URL externa, `..`, parámetros— da null, y lo
 * que da null nunca se le pide borrar al almacén.
 */
export function rutaDeUrl(url: string | null, tenant: string): string | null {
  const base = urlPublica("");
  if (!url || !url.startsWith(base)) return null;
  const ruta = url.slice(base.length);
  return esRutaPropia(ruta, tenant) ? ruta : null;
}

/**
 * Borra del almacén sin lanzar: un archivo sin fila nadie lo enseña, no es motivo para decirle al
 * dueño que falló. supabase-js no lanza cuando el almacén rechaza (contesta `{ error }`), así que se
 * lee y se deja en la consola. Una ruta que no es de este negocio ni se intenta.
 */
async function quitar(ruta: string, tenant: string, motivo: string): Promise<void> {
  if (!esRutaPropia(ruta, tenant)) {
    console.warn(`[fotos] no se quita «${ruta}» del almacén (${motivo}): no es un archivo de este negocio`);
    return;
  }
  try {
    const { error } = await supabase.storage.from(ALMACEN).remove([ruta]);
    if (error) console.warn(`[fotos] no se pudo quitar ${ruta} del almacén (${motivo}):`, error.message);
  } catch (e) {
    console.warn(`[fotos] no se pudo quitar ${ruta} del almacén (${motivo}):`, e instanceof Error ? e.message : e);
  }
}

/** Borra un archivo del almacén. No lanza: un huérfano no debe tumbar el guardado. */
export async function quitarImagen(ruta: string): Promise<void> {
  let tid: string;
  try {
    tid = await tenantId();
  } catch (e) {
    console.warn(`[fotos] no se pudo quitar ${ruta} del almacén:`, e instanceof Error ? e.message : e);
    return;
  }
  await quitar(ruta, tid, "a petición");
}

async function subir(archivo: File, tid: string): Promise<{ ruta: string; url: string }> {
  // Antes de leer nada: un PDF o un GIF no llegan ni al reescalado.
  if (!TIPOS.includes(archivo.type)) throw new Error(NO_ES_IMAGEN);
  let dataUri: string;
  try {
    // `maxBytes` es el largo del data URI (base64): 4 caracteres por cada 3 bytes del archivo.
    dataUri = await reescalarImagen(archivo, { ladoMax: FOTO_LADO_MAX, maxBytes: Math.floor((FOTO_MAX_BYTES * 4) / 3) });
  } catch (e) {
    throw new Error(traducir(e instanceof Error ? e.message : ""));
  }
  const { blob, ext, tipo } = dataUriAArchivo(dataUri, FOTO_MAX_BYTES);
  const ruta = `${tid}/${crypto.randomUUID()}.${ext}`;
  // Sin `upsert`: el almacén no tiene permiso de reescritura, y una ruta nueva nunca choca.
  const { error } = await supabase.storage.from(ALMACEN).upload(ruta, blob, { contentType: tipo, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(traducir(error.message));
  return { ruta, url: urlPublica(ruta) };
}

/** Sube la imagen ya reescalada a `<tenant>/<uuid>.<ext>` y devuelve ruta y URL pública. */
export async function subirImagen(archivo: File): Promise<{ ruta: string; url: string }> {
  return subir(archivo, await tenantId());
}

type Fila = { tabla: "productos"; id: string } | { tabla: "tienda_config" };

/**
 * Escribe la columna de la imagen y comprueba que el cambio ENTRÓ: a quien no puede, la base no le
 * contesta con error, simplemente no encuentra la fila.
 */
async function escribirFila(f: Fila, valor: string | null, tid: string, porDefecto: string): Promise<void> {
  const { data, error } = f.tabla === "productos"
    ? await supabase.from("productos").update({ imagen_url: valor }).eq("id", f.id).select("id")
    : await supabase.from("tienda_config").update({ logo_ruta: valor, updated_at: new Date().toISOString() }).eq("tenant_id", tid).select("tenant_id");
  // La guarda del catálogo (0133) ya contesta en español con el motivo: ese mensaje pasa tal cual.
  if (error) throw new Error(f.tabla === "productos" ? error.message || porDefecto : mensajeTienda(error, porDefecto));
  if (!data || data.length === 0) throw new Error(SOLO_ADMIN);
}

/** Subir → escribir la fila → borrar la anterior. Si la fila no entra, se borra la recién subida. */
async function poner(f: Fila, archivo: File, valorDe: (s: { ruta: string; url: string }) => string, rutaAnterior: (tid: string) => string | null, porDefecto: string): Promise<{ ruta: string; url: string }> {
  const tid = await tenantId();
  const nueva = await subir(archivo, tid);
  try {
    await escribirFila(f, valorDe(nueva), tid, porDefecto);
  } catch (e) {
    await quitar(nueva.ruta, tid, "la fila no entró");
    throw e;
  }
  const anterior = rutaAnterior(tid);
  if (anterior) await quitar(anterior, tid, "se reemplazó");
  return nueva;
}

async function retirar(f: Fila, rutaAnterior: (tid: string) => string | null, porDefecto: string): Promise<void> {
  const tid = await tenantId();
  await escribirFila(f, null, tid, porDefecto);
  const anterior = rutaAnterior(tid);
  if (anterior) await quitar(anterior, tid, "se quitó");
}

/** Pone o cambia la foto de un producto. Solo toca `imagen_url`. Devuelve la URL pública nueva. */
export async function ponerFotoProducto(productoId: string, archivo: File, urlAnterior: string | null): Promise<string> {
  const { url } = await poner({ tabla: "productos", id: productoId }, archivo, (s) => s.url, (tid) => rutaDeUrl(urlAnterior, tid), "No se pudo guardar la foto");
  return url;
}

export async function quitarFotoProducto(productoId: string, urlAnterior: string): Promise<void> {
  await retirar({ tabla: "productos", id: productoId }, (tid) => rutaDeUrl(urlAnterior, tid), "No se pudo quitar la foto");
}

/** Pone o cambia el logo de la tienda. La tienda guarda la RUTA; devuelve la nueva. */
export async function ponerLogoTienda(archivo: File, rutaAnterior: string | null): Promise<string> {
  const { ruta } = await poner({ tabla: "tienda_config" }, archivo, (s) => s.ruta, () => rutaAnterior, "No se pudo guardar el logo");
  return ruta;
}

export async function quitarLogoTienda(rutaAnterior: string): Promise<void> {
  await retirar({ tabla: "tienda_config" }, () => rutaAnterior, "No se pudo quitar el logo");
}
