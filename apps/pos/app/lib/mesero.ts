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
    // Los cargos (envío) no van a cocina. Sin esto, cambiar la zona de un pedido ya mandado
    // dejaba un renglón "pendiente" que se enviaba solo e imprimía una comanda vacía.
    .is("cargo_tipo", null)
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

/**
 * ¿A este ticket ya se le mandó algo a cocina alguna vez?
 *
 * Decide si la comanda se rotula como AGREGADO. Rotular de más es tan malo como de menos: la
 * cocina lee "agregado" y da por hecho que el resto del pedido ya lo está preparando, cuando en
 * realidad esa era la primera comanda.
 */
export async function yaEnviadoACocina(token: string, ticketId: string): Promise<boolean> {
  const { data } = await employeeClient(token)
    .from("tickets").select("estado_cocina").eq("id", ticketId).maybeSingle();
  const estado = (data as { estado_cocina: string | null } | null)?.estado_cocina ?? null;
  return estado !== null && estado !== "SIN_ENVIAR";
}

/** Cuántos renglones del ticket siguen sin mandarse a cocina (habilita "Enviar a cocina"). */
export async function contarPendientesCocina(token: string, ticketId: string): Promise<number> {
  const { count, error } = await employeeClient(token)
    .from("ticket_items")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticketId)
    .eq("cancelado", false)
    .is("enviado_cocina_at", null)
    .is("cargo_tipo", null); // el envío no es cocina: no habilita "Enviar a cocina"
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export type MisPropinas = {
  totalMxn: number;
  ticketsConPropina: number;
  promedioMxn: number;
  totalVendidoMxn: number;
};

type TicketDelTurno = { total_mxn: number | string | null; propina_mxn: number | string | null };

/** Suma las cuentas cobradas de un empleado. Puro, en centavos para no arrastrar decimales. */
export function resumirPropinas(tickets: TicketDelTurno[]): MisPropinas {
  let propinas = 0, vendido = 0, conPropina = 0;
  for (const t of tickets) {
    const p = Math.round(Number(t.propina_mxn ?? 0) * 100);
    propinas += p;
    vendido += Math.round(Number(t.total_mxn ?? 0) * 100);
    if (p > 0) conPropina += 1;
  }
  return {
    totalMxn: propinas / 100,
    totalVendidoMxn: vendido / 100,
    ticketsConPropina: conPropina,
    promedioMxn: tickets.length > 0 ? Math.round(vendido / tickets.length) / 100 : 0,
  };
}

/**
 * Propinas que el empleado generó en ESTE turno. Solo lectura.
 *
 * Antes leía `vw_ventas_por_mesero` y tomaba el renglón más reciente, con dos consecuencias:
 *  - la vista solo cuenta tickets con `mesero_id`, que nada más se llena al abrir una cuenta de
 *    mesa. Las propinas de Para llevar, Pick-up y Domicilio no existían para esta pantalla: en un
 *    negocio de mostrador siempre decía $0.00;
 *  - sin ventas hoy, el renglón más reciente era el de otro día, bajo el rótulo "hoy".
 *
 * Ahora se leen las cuentas cobradas del turno abierto que son de este empleado: las que atendió
 * como mesero y, si la cuenta no tiene mesero, las que él abrió.
 */
export async function misPropinas(token: string, empleadoId: string, turnoId: string): Promise<MisPropinas> {
  const { data, error } = await employeeClient(token)
    .from("tickets")
    .select("total_mxn, propina_mxn")
    .eq("turno_id", turnoId)
    .in("estado_fiscal", ["PAGADO", "FACTURADO"])
    .is("deleted_at", null)
    .or(`mesero_id.eq.${empleadoId},and(mesero_id.is.null,usuario_apertura_id.eq.${empleadoId})`);
  if (error) throw new Error(error.message);
  return resumirPropinas((data ?? []) as TicketDelTurno[]);
}
