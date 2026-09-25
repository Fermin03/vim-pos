/**
 * Cálculos puros del dashboard (sin red), separados para probarlos.
 */

export type PuntoHora = { hora: number; total: number };

/**
 * Ventas por hora como eje CONTINUO y en el orden del día contable.
 *
 * Antes solo venían las horas con venta, ordenadas por número: de las 15 saltaba a las 18 como si
 * fueran seguidas, y en un negocio que cierra a las 3 a.m. las ventas de la 1 quedaban ANTES de las
 * del mediodía. Ahora el eje va de la primera a la última hora con venta, en el orden en que pasa
 * el día (empezando en la hora de cierre), con ceros donde no se vendió nada.
 */
export function serieHoraria(porHora: Map<number, number>, horaCierre: number): PuntoHora[] {
  const conVenta = [...porHora.entries()].filter(([, t]) => t > 0).map(([h]) => h);
  if (conVenta.length === 0) return [];
  // Posición de cada hora dentro del día contable: la hora de cierre es la 0.
  const posicion = (h: number) => (((h - horaCierre) % 24) + 24) % 24;
  const inicio = Math.min(...conVenta.map(posicion));
  const fin = Math.max(...conVenta.map(posicion));
  const serie: PuntoHora[] = [];
  for (let p = inicio; p <= fin; p++) {
    const hora = (p + horaCierre) % 24;
    serie.push({ hora, total: Math.round((porHora.get(hora) ?? 0) * 100) / 100 });
  }
  return serie;
}

export type TurnoDia = { estado: string; diferencia: number | null };

export type ResumenCaja = {
  /** Turnos del día que ya se cerraron (con o sin validar). */
  cerrados: number;
  /** Turnos del día que siguen abiertos. */
  abiertos: number;
  /** Suma de las diferencias de efectivo de los cerrados: negativo = faltó, positivo = sobró. */
  diferenciaNeta: number;
  /** Cuántos cerrados tuvieron diferencia (a partir de un centavo). */
  conDiferencia: number;
};

/** ¿Cuadró la caja? Lo que el dueño quiere saber al abrir el panel, antes que las ventas. */
export function resumirCaja(turnos: TurnoDia[]): ResumenCaja {
  const cerrados = turnos.filter((t) => t.estado === "CERRADO" || t.estado === "PENDIENTE_VALIDACION");
  const diferencias = cerrados.map((t) => Math.round((t.diferencia ?? 0) * 100) / 100);
  return {
    cerrados: cerrados.length,
    abiertos: turnos.filter((t) => t.estado === "ABIERTO").length,
    diferenciaNeta: Math.round(diferencias.reduce((a, d) => a + d, 0) * 100) / 100,
    conDiferencia: diferencias.filter((d) => Math.abs(d) >= 0.01).length,
  };
}
