"use client";
import { employeeClient } from "./supabase";

export type MesaEstado = "LIBRE" | "OCUPADA" | "RESERVADA" | "EN_LIMPIEZA" | "FUERA_DE_SERVICIO";

export type MesaVista = {
  mesaId: string;
  numero: number;
  capacidad: number;
  seccion: string | null;
  estado: MesaEstado;
  /** Ticket activo en la mesa (si OCUPADA). */
  ticketActivoId: string | null;
  ticketFolio: string | null;
  ticketTotal: number;
  minutosOcupada: number;
  posX: number | null;
  posY: number | null;
  forma: string | null;
  /** B4 Café/Bar — minutos desde el último ítem agregado (alerta "sin movimiento"). */
  minutosSinMovimiento: number;
};

/** B4 — umbrales de alerta de cuentas prolongadas (Flujos C&B §5). Informativas, no bloquean. */
export const ALERTA_OCUPADA_MIN = 120; // >2 h ocupada → avisar al mesero
export const ALERTA_OCUPADA_FUERTE_MIN = 240; // >4 h → avisar al supervisor
export const ALERTA_SIN_MOVIMIENTO_MIN = 60; // >1 h sin pedidos nuevos

export type AlertaMesa = "OCUPADA_4H" | "OCUPADA_2H" | "SIN_MOVIMIENTO" | null;

/** Alerta aplicable a una mesa OCUPADA (precedencia: 4h > 2h > sin movimiento). */
export function alertaDeMesa(m: Pick<MesaVista, "estado" | "minutosOcupada" | "minutosSinMovimiento">): AlertaMesa {
  if (m.estado !== "OCUPADA") return null;
  if (m.minutosOcupada >= ALERTA_OCUPADA_FUERTE_MIN) return "OCUPADA_4H";
  if (m.minutosOcupada >= ALERTA_OCUPADA_MIN) return "OCUPADA_2H";
  if (m.minutosSinMovimiento >= ALERTA_SIN_MOVIMIENTO_MIN) return "SIN_MOVIMIENTO";
  return null;
}

/** Lee el estado actual de todas las mesas de la sucursal (vw_mesas_estado_actual). */
export async function leerMesas(token: string, sucursalId: string): Promise<MesaVista[]> {
  const { data, error } = await employeeClient(token)
    .from("vw_mesas_estado_actual")
    .select(
      "mesa_id, mesa_numero, capacidad, seccion_nombre, mesa_estado, ticket_activo_id, ticket_folio, ticket_total_mxn, minutos_ocupada, minutos_sin_movimiento, posicion_x, posicion_y, forma",
    )
    .eq("sucursal_id", sucursalId)
    .order("mesa_numero", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    mesaId: String(r.mesa_id),
    numero: Number(r.mesa_numero),
    capacidad: Number(r.capacidad),
    seccion: (r.seccion_nombre as string) ?? null,
    estado: (r.mesa_estado as MesaEstado) ?? "LIBRE",
    ticketActivoId: (r.ticket_activo_id as string) ?? null,
    ticketFolio: (r.ticket_folio as string) ?? null,
    ticketTotal: Number(r.ticket_total_mxn ?? 0),
    minutosOcupada: Number(r.minutos_ocupada ?? 0),
    minutosSinMovimiento: Number(r.minutos_sin_movimiento ?? 0),
    posX: r.posicion_x != null ? Number(r.posicion_x) : null,
    posY: r.posicion_y != null ? Number(r.posicion_y) : null,
    forma: (r.forma as string) ?? null,
  }));
}

/** Asigna una mesa a un ticket (mesa → OCUPADA vía trigger). RPC asignar_mesa_a_ticket. */
export async function asignarMesa(token: string, ticketId: string, mesaId: string): Promise<void> {
  const { error } = await employeeClient(token).rpc("asignar_mesa_a_ticket", {
    p_ticket_id: ticketId,
    p_mesa_id: mesaId,
    p_es_principal: true,
    p_client_id_local: null,
  });
  if (error) throw new Error(error.message);
}

/** Transfiere el ticket de su mesa actual a otra (la anterior se libera). */
export async function transferirMesa(
  token: string,
  ticketId: string,
  mesaNuevaId: string,
  motivo: string,
  autorizacionPinId?: string | null,
): Promise<void> {
  const { error } = await employeeClient(token).rpc("transferir_mesa", {
    p_ticket_id: ticketId,
    p_mesa_nueva_id: mesaNuevaId,
    p_motivo: motivo,
    p_autorizacion_pin_id: autorizacionPinId ?? null,
  });
  if (error) throw new Error(error.message);
}

const ESTADO_LABEL: Record<MesaEstado, string> = {
  LIBRE: "Libre",
  OCUPADA: "Ocupada",
  RESERVADA: "Reservada",
  EN_LIMPIEZA: "En limpieza",
  FUERA_DE_SERVICIO: "Fuera de servicio",
};

export function labelEstadoMesa(e: MesaEstado): string {
  return ESTADO_LABEL[e] ?? e;
}
