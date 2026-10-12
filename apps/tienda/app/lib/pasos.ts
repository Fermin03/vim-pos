// «Tus datos» por pantallas: qué pantallas hay, qué dice el botón de cada una, qué pasa al tocarlo y
// a cuál regresa cada respuesta del envío. Puro: la pantalla (components/datos.tsx) solo pinta.
import type { Campo } from "./cliente";
import type { Pago } from "./contrato";
import type { Desenlace } from "./envio";
import type { PropinaElegida } from "./pago";

/** `datos`: quién y a dónde. `pago`: cómo paga (y la propina). `tarjeta`: los datos de la tarjeta. */
export type Paso = "datos" | "pago" | "tarjeta";

/**
 * Las pantallas de ESTE pedido, en orden; el «Paso 2 de 3» sale de aquí, así que el total es el real.
 *  · una sola forma de pago y es al recibir (o ninguna): no hay nada que preguntar → solo `datos`;
 *  · se paga al recibir: `datos` y `pago`, y ahí termina;
 *  · se paga en línea: las tres (si es la única forma, `pago` enseña solo la propina).
 */
export function pasosDe(formas: readonly Pago[], pago: Pago | null): Paso[] {
  if (pago === "EN_LINEA") return ["datos", "pago", "tarjeta"];
  return formas.length > 1 ? ["datos", "pago"] : ["datos"];
}

/** Lo que hace el botón principal de una pantalla (su texto lo pone quien pinta). */
export type Accion = "continuar" | "ir-a-pagar" | "enviar" | "pagar";
export function accionDe(pasos: readonly Paso[], paso: Paso, pago: Pago | null): Accion {
  const sigue = pasos[pasos.indexOf(paso) + 1];
  if (!sigue) return pago === "EN_LINEA" ? "pagar" : "enviar";
  return sigue === "tarjeta" ? "ir-a-pagar" : "continuar";
}

export type Avance =
  /** Falta o está mal un dato del cliente: a la pantalla 1, con el foco en ese campo. */
  | { tipo: "campo"; campo: Campo }
  /** El «otro monto» de la propina no vale: a la pantalla del pago, con el foco en él. */
  | { tipo: "otro-monto" }
  /** «¿Gustas dejar una propina?»: va a pagar en línea y no eligió nada, ni «Sin propina». */
  | { tipo: "preguntar" }
  | { tipo: "paso"; paso: Paso }
  /** Era la última pantalla: se manda el pedido. */
  | { tipo: "enviar" };

/**
 * El toque en el botón principal. Los datos del cliente se revisan en TODAS las pantallas (elegir
 * «Pagar en línea» en la segunda vuelve obligatorio el correo, que vive en la primera), y el «otro
 * monto» también (un total que cambió pudo dejarlo por encima del tope). La pregunta de la propina
 * sale una sola vez por pedido: quien la cierra sin contestar sigue sin propina la siguiente vez.
 */
export function avanzar(d: {
  pasos: readonly Paso[]; paso: Paso;
  /** El primer campo con error, en el orden de la pantalla. */
  primerError: Campo | undefined;
  enLinea: boolean; propina: PropinaElegida;
  /** Con «otro monto» elegido: ¿lo escrito vale? */
  otroValido: boolean; yaPreguntada: boolean;
}): Avance {
  if (d.primerError) return { tipo: "campo", campo: d.primerError };
  if (d.enLinea && d.paso !== "datos") {
    if (d.propina === "otro" && !d.otroValido) return { tipo: "otro-monto" };
    if (d.paso === "pago" && d.propina === null && !d.yaPreguntada) return { tipo: "preguntar" };
  }
  const sigue = d.pasos[d.pasos.indexOf(d.paso) + 1];
  return sigue ? { tipo: "paso", paso: sigue } : { tipo: "enviar" };
}

/**
 * A qué pantalla regresa una respuesta del envío: a donde vive el dato que hay que corregir. null =
 * se queda donde está (el aviso sale encima del botón) o no es de estas pantallas (un renglón del
 * carrito). El rechazo de la forma de pago, si no hay pantalla de pago, se dice en la primera.
 */
export function pasoDelDesenlace(d: Desenlace, pasos: readonly Paso[]): Paso | null {
  if (d.tipo === "tarjeta") return pasos.includes("tarjeta") ? "tarjeta" : null;
  if (d.tipo === "campo") return d.campo === "pago" && pasos.includes("pago") ? "pago" : "datos";
  return null;
}
