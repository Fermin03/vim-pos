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
