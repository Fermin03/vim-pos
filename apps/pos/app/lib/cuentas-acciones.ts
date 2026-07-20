"use client";
import { employeeClient } from "./supabase";

// Acciones sobre una cuenta ya PAGADA desde la Consulta de cuentas (turno abierto):
//  • cambiar la forma de pago (el cajero marcó mal el método)
//  • reabrir la cuenta (volverla a ABIERTO para editar/re-cobrar)
// Ambas van por RPC (0058), reversan el efectivo del corte solas (el arqueo lee de `pagos`) y
// requieren autorización venta.editar_post_cobro (resuelta antes con autorizacionPropia / PIN).

/** Formas de pago que se ofrecen para "cambiar" (subconjunto liquidable de metodo_pago). */
export const METODOS_PAGO: { codigo: string; label: string }[] = [
  { codigo: "EFECTIVO", label: "Efectivo" },
  { codigo: "TARJETA_DEBITO", label: "Tarjeta de débito" },
  { codigo: "TARJETA_CREDITO", label: "Tarjeta de crédito" },
  { codigo: "TRANSFERENCIA", label: "Transferencia" },
  { codigo: "VALES_DESPENSA", label: "Vales de despensa" },
];

export function labelMetodoPago(codigo: string): string {
  return METODOS_PAGO.find((m) => m.codigo === codigo)?.label ?? codigo;
}

export async function cambiarFormaPago(
  token: string,
  args: {
    ticketId: string;
    nuevoMetodo: string;
    montoRecibidoMxn: number | null;
    autorizacionPinId: string;
    solicitanteId: string;
    autorizoId: string;
  },
): Promise<void> {
  const { error } = await employeeClient(token).rpc("cambiar_forma_pago_ticket", {
    p_ticket_id: args.ticketId,
    p_nuevo_metodo: args.nuevoMetodo,
    p_monto_recibido_mxn: args.montoRecibidoMxn,
    p_autorizacion_pin_id: args.autorizacionPinId,
    p_usuario_solicitante_id: args.solicitanteId,
    p_usuario_autorizo_id: args.autorizoId,
    p_nota: null,
  });
  if (error) throw new Error(error.message);
}

export async function reabrirCuenta(
  token: string,
  args: {
    ticketId: string;
    motivo: string;
    autorizacionPinId: string;
    solicitanteId: string;
    autorizoId: string;
  },
): Promise<void> {
  const { error } = await employeeClient(token).rpc("reabrir_ticket_pagado", {
    p_ticket_id: args.ticketId,
    p_motivo: args.motivo,
    p_autorizacion_pin_id: args.autorizacionPinId,
    p_usuario_solicitante_id: args.solicitanteId,
    p_usuario_autorizo_id: args.autorizoId,
  });
  if (error) throw new Error(error.message);
}
