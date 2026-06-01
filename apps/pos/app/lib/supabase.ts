"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Cliente público (anon) — para llamar pin-login. Respeta RLS (no ve nada de tenants). */
export const anonClient: SupabaseClient = createClient(URL, ANON, {
  auth: { persistSession: false },
});

export type PinLoginResult = {
  access_token: string;
  usuario: { id: string; nombre: string; tipo_identidad: string };
};

/** Llama la Edge Function pin-login. Lanza Error con el motivo si falla. */
export async function pinLogin(
  usuarioId: string,
  pin: string,
  cajaId: string,
): Promise<PinLoginResult> {
  const res = await fetch(`${URL}/functions/v1/pin-login`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ usuario_id: usuarioId, pin, caja_id: cajaId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as PinLoginResult;
}

/** Cliente autenticado como el empleado (token de pin-login). El RLS lo aísla por tenant. */
export function employeeClient(token: string): SupabaseClient {
  return createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
