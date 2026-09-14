// Qué hacer al dar de alta un add-on que el cliente ya tuvo.
//
// POR QUÉ EXISTE. `tenant_addons` lleva desde la 0002 la restricción `addon_unico_activo`, que
// —pese al nombre y al comentario que la acompaña— NO es "un solo add-on activo": es
// `UNIQUE (tenant_id, addon_id, fecha_inicio)`. O sea, **una sola alta por día y por add-on**.
//
// Con lo cual, dar de baja y volver a dar de alta el MISMO día reventaba con un
// `duplicate key value violates unique constraint "addon_unico_activo"` en la cara del operador.
// Y ese es justo el caso de un clic equivocado: el gesto natural es deshacerlo en el momento.
// Pasó de verdad el 13 sep 2026 probando el add-on de delivery.
//
// La restricción no se toca: existe desde la 0002, la respetan datos reales y cambiarla para
// arreglar esto sería mover el suelo. Lo que se arregla es la lectura del caso — un alta el mismo
// día de la baja no es una fila nueva, es **deshacer** la de hoy.

/**
 * Precio con el que el panel pre-llena el alta del add-on de delivery, según el plan del cliente.
 *
 * **Solo Esencial lo paga.** Cualquier otro plan lo lleva incluido sin cargo. Al principio (spec
 * §4) la regla nombraba Negocio y Cadena, y los planes viejos por vertical —`FT`, `QS`, `CB`, `FS`,
 * `DK`, `ENT`— caían al precio de lista por omisión: un `ENT` de $2,499 pagaba aparte lo que un
 * `CADENA` de $1,999 llevaba incluido. Corregido el 14 sep 2026 dándole la vuelta a la regla: se
 * nombra a quien paga, no a quien no.
 *
 * **Un plan desconocido paga.** Si mañana aparece un plan nuevo, cobrarlo de más se ve en la
 * factura y alguien reclama; regalarlo no lo nota nadie. Y el operador ve el precio en el
 * formulario y puede cambiarlo antes de guardar.
 *
 * @param planCodigo  Código del plan del tenant, o vacío si no tiene.
 * @param precioLista `addons.precio_mensual_mxn` de la fila del add-on.
 */
export function precioAltaDelivery(planCodigo: string | undefined, precioLista: number): number {
  return PLANES_QUE_LO_INCLUYEN.has(planCodigo ?? "") ? 0 : precioLista;
}

/**
 * Los planes que traen delivery sin cargo. Es una lista explícita y no un "todos menos Esencial"
 * para que un plan nuevo no se regale solo: darlo de alta aquí es un gesto deliberado de dos
 * segundos, y mientras tanto el panel cobra, que es el lado recuperable del error.
 */
const PLANES_QUE_LO_INCLUYEN = new Set(["NEGOCIO", "CADENA", "FT", "QS", "CB", "FS", "DK", "ENT"]);

/** Lo mínimo que hace falta de cada fila de `tenant_addons` para decidir. */
export type FilaAddon = { id: string; activo: boolean; fecha_inicio: string };

export type AltaAddon =
  /** Ya lo tiene: no se hace nada y el panel contesta `yaEstaba`. */
  | { accion: "ya_estaba" }
  /** Hubo un alta HOY que se dio de baja: se reactiva esa misma fila con el precio nuevo. */
  | { accion: "reactivar"; id: string }
  /** Ninguna fila de hoy: alta normal. */
  | { accion: "insertar" };

/**
 * @param filas Todas las filas de ese tenant para ese add-on (suelen ser una o dos).
 * @param hoy   La fecha de hoy en México, `YYYY-MM-DD` — la misma que se escribiría en
 *              `fecha_inicio`. Se pasa, no se calcula: el huso horario es decisión de quien llama.
 */
export function decidirAltaAddon(filas: FilaAddon[], hoy: string): AltaAddon {
  if (filas.some((f) => f.activo)) return { accion: "ya_estaba" };
  // Si hubiera más de una baja de hoy —no debería, la restricción lo impide— se reactiva la
  // primera: cualquiera sirve, porque todas chocarían igual con el INSERT.
  const deHoy = filas.find((f) => f.fecha_inicio?.slice(0, 10) === hoy);
  return deHoy ? { accion: "reactivar", id: deHoy.id } : { accion: "insertar" };
}
