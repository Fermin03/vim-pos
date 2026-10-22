// Orden de los pasos del cobro a pantalla completa: cuándo se pregunta la propina, a dónde lleva
// regresar y qué montos de efectivo se sugieren. Puro, para poder probarlo sin la pantalla.
import type { MetodoPago } from "./cobro";

export type VistaCobro =
  | "selector" | "mas" | "propina" | "efectivo" | "otro" | "dividido" | "atajo" | "terminal" | "credito" | "saldo";

export type DestinoMetodo = MetodoPago | "dividido" | "terminal" | "atajo";

/** Hasta cuatro montos redondos, siempre mayores al total y sin repetir (para $616: 620, 650, 700, 1000). */
export function montosSugeridosEfectivo(total: number): number[] {
  const siguientes = [10, 50, 100, 500, 1000].map((paso) => Math.floor(total / paso) * paso + paso);
  return [...new Set(siguientes)].sort((a, b) => a - b).slice(0, 4);
}

/**
 * La propina se pregunta después de elegir el método. No se pregunta si la sucursal no la captura,
 * si ya está fijada (venía en el ticket o ya se contestó) o si la pregunta el lector de la terminal.
 */
export function debePreguntarPropina(p: {
  capturar: boolean;
  propinaFijada: boolean;
  destino: DestinoMetodo;
  propinaEnLector: boolean;
}): boolean {
  if (!p.capturar || p.propinaFijada) return false;
  return !(p.destino === "terminal" && p.propinaEnLector);
}

/**
 * A dónde lleva «regresar» (botón de la cabecera y Escape). `null` = no hace nada: con un pago
 * aplicándose o la terminal cobrando no se sale por reflejo.
 */
export function vistaAlRegresar(
  vista: VistaCobro,
  p: { ocupado: boolean; preguntoPropinaAqui: boolean },
): VistaCobro | "cerrar" | null {
  if (p.ocupado || vista === "terminal" || vista === "atajo") return null;
  if (vista === "selector") return "cerrar";
  if (vista === "propina" || vista === "mas") return "selector";
  return p.preguntoPropinaAqui ? "propina" : "selector";
}

/** Lo que pagó el cliente: el total de la base NO trae la propina (`TotalesTicket.propina` va aparte). */
export function totalCobrado(t: { total: number; propina?: number }): number {
  return Math.round((t.total + (t.propina ?? 0)) * 100) / 100;
}

/**
 * Al volver a «¿Cómo paga?», ¿la propina ya está contestada? Sí si venía en el ticket o si ya entró
 * un pago con ella (firme, aunque sea $0): preguntarla otra vez —VIM o el lector— sumaría una
 * propina nueva a una cuenta que ya empezó a cobrarse.
 */
export function propinaPreguntadaAlVolver(p: { firme: boolean; inicial: number }): boolean {
  return p.firme || p.inicial > 0;
}
