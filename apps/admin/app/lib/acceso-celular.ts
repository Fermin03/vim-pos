"use client";
import { urlApp } from "@vim/db/apps";
import { supabase } from "./supabase";
import { hoyISO } from "./fechas";

/**
 * «Dar acceso a su celular» (Colaboradores). El colaborador ya tiene cuenta (crear-empleado la abre
 * con su correo y una contraseña al azar); el acceso es el correo de recuperación de siempre, que
 * aterriza en /establecer-acceso: ahí pone su contraseña y se le manda a /mi-agenda del POS.
 */

export type AccesoColaborador = { email: string; ultimoAcceso: string | null };

/** Correo y último acceso de cada colaborador activo (0228, solo dueño o administrador). */
export async function listarAccesos(): Promise<Map<string, AccesoColaborador>> {
  const { data, error } = await supabase.rpc("agenda_accesos_colaboradores");
  if (error) throw new Error(error.message);
  type Fila = { usuario_id: string; email: string; ultimo_acceso: string | null };
  return new Map(((data ?? []) as Fila[]).map((r) => [r.usuario_id, { email: r.email, ultimoAcceso: r.ultimo_acceso }]));
}

/** A dónde lleva el enlace del correo: la página del admin que pone la contraseña. */
export const destinoEnlace = (origenAdmin: string) => `${origenAdmin}/establecer-acceso`;

/** La agenda del colaborador en el POS. */
export const enlaceMiAgenda = (hostname: string) => `${urlApp("pos", hostname)}/mi-agenda`;

export async function darAccesoCelular(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: destinoEnlace(window.location.origin) });
  if (error) {
    // GoTrue deja pedir un correo por minuto a cada cuenta.
    if (/seconds|rate limit/i.test(error.message)) throw new Error("Ya se le mandó un correo hace un momento. Espera un minuto para reenviarlo.");
    throw new Error(error.message);
  }
}

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" });

export type BotonAcceso =
  | { visible: false }
  | { visible: true; habilitado: boolean; texto: string; ultimo: string };

/** Qué muestra cada colaborador: solo el activo con cuenta recibe el correo. */
export function botonAcceso(activo: boolean, acceso: AccesoColaborador | undefined, enviado: boolean): BotonAcceso {
  if (!activo) return { visible: false };
  const ultimo = acceso?.ultimoAcceso ? `Último acceso: ${fechaHora(acceso.ultimoAcceso)}` : "Aún no ha entrado";
  if (!acceso) return { visible: true, habilitado: false, texto: "Dar acceso a su celular", ultimo: "Su cuenta no tiene correo" };
  return { visible: true, habilitado: !enviado, texto: enviado ? `Correo enviado a ${acceso.email}` : "Dar acceso a su celular", ultimo };
}

/** ¿La sesión es de un colaborador con agenda? (mi_agenda contesta SIN_AGENDA a todos los demás). */
export async function tieneAgenda(): Promise<boolean> {
  const hoy = hoyISO();
  const { error } = await supabase.rpc("mi_agenda", { p_desde: hoy, p_hasta: hoy });
  return !error;
}
