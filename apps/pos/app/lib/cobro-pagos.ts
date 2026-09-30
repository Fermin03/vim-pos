import type { MetodoPago, TotalesTicket } from "./cobro";

/**
 * Un pago del cobro dividido, con su `client_id_local` FIJO desde que el cajero lo agrega.
 *
 * Auditoría integral 30/09/2026 (B2-2): antes cada intento de "Completar cobro" generaba ids
 * nuevos, así que la idempotencia de `aplicar_pago` nunca aplicaba. Si el pago 2 de 3 fallaba, el
 * reintento reenviaba la lista completa: el pago 1 entraba otra vez (duplicado) y los métodos
 * quedaban corridos. Con el id fijo, reenviar un pago que ya entró no lo duplica, y además la
 * lista se poda de los que ya entraron (ver `aplicarPagosEnOrden`).
 */
export type PagoPorAplicar = {
  clientId: string;
  metodo: MetodoPago;
  monto: number;
};

export type ResultadoPagos = {
  /** `clientId` de los pagos que la base aceptó, en orden. El que falló NO está. */
  aplicados: string[];
  /** Totales al terminar: los del último pago bueno, o releídos tras el fallo (null si ni eso). */
  totales: TotalesTicket | null;
  /** El error que cortó la secuencia, o null si todos entraron. */
  error: unknown;
};

/**
 * Aplica los pagos UNO POR UNO (nunca en paralelo: carrera en la ruta de dinero) y, si uno falla,
 * se detiene, RELEE los totales de la base y dice cuáles sí entraron. Así el llamador:
 *  - quita de la lista lo que ya se cobró, y el reintento manda solo lo que falta;
 *  - ve el estado real del ticket — incluido PAGADO si el pago que "falló" era sobrante porque el
 *    ticket ya había cerrado (B2-1: propina en cobro dividido).
 */
export async function aplicarPagosEnOrden(
  lista: PagoPorAplicar[],
  aplicar: (p: PagoPorAplicar) => Promise<TotalesTicket>,
  releer: () => Promise<TotalesTicket>,
): Promise<ResultadoPagos> {
  const aplicados: string[] = [];
  let totales: TotalesTicket | null = null;
  for (const p of lista) {
    if (!(p.monto > 0)) continue;
    try {
      totales = await aplicar(p);
      aplicados.push(p.clientId);
    } catch (error) {
      const releidos = await releer().catch(() => null);
      return { aplicados, totales: releidos ?? totales, error };
    }
  }
  return { aplicados, totales, error: null };
}

/**
 * ¿Hay que dar la venta por cobrada aunque un pago haya fallado? Sí cuando la base dice PAGADO:
 * el dinero que cubre el ticket ya entró, y mostrar "error" invita a cobrar otra vez (B2-1).
 */
export function ventaQuedoPagada(totales: TotalesTicket | null): totales is TotalesTicket {
  return totales?.estadoFiscal === "PAGADO";
}

/**
 * Tras un pago suelto que falló y los totales releídos: ¿el pago entró de todos modos? (La RPC
 * se aplicó pero la respuesta no llegó.) Si entró, su `client_id_local` ya está gastado y el
 * siguiente cobro necesita uno nuevo; si no, se conserva para que un reintento no lo duplique.
 */
export function pagoEntroPeseAlError(antes: TotalesTicket, despues: TotalesTicket | null): boolean {
  return despues !== null && despues.montoPagado > antes.montoPagado;
}
