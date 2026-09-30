/** El cobro de la suscripción de un negocio a VIM (0130): lo que ven el panel y el dueño.
 *
 * Vive aquí y no en cada app porque las dos tienen que decir LO MISMO: si el panel dice "vence en
 * 3 días" y el dueño ve "al corriente", alguien va a llamar para preguntar cuál es.
 */

export type MetodoCobro = "TRANSFERENCIA" | "EFECTIVO" | "TARJETA" | "DEPOSITO" | "OTRO";

export const ETIQUETA_METODO_COBRO: Record<MetodoCobro, string> = {
  TRANSFERENCIA: "Transferencia",
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  DEPOSITO: "Depósito",
  OTRO: "Otro",
};

/** Días que se avisa antes de la fecha de cobro. */
export const AVISO_DIAS = 5;

export type EstadoCobro =
  | { tipo: "SIN_COBRO" }
  | { tipo: "AL_CORRIENTE"; dias: number }
  | { tipo: "POR_VENCER"; dias: number }
  | { tipo: "HOY" }
  | { tipo: "VENCIDO"; dias: number };

/** Días entre dos fechas `YYYY-MM-DD` (b − a), sin que la hora ni el horario de verano estorben. */
export function diasEntre(a: string, b: string): number {
  const ms = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

/**
 * ¿Cómo va el cobro? `proxima` = la fecha en que toca pagar (la de la suscripción); `hoy` en hora
 * de México (`hoyMx()`), nunca la del servidor.
 */
export function estadoCobro(proxima: string | null | undefined, hoy: string): EstadoCobro {
  if (!proxima) return { tipo: "SIN_COBRO" };
  const faltan = diasEntre(hoy, proxima.slice(0, 10));
  if (faltan < 0) return { tipo: "VENCIDO", dias: -faltan };
  if (faltan === 0) return { tipo: "HOY" };
  if (faltan <= AVISO_DIAS) return { tipo: "POR_VENCER", dias: faltan };
  return { tipo: "AL_CORRIENTE", dias: faltan };
}

/** Una frase para el estado: "Vencido hace 3 días", "Toca pagar hoy"… */
export function textoEstadoCobro(e: EstadoCobro): string {
  const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
  switch (e.tipo) {
    case "SIN_COBRO": return "Sin cobro activo";
    case "AL_CORRIENTE": return "Al corriente";
    case "POR_VENCER": return `Toca pagar en ${dias(e.dias)}`;
    case "HOY": return "Toca pagar hoy";
    case "VENCIDO": return `Vencido hace ${dias(e.dias)}`;
  }
}
