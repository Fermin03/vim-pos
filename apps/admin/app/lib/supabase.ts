"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Cliente del ADMIN web. Sesión de GoTrue (email/password). Su JWT pasa por el
 * Custom Access Token Hook → porta tenant_id + tipo_identidad='ADMIN_WEB'. El RLS
 * aísla por tenant; las acciones server-side validan permisos por rol (doc 09).
 * Persiste para sobrevivir recargas.
 */
export const supabase: SupabaseClient = createClient(URL, ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "vimpos.admin.session",
  },
});

export type Sesion = {
  email: string;
  tenantId: string | null;
  tipoIdentidad: string | null;
};

/** Lee la sesión actual y extrae los claims del JWT (tenant_id, tipo_identidad). */
export async function leerSesion(): Promise<Sesion | null> {
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  if (!s) return null;
  let tenantId: string | null = null;
  let tipoIdentidad: string | null = null;
  try {
    const payload = s.access_token.split(".")[1];
    if (payload) {
      const c = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
      tenantId = c.tenant_id ?? null;
      tipoIdentidad = c.tipo_identidad ?? null;
    }
  } catch {
    /* ignore */
  }
  return { email: s.user.email ?? "", tenantId, tipoIdentidad };
}

/** Login con email/password. Lanza Error con mensaje si falla. */
export async function entrar(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function salir(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Fija/cambia la contraseña del usuario de la sesión actual. Se usa tanto en el
 * aterrizaje de la invitación (el link de Supabase ya dejó una sesión) como en
 * "cambiar contraseña" dentro del panel. Lanza Error con mensaje si falla.
 */
export async function establecerPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}
