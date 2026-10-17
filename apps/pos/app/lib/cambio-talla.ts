"use client";
import { z } from "zod";
import { employeeClient } from "./supabase";
import type { Autorizacion } from "./autorizacion";
import { redondearCentavos } from "./dinero";
import { fmtMxn } from "./turno";

/**
 * Qué pasa con el dinero en un cambio (pos-retail.md, «Cambio de talla»): nunca un número sin
 * palabra. `diferencia` > 0 la paga el cliente; < 0 se le regresa en efectivo.
 */
export function resumenCambio(regresaMxn: number, llevaMxn: number): { diferencia: number; texto: string } {
  const diferencia = redondearCentavos(llevaMxn - regresaMxn);
  if (diferencia > 0) return { diferencia, texto: `El cliente paga ${fmtMxn(diferencia)}` };
  if (diferencia < 0) return { diferencia, texto: `Le regresas ${fmtMxn(-diferencia)} en efectivo` };
  return { diferencia: 0, texto: "Sin diferencia" };
}

const Resultado = z.object({
  ticket_id: z.string(),
  regresa_mxn: z.coerce.number(),
  lleva_mxn: z.coerce.number(),
  diferencia_mxn: z.coerce.number(),
});

export type CambioRegistrado = { ticketId: string; regresa: number; lleva: number; diferencia: number };

/**
 * `registrar_cambio_talla` (0195): devolución parcial con motivo «Cambio de talla» + venta nueva,
 * en una transacción. Con diferencia > 0 la venta nueva queda ABIERTA con ese saldo; si no, PAGADA.
 * `clientId` es la llave del intento: un reintento con la misma devuelve lo ya hecho.
 */
export async function registrarCambio(args: {
  token: string;
  ticketOrigen: string;
  regresa: { ticketItemId: string; cantidad: number };
  lleva: { productoId: string; cantidad: number };
  cajaId: string;
  turnoId: string;
  usuarioId: string;
  autorizacion: Autorizacion;
  clientId: string;
}): Promise<CambioRegistrado> {
  const { data, error } = await employeeClient(args.token).rpc("registrar_cambio_talla", {
    p_ticket_origen: args.ticketOrigen,
    p_regresa: [{ ticket_item_id: args.regresa.ticketItemId, cantidad: args.regresa.cantidad }],
    p_lleva: [{ producto_id: args.lleva.productoId, cantidad: args.lleva.cantidad }],
    p_caja_id: args.cajaId,
    p_turno_id: args.turnoId,
    p_usuario_id: args.usuarioId,
    p_autorizacion_pin_id: args.autorizacion.autorizacionPinId,
    p_usuario_autorizo_id: args.autorizacion.autorizoId,
    p_client_id_local: args.clientId,
  });
  // «DATOS_INVALIDOS: …» trae el motivo para el cajero (p. ej. el de una venta facturada).
  if (error) throw new Error(error.message.replace(/^DATOS_INVALIDOS:\s*/, ""));
  const r = Resultado.parse(data);
  return { ticketId: r.ticket_id, regresa: r.regresa_mxn, lleva: r.lleva_mxn, diferencia: r.diferencia_mxn };
}
