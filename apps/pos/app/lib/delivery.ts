"use client";
import { employeeClient } from "./supabase";

export type DeliveryEstado =
  | "ASIGNADO" | "EN_RUTA" | "EN_DESTINO" | "ENTREGADO"
  | "NO_ENTREGADO" | "EN_REGRESO" | "LIQUIDADO" | "CANCELADO";

export type DeliveryAsignacion = {
  id: string;
  ticketId: string;
  ticketFolio: string | null;
  repartidorId: string | null;
  repartidorNombre: string;
  estado: DeliveryEstado;
  montoALiquidar: number;
  propinaRepartidor: number;
  tiempoPromesa: number | null;
  fechaAsignacion: string;
};

/** Lee las asignaciones de delivery del turno (cola de domicilios). */
export async function leerDeliveries(token: string, sucursalId: string): Promise<DeliveryAsignacion[]> {
  const { data, error } = await employeeClient(token)
    .from("delivery_asignaciones")
    .select(
      "id, ticket_id, repartidor_id, estado, monto_a_liquidar_mxn, propina_repartidor_mxn, tiempo_promesa_minutos, fecha_asignacion, " +
        "ticket:tickets(folio_completo), repartidor:usuarios_perfil!repartidor_id(nombre)",
    )
    .eq("sucursal_id", sucursalId)
    .not("estado", "in", "(LIQUIDADO,CANCELADO)")
    .order("fecha_asignacion", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    ticketId: String(r.ticket_id),
    ticketFolio: ((r.ticket as { folio_completo?: string } | null)?.folio_completo) ?? null,
    repartidorId: (r.repartidor_id as string) ?? null,
    repartidorNombre: ((r.repartidor as { nombre?: string } | null)?.nombre) ?? "—",
    estado: (r.estado as DeliveryEstado) ?? "ASIGNADO",
    montoALiquidar: Number(r.monto_a_liquidar_mxn ?? 0),
    propinaRepartidor: Number(r.propina_repartidor_mxn ?? 0),
    tiempoPromesa: r.tiempo_promesa_minutos != null ? Number(r.tiempo_promesa_minutos) : null,
    fechaAsignacion: String(r.fecha_asignacion),
  }));
}

/** Repartidores activos del tenant (rol REPARTIDOR). */
export async function leerRepartidores(token: string): Promise<{ id: string; nombre: string }[]> {
  const { data, error } = await employeeClient(token)
    .from("usuarios_acceso")
    .select("usuario_id, perfil:usuarios_perfil!usuario_id(nombre), rol:roles(codigo)")
    .eq("activo", true);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .filter((r) => (r.rol as { codigo?: string } | null)?.codigo === "REPARTIDOR")
    .map((r) => ({
      id: String(r.usuario_id),
      nombre: ((r.perfil as { nombre?: string } | null)?.nombre) ?? "Repartidor",
    }));
}

export async function asignarDelivery(
  token: string,
  args: { ticketId: string; repartidorId: string; montoALiquidar: number; tiempoPromesa?: number | null },
): Promise<string> {
  const { data, error } = await employeeClient(token).rpc("asignar_delivery", {
    p_ticket_id: args.ticketId,
    p_repartidor_id: args.repartidorId,
    p_monto_a_liquidar_mxn: args.montoALiquidar,
    p_tiempo_promesa_minutos: args.tiempoPromesa ?? null,
    p_destino_lat: null,
    p_destino_lng: null,
    p_distancia_km_estimada: null,
    p_client_id_local: null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function confirmarSalida(token: string, asignacionId: string): Promise<void> {
  const { error } = await employeeClient(token).rpc("confirmar_salida_delivery", { p_asignacion_id: asignacionId });
  if (error) throw new Error(error.message);
}

export async function confirmarEntrega(token: string, asignacionId: string, propina = 0): Promise<void> {
  const { error } = await employeeClient(token).rpc("confirmar_entrega_delivery", {
    p_asignacion_id: asignacionId,
    p_propina_repartidor_mxn: propina,
  });
  if (error) throw new Error(error.message);
}

export async function liquidarDelivery(
  token: string,
  args: { asignacionId: string; efectivo: number; tarjeta: number; liquidadoPorId: string; nota?: string | null },
): Promise<void> {
  const { error } = await employeeClient(token).rpc("liquidar_delivery", {
    p_asignacion_id: args.asignacionId,
    p_monto_efectivo_mxn: args.efectivo,
    p_monto_tarjeta_mxn: args.tarjeta,
    p_liquidado_por_id: args.liquidadoPorId,
    p_liquidacion_nota: args.nota ?? null,
  });
  if (error) throw new Error(error.message);
}

const ESTADO_LABEL: Record<DeliveryEstado, string> = {
  ASIGNADO: "Asignado", EN_RUTA: "En ruta", EN_DESTINO: "En destino", ENTREGADO: "Entregado",
  NO_ENTREGADO: "No entregado", EN_REGRESO: "En regreso", LIQUIDADO: "Liquidado", CANCELADO: "Cancelado",
};
export function labelDeliveryEstado(e: DeliveryEstado): string {
  return ESTADO_LABEL[e] ?? e;
}

/** El siguiente paso del repartidor según el estado (para el botón de acción). */
export function siguienteAccionDelivery(e: DeliveryEstado): { destino: "salida" | "entrega" | "liquidar"; label: string } | null {
  if (e === "ASIGNADO") return { destino: "salida", label: "Marcar salida" };
  if (e === "EN_RUTA" || e === "EN_DESTINO") return { destino: "entrega", label: "Confirmar entrega" };
  if (e === "ENTREGADO") return { destino: "liquidar", label: "Liquidar" };
  return null;
}
