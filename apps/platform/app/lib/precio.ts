/**
 * Precio mensual que llega del cuerpo de una petición del panel (suscripción, add-on).
 *
 * Antes se hacía `Number(body.precio)` y se guardaba lo que saliera: `-1` rompía el CHECK de la
 * base a mitad de una operación de varios pasos, `"abc"` era NaN, y `""` o `false` se volvían un
 * $0 silencioso. Auditoría integral 30/09/2026, hallazgo E-3.
 *
 * Devuelve el importe (pesos, hasta dos decimales, de 0 al máximo de `numeric(10,2)`) o null si
 * no es un precio. Solo números o texto numérico: un booleano o un objeto no son precios.
 */
export const PRECIO_MAXIMO = 99_999_999.99;

export function precioValido(v: unknown): number | null {
  if (typeof v !== "number" && typeof v !== "string") return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > PRECIO_MAXIMO) return null;
  // Más de dos decimales no es un importe en pesos (y la base lo redondearía sin decir nada).
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return null;
  return Math.round(n * 100) / 100;
}
