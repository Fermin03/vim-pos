// F9 — Helpers PUROS del KDS (sin dependencias de cliente/red, para testear con vitest).
// La máquina de estados de cocina y los cálculos de tiempo viven aquí; kds.ts (que sí
// habla con Supabase) los reexporta.

export type EstadoCocina = "EN_COCINA" | "LISTO" | "ENTREGADO" | "EN_RUTA" | "ENTREGADO_DOMICILIO" | "SIN_ENVIAR";

const MODO_LABEL: Record<string, string> = {
  COMER_AQUI: "Comedor",
  PARA_LLEVAR: "Para llevar",
  DRIVE_THRU: "Pick-up",
  DELIVERY_PROPIO: "Domicilio",
};

export function labelModo(m: string): string {
  return MODO_LABEL[m] ?? m;
}

/** El siguiente estado al que avanza una comanda desde el KDS (null si ya está fuera de cocina). */
export function siguienteEstado(estado: EstadoCocina): EstadoCocina | null {
  if (estado === "EN_COCINA") return "LISTO";
  if (estado === "LISTO") return "ENTREGADO";
  return null;
}

/** Minutos transcurridos desde que entró a cocina (para el cronómetro y la alerta de vencido). */
export function minutosEnCocina(fechaEnvio: string | null, ahora: number): number {
  if (!fechaEnvio) return 0;
  const t = new Date(fechaEnvio).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((ahora - t) / 60000));
}

// ── F15: KDS avanzado ────────────────────────────────────────────────────────

/** Etiqueta canónica de "sin área" para el filtro multi-área. */
export const SIN_AREA = "General";

/**
 * Áreas presentes en un conjunto de comandas (para el tab-bar del filtro multi-área).
 * Cada comanda tiene items; cada item un área (o null → General). Orden alfabético estable.
 */
export function areasDeComandas(
  comandas: { items: { area: string | null }[] }[],
): string[] {
  const set = new Set<string>();
  for (const c of comandas) for (const it of c.items) set.add(it.area ?? SIN_AREA);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Detecta si hay comandas NUEVAS comparando los ticketIds previos con los actuales
 * (para disparar el sonido de "nuevo pedido"). Devuelve cuántas comandas nuevas hay.
 */
export function comandasNuevas(previos: Set<string>, actualesIds: string[]): number {
  let n = 0;
  for (const id of actualesIds) if (!previos.has(id)) n++;
  return n;
}
