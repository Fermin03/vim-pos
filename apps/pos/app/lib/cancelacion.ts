"use client";
import { employeeClient } from "./supabase";

// ── F6.2: Cancelar ticket completo ────────────────────────────────────────

/** Motivos de cancelación de ticket completo (enum cancelacion_motivo en BD). */
export type MotivoTicket =
  | "ERROR_COBRO"
  | "CLIENTE_DESISTIO"
  | "PROBLEMA_OPERATIVO"
  | "COBRO_DUPLICADO"
  | "FRAUDE_DETECTADO"
  | "PRUEBA_OPERATIVA"
  | "OTRO";

export const MOTIVOS_TICKET: { codigo: MotivoTicket; label: string }[] = [
  { codigo: "CLIENTE_DESISTIO", label: "Cliente desistió" },
  { codigo: "ERROR_COBRO", label: "Error de cobro" },
  { codigo: "PROBLEMA_OPERATIVO", label: "Problema operativo" },
  { codigo: "COBRO_DUPLICADO", label: "Cobro duplicado" },
  { codigo: "FRAUDE_DETECTADO", label: "Fraude detectado" },
  { codigo: "PRUEBA_OPERATIVA", label: "Prueba operativa" },
  { codigo: "OTRO", label: "Otro" },
];

/** Cancela un ticket completo (ABIERTO o PAGADO). Si PAGADO+devolverDinero, crea devolución automática. */
export async function cancelarTicket(
  token: string,
  args: {
    ticketId: string;
    cajaId: string;
    turnoId: string;
    motivo: MotivoTicket;
    motivoTexto: string | null;
    autorizacionPinId: string;
    solicitanteId: string;
    autorizoId: string;
    devolverDinero?: boolean;
    reversarInventario?: boolean;
  },
): Promise<string> {
  const { data, error } = await employeeClient(token).rpc("cancelar_ticket_pagado", {
    p_ticket_id: args.ticketId,
    p_caja_id: args.cajaId,
    p_turno_id: args.turnoId,
    p_motivo: args.motivo,
    p_motivo_texto: args.motivoTexto,
    p_autorizacion_pin_id: args.autorizacionPinId,
    p_usuario_solicitante_id: args.solicitanteId,
    p_usuario_autorizo_id: args.autorizoId,
    p_reversar_inventario: args.reversarInventario ?? true,
    p_cancelar_cfdi_sat: false,
    p_devolver_dinero: args.devolverDinero ?? false,
    p_medio_devolucion: "EFECTIVO",
    p_nota: null,
    p_client_id_local: null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

// ── F6.1: Cancelar ítem (existente) ───────────────────────────────────────

export type MotivoCancelacion =
  | "ERROR_DEL_CAJERO"
  | "PRODUCTO_NO_DISPONIBLE"
  | "CLIENTE_CAMBIO_DE_OPINION"
  | "OTRO";

export const MOTIVOS_CANCELACION: { codigo: MotivoCancelacion; label: string }[] = [
  { codigo: "ERROR_DEL_CAJERO", label: "Error del cajero" },
  { codigo: "PRODUCTO_NO_DISPONIBLE", label: "Producto no disponible" },
  { codigo: "CLIENTE_CAMBIO_DE_OPINION", label: "Cliente cambió de opinión" },
  { codigo: "OTRO", label: "Otro" },
];

/** Cancela un ítem individual (RPC cancelar_item_ticket de 0008 §8.8). */
export async function cancelarItem(
  token: string,
  args: { ticketItemId: string; motivo: string; autorizacionPinId?: string | null },
): Promise<void> {
  const { error } = await employeeClient(token).rpc("cancelar_item_ticket", {
    p_ticket_item_id: args.ticketItemId,
    p_motivo: args.motivo,
    p_autorizacion_pin_id: args.autorizacionPinId ?? null,
  });
  if (error) throw new Error(error.message);
}

export type ItemTicket = {
  id: string;
  clientId: string;
  productoNombre: string;
  cantidad: number;
  totalItemMxn: number;
  estadoCocina: string | null;
};

/** Lee los items NO cancelados del ticket persistido (mapea client_id_local ↔ id). */
export async function leerItemsPersistidos(token: string, ticketId: string): Promise<ItemTicket[]> {
  const { data, error } = await employeeClient(token)
    .from("ticket_items")
    .select("id, client_id_local, producto_nombre_snapshot, cantidad, total_item_mxn, estado_cocina")
    .eq("ticket_id", ticketId)
    .eq("cancelado", false)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    id: string;
    client_id_local: string | null;
    producto_nombre_snapshot: string;
    cantidad: number;
    total_item_mxn: string | number;
    estado_cocina: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id_local ?? r.id,
    productoNombre: r.producto_nombre_snapshot,
    cantidad: Number(r.cantidad),
    totalItemMxn: Number(r.total_item_mxn),
    estadoCocina: r.estado_cocina,
  }));
}
