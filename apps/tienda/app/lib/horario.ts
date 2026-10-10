// El horario de una sucursal, para el cliente: si está abierta, cuándo abre y la semana legible.
// La forma del horario y sus reglas base viven en @vim/fecha (las comparte el admin).
//
// Hora del centro de México para todos (decisión 4 del plan): la función no manda la zona horaria
// de la sucursal. Quien DECIDE si se puede pedir es el servidor (`estado` de la sucursal); esto solo
// redacta el aviso. ponytail: cuando haya un negocio en otra zona, que `tienda_negocio` la mande.
import { DIAS, ZONA_MX, type Dia, type Horario } from "@vim/fecha";

/** Un instante en México: día de la semana (1 = lunes) y hora «HH:MM». */
export type Momento = { dia: Dia; hora: string };

const fmt = new Intl.DateTimeFormat("en-US", { timeZone: ZONA_MX, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const DIA_DE: Record<string, Dia> = { Mon: "1", Tue: "2", Wed: "3", Thu: "4", Fri: "5", Sat: "6", Sun: "7" };

export function momentoMx(cuando: Date = new Date()): Momento {
  const p = Object.fromEntries(fmt.formatToParts(cuando).map((x) => [x.type, x.value]));
  return { dia: DIA_DE[p.weekday ?? ""] ?? "1", hora: `${p.hour}:${p.minute}` };
}

const masDias = (dia: Dia, n: number): Dia => String(((Number(dia) - 1 + n) % 7 + 7) % 7 + 1) as Dia;

/**
 * La misma regla que `tienda_horario_abierto` (0162): abre a su hora y cierra ANTES de la de cierre;
 * cierre ≤ apertura = cierra pasada la medianoche (si son iguales, no cierra hasta el día siguiente).
 */
export function abiertoAhora(h: Horario, m: Momento = momentoMx()): boolean {
  const hoy = h[m.dia], ayer = h[masDias(m.dia, -1)];
  if (hoy && (hoy[1] > hoy[0] ? m.hora >= hoy[0] && m.hora < hoy[1] : m.hora >= hoy[0])) return true;
  return !!ayer && ayer[1] <= ayer[0] && m.hora < ayer[1];
}

/**
 * La siguiente vez que abre: hoy si todavía no llega su hora; si no, el próximo día con horario
 * (`enDias: 7` = el mismo día de la semana que viene). null = no abre ningún día.
 */
export function proximaApertura(h: Horario, m: Momento = momentoMx()): { dia: Dia; hora: string; enDias: number } | null {
  for (let n = 0; n <= 7; n++) {
    const dia = masDias(m.dia, n), rango = h[dia];
    if (rango && (n > 0 || rango[0] > m.hora)) return { dia, hora: rango[0], enDias: n };
  }
  return null;
}

/** «13:00» → «1:00 p. m.» */
export function hora12(hhmm: string): string {
  const [h, min] = hhmm.split(":") as [string, string];
  const n = Number(h);
  return `${n % 12 === 0 ? 12 : n % 12}:${min} ${n < 12 ? "a. m." : "p. m."}`;
}

/** «13:05» → «a la 1:05 p. m.»; «18:00» → «a las 6:00 p. m.» (la una va en singular). */
export const aLaHora = (hhmm: string): string => `${/^(01|13):/.test(hhmm) ? "a la" : "a las"} ${hora12(hhmm)}`;

const nombreDe = (dia: Dia): string => DIAS.find((d) => d.dia === dia)!.nombre;

/** «Abre hoy a las 6:00 p. m.» / «Abre el lunes a la 1:00 p. m.»; null si no abre ningún día. */
export function textoApertura(h: Horario, m: Momento = momentoMx()): string | null {
  const p = proximaApertura(h, m);
  if (!p) return null;
  return `Abre ${p.enDias === 0 ? "hoy" : `el ${nombreDe(p.dia).toLowerCase()}`} ${aLaHora(p.hora)}`;
}

/** Los siete días, de lunes a domingo, con su horario en palabras. */
export function semanaLegible(h: Horario): { dia: Dia; nombre: string; texto: string }[] {
  return DIAS.map(({ dia, nombre }) => {
    const r = h[dia];
    return { dia, nombre, texto: !r ? "Cerrado" : r[0] === r[1] ? "Abierto todo el día" : `${hora12(r[0])} – ${hora12(r[1])}` };
  });
}
