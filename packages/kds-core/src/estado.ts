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
