"use client";
import { employeeClient } from "./supabase";

// D45 §12 — Pedidos en espera. Los RPCs poner_ticket_en_espera / retomar_ticket
// existen desde 0008; esta lib los expone al POS. El ticket queda persistido
// (ABIERTO con folio) con en_espera=true y se retoma desde la lista por caja.

export type TicketEnEspera = {
  ticketId: string;
  etiqueta: string;
  folio: string | null;
  total: number;
  nItems: number;
  desdeIso: string | null;
};

/** Tickets en espera de ESTA caja (los retoma el mismo punto de venta). */
export async function listarTicketsEnEspera(token: string, cajaId: string): Promise<TicketEnEspera[]> {
  const { data, error } = await employeeClient(token)
    .from("tickets")
    .select("id, etiqueta_espera, folio_completo, total_mxn, fecha_puesto_en_espera, ticket_items(cantidad, cancelado)")
    .eq("caja_id", cajaId)
    .eq("en_espera", true)
    .in("estado_fiscal", ["BORRADOR", "ABIERTO"])
    .order("fecha_puesto_en_espera", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((t) => ({
    ticketId: String(t.id),
    etiqueta: String(t.etiqueta_espera ?? "Sin etiqueta"),
    folio: (t.folio_completo as string) ?? null,
    total: Number(t.total_mxn ?? 0),
    nItems: (((t.ticket_items as { cantidad: number; cancelado: boolean }[]) ?? []))
      .filter((i) => !i.cancelado)
      .reduce((a, i) => a + Number(i.cantidad), 0),
    desdeIso: (t.fecha_puesto_en_espera as string) ?? null,
  }));
}

/** Marca un ticket persistido como en espera (la etiqueta es obligatoria en BD). */
export async function ponerTicketEnEspera(token: string, ticketId: string, etiqueta: string): Promise<void> {
  const { error } = await employeeClient(token).rpc("poner_ticket_en_espera", {
    p_ticket_id: ticketId,
    p_etiqueta: etiqueta.trim() || "Sin etiqueta",
  });
  if (error) throw new Error(error.message);
}

/** Quita el flag de espera; el caller recarga el ticket al carrito (entrarCuenta). */
export async function retomarTicketEnEspera(token: string, ticketId: string): Promise<void> {
  const { error } = await employeeClient(token).rpc("retomar_ticket", { p_ticket_id: ticketId });
  if (error) throw new Error(error.message);
}

/** Minutos transcurridos desde que se puso en espera (para la lista). Puro, testeable. */
export function minutosEnEspera(desdeIso: string | null, ahora: Date = new Date()): number {
  if (!desdeIso) return 0;
  const d = new Date(desdeIso).getTime();
  if (Number.isNaN(d)) return 0;
  return Math.max(0, Math.floor((ahora.getTime() - d) / 60000));
}
