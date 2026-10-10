"use client";
import { supabase } from "./supabase";
import { generarState } from "./integraciones";

// Terminal de tarjetas (ADR 0033): el dueño autoriza su cuenta de Mercado Pago y liga cada caja a
// una terminal. El admin nunca ve tokens ni el client secret: todo pasa por terminal-mp-conexion.

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// El id de la aplicación «VIM POS» en Mercado Pago es público (viaja en la URL de autorización).
const CLIENT_ID = "763906729621235";
// Tiene que coincidir letra por letra con la registrada en Mercado Pago y con la de la función.
export const REGRESO_MP = "https://admin.vimpos.com.mx/integraciones/mercado-pago/callback";
const CLAVE_STATE = "vimpos.mp.state";

export type ConexionTerminal = { id: string; cuenta_nombre: string | null; de_prueba: boolean; estado: "ACTIVA" | "ERROR" | "DESCONECTADA"; ultimo_error: string | null };
export type ConfigSucursal = { sucursal_id: string; conexion_id: string; sucursal_id_externo: string | null; imprime_terminal: boolean; espera_segundos: number; propina_en_terminal: boolean };
export type DispositivoTerminal = { caja_id: string; sucursal_id: string; terminal_id_externo: string | null; modo: string | null; activa: boolean };
export type EstadoTerminal = { conexiones: ConexionTerminal[]; config: ConfigSucursal[]; dispositivos: DispositivoTerminal[] };

/** Lo que el negocio tiene conectado (RLS). Las cuentas desconectadas no se muestran. */
export async function leerTerminal(): Promise<EstadoTerminal> {
  const [c, g, d] = await Promise.all([
    supabase.from("terminal_conexiones").select("id, cuenta_nombre, de_prueba, estado, ultimo_error").neq("estado", "DESCONECTADA").order("conectada_at"),
    supabase.from("terminal_config_sucursal").select("sucursal_id, conexion_id, sucursal_id_externo, imprime_terminal, espera_segundos, propina_en_terminal"),
    supabase.from("terminal_dispositivos").select("caja_id, sucursal_id, terminal_id_externo, modo, activa"),
  ]);
  const error = c.error ?? g.error ?? d.error;
  if (error) throw new Error(error.message);
  const conexiones = (c.data ?? []) as ConexionTerminal[];
  const vivas = new Set(conexiones.map((x) => x.id));
  return {
    conexiones,
    config: ((g.data ?? []) as ConfigSucursal[]).filter((x) => vivas.has(x.conexion_id)),
    dispositivos: (d.data ?? []) as DispositivoTerminal[],
  };
}

/** Guarda un state nuevo y devuelve la URL de Mercado Pago a la que hay que mandar al dueño. */
export function iniciarConexionMp(): string {
  const state = generarState();
  sessionStorage.setItem(CLAVE_STATE, state);
  const u = new URL("https://auth.mercadopago.com/authorization");
  u.searchParams.set("client_id", CLIENT_ID);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("platform_id", "mp");
  u.searchParams.set("state", state);
  u.searchParams.set("redirect_uri", REGRESO_MP);
  return u.toString();
}

/** Compara con el state guardado y lo consume: solo vale una vez. */
export function validarStateMp(recibido: string | null): boolean {
  const guardado = sessionStorage.getItem(CLAVE_STATE);
  sessionStorage.removeItem(CLAVE_STATE);
  return Boolean(recibido) && guardado !== null && recibido === guardado;
}

type Accion =
  | { accion: "canjear"; code: string }
  | { accion: "sucursal"; conexion_id: string; sucursal_id: string; latitud: number; longitud: number }
  | { accion: "caja"; caja_id: string }
  | { accion: "terminales"; conexion_id: string }
  | { accion: "modo"; caja_id: string; modo: "PDV" | "STANDALONE" }
  | { accion: "configurar"; sucursal_id: string; imprime_terminal: boolean; espera_segundos: number; propina_en_terminal: boolean }
  | { accion: "desconectar"; conexion_id: string };

export async function accionTerminal(cuerpo: Accion): Promise<Record<string, unknown>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("SESION_INVALIDA");
  let r: Response;
  try {
    r = await fetch(`${URL_SB}/functions/v1/terminal-mp-conexion`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
  } catch { throw new Error("SIN_RED"); }
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(typeof j.error === "string" ? j.error : `HTTP_${r.status}`);
  return j;
}

/**
 * Las coordenadas de lo que el dueño pegue: un enlace largo de Google Maps (`@lat,lng`, `!3d…!4d…`,
 * `q=` / `ll=`) o el par «21.12, -101.68» que da el clic derecho sobre el mapa. Los enlaces cortos
 * (maps.app.goo.gl) no las traen: devuelve null y la pantalla pide el par.
 */
export function coordenadasDe(texto: string): { latitud: number; longitud: number } | null {
  const N = "(-?\\d{1,3}\\.\\d{3,})";
  const patrones = [`!3d${N}!4d${N}`, `[?&](?:q|ll|query|destination)=${N}(?:,|%2C)\\s*${N}`, `@${N},${N}`, `^\\s*${N}\\s*,\\s*${N}\\s*$`];
  for (const p of patrones) {
    const m = new RegExp(p).exec(texto);
    if (!m) continue;
    const latitud = Number(m[1]), longitud = Number(m[2]);
    if (Math.abs(latitud) <= 90 && Math.abs(longitud) <= 180) return { latitud, longitud };
  }
  return null;
}

const MENSAJES: Record<string, string> = {
  SIN_RED: "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.",
  SESION_INVALIDA: "Tu sesión expiró. Vuelve a iniciar sesión.",
  NO_AUTH: "Tu sesión expiró. Vuelve a iniciar sesión.",
  AUTH_INVALIDA: "Tu sesión expiró. Vuelve a iniciar sesión.",
  SIN_PERMISO: "Solo un administrador o el dueño puede conectar la terminal.",
  CANJE_RECHAZADO: "Mercado Pago no aceptó la autorización. Vuelve a pulsar «Conectar Mercado Pago».",
  CONEXION_NO_EXISTE: "Esa cuenta de Mercado Pago ya no está conectada. Vuelve a conectarla.",
  SUCURSAL_NO_EXISTE: "Esa sucursal ya no existe.",
  SUCURSAL_SIN_DIRECCION: "A la sucursal le falta calle, ciudad o estado. Complétalos en Configuración › Sucursales y vuelve.",
  SUCURSAL_SIN_CONECTAR: "Primero elige la cuenta de Mercado Pago de esta sucursal.",
  CAJA_NO_EXISTE: "Esa caja ya no existe o está desactivada.",
  SIN_TERMINAL: "Todavía no hay una terminal ligada a esta caja.",
  MP_ERROR: "Mercado Pago no respondió como se esperaba. Inténtalo de nuevo en unos minutos.",
  MP_NO_CONFIGURADO: "La conexión con Mercado Pago no está disponible por ahora. Escríbenos a soporte.",
};

export function mensajeErrorTerminal(e: unknown): string {
  const codigo = e instanceof Error ? e.message : String(e);
  return MENSAJES[codigo] ?? "Algo salió mal con la terminal. Inténtalo de nuevo.";
}
