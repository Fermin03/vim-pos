"use client";
import { employeeClient } from "./supabase";

/**
 * Estaciones de preparación de la sucursal ("Cocina", "Barra").
 *
 * Se dan de alta en el panel y bajan a la caja con la sincronización. Aquí solo se leen: qué
 * impresora física les toca es decisión de CADA caja y vive en su configuración local
 * (`vim_impresora`), no en la nube — ver `estacionParaArea` en print/config.
 */
export type AreaCocina = { id: string; nombre: string };

export async function listarAreasCocina(token: string, sucursalId: string): Promise<AreaCocina[]> {
  const { data, error } = await employeeClient(token)
    .from("areas_cocina")
    .select("id, nombre")
    .eq("sucursal_id", sucursalId)
    .eq("activa", true)
    .is("deleted_at", null)
    .order("nombre");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((a) => ({ id: String(a.id), nombre: String(a.nombre) }));
}
