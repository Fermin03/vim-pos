"use client";
import { z } from "zod";
import { employeeClient } from "./supabase";

/**
 * Reservaciones vistas desde la caja.
 *
 * Es la misma tabla que administra el panel, pero el uso es otro y por eso la
 * pantalla es otra: el dueño planea la semana, el cajero resuelve la noche. Aquí
 * solo importa el día que se está trabajando y las cuatro cosas que se hacen con
 * una reserva delante del cliente — sentarla, crearla, corregirla o cancelarla.
 *
 * Todas las escrituras pasan por RPC bajo RLS, como el resto de la caja: los
 * RPCs son de la 0010 salvo `modificar_reservacion`, que se añadió en la 0088.
 */

export type ReservacionEstado = "CONFIRMADA" | "LLEGO" | "CANCELADA" | "NO_SHOW" | "TERMINADA";
export type CanalReservacion = "TELEFONO" | "WHATSAPP" | "WEB" | "PRESENCIAL" | "APP_INTERNA" | "OTRO";

export const CANALES: { v: CanalReservacion; l: string }[] = [
  { v: "TELEFONO", l: "Teléfono" },
  { v: "WHATSAPP", l: "WhatsApp" },
  { v: "PRESENCIAL", l: "Presencial" },
  { v: "WEB", l: "Web" },
  { v: "APP_INTERNA", l: "App" },
  { v: "OTRO", l: "Otro" },
];

export type Reservacion = {
  id: string;
  folio: string;
  clienteNombre: string;
  clienteTelefono: string;
  /** ISO completo. La hora se formatea en pantalla. */
  fechaHora: string;
  comensales: number;
  canal: CanalReservacion;
  estado: ReservacionEstado;
  nota: string;
  mesaAsignadaId: string | null;
  mesaNumero: number | null;
};

const S = (v: unknown): string => (v == null ? "" : String(v));

export function labelEstado(e: ReservacionEstado): string {
  return (
    { CONFIRMADA: "Confirmada", LLEGO: "Llegó", CANCELADA: "Cancelada", NO_SHOW: "No llegó", TERMINADA: "Terminada" }[e] ??
    e
  );
}

export function labelCanal(c: CanalReservacion): string {
  return CANALES.find((x) => x.v === c)?.l ?? c;
}

/** Hora del día en formato de caja: "8:30 PM". */
export function horaDe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** Día de hoy en formato YYYY-MM-DD, en hora LOCAL de la caja.
 *
 *  Con `toISOString()` el "hoy" se adelantaba un día a partir de las 18:00 en
 *  México, que es exactamente cuando empiezan a llegar las reservas de la cena. */
export function hoyLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Medianoche local del día pedido. `new Date("2026-08-26T00:00:00")` —sin Z— la
 *  interpreta el navegador en su propia zona, que en la caja es la del restaurante. */
function inicioDelDia(dia: string): Date {
  return new Date(`${dia}T00:00:00`);
}

/** Medianoche local del día siguiente. Se compara con `<` para no depender de
 *  cuántos decimales trae el segundo 59.999. */
function finDelDia(dia: string): Date {
  const d = inicioDelDia(dia);
  d.setDate(d.getDate() + 1);
  return d;
}

/** Reservaciones de un día en esta sucursal, de la más temprana a la más tarde. */
export async function leerReservacionesDelDia(
  token: string,
  sucursalId: string,
  dia: string,
): Promise<Reservacion[]> {
  const { data, error } = await employeeClient(token)
    .from("reservaciones")
    .select(
      "id, folio_completo, cliente_nombre_snapshot, cliente_telefono_snapshot, fecha_hora_reserva, " +
        "comensales, canal, estado, nota, mesa_asignada_id, mesa:mesas!reservaciones_mesa_asignada_id_fkey(numero)",
    )
    .eq("sucursal_id", sucursalId)
    // Instantes reales, no cadenas sueltas. `fecha_hora_reserva` es timestamptz y
    // PostgREST lee un "2026-08-26T23:59:59" sin zona como UTC: una reserva de las
    // 20:00 en México se guarda como las 02:00 del día SIGUIENTE en UTC, así que
    // quedaba fuera del rango y la lista de la noche salía vacía. Justo las horas
    // en que un restaurante tiene reservas.
    .gte("fecha_hora_reserva", inicioDelDia(dia).toISOString())
    .lt("fecha_hora_reserva", finDelDia(dia).toISOString())
    .is("deleted_at", null)
    .order("fecha_hora_reserva", { ascending: true });
  if (error) throw new Error(error.message);

  // `as unknown` primero: el join con alias confunde al tipado de supabase-js,
  // que infiere un tipo de error en vez de la fila. Es el mismo patrón que usan
  // los reportes del panel para los selects con relación.
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const mesa = r.mesa as { numero?: number } | null;
    return {
      id: String(r.id),
      folio: S(r.folio_completo) || String(r.id).slice(-6),
      clienteNombre: S(r.cliente_nombre_snapshot),
      clienteTelefono: S(r.cliente_telefono_snapshot),
      fechaHora: S(r.fecha_hora_reserva),
      comensales: Number(r.comensales ?? 0),
      canal: (r.canal as CanalReservacion) ?? "OTRO",
      estado: (r.estado as ReservacionEstado) ?? "CONFIRMADA",
      nota: S(r.nota),
      mesaAsignadaId: (r.mesa_asignada_id as string) ?? null,
      mesaNumero: mesa?.numero != null ? Number(mesa.numero) : null,
    };
  });
}

export const nuevaReservaSchema = z.object({
  clienteNombre: z.string().trim().min(1, "Escribe a nombre de quién").max(150),
  clienteTelefono: z.string().trim().max(20).optional().or(z.literal("")),
  /** `datetime-local`: "2026-08-26T20:30". */
  fechaHora: z.string().min(1, "Indica día y hora"),
  comensales: z.number().int().min(1, "Mínimo 1 persona").max(50, "Máximo 50"),
  canal: z.enum(["TELEFONO", "WHATSAPP", "WEB", "PRESENCIAL", "APP_INTERNA", "OTRO"]),
  nota: z.string().trim().max(300).optional().or(z.literal("")),
});
export type NuevaReservaInput = z.infer<typeof nuevaReservaSchema>;

export async function crearReservacion(
  token: string,
  sucursalId: string,
  input: NuevaReservaInput,
): Promise<void> {
  const d = nuevaReservaSchema.parse(input);
  const { error } = await employeeClient(token).rpc("crear_reservacion", {
    p_sucursal_id: sucursalId,
    p_cliente_nombre: d.clienteNombre,
    p_cliente_telefono: d.clienteTelefono || null,
    p_cliente_email: null,
    p_fecha_hora: new Date(d.fechaHora).toISOString(),
    p_comensales: d.comensales,
    p_canal: d.canal,
    p_nota: d.nota || null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Sienta a la reserva: marca que llegó y aparta la mesa.
 *
 * El trigger de la 0088 se encarga de que la mesa deje de verse libre en el
 * mapa. Al abrir la cuenta en esa mesa, el ticket la pasa a OCUPADA.
 */
export async function asignarMesa(token: string, reservacionId: string, mesaId: string): Promise<void> {
  const { error } = await employeeClient(token).rpc("confirmar_llegada_reservacion", {
    p_reservacion_id: reservacionId,
    p_mesa_asignada_id: mesaId,
    p_ticket_id: null,
  });
  if (error) throw new Error(error.message);
}

/** Corrige una reserva confirmada. Lo que va en `null` se deja como estaba. */
export async function modificarReservacion(
  token: string,
  reservacionId: string,
  cambios: { clienteNombre?: string; clienteTelefono?: string; fechaHora?: string; comensales?: number; nota?: string },
): Promise<void> {
  const { error } = await employeeClient(token).rpc("modificar_reservacion", {
    p_reservacion_id: reservacionId,
    p_cliente_nombre: cambios.clienteNombre ?? null,
    p_cliente_telefono: cambios.clienteTelefono ?? null,
    p_fecha_hora: cambios.fechaHora ? new Date(cambios.fechaHora).toISOString() : null,
    p_comensales: cambios.comensales ?? null,
    p_nota: cambios.nota ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function cancelarReservacion(token: string, reservacionId: string, motivo: string): Promise<void> {
  const { error } = await employeeClient(token).rpc("cancelar_reservacion", {
    p_reservacion_id: reservacionId,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message);
}

/**
 * Marca que no llegó.
 *
 * No estaba en la lista de acciones pedidas, pero sin esto una reserva que no
 * se presentó se queda «Confirmada» para siempre: ocupa la mesa en el mapa, y el
 * reporte de no-shows del panel nunca tiene un solo dato que enseñar. Es el
 * cierre natural de las otras cuatro.
 */
export async function marcarNoShow(token: string, reservacionId: string): Promise<void> {
  const { error } = await employeeClient(token).rpc("marcar_no_show_reservacion", {
    p_reservacion_id: reservacionId,
  });
  if (error) throw new Error(error.message);
}
