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
 * Envía la mesa a cocina ANTES de cobrar (requisito Full Service): pasa estado_cocina
 * SIN_ENVIAR → EN_COCINA, con lo que el ticket aparece en el KDS. Idempotente (solo afecta
 * tickets aún sin enviar).
 */
export async function enviarACocina(token: string, ticketId: string): Promise<void> {
  const { error } = await employeeClient(token)
    .from("tickets").update({ estado_cocina: "EN_COCINA" })
    .eq("id", ticketId).eq("estado_cocina", "SIN_ENVIAR");
  if (error) throw new Error(error.message);
}

/** Lee el estado de cocina actual de un ticket (para saber si ya se envió). */
export async function leerEstadoCocina(token: string, ticketId: string): Promise<string | null> {
  const { data } = await employeeClient(token).from("tickets").select("estado_cocina").eq("id", ticketId).maybeSingle();
  return (data as { estado_cocina: string } | null)?.estado_cocina ?? null;
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
