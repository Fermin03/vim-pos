"use client";
// Cache de LECTURA offline del POS (catálogo, combos, modificadores): clave → valor en IndexedDB,
// vía Dexie. Sirve para pintar el menú cuando no hay red.
//
// El archivo y la base se llaman "outbox" por historia. Aquí vivía también la cola de cobros
// offline del POS web (un op-log que subía `sync_procesar_push`). Se congeló en la remediación
// Fase 3 —el offline lo da el escritorio, ADR 0004— y su código se retiró el 7 oct 2026.
import Dexie, { type Table } from "dexie";

type EntradaCache = { clave: string; valor: unknown; guardadoAt: string };

class OutboxDB extends Dexie {
  cache!: Table<EntradaCache, string>;
  constructor() {
    super("vimpos_outbox");
    // EL ESQUEMA NO SE TOCA. La tabla `operaciones` era la cola retirada y sigue declarada tal
    // cual: quitarla obligaría a Dexie a migrar la base de cada navegador y de cada caja ya
    // instalada, a cambio de nada. Ya no hay código que la lea ni la escriba.
    this.version(1).stores({ operaciones: "clientIdLocal, fechaOperacion" });
    // v2 — cache de lectura offline (catálogo, modificadores): clave→valor.
    this.version(2).stores({ operaciones: "clientIdLocal, fechaOperacion", cache: "clave" });
  }
}

/** Singleton perezoso: Dexie solo existe en el navegador (IndexedDB). */
let _db: OutboxDB | null = null;
function db(): OutboxDB {
  if (!_db) _db = new OutboxDB();
  return _db;
}

export async function cachePut(clave: string, valor: unknown): Promise<void> {
  try { await db().cache.put({ clave, valor, guardadoAt: new Date().toISOString() }); } catch { /* cache best-effort */ }
}

export async function cacheGet<T>(clave: string): Promise<T | null> {
  try {
    const e = await db().cache.get(clave);
    return e ? (e.valor as T) : null;
  } catch { return null; }
}

/** Borra TODO el cache de lectura. Al desvincular la caja: lo guardado era de otro negocio/sucursal
 *  (auditoría 30/09/2026, B2-6). Best-effort, como el resto del cache. */
export async function cacheLimpiar(): Promise<void> {
  try { await db().cache.clear(); } catch { /* cache best-effort */ }
}
