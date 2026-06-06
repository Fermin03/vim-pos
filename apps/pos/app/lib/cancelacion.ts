"use client";
import { employeeClient } from "./supabase";

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
