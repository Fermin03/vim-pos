/**
 * Lo que se teclea en un campo de precio: dígitos y UN punto, con dos decimales como mucho.
 * Antes el filtro dejaba pasar cualquier cantidad de puntos y "1.2.3" llegaba a `Number()` como
 * NaN, con un "Datos inválidos" que no decía qué campo.
 */
export function limpiarPrecio(v: string, { negativo = false } = {}): string {
  const signo = negativo && v.trim().startsWith("-") ? "-" : "";
  const solo = v.replace(/[^0-9.]/g, "");
  const i = solo.indexOf(".");
  if (i < 0) return signo + solo;
  const entero = solo.slice(0, i);
  const decimales = solo.slice(i + 1).replace(/\./g, "").slice(0, 2);
  return `${signo}${entero || "0"}.${decimales}`;
}
