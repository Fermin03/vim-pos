/**
 * Agenda de belleza (0218): las reglas puras que comparten la caja y el admin. La base es la que
 * rechaza un empalme; aquí solo se adelanta lo que se ve antes de guardar.
 */
import type { Database } from "./database.types";

export type CitaEstado = Database["public"]["Enums"]["cita_estado"];

export type Tramo = { inicia: Date; termina: Date };

/** Servicios uno tras otro: el segundo empieza cuando termina el primero (como `_agenda_tramos`). */
export function tramosEncadenados(inicia: Date, duraciones: number[]): Tramo[] {
  let cursor = inicia.getTime();
  return duraciones.map((min) => {
    const t = { inicia: new Date(cursor), termina: new Date(cursor + min * 60_000) };
    cursor = t.termina.getTime();
    return t;
  });
}

/** Intervalos `[)`, como el EXCLUDE: los que solo se tocan (uno termina 11:00, otro empieza 11:00) no se cruzan. */
export const seCruzan = (a: Tramo, b: Tramo): boolean =>
  a.inicia.getTime() < b.termina.getTime() && b.inicia.getTime() < a.termina.getTime();

/** Ya pasaron los minutos de tolerancia desde la hora de la cita. «No llegó» sigue siendo manual. */
export const pasoTolerancia = (inicia: Date, ahora: Date, toleranciaMin: number): boolean =>
  ahora.getTime() > inicia.getTime() + toleranciaMin * 60_000;

export const ETIQUETA_ESTADO_CITA: Record<CitaEstado, string> = {
  AGENDADA: "Por llegar",
  EN_ESPERA: "En espera",
  EN_CURSO: "Atendiendo",
  TERMINADA: "Terminada",
  NO_LLEGO: "No llegó",
  CANCELADA: "Cancelada",
  COBRADA: "Cobrada",
};

const ZONA = "America/Mexico_City";
const fmtDia = new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" });
const fmtHora = new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, hour: "numeric", minute: "2-digit", hourCycle: "h23" });
const lista = new Intl.ListFormat("es-MX", { style: "long", type: "conjunction" });

/** «jueves 6 de noviembre», en México. Por partes: el locale pone una coma después del día de la semana. */
export function diaLargo(d: Date): string {
  const p = Object.fromEntries(fmtDia.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} de ${p.month}`;
}

/** «10:30» (y «9:00», sin el cero que pone h23; la medianoche lo conserva: «00:30»), en México. */
export const horaCorta = (d: Date): string => fmtHora.format(d).replace(/^0(?=[1-9]:)/, "");

/** El recordatorio por WhatsApp, con el texto exacto del diseño. */
export function mensajeRecordatorio(d: { nombre: string; negocio: string; inicia: Date; servicios: string[] }): string {
  return `Hola ${d.nombre}, te recordamos tu cita en ${d.negocio} el ${diaLargo(d.inicia)} a las ${horaCorta(d.inicia)}: ${lista.format(d.servicios)}.`;
}
