/**
 * Cuándo empieza a bloquear una suspensión.
 *
 * Se fija a las 06:00 hora de México del día `hoy + gracia`: a esa hora el corte del día
 * anterior ya está cerrado en cualquier restaurante, así que el bloqueo nunca cae a media
 * jornada. México no tiene horario de verano desde 2022: UTC-6 fijo, sin librería.
 */
export function fechaBloqueo(hoyMx: string, graciaDias: number): string {
  if (!Number.isInteger(graciaDias) || graciaDias < 1) throw new Error("La gracia debe ser de al menos 1 día");
  const [a, m, d] = hoyMx.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) throw new Error("Fecha inválida");
  // 06:00 México = 12:00 UTC. Date.UTC normaliza el desborde de mes.
  const base = Date.UTC(a, m - 1, d + graciaDias, 12, 0, 0);
  return new Date(base).toISOString();
}

export const GRACIA_POR_DEFECTO = 3;

export function mensajeBloqueoPorDefecto(bloqueoDesdeIso: string): string {
  const f = new Date(bloqueoDesdeIso);
  const dia = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" }).format(f);
  return `Tu suscripción de VIM POS tiene un pago pendiente. Ponte en contacto con VIM antes del ${dia}; a partir de esa fecha la caja dejará de vender.`;
}
