"use client";

/**
 * Estado de sincronización de la caja, servido por el escritorio en `/__estado-sync`.
 *
 * El cajero no tenía forma de saber si sus ventas están llegando a la nube: el ciclo de sync
 * solo dejaba rastro en el log, que nadie abre. Si la caja se queda muda —sin internet, sin
 * vinculación, con la nube caída— las ventas viven únicamente en esa computadora, y eso hay que
 * poder verlo desde el mostrador antes de que alguien lo descubra por una pérdida de datos.
 *
 * Va por HTTP contra el servidor local, no por IPC de Electron: la segunda caja y la cocina
 * cargan la interfaz desde ese mismo servidor y no tienen preload.
 */

export type EstadoSync = {
  disponible: boolean;
  vinculada?: boolean;
  sincronizando?: boolean;
  ultimaSincronizacion?: string | null;
  ultimoIntento?: string | null;
  fallos?: number;
};

/** Gravedad de lo que se muestra, para decidir si se pinta un aviso o solo un dato gris. */
export type NivelSync = "ok" | "atrasada" | "muda" | "sin-vincular" | "desconocido";

export async function leerEstadoSync(): Promise<EstadoSync> {
  try {
    const r = await fetch("/__estado-sync", { cache: "no-store" });
    if (!r.ok) return { disponible: false };
    return (await r.json()) as EstadoSync;
  } catch {
    // En el POS web (sin escritorio) esta ruta no existe: no es un error, no hay nada que avisar.
    return { disponible: false };
  }
}

/**
 * Traduce el estado a algo accionable. Función PURA.
 *
 * Los umbrales son deliberadamente flojos: una caja sin internet un par de horas es normal en un
 * local, y un aviso que salta cada rato deja de leerse. Lo que sí importa es pasar de un día,
 * porque ahí ya hay un turno entero de ventas sin respaldo.
 */
export function evaluarSync(e: EstadoSync, ahora: Date = new Date()): { nivel: NivelSync; texto: string } {
  if (!e.disponible) return { nivel: "desconocido", texto: "" };
  if (e.vinculada === false) return { nivel: "sin-vincular", texto: "Sin vincular a la nube" };
  if (!e.ultimaSincronizacion) {
    return { nivel: "muda", texto: "Nunca ha sincronizado" };
  }
  const ms = ahora.getTime() - new Date(e.ultimaSincronizacion).getTime();
  if (Number.isNaN(ms)) return { nivel: "desconocido", texto: "" };
  const horas = Math.floor(ms / 3600_000);
  if (horas >= 24) {
    const dias = Math.floor(horas / 24);
    return { nivel: "muda", texto: `Sin sincronizar hace ${dias} ${dias === 1 ? "día" : "días"}` };
  }
  if (horas >= 3) return { nivel: "atrasada", texto: `Sincronizado hace ${horas} h` };
  const min = Math.floor(ms / 60000);
  return { nivel: "ok", texto: min < 1 ? "Sincronizado ahora" : `Sincronizado hace ${min} min` };
}
