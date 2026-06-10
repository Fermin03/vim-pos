"use client";
import { employeeClient } from "./supabase";
import { pendientes, quitarEnviadas, marcarIntento } from "./outbox";

// Motor de sync: empuja el outbox a sync_procesar_push y limpia lo aceptado.
// El parseo de la respuesta es puro y testeable (clientIdsAceptados / totalesDe).

export type ResultadoSync = {
  enviadas: number;
  exitosas: number;
  idempotentes: number;
  conflictos: number;
  errores: number;
};

type OpResp = { client_id_local?: string; estado?: string };
type PushResp = { totales?: Record<string, number>; operaciones?: OpResp[]; sync_evento_id?: string };

/** client_id_local de las operaciones que el servidor ACEPTÓ (EXITO o IDEMPOTENTE) → quitar del outbox. */
export function clientIdsAceptados(respuesta: unknown): string[] {
  const r = (respuesta ?? {}) as PushResp;
  return (r.operaciones ?? [])
    .filter((o) => o.estado === "EXITO" || o.estado === "IDEMPOTENTE")
    .map((o) => o.client_id_local)
    .filter((x): x is string => Boolean(x));
}

/** Totales agregados de la respuesta. */
export function totalesDe(respuesta: unknown): Omit<ResultadoSync, "enviadas"> {
  const t = ((respuesta ?? {}) as PushResp).totales ?? {};
  return {
    exitosas: Number(t.exitosas ?? 0),
    idempotentes: Number(t.idempotentes ?? 0),
    conflictos: Number(t.conflictos ?? 0),
    errores: Number(t.errores ?? 0),
  };
}

/** Empuja el outbox al servidor. Devuelve el resumen; quita del outbox lo aceptado. */
export async function sincronizar(token: string, dispositivoId: string, descripcion: string): Promise<ResultadoSync> {
  const ops = await pendientes();
  if (ops.length === 0) return { enviadas: 0, exitosas: 0, idempotentes: 0, conflictos: 0, errores: 0 };

  const operaciones = ops.map((o) => ({
    client_id_local: o.clientIdLocal,
    tabla: o.tabla,
    operacion: o.operacion,
    entidad_id_local: o.entidadIdLocal,
    payload: o.payload,
    fecha_operacion: o.fechaOperacion,
  }));

  const { data, error } = await employeeClient(token).rpc("sync_procesar_push", {
    p_dispositivo_id: dispositivoId,
    p_dispositivo_descripcion: descripcion,
    p_operaciones: operaciones,
  });
  if (error) {
    await marcarIntento(ops.map((o) => o.clientIdLocal));
    throw new Error(error.message);
  }

  await quitarEnviadas(clientIdsAceptados(data));
  return { enviadas: ops.length, ...totalesDe(data) };
}
