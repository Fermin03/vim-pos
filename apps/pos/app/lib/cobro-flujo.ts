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
