// Lo que las pantallas del menú y del carrito DECIDEN sin pintar nada: qué sucursal toca, con qué
// carrito se arranca, qué chip de categoría va activo, cómo se marca una opción, a qué renglón
// pertenece un error de la función y la espera antes de recotizar. Puro, para poder probarlo.
import type { Resultado } from "./api";
import { carritoNuevo, type Carrito, type CuerpoCarrito } from "./carrito";
import type { Cotizacion, Modo, Negocio, Sucursal } from "./contrato";
import { textoDeError } from "./textos";

/**
 * La sucursal de la página. Con una sola no se pregunta (decisión 6); con varias viaja en `?s=<id>`
 * y, si no viene una válida, es null: toca preguntar.
 */
export function sucursalElegida(negocio: Negocio, s: string | undefined): Sucursal | null {
  if (negocio.sucursales.length <= 1) return negocio.sucursales[0] ?? null;
  return negocio.sucursales.find((x) => x.id === s?.toLowerCase()) ?? null;
}

/** Los modos que la sucursal ofrece. Con uno solo no se pregunta (decisión 6). */
export function modosDe(sucursal: Sucursal): Modo[] {
  return [...(sucursal.recoger ? ["RECOGER" as const] : []), ...(sucursal.domicilio ? ["DOMICILIO" as const] : [])];
}

/** Por qué no se puede pedir ahora en ese modo (para `textoCerrada`), o null si sí se puede. */
export function motivoDeCierre(sucursal: Sucursal, modo: Modo): string | null {
  if (!modosDe(sucursal).includes(modo)) return "MODO_NO_DISPONIBLE";
  return modo === "RECOGER" ? sucursal.estado.recoger : sucursal.estado.domicilio;
}

/**
 * El carrito con el que arranca la página de una sucursal. El guardado se usa solo si es de ESA
 * sucursal (el carrito es por sucursal); su modo y su zona se corrigen si el negocio ya no los
 * ofrece. Con una sola zona se elige sola; con varias la elige el cliente.
 */
export function carritoPara(sucursal: Sucursal, guardado: Carrito | null): Carrito {
  const modos = modosDe(sucursal);
  const base = guardado?.sucursalId === sucursal.id ? guardado : carritoNuevo(sucursal.id, modos[0] ?? "RECOGER");
  const zonaId = sucursal.zonas.some((z) => z.id === base.zonaId) ? base.zonaId
    : sucursal.zonas.length === 1 ? sucursal.zonas[0]!.id : null;
  const modo = modos.includes(base.modo) ? base.modo : modos[0] ?? base.modo;
  return modo === base.modo && zonaId === base.zonaId ? base : { ...base, modo, zonaId };
}

/**
 * El chip que va activo mientras se recorre el menú: la última sección cuyo borde superior ya cruzó
 * la línea (el borde inferior de la barra pegajosa). Antes de la primera, la primera; con la página
 * al fondo, la última (una categoría corta nunca llegaría a la línea).
 */
export function categoriaActiva(secciones: { id: string; top: number }[], linea: number, alFinal = false): string | null {
  if (alFinal) return secciones.at(-1)?.id ?? null;
  let activa = secciones[0]?.id ?? null;
  for (const s of secciones) if (s.top <= linea) activa = s.id;
  return activa;
}

/**
 * Tocar una opción de un grupo (o de un slot). `delGrupo` son los ids de sus opciones; lo elegido
 * en otros grupos no se toca.
 *  · Ya estaba: se quita, salvo en «elige 1» obligatorio (un radio no se desmarca).
 *  · Máximo 1: reemplaza a la que hubiera.
 *  · Ya se llegó al máximo: no pasa nada (la pantalla deshabilita las demás).
 */
export function alternar<T>(
  elegidos: T[], idDe: (t: T) => string, delGrupo: string[], nuevo: T, regla: { minimo: number; maximo: number | null },
): T[] {
  const id = idDe(nuevo), esDelGrupo = (t: T) => delGrupo.includes(idDe(t));
  if (elegidos.some((t) => idDe(t) === id)) {
    return regla.minimo === 1 && regla.maximo === 1 ? elegidos : elegidos.filter((t) => idDe(t) !== id);
  }
  if (regla.maximo === 1) return [...elegidos.filter((t) => !esDelGrupo(t)), nuevo];
  if (regla.maximo !== null && elegidos.filter(esDelGrupo).length >= regla.maximo) return elegidos;
  return [...elegidos, nuevo];
}

const DE_RENGLON = new Set(["PRODUCTO_NO_DISPONIBLE", "MODIFICADORES_INVALIDOS", "COMBO_INVALIDO"]);

/**
 * Los renglones que señala un error de `cotizar` o `pedir`: `{ [renglon.id]: aviso }`. Esos tres
 * códigos traen en `detalle` el id del producto; se marcan todos sus renglones. Vacío = el error no
 * es de un renglón (o no se sabe de cuál) y se enseña como aviso general.
 */
export function renglonesDelError(carrito: Carrito, e: { error: string; detalle: string | null }): Record<string, string> {
  if (!DE_RENGLON.has(e.error) || !e.detalle) return {};
  const t = textoDeError(e.error);
  return Object.fromEntries(carrito.renglones.filter((r) => r.productoId === e.detalle).map((r) => [r.id, `${t.texto} ${t.hacer}`]));
}

/**
 * Cotiza tras una espera corta, para no preguntar por cada toque de «+». Devuelve cómo cancelar:
 * durante la espera no se llama; con la llamada en vuelo se aborta y su respuesta no se entrega.
 * Quien llama cancela la anterior antes de pedir otra (la limpieza de un efecto).
 */
export function cotizarConEspera(
  cotizar: (cuerpo: CuerpoCarrito, signal: AbortSignal) => Promise<Resultado<Cotizacion>>,
  cuerpo: CuerpoCarrito, alResultado: (r: Resultado<Cotizacion>) => void, esperaMs = 400,
): () => void {
  const corte = new AbortController();
  const reloj = setTimeout(async () => {
    const r = await cotizar(cuerpo, corte.signal);
    if (corte.signal.aborted || (!r.ok && r.error === "CANCELADA")) return;
    alResultado(r);
  }, esperaMs);
  return () => { clearTimeout(reloj); corte.abort(); };
}
