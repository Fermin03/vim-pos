// «Tus datos» por pantallas: qué pantallas hay, qué dice el botón de cada una, qué pasa al tocarlo y
// a cuál regresa cada respuesta del envío. Puro: la pantalla (components/datos.tsx) solo pinta.
import type { Campo } from "./cliente";
import type { Pago } from "./contrato";
import type { Desenlace } from "./envio";
import type { PropinaElegida } from "./pago";

/** `datos`: quién, a dónde, el resumen y cómo paga (con la propina). `tarjeta`: los datos de la tarjeta. */
export type Paso = "datos" | "tarjeta";

/**
 * Las pantallas de ESTE pedido, en orden: todo va en `datos` (una sola pantalla, con un botón abajo),
 * y al pagar en línea sigue la de la tarjeta.
 */
export function pasosDe(pago: Pago | null): Paso[] {
  return pago === "EN_LINEA" ? ["datos", "tarjeta"] : ["datos"];
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
  /** El «otro monto» de la propina no vale: a la primera pantalla, con el foco en él. */
  | { tipo: "otro-monto" }
  /** «¿Gustas dejar una propina?»: va a pagar en línea y no eligió nada, ni «Sin propina». */
  | { tipo: "preguntar" }
  | { tipo: "paso"; paso: Paso }
  /** Era la última pantalla: se manda el pedido. */
  | { tipo: "enviar" };

/**
 * El toque en el botón principal. Los datos del cliente se revisan en TODAS las pantallas, y el
 * «otro monto» también (un total que cambió pudo dejarlo por encima del tope). La pregunta de la
 * propina sale una sola vez por pedido, al ir a pagar: quien la cierra sin contestar sigue sin
 * propina la siguiente vez.
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
  if (d.enLinea) {
    if (d.propina === "otro" && !d.otroValido) return { tipo: "otro-monto" };
    if (d.paso === "datos" && d.propina === null && !d.yaPreguntada) return { tipo: "preguntar" };
  }
  const sigue = d.pasos[d.pasos.indexOf(d.paso) + 1];
  return sigue ? { tipo: "paso", paso: sigue } : { tipo: "enviar" };
}

/**
 * A qué pantalla regresa una respuesta del envío: a donde vive el dato que hay que corregir. null =
 * se queda donde está (el aviso sale encima del botón) o no es de estas pantallas (un renglón del
 * carrito). La forma de pago vive con los datos, en la primera.
 */
export function pasoDelDesenlace(d: Desenlace, pasos: readonly Paso[]): Paso | null {
  if (d.tipo === "tarjeta") return pasos.includes("tarjeta") ? "tarjeta" : null;
  if (d.tipo === "campo") return "datos";
  return null;
}
