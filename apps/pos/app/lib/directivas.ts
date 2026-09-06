"use client";
import { deviceClient } from "./supabase";

/**
 * Lo que la nube dice que este negocio puede hacer (ADR 0014).
 *
 * En la caja instalada lo sirve el escritorio en `/__directivas`, alimentado por el latido cada
 * 10 minutos. En el POS web no hay escritorio, así que se pregunta directo con `mi_acceso()`.
 */
export type Directivas = {
  servidor_hora: string | null;
  acceso: { estado: string | null; bloqueado: boolean; bloquea_desde: string | null; mensaje: string | null };
  modulos: Record<string, boolean>;
  limites: Record<string, unknown>;
  avisos: unknown[];
  version: Record<string, unknown>;
};

export type NivelAcceso = "ok" | "gracia" | "bloqueado";

const MENSAJE_POR_DEFECTO =
  "Tu servicio de VIM POS está suspendido. Ponte en contacto con VIM para reactivarlo.";

/**
 * Qué debe hacer el POS. FUNCIÓN PURA.
 *
 * REGLA DURA (spec §3): solo bloquea una directiva que diga `bloqueado: true`. Si la fecha de
 * bloqueo ya pasó pero el servidor todavía no lo dice —una caja sin internet con una directiva
 * vieja—, la caja SIGUE VENDIENDO. Perder ventas por un corte de red es peor que cobrarle un día
 * de más a alguien que dejó de pagar, y el que decide es siempre la nube.
 */
export function evaluarAcceso(
  d: Directivas | null,
  ahora: Date = new Date(),
): { nivel: NivelAcceso; mensaje: string; desde: string | null } {
  const a = d?.acceso;
  if (!a) return { nivel: "ok", mensaje: "", desde: null };
  const mensaje = a.mensaje?.trim() || MENSAJE_POR_DEFECTO;

  if (a.bloqueado === true) return { nivel: "bloqueado", mensaje, desde: a.bloquea_desde };

  // La gracia solo aplica a quien de verdad está de baja: un TRIAL o un tenant INTERNO nunca
  // debe ver la banda (§6.2).
  if (a.estado === "SUSPENDIDO" || a.estado === "CANCELADO") {
    return { nivel: "gracia", mensaje, desde: a.bloquea_desde };
  }

  void ahora;
  return { nivel: "ok", mensaje: "", desde: null };
}

/** `/__directivas` si hay escritorio; si no, `mi_acceso()`. `null` = no se pudo saber. */
export async function leerDirectivas(): Promise<Directivas | null> {
  try {
    const r = await fetch("/__directivas", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { disponible?: boolean; directivas?: Directivas };
      if (j.disponible && j.directivas) return j.directivas;
    }
  } catch {
    // En el POS web esa ruta no existe: no es un error, se pregunta a la nube.
  }
  try {
    const { data, error } = await deviceClient.rpc("mi_acceso");
    if (error || !data) return null;
    return data as unknown as Directivas;
  } catch {
    return null;
  }
}
