"use client";
import { SOPORTE_POR_DEFECTO, soporteConRespaldo, type Soporte } from "@vim/db/soporte";
import { leerSesion, supabase } from "./supabase";

export type AyudaAdmin = { soporte: Soporte; negocio: string | null; codigo: string | null };

/**
 * Lo que necesita "Ayuda por WhatsApp" (0142): el soporte vigente (RPC `soporte_plataforma()`,
 * que lee cualquier sesión del negocio) y el nombre y código del negocio para el mensaje.
 * NUNCA lanza: sin red o sin RPC, sale el número oficial de fábrica y el mensaje sin negocio.
 */
export async function leerAyuda(): Promise<AyudaAdmin> {
  try {
    const s = await leerSesion();
    const [sop, t] = await Promise.all([
      supabase.rpc("soporte_plataforma"),
      s?.tenantId
        ? supabase.from("tenants").select("nombre_comercial, codigo").eq("id", s.tenantId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const fila = Array.isArray(sop.data) ? sop.data[0] : null;
    const td = (t.data ?? null) as { nombre_comercial?: string; codigo?: string } | null;
    return { soporte: soporteConRespaldo(fila), negocio: td?.nombre_comercial ?? null, codigo: td?.codigo ?? null };
  } catch {
    return { soporte: SOPORTE_POR_DEFECTO, negocio: null, codigo: null };
  }
}
