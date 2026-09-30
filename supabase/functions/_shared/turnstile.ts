// Cloudflare Turnstile del registro público (0142, ADR 0022). Módulo puro: se prueba con
// `node --test` (turnstile.test.ts) pasándole un `fetch` falso.
//
// COMPORTAMIENTO SEGÚN LA CONFIGURACIÓN
//   · Sin `TURNSTILE_SECRET_KEY` en la función: NO se verifica y se avisa en el log. Así funcionan
//     el entorno local y el tiempo entre desplegar esto y que Fermín cree el widget.
//   · Con el secreto: token ausente, inválido, vencido o reusado → rechazo (`CAPTCHA_INVALIDO`).
//     Si Cloudflare no responde también se rechaza: con el secreto puesto, el captcha es un
//     control, y abrirlo cuando falla es justo lo que un bot aprovecharía.
//
// Cómo crear las llaves: docs/operacion/registro-publico.md.

export const TURNSTILE_VERIFICAR = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type ResultadoCaptcha =
  | { ok: true; omitido: boolean }
  | { ok: false; motivo: "SIN_TOKEN" | "RECHAZADO" | "SIN_RESPUESTA"; codigos?: string[] };

type FetchMinimo = (url: string, init: { method: string; body: URLSearchParams; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

export async function verificarTurnstile(args: {
  secreto: string | null | undefined;
  token: unknown;
  /** La IP de confianza (`ipDeLaPeticion`). "desconocida" no se manda. */
  ip?: string | null;
  fetchFn?: FetchMinimo;
  msLimite?: number;
}): Promise<ResultadoCaptcha> {
  const secreto = (args.secreto ?? "").trim();
  if (!secreto) return { ok: true, omitido: true };
  const token = typeof args.token === "string" ? args.token.trim() : "";
  // Los tokens de Turnstile miden ~hasta 2048 caracteres (documentación de Cloudflare).
  if (!token || token.length > 2048) return { ok: false, motivo: "SIN_TOKEN" };

  const cuerpo = new URLSearchParams({ secret: secreto, response: token });
  if (args.ip && args.ip !== "desconocida") cuerpo.set("remoteip", args.ip);
  const f = args.fetchFn ?? (fetch as unknown as FetchMinimo);
  try {
    const r = await f(TURNSTILE_VERIFICAR, {
      method: "POST",
      body: cuerpo,
      signal: AbortSignal.timeout(args.msLimite ?? 5000),
    });
    if (!r.ok) return { ok: false, motivo: "SIN_RESPUESTA" };
    const j = (await r.json()) as { success?: unknown; "error-codes"?: unknown };
    if (j?.success === true) return { ok: true, omitido: false };
    const codigos = Array.isArray(j?.["error-codes"]) ? j["error-codes"].filter((c): c is string => typeof c === "string") : [];
    return { ok: false, motivo: "RECHAZADO", codigos };
  } catch {
    return { ok: false, motivo: "SIN_RESPUESTA" };
  }
}
