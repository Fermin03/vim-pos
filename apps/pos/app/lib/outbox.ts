"use client";
import Dexie, { type Table } from "dexie";

// Fase 3 · outbox offline-first. Cola persistente (IndexedDB vía Dexie) de operaciones
// hechas sin conexión; el motor de sync (lib/sync) las empuja a sync_procesar_push cuando
// vuelve la red. La idempotencia la garantiza client_id_local (PK aquí y en el servidor).

export type OperacionOffline = {
  /** Idempotencia: igual aquí y en el servidor. PK. */
  clientIdLocal: string;
  tabla: string;
  operacion: "INSERT" | "UPDATE" | "DELETE";
  entidadIdLocal: string | null;
  payload: Record<string, unknown>;
  fechaOperacion: string; // ISO; el servidor ordena cronológicamente por esto
  intentos: number;
};

class OutboxDB extends Dexie {
  operaciones!: Table<OperacionOffline, string>;
  constructor() {
    super("vimpos_outbox");
    this.version(1).stores({ operaciones: "clientIdLocal, fechaOperacion" });
  }
}

/** Singleton perezoso: Dexie solo existe en el navegador (IndexedDB). */
let _db: OutboxDB | null = null;
function db(): OutboxDB {
  if (!_db) _db = new OutboxDB();
  return _db;
}

export async function encolar(op: Omit<OperacionOffline, "intentos">): Promise<void> {
  await db().operaciones.put({ ...op, intentos: 0 });
}

export async function pendientes(): Promise<OperacionOffline[]> {
  return db().operaciones.orderBy("fechaOperacion").toArray();
}

export async function contarPendientes(): Promise<number> {
  try { return await db().operaciones.count(); } catch { return 0; }
}

export async function quitarEnviadas(clientIds: string[]): Promise<void> {
  if (clientIds.length > 0) await db().operaciones.bulkDelete(clientIds);
}

export async function marcarIntento(clientIds: string[]): Promise<void> {
  await db().transaction("rw", db().operaciones, async () => {
    for (const id of clientIds) {
      const o = await db().operaciones.get(id);
      if (o) await db().operaciones.put({ ...o, intentos: o.intentos + 1 });
    }
  });
}
