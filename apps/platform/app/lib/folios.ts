/** "+50", "50" o "-10" → número; cualquier otra cosa ("5-3", "--2") → null. */
export function leerAjuste(texto: string): number | null {
  const t = texto.trim();
  if (!/^[+-]?\d+$/.test(t)) return null;
  const n = Number(t);
  return n === 0 ? null : n;
}
