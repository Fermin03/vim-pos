// Helpers PUROS del KDS (sin dependencias de cliente/red, testeables). Máquina de estados de
// cocina y cálculos de tiempo. comandas.ts (que sí habla con Supabase) los reexporta.

import { etiquetaModo } from "@vim/db/modos-servicio";

export type EstadoCocina = "EN_COCINA" | "LISTO" | "ENTREGADO" | "EN_RUTA" | "ENTREGADO_DOMICILIO" | "SIN_ENVIAR";

/** Nombre del modo de servicio. La lista vive en `@vim/db/modos-servicio`: aquí había solo cuatro
 *  de los doce, y la cocina leía `APP_UBEREATS` en crudo. */
export function labelModo(m: string): string {
  return etiquetaModo(m);
}

/** El siguiente estado al que avanza una comanda desde el KDS (null si ya está fuera de cocina). */
export function siguienteEstado(estado: EstadoCocina): EstadoCocina | null {
  if (estado === "EN_COCINA") return "LISTO";
  if (estado === "LISTO") return "ENTREGADO";
  return null;
}

/** Minutos transcurridos desde que entró a cocina (para el cronómetro y la alerta de vencido). */
export function minutosEnCocina(fechaEnvio: string | null, ahora: number): number {
  if (!fechaEnvio) return 0;
  const t = new Date(fechaEnvio).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((ahora - t) / 60000));
}

/** Etiqueta canónica de "sin área" para el filtro multi-área. */
export const SIN_AREA = "General";

/** Valor del filtro que muestra todas las áreas. */
export const TODAS_LAS_AREAS = "__todas__";

type ItemConArea = { area: string | null; listo?: boolean };

/**
 * Áreas con algo PENDIENTE en un conjunto de comandas (para el tab-bar del filtro multi-área).
 * Un área que ya marcó LISTO todo lo suyo no aparece. Orden alfabético estable.
 */
export function areasDeComandas(comandas: { items: ItemConArea[] }[]): string[] {
  const set = new Set<string>();
  for (const c of comandas) for (const it of c.items) if (!it.listo) set.add(it.area ?? SIN_AREA);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Lo que pinta el KDS con un filtro puesto (ADR 0018).
 *
 * - "Todas": cada orden con algo pendiente, con TODOS sus renglones (los ya listos se pintan
 *   tachados para que se vea qué falta).
 * - Un área: solo las órdenes con algo pendiente EN ESA ÁREA, y solo esos renglones. Lo que otras
 *   estaciones aún no terminan va en `otrasPendientes`, para que la plancha sepa que la orden
 *   sigue viva en la barra aunque desaparezca de su pantalla.
 */
export function vistaDeArea<I extends ItemConArea, C extends { items: I[] }>(
  comandas: C[],
  area: string,
): (C & { otrasPendientes: string[] })[] {
  const out: (C & { otrasPendientes: string[] })[] = [];
  for (const c of comandas) {
    const pendientes = c.items.filter((it) => !it.listo);
    if (pendientes.length === 0) continue;
    if (area === TODAS_LAS_AREAS) {
      out.push({ ...c, otrasPendientes: [] });
      continue;
    }
    const propios = pendientes.filter((it) => (it.area ?? SIN_AREA) === area);
    if (propios.length === 0) continue;
    const otras = new Set<string>();
    for (const it of pendientes) {
      const a = it.area ?? SIN_AREA;
      if (a !== area) otras.add(a);
    }
    out.push({ ...c, items: propios, otrasPendientes: [...otras].sort((a, b) => a.localeCompare(b)) });
  }
  return out;
}

/** El área del filtro como la espera `marcar_listo_cocina`: "General" es el área nula. */
export function areaParaRpc(area: string): string | null {
  return area === SIN_AREA ? null : area;
}

/**
 * Detecta cuántas comandas NUEVAS hay comparando los ticketIds previos con los actuales
 * (para disparar el sonido de "nuevo pedido").
 */
export function comandasNuevas(previos: Set<string>, actualesIds: string[]): number {
  let n = 0;
  for (const id of actualesIds) if (!previos.has(id)) n++;
  return n;
}

/** Minutos a partir de los cuales una comanda pide atención (ámbar) y está tarde (roja). */
export const UMBRAL_ATENCION_MIN = 8;
export const UMBRAL_TARDE_MIN = 15;

export type EstadoTiempo = "a-tiempo" | "atencion" | "tarde";

/**
 * El color de una comanda es SOLO su tiempo (docs/diseno/kds.md): nada de colores por modo o por
 * estación, para que el cocinero no tenga que traducir. Va además con palabra ("TARDE"), porque un
 * cocinero daltónico no distingue un borde verde de uno rojo.
 */
export function estadoDelTiempo(minutos: number): EstadoTiempo {
  if (minutos >= UMBRAL_TARDE_MIN) return "tarde";
  if (minutos >= UMBRAL_ATENCION_MIN) return "atencion";
  return "a-tiempo";
}

/** Ancho mínimo de una tarjeta: el mismo en una tele de 1920 que en la caja de 1024. */
export const ANCHO_MIN_TARJETA = 300;

/**
 * Columnas de tarjetas que caben en `ancho` px. La tarjeta mide lo mismo en cualquier pantalla: la
 * grande enseña MÁS comandas, no letra más grande (mismo criterio que el catálogo de la caja).
 */
export function columnasKds(ancho: number, gap: number): number {
  return Math.max(1, Math.floor((ancho + gap) / (ANCHO_MIN_TARJETA + gap)));
}

/**
 * Reparte las comandas en páginas de filas COMPLETAS, sin cortar ninguna tarjeta.
 *
 * Las comandas vienen en orden de llegada (la más vieja primero) y se acomodan por filas de
 * `columnas`; una fila mide lo que su tarjeta más alta. Caben filas mientras su suma (con los
 * `gap`) no pase de `alto`. La página 1 son siempre las más viejas: al cerrar una, las demás se
 * recorren y la primera en espera entra sola.
 *
 * Una fila que por sí sola no cabe va sola en su página (la tarjeta hace scroll por dentro): nunca
 * se queda una comanda sin página.
 */
export function paginarPorFilas(alturas: number[], columnas: number, alto: number, gap: number): number[][] {
  const cols = Math.max(1, columnas);
  const paginas: number[][] = [];
  let actual: number[] = [];
  let usado = 0;
  for (let inicio = 0; inicio < alturas.length; inicio += cols) {
    const fila = alturas.slice(inicio, inicio + cols);
    const altoFila = Math.max(...fila);
    const conGap = actual.length > 0 ? usado + gap + altoFila : altoFila;
    if (actual.length > 0 && conGap > alto) {
      paginas.push(actual);
      actual = [];
      usado = 0;
    }
    usado = actual.length > 0 ? usado + gap + altoFila : altoFila;
    for (let i = inicio; i < inicio + fila.length; i++) actual.push(i);
  }
  if (actual.length > 0) paginas.push(actual);
  return paginas;
}

/**
 * Agrupa los renglones de un combo bajo un solo encabezado: antes cada hijo repetía
 * "↳ Combo #1 · …". Solo junta renglones SEGUIDOS del mismo combo, que es como llegan.
 */
export function bloquesDeComanda<I extends { comboEtiqueta: string | null }>(items: I[]): { combo: string | null; items: I[] }[] {
  const bloques: { combo: string | null; items: I[] }[] = [];
  for (const it of items) {
    const ultimo = bloques[bloques.length - 1];
    if (it.comboEtiqueta && ultimo && ultimo.combo === it.comboEtiqueta) ultimo.items.push(it);
    else bloques.push({ combo: it.comboEtiqueta, items: [it] });
  }
  return bloques;
}
