/**
 * Aritmética de la rejilla del catálogo.
 *
 * El catálogo no scrollea: la rejilla se ajusta al hueco que tiene. Esta es la parte que decide
 * cuántas columnas y filas caben y de qué tamaño queda la ficha — sin React, para poder probarla.
 *
 * La regla, en orden:
 *
 *   1. Se intenta con la ficha IDEAL (168×140). Con un menú normal, ahí se acaba.
 *   2. Si no cabe la categoría, se densifica: una columna y una fila más por paso, hasta el piso
 *      táctil de 110×92 — que es lo que pide `docs/diseno/pos.md` (56px mínimo, y el nombre de un
 *      producto tiene que caber en dos renglones legibles).
 *   3. Si ni así cabe, se PAGINA. Encoger más deja fichas de 74px y el cajero se equivoca.
 *
 * Las columnas y filas son la CAPACIDAD del hueco, no lo que la categoría trae. Así la ficha mide
 * lo mismo en una categoría de 3 productos que en una de 12: el dedo aprende una sola posición.
 */

/** `gap-3` de Tailwind, el mismo que separa las fichas en pantalla. */
const GAP = 12;

/**
 * Celda cómoda: la que se busca cuando el menú cabe holgado. NO es un tope — la celda real llena
 * el hueco, así que suele salir algo mayor. Solo decide CUÁNTAS celdas caben: en 1366×768 da una
 * cuadrícula de 5×4, que es la que se aprobó.
 */
const IDEAL_ANCHO = 168;
const IDEAL_ALTO = 112;

/** Piso táctil. Por debajo de esto se pagina en vez de seguir encogiendo. */
const MIN_ANCHO = 110;
const MIN_ALTO = 92;

export type Rejilla = {
  /** Columnas de la rejilla (capacidad, no cuántos productos hay). */
  columnas: number;
  /** Filas de la rejilla (capacidad). */
  filas: number;
  /** Fichas por página = columnas × filas. Siempre ≥ 1. */
  porPagina: number;
  /** Páginas necesarias para `total`. Siempre ≥ 1, aunque la categoría esté vacía. */
  paginas: number;
  anchoFicha: number;
  altoFicha: number;
};

/** Cuántas piezas de `medida` caben en `hueco` contando los gaps. Nunca menos de una. */
function cuantasCaben(hueco: number, medida: number): number {
  return Math.max(1, Math.floor((hueco + GAP) / (medida + GAP)));
}

function acotar(min: number, valor: number, max: number): number {
  return Math.min(Math.max(valor, min), max);
}

export function calcularRejilla({
  ancho,
  alto,
  total,
}: {
  ancho: number;
  alto: number;
  total: number;
}): Rejilla {
  const columnasMax = cuantasCaben(ancho, MIN_ANCHO);
  const filasMax = cuantasCaben(alto, MIN_ALTO);

  let columnas = cuantasCaben(ancho, IDEAL_ANCHO);
  let filas = cuantasCaben(alto, IDEAL_ALTO);

  // Densifica de a un paso —una columna y una fila— hasta que quepa la categoría o hasta tocar el
  // piso táctil. Termina siempre: cada vuelta sube al menos uno de los dos y ambos tienen tope.
  while (columnas * filas < total && (columnas < columnasMax || filas < filasMax)) {
    columnas = Math.min(columnasMax, columnas + 1);
    filas = Math.min(filasMax, filas + 1);
  }

  const porPagina = columnas * filas;

  return {
    columnas,
    filas,
    porPagina,
    paginas: Math.max(1, Math.ceil(total / porPagina)),
    // La celda llena el hueco en los dos ejes: ni canal muerto a la derecha ni franja abajo. La
    // cuadrícula mide siempre lo mismo dentro de una pantalla, tenga la categoría 3 productos o
    // 20 — lo único que cambia es cuántas celdas van llenas. Es lo que pidió Fermín, y de paso le
    // da al cajero una posición fija por producto.
    anchoFicha: Math.max(MIN_ANCHO, Math.floor((ancho - GAP * (columnas - 1)) / columnas)),
    altoFicha: Math.max(MIN_ALTO, Math.floor((alto - GAP * (filas - 1)) / filas)),
  };
}

/** Pastilla de categoría: mínimo legible y separación, en px. */
const MIN_PASTILLA = 88;
const GAP_PASTILLA = 8;
/** Filas de categorías que se intentan antes de aceptar una tercera. */
const FILAS_OBJETIVO = 2;

export type BarraCategorias = {
  columnas: number;
  filas: number;
  anchoPastilla: number;
};

/**
 * Reparte las categorías en una cuadrícula pareja, sin scroll.
 *
 * Todas las pastillas miden lo mismo y llenan el ancho. El reparto es parejo a propósito: con 11
 * categorías salen 6 y 5, no 10 y 1 —una fila casi vacía debajo de otra llena se lee como un error
 * de dibujo—. Si ni apretando al mínimo caben en dos filas, usa las que hagan falta: una tercera
 * fila le quita alto a la rejilla, que se reacomoda sola, y eso siempre es mejor que una barra con
 * scroll.
 */
export function calcularBarraCategorias({ ancho, total }: { ancho: number; total: number }): BarraCategorias {
  const columnasMax = Math.max(1, Math.floor((ancho + GAP_PASTILLA) / (MIN_PASTILLA + GAP_PASTILLA)));
  const filas = Math.max(1, Math.ceil(total / columnasMax));
  const columnas = Math.max(1, filas <= FILAS_OBJETIVO ? Math.ceil(total / filas) : columnasMax);
  return {
    columnas,
    filas,
    anchoPastilla: Math.max(
      MIN_PASTILLA,
      Math.floor((ancho - GAP_PASTILLA * (columnas - 1)) / columnas),
    ),
  };
}

/**
 * Talla del nombre del producto, en px.
 *
 * El texto se achica para caber en la celda en vez de que la celda crezca para el texto: es la
 * regla que pidió Fermín y la que mantiene la cuadrícula pareja. El ancho manda (los nombres
 * envuelven) y el alto pone el otro tope para que quepan nombre y precio.
 */
export function tamanoNombre(anchoCelda: number, altoCelda: number): number {
  return acotar(11, Math.floor(Math.min(anchoCelda / 11.5, altoCelda / 8)), 16);
}

/** Talla de la etiqueta de categoría, en px. Misma idea que `tamanoNombre`. */
export function tamanoEtiqueta(anchoPastilla: number): number {
  return acotar(11, Math.floor(anchoPastilla / 11), 14);
}

/**
 * Mantiene la página dentro de rango.
 *
 * Hace falta al cambiar de categoría y al redimensionar: si la ventana se maximiza estando en la
 * página 3 de 3, la rejilla crece, quedan 2 páginas y la 3 ya no existe.
 */
export function clampPagina(pagina: number, paginas: number): number {
  return Math.min(Math.max(1, pagina), Math.max(1, paginas));
}
