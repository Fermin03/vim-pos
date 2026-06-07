"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";

// T2 — Reservaciones. RPCs de 0010: crear_reservacion / confirmar_llegada_reservacion /
// marcar_no_show_reservacion / cancelar_reservacion. Estados: CONFIRMADA, LLEGO, CANCELADA,
// NO_SHOW, TERMINADA. La sucursal sale de la sesión (primera del tenant) salvo que se pase.

export type ReservacionEstado = "CONFIRMADA" | "LLEGO" | "CANCELADA" | "NO_SHOW" | "TERMINADA";
export type CanalReservacion = "TELEFONO" | "WHATSAPP" | "WEB" | "PRESENCIAL" | "APP_INTERNA" | "OTRO";

export const CANALES: { v: CanalReservacion; l: string }[] = [
  { v: "TELEFONO", l: "Teléfono" }, { v: "WHATSAPP", l: "WhatsApp" }, { v: "WEB", l: "Web" },
  { v: "PRESENCIAL", l: "Presencial" }, { v: "APP_INTERNA", l: "App" }, { v: "OTRO", l: "Otro" },
];

export type Reservacion = {
  id: string;
  folio: string;
  clienteNombre: string;
  clienteTelefono: string;
  fechaHora: string;
  comensales: number;
  canal: CanalReservacion;
  estado: ReservacionEstado;
  nota: string;
};

const S = (v: unknown) => (v == null ? "" : String(v));

async function sucursalPorDefecto(): Promise<string> {
  const { data, error } = await supabase.from("sucursales").select("id").is("deleted_at", null).order("created_at").limit(1).maybeSingle();
  if (error || !data) throw new Error("No hay sucursal configurada");
  return String(data.id);
}

/** Reservaciones de un día (YYYY-MM-DD), de todas las sucursales del tenant. */
export async function listarReservaciones(dia: string): Promise<Reservacion[]> {
  const desde = `${dia}T00:00:00`;
  const hasta = `${dia}T23:59:59`;
  const { data, error } = await supabase
    .from("reservaciones")
    .select("id, folio_completo, cliente_nombre_snapshot, cliente_telefono_snapshot, fecha_hora_reserva, comensales, canal, estado, nota")
    .gte("fecha_hora_reserva", desde)
    .lte("fecha_hora_reserva", hasta)
    .is("deleted_at", null)
    .order("fecha_hora_reserva", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    folio: S(r.folio_completo) || String(r.id).slice(-6),
    clienteNombre: S(r.cliente_nombre_snapshot),
    clienteTelefono: S(r.cliente_telefono_snapshot),
    fechaHora: S(r.fecha_hora_reserva),
    comensales: Number(r.comensales ?? 0),
    canal: (r.canal as CanalReservacion) ?? "OTRO",
    estado: (r.estado as ReservacionEstado) ?? "CONFIRMADA",
    nota: S(r.nota),
  }));
}

export const reservacionSchema = z.object({
  cliente_nombre: z.string().trim().min(1, "Obligatorio").max(150),
  cliente_telefono: z.string().trim().max(20).optional().or(z.literal("")),
  fecha_hora: z.string().min(1, "Indica fecha y hora"),
  comensales: z.number().int().min(1, "Mínimo 1").max(50),
  canal: z.enum(["TELEFONO", "WHATSAPP", "WEB", "PRESENCIAL", "APP_INTERNA", "OTRO"]),
  nota: z.string().trim().max(300).optional().or(z.literal("")),
});
export type ReservacionInput = z.infer<typeof reservacionSchema>;

export async function crearReservacion(input: ReservacionInput): Promise<void> {
  const d = reservacionSchema.parse(input);
  await leerSesion(); // asegura sesión
  const sucursalId = await sucursalPorDefecto();
  const { error } = await supabase.rpc("crear_reservacion", {
    p_sucursal_id: sucursalId,
    p_cliente_nombre: d.cliente_nombre,
    p_cliente_telefono: d.cliente_telefono || null,
    p_cliente_email: null,
    p_fecha_hora: new Date(d.fecha_hora).toISOString(),
    p_comensales: d.comensales,
    p_canal: d.canal,
    p_nota: d.nota || null,
  });
  if (error) throw new Error(error.message);
}

export async function confirmarLlegada(id: string): Promise<void> {
  const { error } = await supabase.rpc("confirmar_llegada_reservacion", { p_reservacion_id: id, p_mesa_asignada_id: null, p_ticket_id: null });
  if (error) throw new Error(error.message);
}
export async function marcarNoShow(id: string): Promise<void> {
  const { error } = await supabase.rpc("marcar_no_show_reservacion", { p_reservacion_id: id });
  if (error) throw new Error(error.message);
}
export async function cancelarReservacion(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("cancelar_reservacion", { p_reservacion_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);
}

export function labelEstadoReserva(e: ReservacionEstado): string {
  return { CONFIRMADA: "Confirmada", LLEGO: "Llegó", CANCELADA: "Cancelada", NO_SHOW: "No llegó", TERMINADA: "Terminada" }[e] ?? e;
}
export function labelCanal(c: CanalReservacion): string {
  return CANALES.find((x) => x.v === c)?.l ?? c;
}
