"use client";

// Alta de la caja contra la nube de VIM. Las credenciales del dispositivo se generan en el Admin
// (nube), pero el POS de escritorio valida el login contra su Postgres LOCAL: hasta que no se baja
// la rebanada del tenant, ese dispositivo no existe localmente y la vinculación falla.
//
// Este módulo le pide al proceso de Electron que haga ese puente: valida contra la nube y, si son
// buenas, baja catálogo + empleados + org + el propio dispositivo. Después el login local funciona.
// Solo existe dentro de la app de escritorio (el endpoint lo sirve su ui-server).

export type ResultadoAlta =
  | { ok: true; tablas: number }
  | { ok: false; motivo: "CREDENCIALES" | "RED" | "SIN_CONFIG" | "SIN_BACKEND" | "PULL" | "FALTAN_DATOS" | "NO_DISPONIBLE"; error: string };

/** ¿Corre dentro de la app de escritorio? (Electron inyecta la bandera al servir el HTML). */
export function esEscritorio(): boolean {
  if (typeof window === "undefined") return false;
  return (window as unknown as { __VIM_DESKTOP?: boolean }).__VIM_DESKTOP === true;
}

function texto(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() !== "" ? v : fallback;
}

/** Valida las credenciales del dispositivo contra la nube y baja los datos del negocio al local. */
export async function darDeAltaDesdeNube(email: string, password: string): Promise<ResultadoAlta> {
  try {
    const res = await fetch("/__vincular-nube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const j: unknown = await res.json().catch(() => ({}));
    const o = (typeof j === "object" && j !== null ? j : {}) as Record<string, unknown>;
    if (o.ok === true) return { ok: true, tablas: Number(o.tablas ?? 0) };
    const motivo = texto(o.motivo, "NO_DISPONIBLE") as Exclude<ResultadoAlta, { ok: true }>["motivo"];
    return { ok: false, motivo, error: texto(o.error, "No se pudo dar de alta la caja.") };
  } catch {
    // No hay endpoint (navegador normal) o el servidor local no respondió.
    return { ok: false, motivo: "NO_DISPONIBLE", error: "El alta por nube no está disponible en este dispositivo." };
  }
}
