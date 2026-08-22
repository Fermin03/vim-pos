"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";

/**
 * Catálogo de repartidores del negocio.
 *
 * NO son usuarios del sistema: no entran al POS, no tienen PIN y no aparecen en la pantalla donde
 * se elige quién opera la caja. Se dan de alta aquí una vez y el cajero los elige de una lista al
 * marcar la salida de un domicilio, en vez de teclear el nombre en cada pedido.
 *
 * Sin política DELETE en la tabla: la baja es lógica (`deleted_at`), porque los pedidos ya
 * repartidos siguen apuntando a la fila.
 */

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

const S = (v: unknown) => (v == null ? "" : String(v));

export type Repartidor = {
  id: string;
  nombre: string;
  telefono: string;
  notas: string;
  activo: boolean;
};

export const repartidorSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre").max(100),
  telefono: z.string().trim().max(20).optional().or(z.literal("")),
  notas: z.string().trim().max(280).optional().or(z.literal("")),
});
export type RepartidorInput = z.infer<typeof repartidorSchema>;

function payload(d: RepartidorInput) {
  return {
    nombre: d.nombre.trim(),
    telefono: d.telefono?.trim() ? d.telefono.trim() : null,
    notas: d.notas?.trim() ? d.notas.trim() : null,
  };
}

export async function listarRepartidores(): Promise<Repartidor[]> {
  const { data, error } = await supabase
    .from("repartidores")
    .select("id, nombre, telefono, notas, activo")
    .is("deleted_at", null)
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    nombre: S(r.nombre),
    telefono: S(r.telefono),
    notas: S(r.notas),
    activo: r.activo !== false,
  }));
}

export async function crearRepartidor(d: RepartidorInput): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase.from("repartidores").insert({ tenant_id: tid, ...payload(d) });
  if (error) throw new Error(traducir(error.message));
}

export async function editarRepartidor(id: string, d: RepartidorInput): Promise<void> {
  const { error } = await supabase
    .from("repartidores")
    .update({ ...payload(d), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(traducir(error.message));
}

/**
 * Alta y baja del turno de reparto. Un repartidor inactivo deja de ofrecerse en el POS pero
 * conserva los pedidos que ya llevó.
 */
export async function setActivoRepartidor(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase
    .from("repartidores")
    .update({ activo, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Baja definitiva del catálogo (lógica: los pedidos históricos siguen apuntando aquí). */
export async function eliminarRepartidor(id: string): Promise<void> {
  const { error } = await supabase
    .from("repartidores")
    .update({ deleted_at: new Date().toISOString(), activo: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** El choque del índice único llega como jerga de Postgres; aquí se dice lo que pasó. */
function traducir(mensaje: string): string {
  if (mensaje.includes("repartidor_nombre_uq")) return "Ya hay un repartidor con ese nombre.";
  return mensaje;
}
