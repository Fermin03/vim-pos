"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { urlApp } from "@vim/db/apps";

/**
 * Sesión del colaborador en /mi-agenda (su celular): correo y contraseña de GoTrue, guardada como
 * la del admin. Nada que ver con la caja: ni credenciales del dispositivo ni PIN, y su propia llave
 * de almacenamiento para no pisar la sesión del dispositivo si el mismo navegador es una caja.
 * Siempre contra la nube (NEXT_PUBLIC_SUPABASE_URL), nunca contra el backend local del escritorio.
 * Con este token la RLS no le deja leer citas ni clientas (0228): todo va por las RPC mi_*.
 */
export const LLAVE_SESION_COLABORADOR = "vimpos.colaborador.session";

let cliente: SupabaseClient | null = null;
export function clienteColaborador(): SupabaseClient {
  cliente ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: LLAVE_SESION_COLABORADOR },
  });
  return cliente;
}

export const MENSAJE_CREDENCIALES = "Correo o contraseña incorrectos";
export const MENSAJE_SIN_AGENDA = "Esta cuenta no tiene agenda. Pídele acceso al negocio.";

/** Lo que se revisa antes de mandar: null si está bien. */
export function validarEntrada(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Escribe un correo válido";
  if (!password) return "Escribe tu contraseña";
  return null;
}

/** El error de GoTrue o de mi_agenda, en palabras de quien entra. */
export function mensajeEntrada(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (msg.startsWith("SIN_AGENDA")) return MENSAJE_SIN_AGENDA;
  if (/invalid login credentials|invalid_credentials|email not confirmed/i.test(msg)) return MENSAJE_CREDENCIALES;
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return "No hay conexión. Revisa tu internet e inténtalo de nuevo.";
  return "No se pudo entrar. Inténtalo de nuevo.";
}

/** Un día del calendario (YYYY-MM-DD) en México. */
export const diaMx = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

/** Lanza Error con el mensaje de GoTrue o de la RPC (SIN_AGENDA: …). */
async function comprobarAgenda(): Promise<void> {
  const hoy = diaMx();
  const { error } = await clienteColaborador().rpc("mi_agenda", { p_desde: hoy, p_hasta: hoy });
  if (error) throw new Error(error.message);
}

/** Entra y comprueba que la cuenta sea de un colaborador con agenda; si no, cierra la sesión. */
export async function entrarColaborador(email: string, password: string): Promise<void> {
  const sb = clienteColaborador();
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);
  try {
    await comprobarAgenda();
  } catch (e) {
    await sb.auth.signOut();
    throw e;
  }
}

/** ¿Hay sesión guardada? Devuelve el correo o null. */
export async function sesionColaborador(): Promise<string | null> {
  const { data } = await clienteColaborador().auth.getSession();
  return data.session?.user.email ?? null;
}

export async function salirColaborador(): Promise<void> {
  await clienteColaborador().auth.signOut();
}

/** «Olvidé mi contraseña»: la misma página de recuperación del admin; su enlace pone la contraseña
 *  en /establecer-acceso y de ahí manda a /mi-agenda. */
export const enlaceRecuperar = (hostname: string) => `${urlApp("admin", hostname)}/recuperar`;
