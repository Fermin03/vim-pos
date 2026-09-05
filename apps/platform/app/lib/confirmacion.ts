/**
 * Regla de las confirmaciones destructivas del panel (docs/diseno/platform.md): escribir el
 * nombre del negocio, no pulsar "sí". Pura, para probarla sin React.
 */
export type EntradaConfirmacion = {
  nombreEsperado: string;
  nombreEscrito: string;
  motivo: string;
  requiereGracia?: boolean;
  graciaDias?: number;
  requiereEntiendo?: boolean;
  entiendo?: boolean;
};
export type ResultadoConfirmacion = { ok: boolean; faltantes: ("nombre" | "motivo" | "gracia" | "entiendo")[] };

export const MOTIVO_MINIMO = 10;

const normal = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function evaluarConfirmacion(e: EntradaConfirmacion): ResultadoConfirmacion {
  const faltantes: ResultadoConfirmacion["faltantes"] = [];
  if (normal(e.nombreEscrito) !== normal(e.nombreEsperado)) faltantes.push("nombre");
  if (e.motivo.trim().length < MOTIVO_MINIMO) faltantes.push("motivo");
  if (e.requiereGracia && !(Number.isInteger(e.graciaDias) && (e.graciaDias as number) >= 1)) faltantes.push("gracia");
  if (e.requiereEntiendo && !e.entiendo) faltantes.push("entiendo");
  return { ok: faltantes.length === 0, faltantes };
}
