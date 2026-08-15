"use client";
import { employeeClient } from "./supabase";

// B1 Full Service · pieza de mesero: enviar a cocina pre-pago, atribución del mesero
// al ticket, y "mis propinas" del turno. Updates directos permitidos por RLS (verificado).

/** Atribuye el ticket al mesero (para reportes y "mis propinas"). Idempotente. */
export async function atribuirMesero(token: string, ticketId: string, meseroId: string): Promise<void> {
  const { error } = await employeeClient(token).from("tickets").update({ mesero_id: meseroId }).eq("id", ticketId);
  if (error) throw new Error(error.message);
}

/**
 * Envía a cocina los renglones PENDIENTES del ticket y devuelve sus ids.
 *
 * Se marca renglón por renglón (`enviado_cocina_at`) y no solo el ticket: si el cliente pide
 * algo más después del primer envío —lo normal en comedor y por teléfono— hay que poder
 * mandar lo nuevo sin repetirle a la cocina lo que ya está preparando. Quien llama usa los
 * ids devueltos para imprimir una comanda con exactamente eso.
 *
 * Devuelve [] si no había nada pendiente; en ese caso no hay nada que imprimir.
 */
export async function enviarACocina(token: string, ticketId: string): Promise<string[]> {
  const sb = employeeClient(token);
  const { data, error } = await sb
    .from("ticket_items")
    .update({ enviado_cocina_at: new Date().toISOString() })
    .eq("ticket_id", ticketId)
    .eq("cancelado", false)
    .is("enviado_cocina_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);

  // El estado del TICKET es lo que mira el KDS. Se deja igual que antes: solo la primera vez.
  const { error: e2 } = await sb
    .from("tickets").update({ estado_cocina: "EN_COCINA" })
    .eq("id", ticketId).eq("estado_cocina", "SIN_ENVIAR");
  if (e2) throw new Error(e2.message);
  return ids;
}

/** Cuántos renglones del ticket siguen sin mandarse a cocina (habilita "Enviar a cocina"). */
export async function contarPendientesCocina(token: string, ticketId: string): Promise<number> {
  const { count, error } = await employeeClient(token)
    .from("ticket_items")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticketId)
    .eq("cancelado", false)
    .is("enviado_cocina_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export type MisPropinas = {
  totalMxn: number;
  ticketsConPropina: number;
  promedioMxn: number;
  totalVendidoMxn: number;
};

/** Propinas que el mesero generó hoy (vw_ventas_por_mesero, día contable actual). Solo lectura. */
export async function misPropinas(token: string, meseroId: string): Promise<MisPropinas> {
  const { data, error } = await employeeClient(token)
    .from("vw_ventas_por_mesero")
    .select("tickets_atendidos, total_vendido_mxn, propinas_capturadas_mxn, ticket_promedio_mxn")
    .eq("mesero_id", meseroId)
    .order("dia_contable", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { total_vendido_mxn?: number; propinas_capturadas_mxn?: number; ticket_promedio_mxn?: number };
  const total = Number(r.propinas_capturadas_mxn ?? 0);
  const vendido = Number(r.total_vendido_mxn ?? 0);
  return {
    totalMxn: total,
    totalVendidoMxn: vendido,
    ticketsConPropina: total > 0 ? 1 : 0, // la vista agrega por día; conteo fino se hace en cierre
    promedioMxn: Number(r.ticket_promedio_mxn ?? 0),
  };
}
