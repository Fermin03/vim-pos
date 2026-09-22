"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";

/**
 * Zonas de envío por sucursal (0116_zonas_envio): a qué colonias reparte cada sucursal y cuánto
 * cobra por cada una. Las crea el cajero desde la caja o el dueño aquí con calma.
 *
 * Nombre único por sucursal sin distinguir mayúsculas ni espacios (índice `zona_envio_nombre_uq`,
 * filtrado a filas vivas). La tabla SÍ tiene política DELETE (`zonas_envio_delete`, 0116), pero
 * aquí no se usa: tickets y direcciones de cliente apuntan a la zona, así que la baja es lógica
 * (`deleted_at`) para no romper esas referencias ni el historial.
 */

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

const S = (v: unknown) => (v == null ? "" : String(v));

export type Zona = {
  id: string;
  sucursalId: string;
  nombre: string;
  costoMxn: number;
  orden: number;
  activa: boolean;
};

export const zonaSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre de la zona").max(60),
  costoMxn: z.coerce.number().min(0, "El costo no puede ser negativo").max(9999),
  orden: z.coerce.number().int().min(0).default(0),
});
export type ZonaInput = z.infer<typeof zonaSchema>;

function payload(d: ZonaInput) {
  return {
    nombre: d.nombre.trim(),
    costo_mxn: d.costoMxn,
    orden: d.orden,
  };
}

export async function listarZonas(sucursalId: string): Promise<Zona[]> {
  const { data, error } = await supabase
    .from("zonas_envio")
    .select("id, sucursal_id, nombre, costo_mxn, orden, activa")
    .eq("sucursal_id", sucursalId)
    .is("deleted_at", null)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((z) => ({
    id: String(z.id),
    sucursalId: String(z.sucursal_id),
    nombre: S(z.nombre),
    costoMxn: Number(z.costo_mxn) || 0,
    orden: Number(z.orden) || 0,
    activa: z.activa !== false,
  }));
}

export async function crearZona(sucursalId: string, d: ZonaInput): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase
    .from("zonas_envio")
    .insert({ tenant_id: tid, sucursal_id: sucursalId, ...payload(d) });
  if (error) throw new Error(traducir(error.message));
}

export async function editarZona(id: string, d: ZonaInput): Promise<void> {
  const { error } = await supabase
    .from("zonas_envio")
    .update({ ...payload(d), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(traducir(error.message));
}

/** Alta y baja de la zona en el POS. Una zona inactiva deja de ofrecerse pero conserva su historial. */
export async function setActivaZona(id: string, activa: boolean): Promise<void> {
  const { error } = await supabase
    .from("zonas_envio")
    .update({ activa, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Baja lógica: tickets y direcciones de cliente siguen apuntando a la zona. */
export async function eliminarZona(id: string): Promise<void> {
  const { error } = await supabase
    .from("zonas_envio")
    .update({ deleted_at: new Date().toISOString(), activa: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** El choque del índice único llega como jerga de Postgres; aquí se dice lo que pasó. */
function traducir(mensaje: string): string {
  if (mensaje.includes("zona_envio_nombre_uq")) {
    return "Ya existe una zona con ese nombre en esta sucursal.";
  }
  return mensaje;
}
