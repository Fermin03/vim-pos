/**
 * ¿Cuánto le queda al sello digital (CSD)? Reglas PURAS, compartidas por el panel del dueño y el
 * panel de VIM, para que los dos avisen el mismo día.
 *
 * El sitio promete "te avisamos antes de que venza tu sello". Hasta el 30 sep 2026 el panel solo
 * reaccionaba cuando YA había vencido —es decir, cuando el negocio ya no podía facturar—. Tramitar
 * un sello nuevo en el SAT puede llevar días, así que el aviso útil es el de antes.
 *
 * `hoy` va en hora de México (`hoyMx()` de `@vim/fecha`), nunca la fecha del servidor: de 18:00 a
 * 23:59 el servidor ya está en mañana y el aviso se adelantaría un día.
 */
import { diasEntre } from "./cobro";

/** Días antes del vencimiento en que se empieza a avisar. */
export const SELLO_AVISO_DIAS = 30;
/** Días antes del vencimiento en que el aviso sube de tono. */
export const SELLO_URGENTE_DIAS = 7;

export type EstadoSello =
  /** Sin sello o sin fecha conocida: no hay nada que avisar aquí. */
  | { tipo: "SIN_FECHA" }
  | { tipo: "VIGENTE"; hasta: string; dias: number }
  /** Faltan 30 días o menos. `dias` = 0 es "vence hoy" (hoy todavía sirve). */
  | { tipo: "POR_VENCER"; hasta: string; dias: number }
  /** Faltan 7 días o menos. */
  | { tipo: "URGENTE"; hasta: string; dias: number }
  /** Ya venció. `dias` = cuántos lleva vencido. */
  | { tipo: "VENCIDO"; hasta: string; dias: number };

/**
 * El sello sirve hasta el último día de su vigencia inclusive (`certificadoVigente` en
 * `_shared/pac/certificado.ts` usa la misma regla), así que vence al día siguiente.
 */
export function estadoSello(vigenciaHasta: string | null | undefined, hoy: string): EstadoSello {
  if (!vigenciaHasta || !/^\d{4}-\d{2}-\d{2}/.test(vigenciaHasta)) return { tipo: "SIN_FECHA" };
  const hasta = vigenciaHasta.slice(0, 10);
  const dias = diasEntre(hoy, hasta);
  if (dias < 0) return { tipo: "VENCIDO", hasta, dias: -dias };
  if (dias <= SELLO_URGENTE_DIAS) return { tipo: "URGENTE", hasta, dias };
  if (dias <= SELLO_AVISO_DIAS) return { tipo: "POR_VENCER", hasta, dias };
  return { tipo: "VIGENTE", hasta, dias };
}

/** "faltan 12 días", "falta 1 día", "vence hoy". */
export function faltanDias(dias: number): string {
  if (dias <= 0) return "vence hoy";
  return dias === 1 ? "falta 1 día" : `faltan ${dias} días`;
}
