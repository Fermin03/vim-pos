"use client";
import { employeeClient } from "./supabase";

/** Otra cuenta de barra abierta ya usa ese nombre (el RPC responde `NOMBRE_EN_USO: <nombre>`). */
export class NombreEnUso extends Error {
  constructor(public nombre: string) {
    super(`NOMBRE_EN_USO: ${nombre}`);
  }
}

/** Nombre recortado; si ya está en uso (sin distinguir mayúsculas) propone "Nombre 2", "Nombre 3"… */
export function nombreLibre(nombre: string, enUso: readonly string[]): string {
  const base = nombre.trim();
  const usados = new Set(enUso.map((x) => x.trim().toLowerCase()));
  let candidato = base;
  for (let i = 2; usados.has(candidato.toLowerCase()); i++) candidato = `${base} ${i}`;
  return candidato;
}

const MENSAJES: Record<string, string> = {
  CUENTA_CERRADA: "Esta cuenta ya se cobró o se canceló. Actualiza la lista.",
  NO_ES_CUENTA_DE_BARRA: "Esta cuenta ya no está en la barra. Actualiza la lista.",
  NO_ES_CUENTA_DE_MESA: "Esta cuenta ya no está en una mesa. Actualiza la lista.",
  NOMBRE_REQUERIDO: "Escribe un nombre para la cuenta.",
};

function lanzar(error: { message: string }): never {
  if (error.message.startsWith("NOMBRE_EN_USO")) throw new NombreEnUso(error.message.replace(/^NOMBRE_EN_USO:\s*/, ""));
  throw new Error(MENSAJES[error.message] ?? error.message);
}

export async function abrirCuentaBarra(
  token: string,
  a: { sucursalId: string; cajaId: string; turnoId: string; nombre: string; usuarioId: string | null; clientIdLocal: string },
): Promise<string> {
  const { data, error } = await employeeClient(token).rpc("abrir_cuenta_barra", {
    p_sucursal_id: a.sucursalId,
    p_caja_id: a.cajaId,
    p_turno_id: a.turnoId,
    p_nombre: a.nombre,
    p_client_id_local: a.clientIdLocal,
    p_usuario_id: a.usuarioId ?? undefined,
  });
  if (error) lanzar(error);
  return data as string;
}

export async function moverCuentaAMesa(token: string, ticketId: string, mesaId: string, clientIdLocal: string): Promise<void> {
  const { error } = await employeeClient(token).rpc("mover_cuenta_a_mesa", {
    p_ticket_id: ticketId, p_mesa_id: mesaId, p_client_id_local: clientIdLocal,
  });
  if (error) lanzar(error);
}

export async function moverCuentaABarra(token: string, ticketId: string, nombre: string): Promise<void> {
  const { error } = await employeeClient(token).rpc("mover_cuenta_a_barra", { p_ticket_id: ticketId, p_nombre: nombre });
  if (error) lanzar(error);
}
