// Validación del latido (ADR 0014, entrega 2).
//
// Vive aparte del handler para poder probarla con `node --test`: supabase/functions es código
// Deno y no está en el workspace de pnpm, así que sus módulos puros se prueban con el runner de
// Node (mismo patrón que `_shared/pac` y `_shared/delivery`).

const EMAIL_DISPOSITIVO = /^caja-([0-9a-f-]{36})@dispositivos\.vimpos\.mx$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El dispositivo ES una caja: su id va en el correo sintético (1F §1.1, desktop/src/auth.mjs). */
export function cajaIdDeEmail(email: string | null | undefined): string | null {
  const m = EMAIL_DISPOSITIVO.exec(String(email ?? ""));
  return m ? m[1]!.toLowerCase() : null;
}

export type CuerpoLatido = { version: string | null; so: string | null; avisos_vistos: string[] };

/**
 * Nada del cuerpo llega a SQL sin pasar por aquí. Recorta en vez de rechazar: un SO con un
 * nombre raro no debe costar el latido, que es lo que mantiene viva la señal de la caja y lo
 * que le trae si puede seguir vendiendo.
 */
export function validarCuerpo(x: unknown): CuerpoLatido {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const texto = (v: unknown, max: number): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
  };
  const vistos = Array.isArray(o.avisos_vistos) ? o.avisos_vistos : [];
  return {
    version: texto(o.version, 20),
    so: texto(o.so, 80),
    avisos_vistos: vistos.filter((v): v is string => typeof v === "string" && UUID.test(v)).slice(0, 50),
  };
}
