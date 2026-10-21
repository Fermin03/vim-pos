"use client";
import { supabase } from "./supabase";
import { generarState } from "./integraciones";
import { REGRESO_MP } from "./terminal";

// La cuenta de Mercado Pago de la TIENDA EN LÍNEA (0173). Es otra aplicación de Mercado Pago que la
// de la terminal («VIM POS Tienda», Pagos online): otra conexión, otra tabla (`tienda_conexiones`) y
// otros tokens. Lo único compartido es la URL de regreso, registrada en las dos aplicaciones, y la
// función que canjea (`terminal-mp-conexion`, que la atiende aparte por `destino`). De la terminal
// aquí no se lee ni se toca nada.
//
// TEXTOS PROVISIONALES: todo lo que aquí lee el dueño lo revisa James antes de publicar.

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// El id de la aplicación «VIM POS Tienda» es público (viaja en la URL de autorización).
const CLIENT_ID = process.env.NEXT_PUBLIC_MP_TIENDA_CLIENT_ID ?? "";
const CLAVE_STATE = "vimpos.mp.tienda.state";
/** El `state` de la tienda empieza así: con eso el regreso sabe a qué producto pertenece la autorización. */
const PREFIJO = "tienda.";
export const REGRESO_TIENDA = "/tienda/pedidos?conectada=1";

export type ConexionTienda = { id: string; cuenta_nombre: string | null; de_prueba: boolean; estado: "ACTIVA" | "ERROR" | "DESCONECTADA"; ultimo_error: string | null };

/** Las cuentas que el negocio conectó para su tienda (RLS: dueño o administrador). Las desconectadas no se muestran. */
export async function leerConexionesTienda(): Promise<ConexionTienda[]> {
  const { data, error } = await supabase.from("tienda_conexiones")
    .select("id, cuenta_nombre, de_prueba, estado, ultimo_error").neq("estado", "DESCONECTADA").order("conectada_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as ConexionTienda[];
}

/** ¿Se puede conectar? Sin el id de la aplicación configurado no hay a dónde mandar al dueño. */
export const conexionTiendaDisponible = (): boolean => CLIENT_ID !== "";

/** Guarda un state nuevo y devuelve la URL de Mercado Pago a la que hay que mandar al dueño. */
export function iniciarConexionTienda(): string {
  const state = PREFIJO + generarState();
  sessionStorage.setItem(CLAVE_STATE, state);
  const u = new URL("https://auth.mercadopago.com/authorization");
  u.searchParams.set("client_id", CLIENT_ID);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("platform_id", "mp");
  u.searchParams.set("state", state);
  u.searchParams.set("redirect_uri", REGRESO_MP);
  return u.toString();
}

/** ¿Ese `state` es de una autorización de la tienda? Solo decide a cuál de los dos flujos conocidos va el regreso. */
export const esStateDeTienda = (recibido: string | null): boolean => recibido !== null && recibido.startsWith(PREFIJO);

/** Compara con el state guardado y lo consume: solo vale una vez. */
export function validarStateTienda(recibido: string | null): boolean {
  const guardado = sessionStorage.getItem(CLAVE_STATE);
  sessionStorage.removeItem(CLAVE_STATE);
  return esStateDeTienda(recibido) && guardado !== null && recibido === guardado;
}

type Accion = { accion: "canjear"; code: string } | { accion: "desconectar"; conexion_id: string };

/** Canjear o desconectar la cuenta de la tienda. Siempre con `destino: "tienda"`: nunca toca la terminal. */
export async function accionConexionTienda(cuerpo: Accion): Promise<Record<string, unknown>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("SESION_INVALIDA");
  let r: Response;
  try {
    r = await fetch(`${URL_SB}/functions/v1/terminal-mp-conexion`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...cuerpo, destino: "tienda" }),
    });
  } catch { throw new Error("SIN_RED"); }
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  // PAGOS_RECIENTES trae hasta cuándo: viaja pegado al código para que el mensaje pueda decirlo.
  if (!r.ok) throw new Error(typeof j.error === "string" ? (j.error === "PAGOS_RECIENTES" && typeof j.hasta === "string" ? `PAGOS_RECIENTES:${j.hasta}` : j.error) : `HTTP_${r.status}`);
  return j;
}

const MENSAJES: Record<string, string> = {
  SIN_RED: "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.",
  SESION_INVALIDA: "Tu sesión expiró. Vuelve a iniciar sesión.",
  NO_AUTH: "Tu sesión expiró. Vuelve a iniciar sesión.",
  AUTH_INVALIDA: "Tu sesión expiró. Vuelve a iniciar sesión.",
  SIN_PERMISO: "Solo un administrador o el dueño puede conectar Mercado Pago.",
  CANJE_RECHAZADO: "Mercado Pago no aceptó la autorización. Vuelve a pulsar «Conectar Mercado Pago».",
  SIN_PUBLIC_KEY: "Mercado Pago no entregó lo necesario para cobrar con tarjeta en tu tienda. Vuelve a intentarlo; si se repite, escríbenos a soporte.",
  CONEXION_NO_EXISTE: "Esa cuenta de Mercado Pago ya no está conectada.",
  PAGOS_PENDIENTES: "No se puede desconectar todavía: hay un pago en línea por confirmar o una devolución sin terminar con esta cuenta, y sin ella ese dinero no se le puede regresar al cliente. Podrás desconectarla cuando terminen; si una devolución lleva más de un día, escríbenos a soporte.",
  PAGOS_RECIENTES: "No se puede desconectar todavía: esta cuenta cobró pedidos en las últimas 48 horas y, si alguno se cancela, la devolución sale de aquí.",
  // Modo de prueba (lo pone VIM, 0178). TEXTOS PROVISIONALES (James).
  CONEXION_DE_PRUEBA: "Esa es la cuenta de prueba de tu tienda: la configura VIM y no se desconecta desde aquí.",
  MODO_DE_PRUEBA: "Tu tienda está en modo de prueba: por ahora no se conecta ninguna cuenta de Mercado Pago desde aquí.",
  CUENTA_DE_PRUEBA: "Esa cuenta de Mercado Pago ya está en tu tienda como cuenta de prueba y no se puede conectar encima. Escríbenos a soporte.",
  MP_NO_CONFIGURADO: "La conexión con Mercado Pago no está disponible por ahora. Escríbenos a soporte.",
};

export function mensajeErrorConexionTienda(e: unknown): string {
  const [codigo = "", ...resto] = (e instanceof Error ? e.message : String(e)).split(":");
  const base = MENSAJES[codigo] ?? "Algo salió mal con Mercado Pago. Inténtalo de nuevo.";
  if (codigo !== "PAGOS_RECIENTES") return base;
  // Cuándo sí: 48 horas después del último cobro, en la hora del centro de México.
  const hasta = new Date(resto.join(":"));
  return Number.isNaN(hasta.getTime()) ? base
    : `${base} Podrás desconectarla a partir del ${hasta.toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true })}.`;
}
