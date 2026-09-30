"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON } from "./runtime";
import { correoAlternoDispositivo } from "@vim/db/dispositivo";

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
