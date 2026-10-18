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

/**
 * Lo que se le regresa en efectivo al cancelar la venta abierta de un cambio: su pago interno
 * (`<llave del ticket>-pago`, 0195), que la base anula al cancelar (0196). 0 si no es de un cambio.
 */
export async function pagoInternoDelCambio(token: string, ticketId: string): Promise<number> {
  const sb = employeeClient(token);
  const { data: tk, error: e1 } = await sb.from("tickets").select("client_id_local").eq("id", ticketId).maybeSingle();
  if (e1) throw new Error(e1.message);
  const llave = tk?.client_id_local;
  if (!llave) return 0;
  const { data, error } = await sb.from("pagos").select("monto_mxn")
    .eq("ticket_id", ticketId).eq("client_id_local", `${llave}-pago`)
    .in("estado", ["APLICADO", "CONCILIADO"]).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? Number(data.monto_mxn) : 0;
}

/**
 * ¿La cuenta es la venta nueva de un cambio de talla? Lo dice la base (`_ticket_es_de_cambio`, 0200),
 * con el criterio del ticket impreso (`leerCambioTalla`): una devolución CAMBIO_TALLA con la misma
 * `client_id_local`.
 */
export async function esVentaDeCambio(token: string, ticketId: string): Promise<boolean> {
  const { data, error } = await employeeClient(token).rpc("_ticket_es_de_cambio", { p_ticket: ticketId });
  if (error) throw new Error(error.message);
  return data === true;
}

const Resultado = z.object({
  ticket_id: z.string(),
  regresa_mxn: z.coerce.number(),
  lleva_mxn: z.coerce.number(),
  diferencia_mxn: z.coerce.number(),
});

/** La base rechazó el cambio (`DATOS_INVALIDOS`): no quedó nada hecho; el siguiente intento lleva otra llave. */
export class CambioRechazado extends Error {}

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
  // Otro error (la red, un corte) es ambiguo: el cambio pudo quedar hecho y la llave se conserva.
  if (error) {
    if (/^DATOS_INVALIDOS:/.test(error.message)) throw new CambioRechazado(error.message.replace(/^DATOS_INVALIDOS:\s*/, ""));
    throw new Error(error.message);
  }
  const r = Resultado.parse(data);
  return { ticketId: r.ticket_id, regresa: r.regresa_mxn, lleva: r.lleva_mxn, diferencia: r.diferencia_mxn };
}
