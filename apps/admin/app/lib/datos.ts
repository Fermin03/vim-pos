"use client";
import { leerSesion, supabase } from "./supabase";

// Lo que repiten los módulos de datos del panel. Vive aparte de `supabase.ts` para que las pruebas
// que simulan ese módulo sigan valiendo sin tocarlas.

/** El tenant de la sesión. Lo piden los módulos de datos del panel antes de leer o escribir. */
export async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

/** Baja lógica: marca `deleted_at` (y lo que traiga `extra`, p. ej. `{ activa: false }`). El POS y
 *  las listas filtran `deleted_at IS NULL`. */
export async function borrarSuave(tabla: string, id: string, extra: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabase.from(tabla).update({ deleted_at: new Date().toISOString(), ...extra }).eq("id", id);
  if (error) throw new Error(error.message);
}
