// El teléfono es la identidad del cliente en la lealtad (ADR 0030): la nube lo compara por dígitos.
// Vive aparte y sin dependencias porque lo usan clientes-cuenta.ts y clientes-domicilio.ts, y el
// primero ya importa del segundo.

/** Deja solo los dígitos: "477 123-4567" y "(477) 1234567" son el mismo número. */
export function normalizarTelefono(t: string): string {
  return t.replace(/\D/g, "");
}

/** «477 123 4567» para leerlo en pantalla; si no son 10 dígitos, como venga. */
export function telefonoLegible(t: string): string {
  const d = normalizarTelefono(t);
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : t;
}
