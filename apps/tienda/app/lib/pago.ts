// El pago en línea visto desde la tienda: qué formas de pago se ofrecen, la propina que se ENSEÑA
// (la que vale la calcula el servidor con la misma cuenta) y la marca que dice «este carrito es de
// un pedido que salió a pagarse», para vaciarlo solo cuando ese pago quede aprobado. Puro.
import { almacenDelNavegador, guardarCarrito, leerCarrito, vaciar, type Almacen } from "./carrito";
import type { Negocio, Pago, Sucursal } from "./contrato";
import { aCentavos, aTexto } from "./dinero";

/**
 * Las formas de pago de ESTA sucursal, en el orden en que se ofrecen. Con una sola no se pregunta:
 * se informa. En línea solo donde el negocio lo ofrece Y la sucursal puede cobrar ahora (las dos
 * banderas las pone la función; una función que aún no las manda las deja en falso).
 */
export function formasDePago(negocio: Pick<Negocio, "pago_efectivo" | "pago_tarjeta" | "pago_en_linea">, sucursal: Pick<Sucursal, "pago_en_linea">): Pago[] {
  return [
    ...(negocio.pago_efectivo ? ["EFECTIVO" as const] : []),
    ...(negocio.pago_tarjeta ? ["TARJETA" as const] : []),
    ...(negocio.pago_en_linea && sucursal.pago_en_linea ? ["EN_LINEA" as const] : []),
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

/**
 * A dónde se manda al cliente a pagar: SOLO una dirección https de Mercado Pago. Cualquier otra cosa
 * que llegara en ese campo no se sigue (nunca se redirige a ciegas a lo que diga una respuesta).
 */
export function enlaceDePago(x: unknown): string | null {
  if (typeof x !== "string" || x.length > 600) return null;
  try {
    const u = new URL(x);
    return u.protocol === "https:" && /(^|\.)mercadopago\.com(\.[a-z]{2})?$/.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

// ── El carrito de un pedido que salió a pagarse ──────────────────────────────────────────────────
// El carrito NO se vacía al salir a Mercado Pago: si el cliente vuelve atrás, su pedido sigue ahí.
// Se vacía cuando el seguimiento de ESE pedido dice «pagado». Para saber que el carrito guardado es
// el de ese pedido se anota su folio (no su enlace: el código del pedido nunca se guarda).
const claveDePorPagar = (slug: string): string => `vim.tienda.${slug}.porPagar`;

/** Al salir a pagar: este carrito es el del pedido `folio`. */
export function anotarPorPagar(slug: string, folio: string | null, almacen: Almacen | null = almacenDelNavegador()): void {
  try {
    if (folio) almacen?.setItem(claveDePorPagar(slug), folio);
  } catch { /* cuota llena o modo privado: el carrito se quedará; no estorba */ }
}

/**
 * El pedido `folio` ya está pagado: si el carrito guardado era el suyo, se vacía. Un carrito que el
 * cliente armó después (otro pedido) no se toca. Devuelve si lo vació.
 */
export function vaciarSiPagado(slug: string, folio: string, almacen: Almacen | null = almacenDelNavegador()): boolean {
  try {
    if (!almacen || almacen.getItem(claveDePorPagar(slug)) !== folio) return false;
    almacen.removeItem(claveDePorPagar(slug));
    const carrito = leerCarrito(slug, almacen);
    if (carrito) guardarCarrito(slug, vaciar(carrito), almacen);
    return true;
  } catch {
    return false;
  }
}
