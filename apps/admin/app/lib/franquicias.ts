"use client";
import { supabase, leerSesion } from "./supabase";

// Fase 5 · franquicias: agrupan sucursales del tenant para el reporteo central.
// El scope del franquiciatario se da con usuarios_acceso por sucursal (D68).

export type Franquicia = { id: string; nombre: string; notas: string | null; activa: boolean; nSucursales: number };
export type SucursalFranquicia = { id: string; nombre: string; franquiciaId: string | null };

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

export async function listarFranquicias(): Promise<Franquicia[]> {
  const { data, error } = await supabase
    .from("franquicias")
    .select("id, nombre, notas, activa, sucursales(count)")
    .order("nombre");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as { id: string; nombre: string; notas: string | null; activa: boolean; sucursales: { count: number }[] | null }[])
    .map((f) => ({ id: f.id, nombre: f.nombre, notas: f.notas, activa: f.activa, nSucursales: f.sucursales?.[0]?.count ?? 0 }));
}

export async function crearFranquicia(nombre: string): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase.from("franquicias").insert({ tenant_id: tid, nombre: nombre.trim() });
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "Ya existe una franquicia con ese nombre." : error.message);
}

export async function eliminarFranquicia(id: string): Promise<void> {
  const { error } = await supabase.from("franquicias").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listarSucursalesConFranquicia(): Promise<SucursalFranquicia[]> {
  const { data, error } = await supabase
    .from("sucursales")
    .select("id, nombre, franquicia_id")
    .is("deleted_at", null)
    .order("nombre");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; nombre: string; franquicia_id: string | null }[])
    .map((s) => ({ id: s.id, nombre: s.nombre, franquiciaId: s.franquicia_id }));
}

/** Asigna (o quita con null) la franquicia de una sucursal. */
export async function asignarFranquicia(sucursalId: string, franquiciaId: string | null): Promise<void> {
  const { error } = await supabase.from("sucursales").update({ franquicia_id: franquiciaId }).eq("id", sucursalId);
  if (error) throw new Error(error.message);
}
