// Dinero de la tienda. Llega como texto con dos decimales («120.00») y aquí se trabaja SIEMPRE en
// centavos enteros: 0.1 + 0.2 no es 0.3 en flotante, y 19.99 × 100 tampoco es 1999.

const IMPORTE = /^(-?)(\d+)\.(\d{2})$/;

/** «1234.50» → 123450. Lo que no sea un importe con dos decimales exactos es null. */
export function aCentavos(texto: string): number | null {
  const m = IMPORTE.exec(texto);
  if (!m) return null;
  const n = Number(m[2]) * 100 + Number(m[3]);
  return m[1] ? -n : n;
}

/** 123450 → «1234.50»: la forma en que la función espera `paga_con` y `total_esperado`. */
export function aTexto(centavos: number): string {
  const n = Math.abs(Math.round(centavos));
  return `${centavos < 0 ? "-" : ""}${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")}`;
}

/** 123450 → «$1,234.50». */
export function formato(centavos: number): string {
  const [pesos, cents] = aTexto(Math.abs(centavos)).split(".") as [string, string];
  return `${centavos < 0 ? "-" : ""}$${pesos.replace(/\B(?=(\d{3})+$)/g, ",")}.${cents}`;
}

/** Un importe del contrato listo para pintar: «1234.50» → «$1,234.50». Si no es un importe, nada. */
export function formatoMxn(texto: string): string {
  const c = aCentavos(texto);
  return c === null ? "" : formato(c);
}

/**
 * Lo que el cliente escribe en «¿Con cuánto pagas?» → centavos, o null si no se entiende.
 * El punto siempre es decimal («500», «500.5», «$1,000.50»). La coma se lee por lo que trae detrás:
 *  · una o dos cifras y nada más («100,5», «100,50») → coma decimal: 100.50;
 *  · grupos de tres exactos («1,234», «12,345,678», «1,234.5») → separador de miles.
 * Lo que no es ninguna de las dos («1,2345», «1.234,5») es null: con dinero no se adivina.
 */
export function leerImporte(entrada: string): number | null {
  const t = entrada.replace(/[\s$]/g, "");
  const limpio = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t) ? t.replace(/,/g, "") : /^\d+,\d{1,2}$/.test(t) ? t.replace(",", ".") : t;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(limpio);
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}
