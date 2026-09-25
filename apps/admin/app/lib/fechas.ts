// Fechas de calendario en la zona horaria del navegador (no UTC). `toISOString()` da la fecha UTC y
// en México después de las 18:00 ya es "mañana"; para rangos de reportes y fechas por defecto
// importa el día local. Mismo patrón que hoyISO() en reservaciones/page.tsx.

/** YYYY-MM-DD del día local. */
export function hoyISO(): string {
  return aISO(new Date());
}

/** YYYY-MM-DD de hace `dias` días, en día local. */
export function haceDiasISO(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return aISO(d);
}

function aISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Un instante como lo espera un `<input type="datetime-local">`: la hora de ESTE navegador, sin
 * zona. `new Date(valor)` hace el camino inverso (también lee la hora local), así que la ida y la
 * vuelta se anulan.
 *
 * Promociones metía `fechaInicio.slice(0, 16)` al editar: la hora UTC tal cual salía de la base.
 * El campo enseñaba las 00:00 de una promo de las 18:00, y guardar sin tocar nada la corría 6 h
 * cada vez (revisión de diseño, sep 2026).
 */
export function aDatetimeLocal(instante: Date | string = new Date()): string {
  const d = new Date(instante);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
