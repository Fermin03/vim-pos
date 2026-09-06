"use client";
import { supabase } from "./supabase";

export type NivelAcceso = "ok" | "gracia" | "bloqueado";
export type Acceso = { nivel: NivelAcceso; mensaje: string; desde: string | null };

export const ACCESO_OK: Acceso = { nivel: "ok", mensaje: "", desde: null };

const POR_DEFECTO = "Tu servicio de VIM POS está suspendido. Ponte en contacto con VIM.";

/**
 * Las mismas directivas que obedece la caja, para el dueño (ADR 0014).
 *
 * Bloqueado NO cierra el admin: lo deja en solo lectura. El dueño necesita sus reportes y sus
 * datos fiscales precisamente para pagar y para cerrar su contabilidad; cerrarle la puerta le
 * impediría resolver justo lo que le estamos pidiendo que resuelva.
 *
 * Cualquier fallo devuelve "ok": un problema de red nuestro no puede dejar a un negocio al
 * corriente sin su panel.
 */
export async function leerAcceso(): Promise<Acceso> {
  try {
    const { data, error } = await supabase.rpc("mi_acceso");
    if (error || !data) return ACCESO_OK;
    const a = (data as {
      acceso?: { estado?: string | null; bloqueado?: boolean; bloquea_desde?: string | null; mensaje?: string | null };
    }).acceso;
    if (!a) return ACCESO_OK;
    const mensaje = a.mensaje?.trim() || POR_DEFECTO;
    if (a.bloqueado === true) return { nivel: "bloqueado", mensaje, desde: a.bloquea_desde ?? null };
    if (a.estado === "SUSPENDIDO" || a.estado === "CANCELADO") {
      return { nivel: "gracia", mensaje, desde: a.bloquea_desde ?? null };
    }
    return ACCESO_OK;
  } catch {
    return ACCESO_OK;
  }
}
