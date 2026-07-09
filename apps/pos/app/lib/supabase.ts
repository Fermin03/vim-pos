"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Fase 1 (escritorio local-first): en Electron, el preload inyecta el endpoint del gateway
// local (window.__VIM_SUPABASE_URL). En el navegador/nube cae al env de build. Mismo código,
// dos destinos: apuntar a localhost hace que TODO el POS corra offline sin más cambios.
const runtime = typeof window !== "undefined"
  ? (window as unknown as { __VIM_SUPABASE_URL?: string; __VIM_SUPABASE_ANON?: string })
  : undefined;
const URL = runtime?.__VIM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = runtime?.__VIM_SUPABASE_ANON || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Cliente del DISPOSITIVO (caja). Sostiene la sesión base de GoTrue (signInWithPassword
 * con las credenciales de la caja). Su JWT pasa por el Custom Access Token Hook → porta
 * tenant_id + tipo_identidad='DISPOSITIVO'. Persiste para sobrevivir recargas (Parte 1F §2.1).
 * En este cliente NO vive la sesión del empleado: esa se maneja con employeeClient().
 */
export const deviceClient: SupabaseClient = createClient(URL, ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "vimpos.device.session",
  },
});

export type SesionDispositivo = {
  cajaId: string;
  sucursalNombre: string | null;
};

/** Inicia la sesión de dispositivo. Lanza Error si las credenciales fallan. */
export async function deviceSignIn(email: string, password: string): Promise<void> {
  const { error } = await deviceClient.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

/** ¿Hay sesión de dispositivo viva? Devuelve el email del dispositivo o null. */
export async function deviceEmail(): Promise<string | null> {
  const { data } = await deviceClient.auth.getSession();
  return data.session?.user.email ?? null;
}

export async function deviceSignOut(): Promise<void> {
  await deviceClient.auth.signOut();
}

/** Token de la sesión de dispositivo (para el Modo KDS: lee/avanza comandas sin PIN de empleado,
 *  ya que tickets_select/update es por tenant, no por identidad). supabase-js lo auto-refresca. */
export async function deviceToken(): Promise<string | null> {
  const { data } = await deviceClient.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * El caja_id va codificado en el email sintético del dispositivo
 * (`caja-{caja_id}@dispositivos.vimpos.mx`, Parte 1F §1.1). El dispositivo ES una caja.
 */
export function cajaIdFromEmail(email: string): string | null {
  const m = /^caja-([0-9a-f-]{36})@/i.exec(email);
  return m?.[1] ?? null;
}

export type Empleado = { id: string; nombre: string; rol: string };

/**
 * Empleados operativos de la sucursal, leídos bajo la sesión de dispositivo (RLS por
 * tenant: la política acceso_tenant deja al dispositivo ver los accesos de su tenant).
 * Excluye la propia cuenta de dispositivo. Nunca expone pin_hash.
 */
export async function listarEmpleados(): Promise<Empleado[]> {
  // No hay FK directa usuarios_acceso → usuarios_perfil (ambas apuntan a auth.users),
  // así que PostgREST no puede embeber el perfil. Dos queries + join en cliente:
  // 1) accesos activos con su rol (embed a roles SÍ tiene FK directa), excluyendo DISPOSITIVO;
  // 2) los perfiles (nombre) de esos usuarios. Nunca se pide pin_hash.
  const { data: accesos, error: e1 } = await deviceClient
    .from("usuarios_acceso")
    .select("usuario_id, rol:roles(codigo)")
    .eq("activo", true);
  if (e1) throw new Error(e1.message);
  type Acceso = { usuario_id: string; rol: { codigo: string } | null };
  const operativos = ((accesos ?? []) as unknown as Acceso[]).filter(
    (a) => a.rol?.codigo && a.rol.codigo !== "DISPOSITIVO",
  );
  if (operativos.length === 0) return [];

  const rolPorId = new Map(operativos.map((a) => [a.usuario_id, a.rol!.codigo]));
  const { data: perfiles, error: e2 } = await deviceClient
    .from("usuarios_perfil")
    .select("id, nombre, estado")
    .in("id", Array.from(rolPorId.keys()))
    .eq("estado", "ACTIVO");
  if (e2) throw new Error(e2.message);
  type Perfil = { id: string; nombre: string; estado: string };
  return ((perfiles ?? []) as unknown as Perfil[]).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    rol: rolPorId.get(p.id) ?? "PERSONAL",
  }));
}

export type PinLoginResult = {
  access_token: string;
  expires_at: number;
  usuario: { id: string; nombre: string; tipo_identidad: string };
};

/** Llama la Edge Function pin-login (autenticada con el JWT del dispositivo). */
export async function pinLogin(
  usuarioId: string,
  pin: string,
  cajaId: string,
): Promise<PinLoginResult> {
  const { data: sess } = await deviceClient.auth.getSession();
  const deviceToken = sess.session?.access_token ?? ANON;
  const res = await fetch(`${URL}/functions/v1/pin-login`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${deviceToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ usuario_id: usuarioId, pin, caja_id: cajaId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as PinLoginResult;
}

/** Cliente autenticado como el EMPLEADO (token de pin-login). El RLS lo aísla por tenant. */
export function employeeClient(token: string): SupabaseClient {
  return createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** C2 — el propio cajero cambia su PIN (verifica el actual). Errores: PIN_ACTUAL_INCORRECTO, PIN_INVALIDO, PIN_IGUAL. */
export async function cambiarPinPropio(token: string, pinActual: string, pinNuevo: string): Promise<void> {
  const { error } = await employeeClient(token).rpc("cambiar_pin_propio", { p_pin_actual: pinActual, p_pin_nuevo: pinNuevo });
  if (error) throw new Error(error.message);
}

/** Segundos restantes de vida del token de empleado (exp del JWT − ahora). */
export function segundosParaExpirar(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const p = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return (p.exp as number) - Math.floor(Date.now() / 1000);
  } catch {
    return 0;
  }
}
