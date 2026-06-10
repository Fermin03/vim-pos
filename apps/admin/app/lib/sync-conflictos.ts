"use client";
import { supabase } from "./supabase";

// Fase 3 · resolución de conflictos de sync (P-215). El backend ya los detecta y los
// guarda en sync_conflictos; aquí el admin elige qué versión conservar.

export type Resolucion = "RESUELTO_OPERADOR" | "DESCARTADO";

export type ConflictoSync = {
  id: string;
  tipo: string;
  entidad: string;
  clientIdLocal: string | null;
  entidadServidorId: string | null;
  diferencia: string | null;
  /** Lo que el dispositivo intentó aplicar (su versión). */
  payloadLocal: Record<string, unknown>;
  /** Lo que ya estaba en el servidor. */
  payloadServidor: Record<string, unknown>;
  fecha: string;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Conflictos PENDIENTES del tenant (RLS). Más recientes primero. */
export async function listarConflictosPendientes(): Promise<ConflictoSync[]> {
  const { data, error } = await supabase
    .from("sync_conflictos")
    .select("id, tipo_conflicto, entidad_tipo, client_id_local, entidad_id_servidor, diferencia_detectada, payload_intentado, payload_servidor, created_at")
    .eq("resolucion", "PENDIENTE")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const f = r as Record<string, unknown>;
    return {
      id: String(f.id),
      tipo: String(f.tipo_conflicto),
      entidad: String(f.entidad_tipo),
      clientIdLocal: (f.client_id_local as string) ?? null,
      entidadServidorId: (f.entidad_id_servidor as string) ?? null,
      diferencia: f.diferencia_detectada == null ? null : typeof f.diferencia_detectada === "string" ? f.diferencia_detectada : JSON.stringify(f.diferencia_detectada),
      payloadLocal: obj(f.payload_intentado),
      payloadServidor: obj(f.payload_servidor),
      fecha: String(f.created_at),
    };
  });
}

/** Resuelve un conflicto: conservar la versión del dispositivo o descartarla (conservar servidor). */
export async function resolverConflicto(id: string, resolucion: Resolucion, nota: string): Promise<void> {
  const { error } = await supabase.rpc("sync_resolver_conflicto", {
    p_conflicto_id: id,
    p_resolucion: resolucion,
    p_nota: nota.trim() || (resolucion === "RESUELTO_OPERADOR" ? "Se conservó la versión del dispositivo." : "Se conservó la versión del servidor."),
  });
  if (error) throw new Error(error.message);
}
