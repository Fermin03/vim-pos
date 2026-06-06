// F9 — Helpers PUROS del KDS (sin dependencias de cliente/red, para testear con vitest).
// La máquina de estados de cocina y los cálculos de tiempo viven aquí; kds.ts (que sí
// habla con Supabase) los reexporta.

export type EstadoCocina = "EN_COCINA" | "LISTO" | "ENTREGADO" | "EN_RUTA" | "ENTREGADO_DOMICILIO" | "SIN_ENVIAR";

const MODO_LABEL: Record<string, string> = {
  COMER_AQUI: "Comer aquí",
  PARA_LLEVAR: "Para llevar",
  DRIVE_THRU: "Drive-thru",
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
