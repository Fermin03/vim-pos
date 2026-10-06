// El teléfono es la identidad del cliente en la lealtad (ADR 0030): la nube lo compara por dígitos.
// Vive aparte y sin dependencias porque lo usan clientes-cuenta.ts y clientes-domicilio.ts, y el
// primero ya importa del segundo.

/** Deja solo los dígitos: "477 123-4567" y "(477) 1234567" son el mismo número. */
export function normalizarTelefono(t: string): string {
  return t.replace(/\D/g, "");
}
