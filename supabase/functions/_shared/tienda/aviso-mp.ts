// Qué dice un aviso (webhook) de Mercado Pago de una orden en línea. Puro: se prueba con node --test.
// El formato es el de las órdenes de Point, VERIFICADO con avisos reales (terminal-webhook-mp):
//   ?data.id=<orden>&type=order      { action: "order.processed", type: "order", data: { external_reference, status, … } }
// (`data` no trae `id`: el de la orden viene en la query). Que las órdenes en línea avisen con este
// mismo formato está SIN PROBAR (docs/integraciones/mercado-pago-checkout-pro/04-verificado-orders.md).
import { datosDeOrden } from "../terminal/mercado-pago.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDEN = /^[A-Za-z0-9_-]{1,64}$/;

export type AvisoDeOrden = {
  accion: string;
  /** El id de la orden en Mercado Pago: solo una pista de cuál consultar. */
  ordenIdExterno: string;
  /** Nuestra referencia (id de tienda_pagos), si el aviso la trae y tiene forma de uuid. */
  ref: string | null;
};

/**
 * La orden de la que habla un aviso, y solo si es un aviso de orden (`action: "order.…"`). null = no
 * es para nosotros. De aquí no sale ningún estado ni monto: eso se le pregunta a Mercado Pago.
 */
export function ordenDelAviso(cuerpo: unknown, dataId: string | null): AvisoDeOrden | null {
  const c = cuerpo && typeof cuerpo === "object" && !Array.isArray(cuerpo) ? cuerpo as Record<string, unknown> : {};
  const accion = typeof c.action === "string" ? c.action : "";
  if (!accion.startsWith("order.")) return null;
  const d = datosDeOrden(c.data, dataId ?? undefined);
  // La firma se calculó con `data.id` en minúsculas; el id de la orden se usa como llegó.
  if (!d.orden_id_externo || !ORDEN.test(d.orden_id_externo)) return null;
  return { accion, ordenIdExterno: d.orden_id_externo, ref: d.cobro_id && UUID.test(d.cobro_id) ? d.cobro_id.toLowerCase() : null };
}
