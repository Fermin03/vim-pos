"use client";

// Actualización desde el menú del POS (Opción B, sin firma). La UI no descarga ni instala nada:
// solo le pide al proceso de Electron que revise el feed. Él verifica el SHA-512, pregunta y
// reinicia. Por eso esto vive fuera de Supabase: es una llamada al servidor local que sirve el POS.

/** El POS corre dentro de la app de escritorio. Electron inyecta esta bandera al servir el HTML;
 *  en un navegador normal (o en `pnpm dev`) no existe y el botón no se muestra. */
export function esEscritorio(): boolean {
  if (typeof window === "undefined") return false;
  return (window as unknown as { __VIM_DESKTOP?: boolean }).__VIM_DESKTOP === true;
}

export type ResultadoActualizacion =
  | { estado: "al-dia"; version: string }
  | { estado: "hay"; version: string }
  | { estado: "descargando" }
  | { estado: "error"; error: string };

function texto(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/** Pide el chequeo. Si hay versión nueva, Electron abre su propio diálogo de instalación. */
export async function buscarActualizacion(): Promise<ResultadoActualizacion> {
  try {
    const r = await fetch("/__actualizar", { method: "POST" });
    const j: unknown = await r.json();
    const o = (typeof j === "object" && j !== null ? j : {}) as Record<string, unknown>;
    if (o.ok !== true) return { estado: "error", error: texto(o.error, "No se pudo revisar") };
    if (o.estado === "hay") return { estado: "hay", version: texto(o.version) };
    if (o.estado === "descargando") return { estado: "descargando" };
    return { estado: "al-dia", version: texto(o.version) };
  } catch {
    // Sin conexión, o el feed no responde: no es un error del cajero, no hay que alarmarlo.
    return { estado: "error", error: "No se pudo conectar para revisar actualizaciones." };
  }
}
