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

/** Lo que el cliente escribe en «¿Con cuánto pagas?» («500», «$1,000.5») → centavos, o null. */
export function leerImporte(entrada: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(entrada.replace(/[\s$,]/g, ""));
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}
