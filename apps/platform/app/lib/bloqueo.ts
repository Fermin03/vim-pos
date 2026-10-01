/**
 * Cuándo empieza a bloquear una suspensión.
 *
 * Con gracia (1 día o más) se fija a las 06:00 hora de México del día `hoy + gracia`: a esa hora
 * el corte del día anterior ya está cerrado en cualquier restaurante, así que el bloqueo nunca cae
 * a media jornada. México no tiene horario de verano desde 2022: UTC-6 fijo, sin librería.
 *
 * Con 0 días el bloqueo es INMEDIATO (`ahora`). Regla comercial del 1 oct 2026: el pago no tiene
 * días de tolerancia; al vencerse, VIM bloquea a mano. La caja lo obedece en su siguiente latido
 * (minutos), así que sí puede caer a media jornada: por eso el diálogo lo dice con todas sus letras.
 */
export function fechaBloqueo(hoyMx: string, graciaDias: number, ahora: Date = new Date()): string {
  if (!Number.isInteger(graciaDias) || graciaDias < 0) throw new Error("Los días de gracia no pueden ser negativos");
  if (graciaDias === 0) return ahora.toISOString();
  const [a, m, d] = hoyMx.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) throw new Error("Fecha inválida");
  // 06:00 México = 12:00 UTC. Date.UTC normaliza el desborde de mes.
  const base = Date.UTC(a, m - 1, d + graciaDias, 12, 0, 0);
  return new Date(base).toISOString();
}

/** Sin días de tolerancia por omisión (regla del 1 oct 2026); el operador puede dar los que quiera. */
export const GRACIA_POR_DEFECTO = 0;

export function mensajeBloqueoPorDefecto(bloqueoDesdeIso: string, ahora: Date = new Date()): string {
  const f = new Date(bloqueoDesdeIso);
  // Bloqueo que ya entró (suspensión inmediata): no hay "antes del…" que ofrecer.
  if (f.getTime() <= ahora.getTime()) {
    return "Tu suscripción de VIM POS tiene un pago pendiente y la caja está bloqueada. Ponte en contacto con VIM para reactivarla; tu información está completa.";
  }
  const dia = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" }).format(f);
  return `Tu suscripción de VIM POS tiene un pago pendiente. Ponte en contacto con VIM antes del ${dia}; a partir de esa fecha la caja dejará de vender.`;
}
