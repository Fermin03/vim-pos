import { minutosAbierta } from "./cuentas-abiertas";
import type { DeliveryAsignacion } from "./delivery";

/**
 * Un viaje: los pedidos que salieron juntos con el mismo repartidor.
 *
 * Se agrupa por `viaje_id` y NO por repartidor. Una asignación sigue viva hasta que se cobra, así
 * que si el cajero tarda en cobrar, el repartidor puede salir de nuevo con los pedidos anteriores
 * todavía sin liquidar. Agrupando por repartidor esos dos viajes saldrían revueltos en una sola
 * tarjeta y los minutos fuera dejarían de significar nada.
 *
 * Las asignaciones sin `viaje_id` son anteriores a la 0114: cada una es su propio viaje. No se
 * juntan entre sí aunque coincida el repartidor — eso inventaría un viaje que nunca ocurrió.
 */
export type Viaje = {
  /** El `viaje_id`, o el id de la asignación cuando no lo tiene. */
  id: string;
  repartidorNombre: string;
  pedidos: DeliveryAsignacion[];
  /** Lo que el repartidor debe traer de vuelta por todo el viaje. */
  efectivo: number;
  /** Cuándo salió: la salida más vieja del viaje (ver `salidaDe`). */
  desdeIso: string;
  promesaMin: number | null;
};

/**
 * Cuándo salió este pedido: `fecha_salida` y, si no la tiene, la asignación.
 *
 * Manda la salida porque es la que se mueve. Al REASIGNAR, `asignar_delivery_lote` (0114) pone
 * `fecha_salida = now()` y NO toca `fecha_asignacion`: contando desde la asignación, un pedido que
 * cambió de repartidor dos horas después salía con "120 min fuera" en un viaje recién arrancado —
 * y marcado como tarde sin serlo.
 *
 * El respaldo hace falta de verdad: las asignaciones anteriores a la 0114 podían quedarse en
 * ASIGNADO sin salida confirmada, y ahí `fecha_asignacion` es lo único que hay.
 */
function salidaDe(a: DeliveryAsignacion): string {
  return a.fechaSalida ?? a.fechaAsignacion;
}

export function agruparViajes(asignaciones: DeliveryAsignacion[]): Viaje[] {
  const porViaje = new Map<string, DeliveryAsignacion[]>();
  for (const a of asignaciones) {
    const clave = a.viajeId ?? a.id;
    const grupo = porViaje.get(clave);
    if (grupo) grupo.push(a);
    else porViaje.set(clave, [a]);
  }

  const viajes: Viaje[] = [];
  for (const [id, pedidos] of porViaje) {
    const ordenados = [...pedidos].sort((x, y) => salidaDe(x).localeCompare(salidaDe(y)));
    const primero = ordenados[0]!;
    viajes.push({
      id,
      repartidorNombre: primero.repartidorNombre,
      pedidos: ordenados,
      efectivo: ordenados.reduce((s, p) => s + p.montoALiquidar, 0),
      desdeIso: salidaDe(primero),
      // La promesa es del viaje: si los pedidos traen distintas, manda la más corta, que es la que
      // se incumple primero.
      promesaMin: ordenados.reduce<number | null>(
        (m, p) => (p.tiempoPromesa == null ? m : m == null ? p.tiempoPromesa : Math.min(m, p.tiempoPromesa)),
        null,
      ),
    });
  }

  // El que lleva más tiempo fuera, arriba: es por el que preguntan.
  return viajes.sort((a, b) => a.desdeIso.localeCompare(b.desdeIso));
}

/** Minutos desde que el viaje salió. Reusa el contador de las cuentas abiertas. */
export function minutosFuera(v: Viaje, ahora: Date = new Date()): number {
  return minutosAbierta(v.desdeIso, ahora);
}

/** Si se pasó del tiempo que se le prometió al cliente. Sin promesa, nunca. */
export function viajeTarde(v: Viaje, ahora: Date = new Date()): boolean {
  if (v.promesaMin == null) return false;
  return minutosFuera(v, ahora) > v.promesaMin;
}
