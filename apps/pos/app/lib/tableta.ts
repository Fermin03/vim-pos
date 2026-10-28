/**
 * La caja web en una tableta.
 *
 * La venta se diseñó para una pantalla táctil de 15" a 1024×768 (`docs/diseno/pos.md`). Una
 * tableta de 10–11" pinta 1180–1280 px CSS en una pantalla un tercio más chica: los mismos
 * botones quedan físicamente más pequeños. En vez de agrandar componente por componente, la
 * tableta dibuja la página como si su lado largo midiera 1024 px y escala todo parejo — es lo que
 * hace el navegador con `<meta name="viewport" content="width=…">`.
 *
 * La caja de escritorio (Electron) y las computadoras con mouse no cambian.
 */

/** El ancho para el que se diseñó la venta. */
export const ANCHO_DISENO = 1024;

/** Pantalla táctil sin mouse que no es la caja instalada: una tableta (o un celular). */
export function esTableta(): boolean {
  if (typeof window === "undefined") return false;
  if ((window as { __VIM_DESKTOP?: boolean }).__VIM_DESKTOP === true) return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

/**
 * Ancho de layout para la orientación actual, o null si la pantalla ya está a la escala del
 * diseño (un celular, una tableta de 8" a 1024 o menos).
 *
 * La escala sale del lado LARGO, así que es la misma de pie que acostada: el botón mide igual al
 * girar la tableta. `screen.width` no sirve solo: en iPad es siempre el ancho vertical.
 */
export function anchoLayout(ladoA: number, ladoB: number, vertical: boolean): number | null {
  const largo = Math.max(ladoA, ladoB);
  if (largo <= ANCHO_DISENO) return null;
  const ancho = vertical ? Math.min(ladoA, ladoB) : largo;
  return Math.round((ancho * ANCHO_DISENO) / largo);
}
