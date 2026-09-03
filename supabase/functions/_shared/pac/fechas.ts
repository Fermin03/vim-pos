// Fechas que devuelve el PAC.
//
// Facturama contesta la hora del timbrado en hora local de México y SIN zona
// ("2026-09-03T16:34:41"). Si eso se guarda tal cual en un `timestamptz`, Postgres lo toma como
// UTC y el comprobante queda registrado seis horas antes de lo que ocurrió. Se vio en el primer
// CFDI real (3 sep 2026): timbrado a las 16:34 de León, guardado como 16:34Z = 10:34 de León.
//
// México central no tiene horario de verano desde 2022, así que la zona es fija.

export const ZONA_PAC = "-06:00";

/** Devuelve una fecha ISO con zona. Si el PAC ya la mandó con zona, se respeta. */
export function normalizarFechaPac(
  valor: string | null | undefined,
  ahora: () => string = () => new Date().toISOString(),
): string {
  const t = (valor ?? "").trim();
  if (!t) return ahora();
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(t)) return t + ZONA_PAC;
  // Forma que no conocemos: se deja tal cual y que Postgres la rechace si no la entiende, mejor que
  // inventar una hora.
  return t;
}
