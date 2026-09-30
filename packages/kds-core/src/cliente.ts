"use client";
import { createClient, isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON } from "./runtime";
import { correoAlternoDispositivo } from "@vim/db/dispositivo";

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Límite de las llamadas de auth. Menor que el TIMEOUT_MS del arranque de apps/kds (7 s), para
 *  que la llamada se aborte —y supabase-js suelte su candado— antes de que la pantalla se rinda. */
export const TIMEOUT_AUTH_MS = 6000;

/**
 * `fetch` que ABORTA las llamadas de /auth/v1 que tarden más de `ms` (SEC CN-006, B2-5).
 *
 * getSession() y el refresh de supabase-js no aceptan timeout: con el hub caído, el refresh del
 * arranque se quedaba esperando para siempre con el candado de auth tomado, y todo getSession()
 * posterior se formaba detrás. Por eso la cocina re-logueaba con la contraseña guardada en cada
 * arranque. Abortado, auth-js lo reporta como AuthRetryableFetchError: CONSERVA la sesión, suelta
 * el candado, y `sesionDispositivo()` lo traduce a "reconectando".
 *
 * Solo toca /auth/v1: las lecturas de comandas siguen como estaban.
 */
export function fetchConTimeoutAuth(ms: number = TIMEOUT_AUTH_MS, base: Fetch = (i, n) => fetch(i, n)): Fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/auth/v1/") || init?.signal) return base(input, init);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(new Error("timeout")), ms);
    try {
      return await base(input, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };
}

/**
 * Cliente del DISPOSITIVO (caja/cocina). Sostiene la sesión base (signInWithPassword con las
 * credenciales del dispositivo). Su JWT porta tenant_id + tipo_identidad='DISPOSITIVO'. Persiste
 * para sobrevivir recargas. La cocina lo usa para leer/avanzar comandas SIN PIN de empleado
 * (tickets_select/update es por tenant, no por identidad).
 */
export const deviceClient: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "vimpos.device.session",
  },
  global: { fetch: fetchConTimeoutAuth() },
});

/** Inicia la sesión de dispositivo. Lanza Error si las credenciales fallan. Devuelve el correo
 *  con el que entró: si el apuntado es de una cuenta que ya cambió de dominio (vimpos.mx →
 *  vimpos.com.mx), se prueba el otro y se devuelve ése (ver @vim/db/dispositivo). */
export async function deviceSignIn(email: string, password: string): Promise<string> {
  const { error } = await deviceClient.auth.signInWithPassword({ email, password });
  if (!error) return email;
  const otro = correoAlternoDispositivo(email);
  if (otro && !(await deviceClient.auth.signInWithPassword({ email: otro, password })).error) return otro;
  throw new Error(error.message);
}

/** ¿Hay sesión de dispositivo viva? Devuelve el email del dispositivo o null. */
export async function deviceEmail(): Promise<string | null> {
  const { data } = await deviceClient.auth.getSession();
  return data.session?.user.email ?? null;
}

/** El hub no respondió (red, timeout, 5xx): la sesión guardada sigue ahí, hay que reintentar. */
export class ErrorHubSinRespuesta extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorHubSinRespuesta";
  }
}

/**
 * Sesión de dispositivo persistida, para el arranque de la cocina (B2-5).
 *
 * - `{ email, token }` si hay sesión viva (refrescándola si hacía falta).
 * - `null` si NO hay sesión, o si el hub la rechazó: hay que vincular.
 * - Lanza `ErrorHubSinRespuesta` si el hub no contestó: la sesión se conserva y el llamador
 *   reintenta, en vez de mandar a la tele a pedir una contraseña que nadie tiene a la mano.
 */
export async function sesionDispositivo(): Promise<{ email: string; token: string } | null> {
  const { data, error } = await deviceClient.auth.getSession();
  if (error) {
    if (isAuthRetryableFetchError(error)) throw new ErrorHubSinRespuesta(error.message);
    return null;
  }
  const s = data.session;
  if (!s?.user.email) return null;
  return { email: s.user.email, token: s.access_token };
}

export async function deviceSignOut(): Promise<void> {
  await deviceClient.auth.signOut();
}

/** Token de la sesión de dispositivo (para leer/avanzar comandas sin PIN). supabase-js lo auto-refresca. */
export async function deviceToken(): Promise<string | null> {
  const { data } = await deviceClient.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * El caja_id va codificado en el email sintético del dispositivo
 * (`caja-{caja_id}@dispositivos.vimpos.com.mx`). El dispositivo ES una caja.
 */
export function cajaIdFromEmail(email: string): string | null {
  const m = /^caja-([0-9a-f-]{36})@/i.exec(email);
  return m?.[1] ?? null;
}

/** Cliente autenticado con un token (device o empleado). El RLS lo aísla por tenant. */
export function clienteConToken(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
