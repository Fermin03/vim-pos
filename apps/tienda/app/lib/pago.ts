// El pago en línea visto desde la tienda: qué formas de pago se ofrecen y la propina que se ENSEÑA
// (la que vale la calcula el servidor con la misma cuenta). La tarjeta está en tarjeta.ts. Puro.
import type { Negocio, Pago, Sucursal } from "./contrato";
import { aCentavos, aTexto } from "./dinero";

/**
 * Las formas de pago de ESTA sucursal, en el orden en que se ofrecen. Con una sola no se pregunta:
 * se informa. En línea solo donde el negocio lo ofrece, la sucursal puede cobrar ahora (las dos
 * banderas las pone la función; una función que aún no las manda las deja en falso) Y viene la
 * public key de la cuenta que cobra: sin ella no hay cómo leer la tarjeta.
 */
export function formasDePago(negocio: Pick<Negocio, "pago_efectivo" | "pago_tarjeta" | "pago_en_linea">, sucursal: Pick<Sucursal, "pago_en_linea" | "public_key">): Pago[] {
  return [
    ...(negocio.pago_efectivo ? ["EFECTIVO" as const] : []),
    ...(negocio.pago_tarjeta ? ["TARJETA" as const] : []),
    ...(negocio.pago_en_linea && sucursal.pago_en_linea && sucursal.public_key ? ["EN_LINEA" as const] : []),
  ];
}

/** Las propinas que se ofrecen al pagar en línea, en por ciento de los productos. Las mismas que acepta la función. */
export const PROPINAS = [0, 10, 15, 20] as const;
export type Propina = (typeof PROPINAS)[number];

/**
 * La propina de un porcentaje sobre el subtotal de productos (sin envío), como texto con dos
 * decimales. En centavos enteros y redondeando el medio centavo hacia arriba, igual que la base
 * (`ROUND(subtotal × pct / 100, 2)`). null si el subtotal no es un importe.
 */
export function propinaDe(subtotal: string, pct: Propina): string | null {
  const c = aCentavos(subtotal);
  if (c === null || c < 0) return null;
  // (c × pct + 50) / 100, todo en enteros: sin flotantes de por medio.
  return aTexto(Math.floor((c * pct + 50) / 100));
}

/** Total del pedido + propina = lo que se va a cobrar. null si alguno no es un importe. */
export function totalAPagar(total: string, propina: string | null): string | null {
  const t = aCentavos(total), p = propina === null ? 0 : aCentavos(propina);
  return t === null || p === null ? null : aTexto(t + p);
}
