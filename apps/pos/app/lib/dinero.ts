/**
 * Redondeo a centavos que da lo MISMO que `round(x, 2)` de Postgres sobre `numeric`.
 *
 * Auditoría integral 30/09/2026 (B2-7). `Math.round(n * 100) / 100` falla en los medios centavos
 * porque `n * 100` no es exacto en binario: 1.005 * 100 = 100.49999999999999 → 1.00, mientras la
 * base (numeric, decimal exacto) da 1.01. La vista previa anunciaba un centavo distinto del que
 * se cobraba. Además `Math.round` redondea -0.5 hacia arriba (-0) y Postgres lo aleja del cero.
 *
 * `toPrecision(15)` recorta el ruido binario (15 dígitos significativos son exactos en un double)
 * antes de redondear, y el signo se aparta para redondear "alejándose del cero" como `numeric`.
 */
export function redondearCentavos(n: number): number {
  if (!Number.isFinite(n)) return n;
  const centavos = Math.round(Math.abs(Number((n * 100).toPrecision(15))));
  const r = (Math.sign(n) * centavos) / 100;
  return r === 0 ? 0 : r; // sin -0
}
