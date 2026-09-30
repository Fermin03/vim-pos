// Lógica pura de los operadores del panel (A8), aparte de las rutas para poder probarla.

import { MOTIVO_MINIMO } from "./confirmacion";

export type EstadoOperador = "PENDIENTE" | "ACTIVO" | "DESACTIVADO";

/** Invitado que no ha entrado con su segundo factor = PENDIENTE; lo desactivado manda sobre todo. */
export function estadoOperador(o: { activo: boolean; activado_at: string | null }): EstadoOperador {
  if (!o.activo) return "DESACTIVADO";
  return o.activado_at ? "ACTIVO" : "PENDIENTE";
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida el alta: nombre de 2 a 80 caracteres y un correo con forma de correo. */
export function validarInvitacion(nombre: unknown, email: unknown): { ok: true; nombre: string; email: string } | { ok: false; detalle: string } {
  const n = String(nombre ?? "").trim();
  const e = String(email ?? "").trim().toLowerCase();
  if (n.length < 2 || n.length > 80) return { ok: false, detalle: "Escribe el nombre de la persona (2 a 80 caracteres)." };
  if (!CORREO.test(e)) return { ok: false, detalle: "Escribe un correo válido." };
  return { ok: true, nombre: n, email: e };
}

export function motivoValido(m: unknown): string | null {
  const t = String(m ?? "").trim();
  return t.length >= MOTIVO_MINIMO ? t : null;
}

/**
 * El enlace de un solo uso que abre /acceso. Va en el FRAGMENTO (#), no en la query: el fragmento
 * no viaja al servidor, así que el token no queda en ningún log de acceso ni de Vercel.
 */
export function enlaceAcceso(origen: string, token: string, tipo: "invite" | "recovery"): string {
  return `${origen.replace(/\/$/, "")}/acceso#token=${encodeURIComponent(token)}&tipo=${tipo}`;
}
