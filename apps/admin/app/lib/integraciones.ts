"use client";
import { supabase, leerSesion } from "./supabase";

// Apps de delivery (spec F1b): estado de las conexiones por sucursal y el flujo OAuth con Uber.
// El admin nunca ve el client secret: el code se canjea en la Edge Function delivery-uber-conexion.

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const CLIENT_ID = process.env.NEXT_PUBLIC_UBER_CLIENT_ID ?? "";
const ENTORNO = process.env.NEXT_PUBLIC_UBER_ENTORNO ?? "sandbox";
export const RUTA_CALLBACK_UBER = "/configuracion/integraciones/uber/callback";
const CLAVE_STATE = "vimpos.uber.state";

export type EstadoConexion = "SIN_CONECTAR" | "PENDIENTE" | "ACTIVA" | "PAUSADA" | "ERROR" | "DESCONECTADA";
export type AppDelivery = "APP_UBEREATS" | "APP_DIDI" | "APP_RAPPI";

export type ConexionApp = {
  id: string; sucursal_id: string; sucursal_nombre: string; app: AppDelivery; estado: EstadoConexion;
  tienda_nombre_app: string | null; auto_aceptar: boolean; tiempo_prep_min: number;
  ultimo_error: string | null; conectada_at: string | null;
};

type Fila = Omit<ConexionApp, "sucursal_nombre"> & { sucursal: { nombre: string } | { nombre: string }[] | null };

/** Conexiones del tenant (RLS). Una fila por sucursal × app, en cualquier estado. */
export async function listarConexiones(): Promise<ConexionApp[]> {
  const { data, error } = await supabase.from("delivery_conexiones")
    .select("id, sucursal_id, app, estado, tienda_nombre_app, auto_aceptar, tiempo_prep_min, ultimo_error, conectada_at, sucursal:sucursales(nombre)")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Fila[]).map((f) => {
    const { sucursal, ...resto } = f;
    const s = Array.isArray(sucursal) ? sucursal[0] : sucursal;
    return { ...resto, sucursal_nombre: s?.nombre ?? "" };
  });
}

/** Auto-aceptar y minutos de preparación se editan directo bajo RLS (la tabla da UPDATE a authenticated). */
export async function actualizarConexion(id: string, cambios: { auto_aceptar?: boolean; tiempo_prep_min?: number }): Promise<void> {
  const { error } = await supabase.from("delivery_conexiones").update(cambios).eq("id", id);
  if (error) throw new Error(error.message);
}

const AUTH = { sandbox: "https://sandbox-login.uber.com", produccion: "https://auth.uber.com" } as const;

/** Misma regla que `_shared/delivery/uber-activacion.ts` (el admin no importa código de Deno). */
export function urlConexionUber(cfg: { entorno: string; clientId: string; redirectUri: string; state: string }): string {
  const u = new URL("/oauth/v2/authorize", cfg.entorno === "produccion" ? AUTH.produccion : AUTH.sandbox);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("scope", "eats.pos_provisioning");
  u.searchParams.set("state", cfg.state);
  return u.toString();
}

/** 128 bits aleatorios en hex: el `state` anti-CSRF del OAuth. */
export function generarState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Guarda un state nuevo y devuelve la URL a la que hay que mandar al dueño. */
export function iniciarConexionUber(): string {
  const state = generarState();
  sessionStorage.setItem(CLAVE_STATE, state);
  const redirectUri = window.location.origin + RUTA_CALLBACK_UBER;
  return urlConexionUber({ entorno: ENTORNO, clientId: CLIENT_ID, redirectUri, state });
}

/** Compara con el state guardado y lo consume: solo vale una vez. */
export function validarState(recibido: string | null): boolean {
  const guardado = sessionStorage.getItem(CLAVE_STATE);
  sessionStorage.removeItem(CLAVE_STATE);
  return Boolean(recibido) && guardado !== null && recibido === guardado;
}

export type TiendaUber = {
  id: string; nombre: string; direccion: string; ciudad: string;
  conectada_a: { sucursal_id: string; sucursal_nombre: string } | null;
};
export type Verificacion = { integracion_activa: boolean; tienda_online: boolean; offline_reason: string | null; detalle: string | null };

export async function accionConexion(accion: "intercambiar", campos: { code: string }): Promise<{ tiendas: TiendaUber[] }>;
export async function accionConexion(accion: "tiendas"): Promise<{ tiendas: TiendaUber[] }>;
export async function accionConexion(accion: "activar", campos: { tienda_id: string; sucursal_id: string; auto_aceptar: boolean; tiempo_prep_min: number; terminos_aceptados: boolean }): Promise<{ conexion_id: string }>;
export async function accionConexion(accion: "pausar" | "reanudar" | "desconectar", campos: { conexion_id: string }): Promise<{ estado: EstadoConexion }>;
export async function accionConexion(accion: "verificar", campos: { conexion_id: string }): Promise<Verificacion>;
export async function accionConexion(accion: string, campos: Record<string, unknown> = {}): Promise<unknown> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("SESION_INVALIDA");
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("SESION_INVALIDA");
  let r: Response;
  try {
    r = await fetch(`${URL_SB}/functions/v1/delivery-uber-conexion`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ accion, ...campos }),
    });
  } catch { throw new Error("SIN_RED"); }
  const j = (await r.json().catch(() => ({}))) as { error?: string; detalle?: string };
  if (!r.ok) {
    const e = new Error(j.error ?? `HTTP_${r.status}`) as Error & { detalle?: string };
    e.detalle = j.detalle;
    throw e;
  }
  return j;
}

const MENSAJES: Record<string, string> = {
  SIN_RED: "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.",
  SESION_INVALIDA: "Tu sesión expiró. Vuelve a iniciar sesión.",
  NO_AUTH: "Tu sesión expiró. Vuelve a iniciar sesión.",
  AUTH_INVALIDA: "Tu sesión expiró. Vuelve a iniciar sesión.",
  SIN_PERMISO: "Solo un administrador o el dueño puede conectar apps de delivery.",
  SIN_AUTORIZACION: "La autorización de Uber venció o no existe. Vuelve a conectar con Uber Eats.",
  SUCURSAL_NO_EXISTE: "Esa sucursal ya no existe.",
  SUCURSAL_YA_CONECTADA: "Esa sucursal ya tiene una tienda de Uber Eats conectada. Desconéctala primero.",
  TIENDA_YA_CONECTADA: "Esa tienda de Uber ya está conectada a otra sucursal.",
  TERMINOS_NO_ACEPTADOS: "Debes autorizar a VIM POS para continuar.",
  CONEXION_NO_EXISTE: "Esa conexión ya no existe.",
  ACCION_INVALIDA: "Esa acción no aplica en el estado actual de la conexión.",
  UBER_ERROR: "Uber no respondió como se esperaba. Inténtalo de nuevo en unos minutos.",
};

export function mensajeErrorIntegracion(e: unknown): string {
  const codigo = e instanceof Error ? e.message : String(e);
  return MENSAJES[codigo] ?? "Algo salió mal con la conexión. Inténtalo de nuevo.";
}

export function etiquetaEstado(estado: EstadoConexion): string {
  return { SIN_CONECTAR: "Sin conectar", PENDIENTE: "Pendiente", ACTIVA: "Activa", PAUSADA: "Pausada", ERROR: "Con error", DESCONECTADA: "Desconectada" }[estado];
}

export function etiquetaApp(app: AppDelivery): string {
  return { APP_UBEREATS: "Uber Eats", APP_DIDI: "DiDi Food", APP_RAPPI: "Rappi" }[app];
}
