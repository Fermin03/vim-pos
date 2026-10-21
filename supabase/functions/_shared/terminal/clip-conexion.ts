// Lo que el admin le pide a terminal-clip-conexion. Módulo puro (node --test).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string | null => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);
// ASCII imprimible sin espacios: van en Basic auth por `btoa`, que truena con lo que no es Latin-1.
const clave = (v: unknown): v is string => typeof v === "string" && /^[\x21-\x7E]{1,200}$/.test(v);

/** La API key y la clave secreta del Panel de Desarrollador de Clip, tal cual (sin espacios, ≤ 200). */
export function validarCredenciales(crudo: unknown): { ok: true; api_key: string; secreto: string } | { ok: false; error: string } {
  const b = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  return clave(b.api_key) && clave(b.secreto) ? { ok: true, api_key: b.api_key, secreto: b.secreto } : { ok: false, error: "FALTAN_CAMPOS" };
}

export type Configuracion = {
  sucursal_id: string; imprime_terminal: boolean; espera_segundos: number; propina_opciones: number[] | null;
  /** El cliente elige la propina en el lector (con `propina_opciones`). */
  propina_en_terminal: boolean;
};

/**
 * Espera de 60 s (el minuto que Clip suma solo) a 3 h. Propinas: de 1 a 3 porcentajes enteros de 1 a
 * 100, o null; la propina en el lector no se enciende sin al menos un porcentaje.
 */
export function validarConfiguracion(crudo: unknown): ({ ok: true } & Configuracion) | { ok: false; error: string } {
  const b = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const sucursal_id = uuid(b.sucursal_id);
  const espera = b.espera_segundos;
  if (!sucursal_id || typeof b.imprime_terminal !== "boolean" || typeof b.propina_en_terminal !== "boolean" || typeof espera !== "number"
    || !Number.isInteger(espera) || espera < 60 || espera > 10800) return { ok: false, error: "FALTAN_CAMPOS" };
  const p = b.propina_opciones ?? null;
  if (p !== null && !(Array.isArray(p) && p.length >= 1 && p.length <= 3
    && p.every((x) => typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= 100))) return { ok: false, error: "PROPINA_INVALIDA" };
  if (b.propina_en_terminal && p === null) return { ok: false, error: "PROPINA_SIN_PORCENTAJES" };
  return {
    ok: true, sucursal_id, imprime_terminal: b.imprime_terminal, espera_segundos: espera,
    propina_opciones: p as number[] | null, propina_en_terminal: b.propina_en_terminal,
  };
}

/** Clip suma un minuto fijo al `timeout_seg` del lector. */
export const timeoutDelLector = (esperaSeg: number): number => Math.max(esperaSeg - 60, 0);

/** `cuenta_id_externo`: sha256 hex de la API key. La clave nunca se guarda fuera de Vault. */
export async function cuentaDeClave(apiKey: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const nombreDeCuenta = (apiKey: string): string => `Clip ····${apiKey.slice(-4)}`;
