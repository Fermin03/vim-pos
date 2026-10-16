// EAN-13 sin librerías (decisión de la entrega 2: el repo evita dependencias). Lo usan las etiquetas
// y la validación de lo que el dueño escribe. Otros formatos (Code 128) cuando un cliente los pida.

const PESOS = (i: number) => (i % 2 === 0 ? 1 : 3);

export function digitoEan13(doce: string): string {
  const s = [...doce].reduce((a, d, i) => a + Number(d) * PESOS(i), 0);
  return String((10 - (s % 10)) % 10);
}

export const esEan13 = (c: string): boolean => /^\d{13}$/.test(c) && digitoEan13(c.slice(0, 12)) === c[12];

/** EAN-13 válido tal cual, o UPC-A (12 dígitos) con un 0 adelante. Cualquier otra cosa: null. */
export function normalizarEan(c: string): string | null {
  const t = c.trim();
  const trece = /^\d{12}$/.test(t) ? "0" + t : t;
  return esEan13(trece) ? trece : null;
}

// Patrones L, G y R por dígito, y la paridad de la primera mitad según el primer dígito.
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = L.map((p) => [...p].reverse().map((b) => (b === "1" ? "0" : "1")).join(""));
const R = L.map((p) => [...p].map((b) => (b === "1" ? "0" : "1")).join(""));
const PARIDAD = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** Las 95 barras (1 = negra) de un EAN-13 ya válido. */
export function modulosEan13(trece: string): string {
  if (!esEan13(trece)) throw new Error("modulosEan13: el código no es EAN-13");
  const d = [...trece].map(Number);
  const par = PARIDAD[d[0]!]!;
  const izq = d.slice(1, 7).map((n, i) => (par[i] === "L" ? L[n] : G[n])).join("");
  const der = d.slice(7).map((n) => R[n]).join("");
  return "101" + izq + "01010" + der + "101";
}
