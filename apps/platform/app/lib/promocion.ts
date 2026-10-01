// Promociones al activar el cobro (0141, ADR 0021).
//
// La base guarda el precio de lista y, encima, la promoción con su fecha de fin; el precio de cada
// día lo decide `precioVigente` (@vim/db/cobro), espejo de `precio_vigente_suscripcion()` en SQL.
// Aquí solo vive cómo se ARMA una promoción desde el formulario del panel.
//
// EL COBRO ES POR ADELANTADO (decisión de Fermín, 30/09/2026): al activar, el primer cobro vence el
// mismo día (se paga el mes que empieza). Los cobros caen en inicio, inicio+1 mes, inicio+2…
import { sumarDias, sumarMeses } from "@vim/fecha";
import { precioVigente, type PrecioSuscripcion } from "@vim/db/cobro";
import { precioValido } from "./precio";

/**
 * La oferta del piloto (sitio-web/precios.md): mes 1 gratis —la prueba—, meses 2 a 7 a $499 y del
 * mes 8 en adelante el precio de lista. Solo en Esencial y solo con cobro mensual.
 *
 * El cobro se activa al terminar la prueba y se paga por adelantado, así que los seis pagos a $499
 * caen en inicio, +1, …, +5 meses, y el séptimo (inicio + 6 meses) ya es a lista: la promoción vale
 * hasta el día ANTERIOR a ese séptimo cobro (`promocion_hasta` es inclusive).
 */
export const PILOTO = { nombre: "Piloto 5 negocios", precio: 499, meses: 6, plan: "ESENCIAL" } as const;

export type Promocion = { precio: number; hasta: string; nombre: string | null };

/** ¿`YYYY-MM-DD` es una fecha que existe? (2027-02-30 no; la base respondería con un 500 crudo). */
export function fechaValida(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(a, m - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * ESPEJO de `_fecha_cobro_siguiente(p_inicio, p_desde, p_meses)` (0130): la fecha de cobro que va
 * `meses` después de `desde`, contada SIEMPRE desde el día de alta. Una suscripción del 31 de enero
 * cobra el 28 de febrero y el 31 de marzo; encadenar "+1 mes" la dejaría en 28 para siempre.
 */
export function fechaCobro(inicio: string, desde: string, meses: number): string {
  const diff = (Number(desde.slice(0, 4)) - Number(inicio.slice(0, 4))) * 12 + (Number(desde.slice(5, 7)) - Number(inicio.slice(5, 7)));
  return sumarMeses(inicio.slice(0, 10), diff + meses);
}

/** La promoción del piloto para un cobro que empieza (y se paga por primera vez) en `inicio`. */
export function promocionPiloto(inicio: string): Promocion {
  return { precio: PILOTO.precio, hasta: sumarDias(fechaCobro(inicio, inicio, PILOTO.meses), -1), nombre: PILOTO.nombre };
}

/**
 * Valida la promoción que llega en el cuerpo de `suscripcion_activar`. `null` en el cuerpo = sin
 * promoción. Las mismas reglas que `activar_suscripcion` en la base, para contestar con un error
 * claro antes de llamarla (la base las vuelve a comprobar: el servidor no es la única puerta).
 *
 * @param primerCobro la primera fecha de cobro (con cobro por adelantado, el mismo día del inicio).
 */
export function leerPromocion(
  v: unknown,
  precioLista: number,
  primerCobro: string,
  ciclo: "MENSUAL" | "ANUAL",
): { ok: true; promo: Promocion | null } | { ok: false; error: string; detalle: string } {
  if (v == null) return { ok: true, promo: null };
  if (ciclo !== "MENSUAL") {
    return { ok: false, error: "PROMOCION_CICLO_INVALIDO", detalle: "Las promociones son solo para cobro mensual." };
  }
  if (typeof v !== "object") return { ok: false, error: "PROMOCION_INCOMPLETA", detalle: "La promoción lleva precio y fecha de fin." };
  const o = v as Record<string, unknown>;
  const precio = precioValido(o.precio);
  if (precio === null || o.hasta == null || o.hasta === "") {
    return { ok: false, error: "PROMOCION_INCOMPLETA", detalle: "La promoción lleva precio y fecha de fin." };
  }
  if (!fechaValida(o.hasta)) {
    return { ok: false, error: "PROMOCION_FECHA_INVALIDA", detalle: "La fecha de fin de la promoción no existe en el calendario." };
  }
  const hasta = o.hasta;
  if (precio >= precioLista) {
    return { ok: false, error: "PROMOCION_PRECIO_INVALIDO", detalle: "El precio de promoción debe ser menor que el de lista." };
  }
  if (hasta < primerCobro) {
    return { ok: false, error: "PROMOCION_FECHA_INVALIDA", detalle: "La promoción debe durar al menos hasta el primer cobro." };
  }
  const nombre = typeof o.nombre === "string" && o.nombre.trim() ? o.nombre.trim() : null;
  if (nombre && nombre.length > 80) return { ok: false, error: "PROMOCION_NOMBRE_INVALIDO", detalle: "El nombre es de 80 caracteres o menos." };
  return { ok: true, promo: { precio, hasta, nombre } };
}

/**
 * Lo que toca pagar por `n` periodos a partir de `desde` (la fecha de cobro pendiente). Cada periodo
 * se cobra al precio vigente EN SU fecha de cobro —anclada al día de alta, como la calcula la base
 * (`fechaCobro`)—: tres meses pagados de una vez, con la promoción terminando a la mitad, son dos a
 * $499 y uno a $699. En el ciclo anual el precio sigue siendo mensual, así que un periodo son doce.
 * `addonsAlMes` = `totalAddons()` de @vim/db/cobro: lo que paga aparte cada mes.
 */
export function montoPeriodos(s: PrecioSuscripcion & { fecha_inicio: string }, desde: string, n: number, anual: boolean, addonsAlMes = 0): number {
  const paso = anual ? 12 : 1;
  let total = 0;
  // Los add-ons que paga aparte (0147) van en cada mes, al importe de HOY: no tienen fecha de fin
  // pactada como la promoción, así que para los meses que vienen se asume lo que tiene contratado.
  for (let k = 0; k < n; k++) total += (precioVigente(s, fechaCobro(s.fecha_inicio, desde, k * paso)) + addonsAlMes) * paso;
  return Math.round(total * 100) / 100;
}
