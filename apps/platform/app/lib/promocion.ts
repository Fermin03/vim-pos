// Promociones al activar el cobro (0141, ADR 0021).
//
// La base guarda el precio de lista y, encima, la promoción con su fecha de fin; el precio de cada
// día lo decide `precioVigente` (@vim/db/cobro), espejo de `precio_vigente_suscripcion()` en SQL.
// Aquí solo vive cómo se ARMA una promoción desde el formulario del panel.
//
// EL COBRO ES POR ADELANTADO (decisión de Fermín, 30/09/2026): al activar, el primer cobro vence el
// mismo día (se paga el mes que empieza). Los cobros caen en inicio, inicio+1 mes, inicio+2…
import { sumarDias, sumarMeses } from "@vim/fecha";
import { precioVigente, rebajaDescuento, type PrecioSuscripcion } from "@vim/db/cobro";
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
  // El descuento (0289) se decide como la promoción: por la fecha de cada cobro.
  for (let k = 0; k < n; k++) {
    const f = fechaCobro(s.fecha_inicio, desde, k * paso);
    const mes = precioVigente(s, f) + addonsAlMes;
    total += (mes - rebajaDescuento(s, mes, f)) * paso;
  }
  return Math.round(total * 100) / 100;
}

// ── Descuento al cobro final (0289) ─────────────────────────────────────────────────────────────

export type Descuento = { tipo: "PORCENTAJE" | "IMPORTE"; valor: number; desde: string; hasta: string | null };

/**
 * Arma el descuento que llega del panel. Tres formas, que en la base quedan en dos (rango o sin fin):
 *
 *   · COBROS     — los próximos N cobros, contando el pendiente. Vale desde hoy (o desde el cobro
 *                  vencido, si lo hay) hasta el día antes del cobro N+1.
 *   · RANGO      — los cobros que caigan entre `desde` y `hasta`, inclusive.
 *   · INDEFINIDO — desde `desde` (hoy si no viene), sin fin, hasta que alguien lo quite.
 *
 * La base vuelve a comprobar tipo, valor y fechas con sus CHECK.
 */
export function leerDescuento(
  b: Record<string, unknown>,
  s: { fecha_inicio: string; proxima_fecha_cobro: string | null; ciclo_facturacion?: string | null },
  hoy: string,
): { ok: true; descuento: Descuento } | { ok: false; error: string; detalle: string } {
  const mal = (error: string, detalle: string) => ({ ok: false as const, error, detalle });
  const tipo = b.tipo;
  if (tipo !== "PORCENTAJE" && tipo !== "IMPORTE") return mal("DESCUENTO_TIPO_INVALIDO", "Elige porcentaje o importe.");
  const valor = precioValido(b.valor);
  if (valor === null || valor <= 0) return mal("DESCUENTO_VALOR_INVALIDO", "El descuento tiene que ser mayor a cero.");
  if (tipo === "PORCENTAJE" && valor > 100) return mal("DESCUENTO_VALOR_INVALIDO", "Un porcentaje va de 1 a 100.");

  if (b.forma === "COBROS") {
    const n = Number(b.cobros);
    if (!Number.isInteger(n) || n < 1 || n > 36) return mal("DESCUENTO_COBROS_INVALIDO", "Elige de 1 a 36 cobros.");
    const proxima = (s.proxima_fecha_cobro ?? hoy).slice(0, 10);
    const paso = s.ciclo_facturacion === "ANUAL" ? 12 : 1;
    const desde = proxima < hoy ? proxima : hoy;
    return { ok: true, descuento: { tipo, valor, desde, hasta: sumarDias(fechaCobro(s.fecha_inicio, proxima, n * paso), -1) } };
  }
  const desde = b.desde == null || b.desde === "" ? hoy : b.desde;
  if (!fechaValida(desde)) return mal("DESCUENTO_FECHA_INVALIDA", "La fecha de inicio no existe en el calendario.");
  if (b.forma === "INDEFINIDO") return { ok: true, descuento: { tipo, valor, desde, hasta: null } };
  if (b.forma !== "RANGO") return mal("DESCUENTO_FORMA_INVALIDA", "Elige por cobros, por fechas o sin fecha de fin.");
  if (!fechaValida(b.hasta)) return mal("DESCUENTO_FECHA_INVALIDA", "La fecha de fin no existe en el calendario.");
  if (b.hasta < desde) return mal("DESCUENTO_FECHA_INVALIDA", "La fecha de fin va después de la de inicio.");
  if (b.hasta < hoy) return mal("DESCUENTO_FECHA_INVALIDA", "Ese rango ya pasó.");
  return { ok: true, descuento: { tipo, valor, desde, hasta: b.hasta } };
}
