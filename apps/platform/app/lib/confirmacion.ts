/**
 * Regla de las confirmaciones destructivas del panel (docs/diseno/platform.md): escribir el
 * nombre del negocio, no pulsar "sí". Pura, para probarla sin React.
 */
export type EntradaConfirmacion = {
  /** false: lo reversible que toca a un solo cliente pide motivo, no el nombre (ver DialogoConfirmar). */
  requiereNombre?: boolean;
  nombreEsperado: string;
  nombreEscrito: string;
  motivo: string;
  requiereGracia?: boolean;
  graciaDias?: number;
  requiereEntiendo?: boolean;
  entiendo?: boolean;
  /**
   * Además del nombre, una palabra que hay que escribir tal cual (`ELIMINAR`). Para lo que no se
   * puede deshacer: el nombre dice A QUIÉN, la palabra dice QUÉ. Exacta, en mayúsculas.
   */
  palabraEsperada?: string;
  palabraEscrita?: string;
};
export type ResultadoConfirmacion = { ok: boolean; faltantes: ("nombre" | "motivo" | "gracia" | "entiendo" | "palabra")[] };

export const MOTIVO_MINIMO = 10;

const normal = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** ¿Lo escrito es el nombre del negocio? Misma regla en el diálogo y en el servidor. */
export function nombreCoincide(esperado: string, escrito: string): boolean {
  return normal(esperado) !== "" && normal(escrito) === normal(esperado);
}

export function evaluarConfirmacion(e: EntradaConfirmacion): ResultadoConfirmacion {
  const faltantes: ResultadoConfirmacion["faltantes"] = [];
  if (e.requiereNombre !== false && normal(e.nombreEscrito) !== normal(e.nombreEsperado)) faltantes.push("nombre");
  if (e.motivo.trim().length < MOTIVO_MINIMO) faltantes.push("motivo");
  if (e.requiereGracia && !(Number.isInteger(e.graciaDias) && (e.graciaDias as number) >= 1)) faltantes.push("gracia");
  if (e.requiereEntiendo && !e.entiendo) faltantes.push("entiendo");
  if (e.palabraEsperada && (e.palabraEscrita ?? "").trim() !== e.palabraEsperada) faltantes.push("palabra");
  return { ok: faltantes.length === 0, faltantes };
}
