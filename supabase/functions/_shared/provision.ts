// Quién puede llamar a provisionar-tenant — decisión pura, probada con `node --test`.
//
// Auditoría integral 30/09/2026 (C2-7). La función aceptaba para siempre la clave compartida del
// arranque (`PLATFORM_PROVISION_KEY` en `X-Platform-Key`), aunque el panel la "retira" en cuanto un
// operador entra con su segundo factor (apps/platform/app/lib/server.ts). Esa retirada solo vale
// dentro del panel: con la clave en la mano, cualquiera podía llamar a la Edge Function directo
// —sin operador, sin 2FA, sin bitácora— y dar de alta negocios.
//
// Ahora la función tiene su PROPIO secreto, `PROVISION_INTERNAL_SECRET`, en la cabecera
// `X-Vim-Provision`. Solo lo conocen el servidor del panel (Vercel) y la función (Supabase): ningún
// humano lo teclea, así que no hay nada que retirar. En cuanto está configurado en la función, la
// clave compartida deja de servir aquí, venga como venga.
//
// Transición (para no cortar el alta de clientes a medio despliegue): mientras
// `PROVISION_INTERNAL_SECRET` NO esté en la función, se acepta la clave compartida como antes, y
// se avisa en el log. El orden de despliegue está en el informe y en provisionar-tenant/index.ts.

export type ModoProvision = "interno" | "legado" | "deshabilitado";

/** Qué secreto manda, según lo que haya configurado en la función. */
export function modoProvision(env: { interno?: string | null; legado?: string | null }): ModoProvision {
  if ((env.interno ?? "").trim()) return "interno";
  if ((env.legado ?? "").trim()) return "legado";
  return "deshabilitado";
}

/** Qué cabecera se compara con qué secreto en cada modo. */
export function cabeceraDeModo(modo: ModoProvision): string | null {
  return modo === "interno" ? "x-vim-provision" : modo === "legado" ? "x-platform-key" : null;
}

/**
 * Comparación en tiempo constante (SEC CN-024). Se hashean los dos lados antes de comparar: así las
 * longitudes nunca difieren y tampoco se filtra el tamaño del secreto. `.trim()` en ambos lados por
 * el salto de línea al pegar el valor en un panel (ver platform/server.ts).
 */
export async function igualSeguro(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a.trim())),
    crypto.subtle.digest("SHA-256", enc.encode(b.trim())),
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i]! ^ y[i]!;
  return dif === 0 && b.trim() !== "";
}
