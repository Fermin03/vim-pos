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

export type Medidas = { minAncho: number; minAlto: number; idealAncho: number; idealAlto: number };

/** Celda del catálogo: la de un producto, que es el objetivo táctil más repetido del turno. */
const CELDA_CATALOGO: Medidas = {
  minAncho: MIN_ANCHO,
  minAlto: MIN_ALTO,
  idealAncho: IDEAL_ANCHO,
  idealAlto: IDEAL_ALTO,
};

/**
 * Celda de una OPCIÓN (un slot de combo, un modificador). Vive en un drawer de 480px, no en la
 * pantalla completa, y su contenido es más corto —"Bien cocido", "Queso cheddar +$15"—, así que
 * aguanta ser más baja que la del catálogo sin dejar de ser cómoda con el dedo.
 */
export const CELDA_OPCION: Medidas = { minAncho: 96, minAlto: 60, idealAncho: 200, idealAlto: 90 };

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
  medidas = CELDA_CATALOGO,
}: {
  ancho: number;
  alto: number;
  total: number;
  /** Con qué celda se mide. Por omisión, la del catálogo. */
  medidas?: Medidas;
}): Rejilla {
  const columnasMax = cuantasCaben(ancho, medidas.minAncho);
  const filasMax = cuantasCaben(alto, medidas.minAlto);

  let columnas = cuantasCaben(ancho, medidas.idealAncho);
  let filas = cuantasCaben(alto, medidas.idealAlto);

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
    anchoFicha: Math.max(medidas.minAncho, Math.floor((ancho - GAP * (columnas - 1)) / columnas)),
    altoFicha: Math.max(medidas.minAlto, Math.floor((alto - GAP * (filas - 1)) / filas)),
  };
}

/** Columnas que se prueban al repartir grupos de opciones, de la más cómoda a la más apretada. */
const COLUMNAS_GRUPO = [2, 3, 4, 5];
/**
 * Separación entre celdas de opción (`gap-2`), más apretada que la del catálogo porque vive en
 * un drawer. Tiene que ser EL MISMO número que pinta el componente: calcular con 12 y dibujar
 * con 8 reservaba de más y dejaba la celda en su mínimo con 59px libres debajo.
 */
const GAP_OPCION = 8;
/**
 * Alto de la celda de opción. El mínimo es 60 y no 44 porque el que manda aquí es el TEXTO: una
 * opción se lee a un escalón por debajo del nombre de un producto del catálogo (`tamanoOpcion`),
 * y en 44px esa talla no cabía con su precio debajo. Celdas más altas entran menos por página —
 * se pagina antes— y es el intercambio que se eligió: mejor pasar de página que entrecerrar los
 * ojos en hora pico.
 */
const ALTO_OPCION_IDEAL = 88;
const ALTO_OPCION_MIN = 60;

/** Un trozo de un grupo colocado en una página: `cantidad` opciones a partir de `desde`. */
export type TrozoGrupo = { grupo: number; desde: number; cantidad: number };

export type RepartoGrupos = {
  /** Iguales para TODOS los grupos: es lo que hace que la cuadrícula se vea pareja. */
  columnas: number;
  altoCelda: number;
  anchoCelda: number;
  paginas: TrozoGrupo[][];
};

/**
 * Reparte varios grupos de opciones —los modificadores de un producto— en páginas que caben.
 *
 * El catálogo tiene una sola tanda de celdas; aquí hay N grupos, cada uno con su cabecera y su
 * propio número de opciones, apilados en el mismo hueco. La regla es la misma de siempre: la
 * cuadrícula manda, el texto se achica, y lo que no cabe se pagina en vez de scrollear.
 *
 * Primero busca la combinación MÁS CÓMODA (menos columnas, celda más alta) con la que TODOS los
 * grupos entren de una sola vez, que es el caso normal: tres grupos de cinco opciones en un drawer
 * de 440×620 caben holgados. Solo cuando ninguna combinación alcanza, reparte en páginas.
 *
 * Al repartir **puede partir un grupo**. Es a propósito: un grupo con 30 opciones es más alto que
 * la página entera, y preferir "no partir grupos" lo dejaría directamente inalcanzable. Partido, el
 * cajero lo ve continuado en la siguiente página; entero y recortado, no lo ve nunca.
 */
export function repartirGrupos({
  ancho,
  alto,
  opcionesPorGrupo,
  altoCabecera,
  altoExtra,
}: {
  ancho: number;
  alto: number;
  opcionesPorGrupo: number[];
  /** Alto del encabezado de cada grupo (nombre + insignia de regla). */
  altoCabecera: number;
  /** Alto de lo que comparte la página con los grupos (la nota de cocina, el paginador). */
  altoExtra: number;
}): RepartoGrupos {
  // El piso garantiza que en una página SIEMPRE quepa una cabecera y una fila. Sin eso, un hueco
  // diminuto —o la medición de 0 del primer render— dejaba el reparto cerrando páginas vacías para
  // siempre: bucle infinito y el proceso muerto por memoria.
  const altoUtil = Math.max(altoCabecera + ALTO_OPCION_MIN + GAP_OPCION, alto - altoExtra);
  const anchoDe = (columnas: number) => Math.floor((ancho - GAP_OPCION * (columnas - 1)) / columnas);
  const usables = COLUMNAS_GRUPO.filter((c) => anchoDe(c) >= CELDA_OPCION.minAncho);
  const columnasPosibles = usables.length > 0 ? usables : [1];

  const altoDe = (opciones: number, columnas: number, altoCelda: number) =>
    altoCabecera + Math.max(1, Math.ceil(opciones / columnas)) * (altoCelda + GAP_OPCION);

  // ¿Hay una combinación con la que TODO quepa de una vez? Es el caso normal.
  for (const columnas of columnasPosibles) {
    for (let altoCelda = ALTO_OPCION_IDEAL; altoCelda >= ALTO_OPCION_MIN; altoCelda -= 4) {
      const total = opcionesPorGrupo.reduce((s, n) => s + altoDe(n, columnas, altoCelda), 0);
      if (total <= altoUtil) {
        return {
          columnas,
          altoCelda,
          anchoCelda: Math.max(CELDA_OPCION.minAncho, anchoDe(columnas)),
          paginas: [opcionesPorGrupo.map((n, grupo) => ({ grupo, desde: 0, cantidad: n }))],
        };
      }
    }
  }

  // No cabe: máxima densidad y reparto por páginas, llenando cada una hasta donde da.
  const columnas = columnasPosibles[columnasPosibles.length - 1]!;
  const altoCelda = ALTO_OPCION_MIN;
  const paginas: TrozoGrupo[][] = [];
  let pagina: TrozoGrupo[] = [];
  let usado = 0;

  for (const [grupo, opciones] of opcionesPorGrupo.entries()) {
    let desde = 0;
    do {
      const filasQueCaben = Math.floor((altoUtil - usado - altoCabecera) / (altoCelda + GAP_OPCION));
      if (filasQueCaben < 1) {
        if (pagina.length === 0) break; // no debería pasar: el piso de `altoUtil` lo impide
        // Ya no cabe ni la cabecera con una fila: se cierra la página y se sigue en la siguiente.
        paginas.push(pagina);
        pagina = [];
        usado = 0;
        continue;
      }
      const filas = Math.min(filasQueCaben, Math.ceil((opciones - desde) / columnas));
      const cantidad = Math.min(opciones - desde, filas * columnas);
      pagina.push({ grupo, desde, cantidad });
      usado += altoCabecera + filas * (altoCelda + GAP_OPCION);
      desde += cantidad;
    } while (desde < opciones);
  }
  paginas.push(pagina);

  return { columnas, altoCelda, anchoCelda: Math.max(CELDA_OPCION.minAncho, anchoDe(columnas)), paginas };
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

/**
 * Talla del nombre de una OPCIÓN (slot de combo, modificador), en px.
 *
 * Va un escalón por debajo del nombre de un producto del catálogo —que llega a 16— porque es
 * texto de apoyo dentro de un drawer, no el objetivo principal de la pantalla. El piso de 13 es
 * lo que obliga a que la celda no baje de 60px de alto.
 */
export function tamanoOpcion(anchoCelda: number, altoCelda: number): number {
  return acotar(13, Math.floor(Math.min(anchoCelda / 9, altoCelda / 4.2)), 15);
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
