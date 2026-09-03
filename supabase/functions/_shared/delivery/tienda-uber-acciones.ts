// Orquestación con I/O del estado de tienda y prep en Uber (spec A6). La usan delivery-accion
// (POS, JWT de empleado) y delivery-uber-conexion (admin). Cache de 60 s del estado en
// delivery_conexiones.config.tienda para no gastar llamadas; cada llamada a Uber deja evento.
import type { ClienteUber } from "./uber.ts";
import type { DbMinima } from "./procesar-uber.ts";
import {
  cuerpoPausarTienda, cuerpoPrepTime, cuerpoReanudarTienda, esErrorEstrategiaExterna, estadoCacheVigente,
  normalizarEstadoTienda, type DuracionPausa, type EstadoTienda,
} from "./tienda-uber.ts";

export type ConexionTienda = {
  id: string; tenant_id: string; sucursal_id: string; tienda_id_externo: string; tiempo_prep_min: number; config: unknown;
};
export type DepsTienda = { db: DbMinima; uber: ClienteUber; ahora: () => Date; zonaHoraria?: string };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

async function evento(deps: DepsTienda, cx: ConexionTienda, tipo: string, ok: boolean, detalle: unknown): Promise<void> {
  await deps.db.from("delivery_eventos").insert({
    tenant_id: cx.tenant_id, conexion_id: cx.id, app: "APP_UBEREATS", direccion: "SALIDA", tipo,
    id_externo: cx.tienda_id_externo, procesado: ok, respuesta: ok ? detalle : null, error: ok ? null : String(detalle),
    http_status: ok ? 200 : null,
  }).select("id").single();
}

async function guardarCache(deps: DepsTienda, cx: ConexionTienda, tienda: EstadoTienda): Promise<void> {
  await deps.db.from("delivery_conexiones")
    .update({ config: { ...obj(cx.config), tienda }, ultimo_evento_at: deps.ahora().toISOString() })
    .eq("id", cx.id);
}

/** Estado de la tienda: del cache si tiene menos de 60 s, si no (o con `forzar`) de Uber. */
export async function consultarEstadoTienda(deps: DepsTienda, cx: ConexionTienda, forzar = false): Promise<EstadoTienda> {
  if (!forzar) {
    const c = estadoCacheVigente(cx.config, deps.ahora());
    if (c) return c;
  }
  try {
    const tienda = normalizarEstadoTienda(await deps.uber.estadoTienda(cx.tienda_id_externo), deps.ahora());
    await guardarCache(deps, cx, tienda);
    await evento(deps, cx, "tienda_estado", true, tienda);
    return tienda;
  } catch (e) {
    await evento(deps, cx, "tienda_estado", false, msg(e));
    throw e;
  }
}

async function cambiarEstado(deps: DepsTienda, cx: ConexionTienda, tipo: "tienda_pausar" | "tienda_reanudar", cuerpo: unknown): Promise<EstadoTienda> {
  try {
    const r = await deps.uber.actualizarEstadoTienda(cx.tienda_id_externo, cuerpo);
    const tienda = normalizarEstadoTienda(r, deps.ahora());
    await guardarCache(deps, cx, tienda);
    await evento(deps, cx, tipo, true, cuerpo);
    return tienda;
  } catch (e) {
    await evento(deps, cx, tipo, false, msg(e));
    if (esErrorEstrategiaExterna(msg(e))) throw new Error("TIENDA_ESTRATEGIA_UBER");
    throw e;
  }
}

export function pausarTienda(deps: DepsTienda, cx: ConexionTienda, duracion: DuracionPausa): Promise<EstadoTienda> {
  return cambiarEstado(deps, cx, "tienda_pausar", cuerpoPausarTienda(deps.ahora(), duracion, deps.zonaHoraria ?? "America/Mexico_City"));
}

export function reanudarTienda(deps: DepsTienda, cx: ConexionTienda): Promise<EstadoTienda> {
  return cambiarEstado(deps, cx, "tienda_reanudar", cuerpoReanudarTienda());
}

/** Uber primero; solo si respondió se escribe tiempo_prep_min en VIM. */
export async function cambiarPrepTienda(deps: DepsTienda, cx: ConexionTienda, minutos: number): Promise<{ tiempo_prep_min: number }> {
  const cuerpo = cuerpoPrepTime(minutos);   // valida el rango antes de tocar Uber
  try {
    await deps.uber.actualizarPrepTienda(cx.tienda_id_externo, cuerpo);
  } catch (e) {
    await evento(deps, cx, "tienda_prep", false, msg(e));
    throw e;
  }
  await deps.db.from("delivery_conexiones")
    .update({ tiempo_prep_min: minutos, ultimo_evento_at: deps.ahora().toISOString() })
    .eq("id", cx.id);
  await evento(deps, cx, "tienda_prep", true, cuerpo);
  return { tiempo_prep_min: minutos };
}
