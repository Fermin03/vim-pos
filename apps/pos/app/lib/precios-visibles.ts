"use client";
import { useSyncExternalStore } from "react";

/**
 * ¿La rejilla enseña los precios?
 *
 * La celda del catálogo muestra **solo el nombre**: el precio ocupa un renglón que en hora pico no
 * le sirve a nadie —el cajero se sabe el menú y el cliente lo ve en el menú de pared— y quitarlo
 * deja el nombre más grande en la misma celda. Cuando alguien pregunta "¿cuánto es la doble?", el
 * interruptor de "Mostrar precios" del ticket los enciende en todas las celdas.
 *
 * Vive en un almacén propio y no en el estado de la pantalla porque lo leen dos componentes que no
 * son padre e hijo: la celda del catálogo y el interruptor del sidebar. Pasarlo por props obligaría
 * a cablearlo por las dos pantallas que montan el catálogo, y las dos tendrían que acordarse de
 * hacerlo igual.
 *
 * Se recuerda por caja (`localStorage`), así que si el dueño prefiere trabajar con precios a la
 * vista, lo deja encendido y ya.
 */

const LLAVE = "vimpos.pos.mostrar-precios";

const oyentes = new Set<() => void>();
let valor: boolean | null = null;

/** Lee del almacenamiento la primera vez. Si el navegador lo prohíbe, se queda en memoria. */
function leer(): boolean {
  if (valor !== null) return valor;
  try {
    valor = globalThis.localStorage?.getItem(LLAVE) === "1";
  } catch {
    valor = false;
  }
  return valor;
}

export function preciosVisibles(): boolean {
  return leer();
}

export function setPreciosVisibles(v: boolean): void {
  if (leer() === v) return; // sin cambio no hay repintado
  valor = v;
  try {
    globalThis.localStorage?.setItem(LLAVE, v ? "1" : "0");
  } catch {
    /* modo privado o almacenamiento bloqueado: vale con tenerlo en memoria */
  }
  for (const o of oyentes) o();
}

export function suscribirPrecios(fn: () => void): () => void {
  oyentes.add(fn);
  return () => void oyentes.delete(fn);
}

/** Para componentes. En el render del servidor devuelve `false`, que es el valor por omisión. */
export function usePreciosVisibles(): boolean {
  return useSyncExternalStore(suscribirPrecios, preciosVisibles, () => false);
}
