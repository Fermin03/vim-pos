// Cloudflare Turnstile del registro público (0142, ADR 0022). Módulo puro: se prueba con
// `node --test` (turnstile.test.ts) pasándole un `fetch` falso.
//
// FAIL-CLOSED
//   · Sin `TURNSTILE_SECRET_KEY`: se RECHAZA (`NO_CONFIGURADO` → 503 CAPTCHA_NO_CONFIGURADO). Un
//     secreto que se cae de la configuración no puede abrir el registro a los bots en silencio.
//     Solo con `CAPTCHA_OPCIONAL=1` (local y desarrollo, NUNCA en producción) se omite.
//   · Con el secreto: token ausente, inválido, vencido o reusado → rechazo. También si Cloudflare
//     no responde, y si el token se emitió para OTRO dominio (`TURNSTILE_HOSTNAMES`) o para otra
//     acción ("registro" / "reenvio"): un token resuelto en otro sitio o para el reenvío no sirve
//     para dar de alta.
//
// Cómo crear las llaves: docs/operacion/registro-publico.md.

export const TURNSTILE_VERIFICAR = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const HOSTNAMES_POR_DEFECTO = ["admin.vimpos.com.mx"];

export type AccionCaptcha = "registro" | "reenvio" | "tienda_pedido";

export type ResultadoCaptcha =
  | { ok: true; omitido: boolean }
  | {
      ok: false;
      motivo: "NO_CONFIGURADO" | "SIN_TOKEN" | "RECHAZADO" | "SIN_RESPUESTA" | "HOSTNAME" | "ACCION";
      codigos?: string[];
    };

type FetchMinimo = (url: string, init: { method: string; body: URLSearchParams; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

/** "admin.vimpos.com.mx, localhost" → ["admin.vimpos.com.mx", "localhost"]; vacío → el de producción. */
export function hostnamesPermitidos(v: string | null | undefined): string[] {
  const xs = (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return xs.length ? xs : HOSTNAMES_POR_DEFECTO;
}

export async function verificarTurnstile(args: {
  secreto: string | null | undefined;
  /** `CAPTCHA_OPCIONAL=1`: sin secreto se deja pasar. Solo local/desarrollo. */
  opcional?: boolean;
  token: unknown;
  /** La acción que el widget debió declarar ("registro" o "reenvio"). */
  accion: AccionCaptcha;
  hostnames?: string[];
  /** La IP de confianza (`ipDeLaPeticion`). "desconocida" no se manda. */
  ip?: string | null;
  fetchFn?: FetchMinimo;
  msLimite?: number;
}): Promise<ResultadoCaptcha> {
  const secreto = (args.secreto ?? "").trim();
  if (!secreto) return args.opcional ? { ok: true, omitido: true } : { ok: false, motivo: "NO_CONFIGURADO" };
  const token = typeof args.token === "string" ? args.token.trim() : "";
  // Los tokens de Turnstile miden hasta 2048 caracteres (documentación de Cloudflare).
  if (!token || token.length > 2048) return { ok: false, motivo: "SIN_TOKEN" };

  const cuerpo = new URLSearchParams({ secret: secreto, response: token });
  if (args.ip && args.ip !== "desconocida") cuerpo.set("remoteip", args.ip);
  const f = args.fetchFn ?? (fetch as unknown as FetchMinimo);
  let j: { success?: unknown; "error-codes"?: unknown; hostname?: unknown; action?: unknown };
  try {
    const r = await f(TURNSTILE_VERIFICAR, {
      method: "POST",
      body: cuerpo,
      signal: AbortSignal.timeout(args.msLimite ?? 5000),
    });
    if (!r.ok) return { ok: false, motivo: "SIN_RESPUESTA" };
    j = ((await r.json()) ?? {}) as typeof j;
  } catch {
    return { ok: false, motivo: "SIN_RESPUESTA" };
  }
  if (j.success !== true) {
    const codigos = Array.isArray(j["error-codes"]) ? j["error-codes"].filter((c): c is string => typeof c === "string") : [];
    return { ok: false, motivo: "RECHAZADO", codigos };
  }
  const host = typeof j.hostname === "string" ? j.hostname.toLowerCase() : "";
  if (!(args.hostnames ?? HOSTNAMES_POR_DEFECTO).includes(host)) return { ok: false, motivo: "HOSTNAME" };
  if (j.action !== args.accion) return { ok: false, motivo: "ACCION" };
  return { ok: true, omitido: false };
}
