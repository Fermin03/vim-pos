"use client";
import { employeeClient } from "./supabase";
import type { LineaCarrito, ModoServicio } from "./carrito";

export type MetodoPago =
  | "EFECTIVO"
  | "TARJETA_CREDITO"
  | "TARJETA_DEBITO"
  | "TRANSFERENCIA"
  | "APP_OTRO";

export type PagoInput = {
  metodo: MetodoPago;
  monto: number;
  montoRecibido?: number; // solo efectivo
  referencia?: string;
};

export type TotalesTicket = {
  ticketId: string;
  subtotal: number;
  iva: number;
  descuentos: number;
  total: number;
  montoPagado: number;
  cambio: number;
  pendiente: number;
  estadoFiscal: string;
  folio: string | null;
};

type CtxCobro = {
  token: string;
  sucursalId: string;
  cajaId: string;
  turnoId: string;
};

function modifsJsonb(linea: LineaCarrito): { opcion_modificador_id: string; cantidad: number }[] {
  return linea.modificadores.map((m) => ({ opcion_modificador_id: m.opcionId, cantidad: m.cantidad }));
}

/** Persiste el ticket completo (abrir + items) y devuelve los totales autoritativos de la BD. */
export async function persistirTicket(
  ctx: CtxCobro,
  modoServicio: ModoServicio,
  lineas: LineaCarrito[],
  ticketClientId: string,
): Promise<TotalesTicket> {
  const sb = employeeClient(ctx.token);

  const { data: ticketId, error: e1 } = await sb.rpc("abrir_ticket", {
    p_sucursal_id: ctx.sucursalId,
    p_caja_id: ctx.cajaId,
    p_turno_id: ctx.turnoId,
    p_modo_servicio: modoServicio,
    p_client_id_local: ticketClientId,
  });
  if (e1) throw new Error(e1.message);
  const tid = ticketId as string;

  for (const l of lineas) {
    const { error } = await sb.rpc("agregar_item_a_ticket", {
      p_ticket_id: tid,
      p_producto_id: l.producto.id,
      p_cantidad: l.cantidad,
      p_nota_cocina: l.notaCocina,
      p_modificadores: modifsJsonb(l),
      p_client_id_local: l.clientId,
    });
    if (error) throw new Error(error.message);
  }

  return leerTotales(ctx.token, tid);
}

/** Relee los totales autoritativos de la fila tickets. */
export async function leerTotales(token: string, ticketId: string): Promise<TotalesTicket> {
  const { data, error } = await employeeClient(token)
    .from("tickets")
    .select("id, subtotal_mxn, iva_mxn, descuentos_manuales_mxn, total_mxn, monto_pagado_mxn, cambio_mxn, monto_pendiente_mxn, estado_fiscal, folio_completo")
    .eq("id", ticketId)
    .single();
  if (error) throw new Error(error.message);
  const t = data as {
    id: string; subtotal_mxn: string | number; iva_mxn: string | number;
    descuentos_manuales_mxn: string | number; total_mxn: string | number;
    monto_pagado_mxn: string | number; cambio_mxn: string | number; monto_pendiente_mxn: string | number;
    estado_fiscal: string; folio_completo: string | null;
  };
  return {
    ticketId: t.id,
    subtotal: Number(t.subtotal_mxn),
    iva: Number(t.iva_mxn),
    descuentos: Number(t.descuentos_manuales_mxn),
    total: Number(t.total_mxn),
    montoPagado: Number(t.monto_pagado_mxn),
    cambio: Number(t.cambio_mxn),
    pendiente: Number(t.monto_pendiente_mxn),
    estadoFiscal: t.estado_fiscal,
    folio: t.folio_completo,
  };
}

/** Aplica un pago contra el ticket. Devuelve los totales actualizados. */
export async function aplicarPago(
  token: string,
  ticketId: string,
  pago: PagoInput,
  pagoClientId: string,
): Promise<TotalesTicket> {
  const { error } = await employeeClient(token).rpc("aplicar_pago", {
    p_ticket_id: ticketId,
    p_metodo_pago: pago.metodo,
    p_monto_mxn: pago.monto,
    p_monto_recibido_mxn: pago.metodo === "EFECTIVO" ? (pago.montoRecibido ?? pago.monto) : null,
    p_referencia: pago.referencia ?? null,
    p_client_id_local: pagoClientId,
  });
  if (error) throw new Error(error.message);
  return leerTotales(token, ticketId);
}
