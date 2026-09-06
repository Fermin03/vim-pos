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

export type NivelAviso = "info" | "warning" | "danger";
export type Aviso = {
  id: string;
  nivel: NivelAviso;
  titulo: string;
  cuerpo: string;
  requiere_confirmacion: boolean;
  vigente_hasta: string | null;
};

const NIVELES_AVISO: NivelAviso[] = ["info", "warning", "danger"];

/**
 * Los avisos que hay que enseñarle al cajero. FUNCIÓN PURA.
 *
 * Descarta lo que no tenga forma de aviso en vez de confiar en la nube: un JSON raro no puede
 * tumbar la pantalla desde la que se cobra. El orden se respeta tal cual viene — la nube ya los
 * ordenó por urgencia (danger primero) y aquí no se re-decide.
 */
export function avisosDe(d: Directivas | null): Aviso[] {
  const xs = Array.isArray(d?.avisos) ? d.avisos : [];
  return xs.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.titulo !== "string" || typeof o.cuerpo !== "string") return [];
    const nivel = NIVELES_AVISO.includes(o.nivel as NivelAviso) ? (o.nivel as NivelAviso) : "info";
    return [{
      id: o.id,
      nivel,
      titulo: o.titulo,
      cuerpo: o.cuerpo,
      requiere_confirmacion: o.requiere_confirmacion === true,
      vigente_hasta: typeof o.vigente_hasta === "string" ? o.vigente_hasta : null,
    }];
  });
}

/**
 * Acusa la lectura de un aviso.
 *
 * En la caja lo anota el escritorio y viaja en el siguiente latido; en el POS web va directo por
 * RPC. NUNCA lanza: un acuse perdido hace que el aviso vuelva a salir, que es molesto; dejar al
 * cajero con el diálogo atrapado sería peor.
 */
export async function marcarAvisoVisto(id: string): Promise<void> {
  try {
    const r = await fetch("/__aviso-visto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (r.ok) return;
  } catch {
    // POS web: esa ruta no existe. Se acusa contra la nube.
  }
  try {
    await deviceClient.rpc("marcar_aviso_visto", { p_aviso: id });
  } catch {
    // Se reintentará la próxima vez que el aviso aparezca.
  }
}

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
