/**
 * Fechas de NEGOCIO en la zona horaria de México.
 *
 * POR QUÉ EXISTE ESTE MÓDULO. En todo el código se escribía `new Date().toISOString().slice(0,10)`
 * para obtener "hoy". Se lee como si diera la fecha de hoy, y no lo hace: `toISOString()` convierte
 * a UTC siempre, corra donde corra. México está en UTC-6, así que a partir de las 18:00 hora local
 * esa línea devuelve MAÑANA.
 *
 * Para un restaurante eso no es un detalle: las 18:00 a 23:59 son sus horas fuertes. La pantalla de
 * consulta de cuentas se abría en la fecha de mañana y salía vacía justo en plena cena; los
 * reportes del panel arrancaban en un rango sin ventas; y en el servidor (que corre en UTC) las
 * altas de suscripción quedaban fechadas un día adelante.
 *
 * Aquí las fechas se calculan con `Intl` sobre la zona horaria real, que además absorbe sola
 * cualquier cambio de horario de verano sin que haya que tocar un offset a mano.
 */

export const ZONA_MX = "America/Mexico_City";

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_MX,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * La fecha de un instante en México, como `YYYY-MM-DD`.
 *
 * Se arma por partes y no con un formato de locale: un locale puede entregar el día antes del mes,
 * o con otro separador, y el resultado viaja tal cual a una columna `date` de Postgres.
 */
export function aFechaMx(cuando: Date = new Date()): string {
  const p = Object.fromEntries(fmt.formatToParts(cuando).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Hoy en México, como `YYYY-MM-DD`. Reemplaza a `new Date().toISOString().slice(0,10)`. */
export function hoyMx(): string {
  return aFechaMx();
}

/**
 * Suma meses a una fecha `YYYY-MM-DD`, recortando al último día del mes destino.
 *
 * Sin el recorte, una suscripción que arranca el 31 de enero pasaría a cobrarse el 3 de marzo:
 * `Date` desborda los días sobrantes al mes siguiente en silencio. Al cliente le llegaría el cobro
 * en una fecha que nadie eligió, y saltándose febrero entero.
 */
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  if (!a || !m || !d) throw new Error(`Fecha inválida: ${fecha}`);
  const totalMes = (a * 12 + (m - 1)) + meses;
  const anioDestino = Math.floor(totalMes / 12);
  const mesDestino = totalMes % 12; // 0-11
  // Día 0 del mes siguiente = último día del mes destino.
  const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDia);
  const dosDigitos = (n: number) => String(n).padStart(2, "0");
  return `${anioDestino}-${dosDigitos(mesDestino + 1)}-${dosDigitos(dia)}`;
}

/**
 * Suma (o resta, con `n` negativo) días a una fecha `YYYY-MM-DD`.
 *
 * Se calcula en UTC a propósito: aquí ya no hay hora ni zona, solo aritmética de calendario, y
 * hacerla sobre la hora local reintroduciría el desfase que este módulo existe para evitar.
 */
export function sumarDias(fecha: string, n: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  if (!a || !m || !d) throw new Error(`Fecha inválida: ${fecha}`);
  const t = new Date(Date.UTC(a, m - 1, d));
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Una fecha para leerla, no para guardarla: `2026-09-24` → `24 sep 2026`.
 *
 * Las pantallas del panel enseñaban la fecha tal como sale de la base (`2026-09-03–2026-09-03`),
 * que es formato de máquina (revisión de diseño, sep 2026). Acepta una fecha `YYYY-MM-DD` —que
 * se toma tal cual, sin pasar por `Date`, porque `new Date("2026-09-24")` es medianoche UTC y en
 * México ya sería el 23— o un instante ISO completo, que se lleva a la fecha de México.
 */
export function fechaLegible(valor: string | null | undefined): string {
  if (!valor) return "—";
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : aFechaMx(new Date(valor));
  const [a, m, d] = dia.split("-").map(Number);
  if (!a || !m || !d) return valor;
  return `${d} ${MESES[m - 1]} ${a}`;
}

/** Un rango legible: `24 sep 2026` si es un solo día, `3 – 9 sep 2026` si no. */
export function rangoLegible(desde: string | null | undefined, hasta: string | null | undefined): string {
  if (!desde || !hasta || desde === hasta) return fechaLegible(desde ?? hasta);
  return `${fechaLegible(desde)} – ${fechaLegible(hasta)}`;
}

/**
 * Hace cuánto pasó algo, en palabras: `hace 4 min`, `hace 2 h`, `hace 3 días`. Pasado un mes
 * devuelve la fecha. Para señales de vida (el latido de una caja, la última venta): "hace 4 min"
 * se lee de un vistazo; "24 sep 2026 20:58" obliga a hacer la resta.
 */
export function haceCuanto(valor: string | null | undefined, ahora: number = Date.now()): string {
  if (!valor) return "nunca";
  const t = new Date(valor).getTime();
  if (Number.isNaN(t)) return "—";
  const min = Math.max(0, Math.floor((ahora - t) / 60000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return d === 1 ? "hace 1 día" : `hace ${d} días`;
  return fechaLegible(valor);
}
