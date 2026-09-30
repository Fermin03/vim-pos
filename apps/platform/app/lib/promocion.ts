// Promociones al activar el cobro (0141, ADR 0021).
//
// La base guarda el precio de lista y, encima, la promoción con su fecha de fin; el precio de cada
// día lo decide `precioVigente` (@vim/db/cobro), espejo de `precio_vigente_suscripcion()` en SQL.
// Aquí solo vive cómo se ARMA una promoción desde el formulario del panel.
import { sumarDias, sumarMeses } from "@vim/fecha";
import { precioVigente, type PrecioSuscripcion } from "@vim/db/cobro";
import { precioValido } from "./precio";

/**
 * La oferta del piloto (sitio-web/precios.md): mes 1 gratis —la prueba—, meses 2 a 7 a $499 y del
 * mes 8 en adelante el precio de lista. Solo en Esencial.
 *
 * El cobro se activa al terminar la prueba, o sea al empezar el mes 2, así que la promoción cubre
 * seis periodos desde el inicio del cobro: vale hasta el día ANTERIOR al sexto aniversario
 * (`promocion_hasta` es inclusive). El séptimo cobro ya sale a precio de lista.
 */
export const PILOTO = { nombre: "Piloto 5 negocios", precio: 499, meses: 6, plan: "ESENCIAL" } as const;

export type Promocion = { precio: number; hasta: string; nombre: string | null };

/** La promoción del piloto para un cobro que empieza en `inicio` (`YYYY-MM-DD`). */
export function promocionPiloto(inicio: string): Promocion {
  return { precio: PILOTO.precio, hasta: sumarDias(sumarMeses(inicio, PILOTO.meses), -1), nombre: PILOTO.nombre };
}

/**
 * Valida la promoción que llega en el cuerpo de `suscripcion_activar`. `null` en el cuerpo = sin
 * promoción. Las mismas reglas que `activar_suscripcion` en la base, para contestar con un error
 * claro antes de llamarla (la base las vuelve a comprobar: el servidor no es la única puerta).
 */
export function leerPromocion(
  v: unknown,
  precioLista: number,
  inicio: string,
): { ok: true; promo: Promocion | null } | { ok: false; error: string; detalle: string } {
  if (v == null) return { ok: true, promo: null };
  if (typeof v !== "object") return { ok: false, error: "PROMOCION_INCOMPLETA", detalle: "La promoción lleva precio y fecha de fin." };
  const o = v as Record<string, unknown>;
  const precio = precioValido(o.precio);
  const hasta = typeof o.hasta === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.hasta) ? o.hasta : null;
  if (precio === null || hasta === null) {
    return { ok: false, error: "PROMOCION_INCOMPLETA", detalle: "La promoción lleva precio y fecha de fin." };
  }
  if (precio >= precioLista) {
    return { ok: false, error: "PROMOCION_PRECIO_INVALIDO", detalle: "El precio de promoción debe ser menor que el de lista." };
  }
  if (hasta <= inicio) {
    return { ok: false, error: "PROMOCION_FECHA_INVALIDA", detalle: "La promoción debe terminar después de hoy." };
  }
  const nombre = typeof o.nombre === "string" && o.nombre.trim() ? o.nombre.trim() : null;
  if (nombre && nombre.length > 80) return { ok: false, error: "PROMOCION_NOMBRE_INVALIDO", detalle: "El nombre es de 80 caracteres o menos." };
  return { ok: true, promo: { precio, hasta, nombre } };
}

/**
 * Lo que toca pagar por `n` periodos a partir de `desde` (la fecha de cobro pendiente). Cada periodo
 * se cobra al precio vigente EN SU fecha de cobro: tres meses pagados de una vez, con la promoción
 * terminando a la mitad, son dos a $499 y uno a $699 — no tres a lo que valga hoy. En el ciclo anual
 * el precio sigue siendo mensual, así que un periodo son doce.
 */
export function montoPeriodos(s: PrecioSuscripcion, desde: string, n: number, anual: boolean): number {
  const paso = anual ? 12 : 1;
  let total = 0;
  for (let k = 0; k < n; k++) total += precioVigente(s, sumarMeses(desde, k * paso)) * paso;
  return Math.round(total * 100) / 100;
}
