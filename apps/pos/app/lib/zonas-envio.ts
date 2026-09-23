"use client";
import { employeeClient } from "./supabase";

// Zonas de reparto de la sucursal. El cargo de la zona entra al ticket como un renglón
// (fijar_envio_ticket); aquí solo se administra el catálogo.

export type ZonaEnvio = { id: string; nombre: string; costoMxn: number };

function mapZona(r: Record<string, unknown>): ZonaEnvio {
  return { id: String(r.id), nombre: String(r.nombre), costoMxn: Number(r.costo_mxn) };
}

/**
 * La zona de una dirección guardada, tal como está HOY en el catálogo vigente.
 *
 * La dirección embebe su zona sin filtrar `activa` ni `deleted_at` (y con el precio de cuando se
 * leyó). Usarla tal cual mandaba a `fijar_envio_ticket` una zona desactivada, que truena al
 * persistir. Una zona que no esté en la lista vigente cuenta como "sin zona" (se vuelve a pedir),
 * y el precio sale siempre de la lista.
 */
export function zonaVigente(zona: ZonaEnvio | null, vigentes: ZonaEnvio[]): ZonaEnvio | null {
  if (!zona) return null;
  return vigentes.find((z) => z.id === zona.id) ?? null;
}

/** Zonas activas de la sucursal, en el orden en que se muestran los chips. */
export async function listarZonas(token: string, sucursalId: string): Promise<ZonaEnvio[]> {
  const { data, error } = await employeeClient(token)
    .from("zonas_envio")
    .select("id, nombre, costo_mxn")
    .eq("sucursal_id", sucursalId)
    .eq("activa", true)
    .is("deleted_at", null)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapZona);
}

/** Tope del costo de una zona: el mismo del panel (`zonaSchema` en apps/admin). */
export const COSTO_ZONA_MAX = 9999;

/** Valida el costo capturado en la caja (alta o repreciado). null = válido. */
export function validarCostoZona(costo: number): string | null {
  if (!Number.isFinite(costo)) return "Escribe un costo válido.";
  if (costo < 0) return "El costo no puede ser negativo.";
  if (costo > COSTO_ZONA_MAX) return "El costo no puede pasar de $9,999.";
  return null;
}

/** El choque del índice único llega como jerga de Postgres; aquí se dice lo que pasó (como el panel). */
export function traducirErrorZona(mensaje: string): string {
  if (mensaje.includes("zona_envio_nombre_uq")) return "Ya existe una zona con ese nombre en esta sucursal.";
  return mensaje;
}

/** Alta desde la caja: llega un pedido de una colonia que nadie había capturado. Sin PIN. */
export async function crearZona(
  token: string,
  args: { tenantId: string; sucursalId: string; nombre: string; costoMxn: number },
): Promise<ZonaEnvio> {
  const invalido = validarCostoZona(args.costoMxn);
  if (invalido) throw new Error(invalido);
  const { data, error } = await employeeClient(token)
    .from("zonas_envio")
    .insert({
      tenant_id: args.tenantId,
      sucursal_id: args.sucursalId,
      nombre: args.nombre.trim(),
      costo_mxn: args.costoMxn,
    })
    .select("id, nombre, costo_mxn")
    .single();
  if (error) throw new Error(traducirErrorZona(error.message));
  return mapZona(data as Record<string, unknown>);
}

/** Repreciar una zona existente. El PIN lo pide la pantalla ANTES de llamar aquí. */
export async function cambiarCostoZona(token: string, zonaId: string, costoMxn: number): Promise<void> {
  const invalido = validarCostoZona(costoMxn);
  if (invalido) throw new Error(invalido);
  const { error } = await employeeClient(token)
    .from("zonas_envio")
    .update({ costo_mxn: costoMxn })
    .eq("id", zonaId);
  if (error) throw new Error(error.message);
}

/** Fija (o quita, con `zonaId` null) el renglón de envío de un ticket ya persistido. */
export async function fijarEnvioTicket(token: string, ticketId: string, zonaId: string | null): Promise<void> {
  const { error } = await employeeClient(token).rpc("fijar_envio_ticket", {
    p_ticket_id: ticketId,
    p_zona_id: zonaId,
  });
  if (error) throw new Error(error.message);
}
