/**
 * Fechas del panel que el operador elige como DÍA (un `<input type="date">`) y el servidor guarda
 * como instante.
 *
 * `new Date("2026-09-30")` es la medianoche UTC, que en México es el 29 a las 18:00: un aviso que
 * debía mostrarse "hasta el 30" dejaba de verse seis horas antes de empezar ese día (revisión de
 * diseño, sep 2026). México centro no tiene horario de verano desde 2022: el día acaba a las
 * 23:59:59 con desfase -06:00.
 */
export function finDelDiaMx(fecha: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error(`Fecha inválida: ${fecha}`);
  return new Date(`${fecha}T23:59:59-06:00`).toISOString();
}

/**
 * Compara dos versiones "0.4.91" por sus números (no como texto: "0.4.100" es mayor que "0.4.99").
 * Negativo si `a` es menor, 0 si son iguales, positivo si `a` es mayor.
 */
export function compararVersiones(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** "hace 7 min", "hace 2 h", "hace 3 días": el dato principal de una caja es cuánto lleva callada. */
export function haceMinutos(minutos: number | null): string {
  if (minutos === null) return "nunca";
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;
  const h = Math.floor(minutos / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}
