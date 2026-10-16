"use client";
import { sumarDias } from "@vim/fecha";
import { supabase } from "./supabase";
import { leerTodas } from "./reportes";

export type FilaExistencia = {
  sucursal_id: string; sucursal_nombre: string; producto_id: string; producto_nombre: string; variante: string;
  nombre_completo: string; codigo_interno: string | null; codigo_barras: string | null; costo_mxn: number | null;
  precio_mxn: number; cantidad: number; minimo: number | null; valor_mxn: number;
};

export const varianteDe = (ejes: string[] | null, valores: Record<string, string> | null): string =>
  ejes && valores ? ejes.map((e) => valores[e]).filter(Boolean).join(" · ") : "";

export type EstadoExistencia = "negativa" | "agotada" | "bajo" | "ok";
export function estadoExistencia(cantidad: number, minimo: number | null): EstadoExistencia {
  if (cantidad < 0) return "negativa";
  if (cantidad === 0) return "agotada";
  if (minimo !== null && cantidad <= minimo) return "bajo";
  return "ok";
}

/** Piezas = la suma con signo (lo que hay de verdad); bajo = con mínimo y en o bajo él (agotadas incluidas). */
export function resumenExistencias(filas: FilaExistencia[]) {
  let piezas = 0, valor = 0, bajo = 0, negativas = 0;
  for (const f of filas) {
    piezas += f.cantidad;
    valor += f.valor_mxn;
    const e = estadoExistencia(f.cantidad, f.minimo);
    if (e === "negativa") negativas++;
    else if (f.minimo !== null && (e === "bajo" || e === "agotada")) bajo++;
  }
  return { piezas, valor_mxn: Math.round(valor * 100) / 100, bajo, negativas };
}

export type Capturable = { id: string; nombre: string; codigo_interno: string | null; codigo_barras: string | null };
/** El escáner escribe el código y Enter: primero el código exacto; si no, el nombre. */
export function buscarCapturable(lista: Capturable[], texto: string): { exacto: Capturable | null; coincidencias: Capturable[] } {
  const t = texto.trim().toLowerCase();
  if (!t) return { exacto: null, coincidencias: [] };
  const exacto = lista.find((p) => p.codigo_barras?.toLowerCase() === t || p.codigo_interno?.toLowerCase() === t) ?? null;
  return { exacto, coincidencias: exacto ? [] : lista.filter((p) => p.nombre.toLowerCase().includes(t)).slice(0, 8) };
}

const n = (v: unknown) => Number(v ?? 0);

export async function listarExistencias(sucursalId: string | null): Promise<FilaExistencia[]> {
  const filas = await leerTodas((desde, hasta) => {
    let q = supabase.from("vw_existencias")
      .select("sucursal_id, sucursal_nombre, producto_id, producto_nombre, nombre_completo, variante_valores, variante_ejes, codigo_interno, codigo_barras, costo_mxn, precio_base_mxn, cantidad, minimo, valor_mxn")
      .order("producto_nombre").order("nombre_completo").order("sucursal_id").order("producto_id");
    if (sucursalId) q = q.eq("sucursal_id", sucursalId);
    return q.range(desde, hasta);
  });
  return filas.map((r) => ({
    sucursal_id: String(r.sucursal_id), sucursal_nombre: String(r.sucursal_nombre ?? ""), producto_id: String(r.producto_id),
    producto_nombre: String(r.producto_nombre ?? ""),
    variante: varianteDe(r.variante_ejes as string[] | null, r.variante_valores as Record<string, string> | null),
    nombre_completo: String(r.nombre_completo ?? ""), codigo_interno: (r.codigo_interno as string | null) ?? null,
    codigo_barras: (r.codigo_barras as string | null) ?? null, costo_mxn: r.costo_mxn == null ? null : n(r.costo_mxn),
    precio_mxn: n(r.precio_base_mxn), cantidad: n(r.cantidad), minimo: r.minimo == null ? null : n(r.minimo), valor_mxn: n(r.valor_mxn),
  }));
}

async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nombre, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const fijarMinimo = (sucursal: string, producto: string, minimo: number | null) =>
  rpc<void>("fijar_minimo_producto", { p_sucursal: sucursal, p_producto: producto, p_minimo: minimo });
export const registrarMovimientoProducto = (sucursal: string, producto: string, tipo: "ENTRADA" | "MERMA" | "AJUSTE", cantidad: number, costo: number | null = null, motivo: string | null = null) =>
  rpc<string>("registrar_movimiento_producto", { p_sucursal: sucursal, p_producto: producto, p_tipo: tipo, p_cantidad: cantidad, p_costo_unitario: costo, p_motivo: motivo });
export const recibirMercancia = (sucursal: string, proveedor: string | null, lineas: { producto_id: string; cantidad: number; costo?: number | null }[], referencia: string) =>
  rpc<number>("recibir_mercancia", { p_sucursal: sucursal, p_proveedor: proveedor, p_lineas: lineas, p_referencia: referencia });
export const registrarConteo = (sucursal: string, lineas: { producto_id: string; contado: number }[]) =>
  rpc<{ ajustados: number; diferencias: { producto_id: string; sistema: number; contado: number; diferencia: number }[] }>("registrar_conteo", { p_sucursal: sucursal, p_conteo: lineas });
export const enviarTraspaso = (origen: string, destino: string, lineas: { producto_id: string; cantidad: number }[]) =>
  rpc<string>("enviar_traspaso_producto", { p_origen: origen, p_destino: destino, p_lineas: lineas });
export const recibirTraspaso = (id: string) => rpc<void>("recibir_traspaso_producto", { p_traspaso: id });
export const cancelarTraspaso = (id: string) => rpc<void>("cancelar_traspaso_producto", { p_traspaso: id });

export type Traspaso = {
  id: string; origen_sucursal_id: string; destino_sucursal_id: string; estado: "ENVIADO" | "RECIBIDO" | "CANCELADO";
  lineas: { producto_id: string; cantidad: number }[]; enviado_at: string; recibido_at: string | null; cancelado_at: string | null;
};
export async function listarTraspasos(): Promise<Traspaso[]> {
  const filas = await leerTodas((d, h) => supabase.from("traspasos_producto")
    .select("id, origen_sucursal_id, destino_sucursal_id, estado, lineas, enviado_at, recibido_at, cancelado_at")
    .order("enviado_at", { ascending: false }).order("id").range(d, h));
  return filas as unknown as Traspaso[];
}

export type MovimientoProducto = {
  id: string; creado_at: string; sucursal_id: string; producto_id: string; producto: string; tipo: string;
  cantidad: number; costo_unitario_mxn: number | null; motivo: string | null;
};
/** Los movimientos de un rango de días de México: [desde 00:00, día siguiente a hasta 00:00), como lealtad-libro. */
export async function listarMovimientosProducto(desde: string, hasta: string, sucursalId: string | null): Promise<MovimientoProducto[]> {
  const filas = await leerTodas((d, h) => {
    let q = supabase.from("movimientos_producto")
      .select("id, creado_at, sucursal_id, producto_id, tipo, cantidad, costo_unitario_mxn, motivo, producto:productos(nombre)")
      .gte("creado_at", `${desde}T00:00:00-06:00`).lt("creado_at", `${sumarDias(hasta, 1)}T00:00:00-06:00`)
      .order("creado_at", { ascending: false }).order("id");
    if (sucursalId) q = q.eq("sucursal_id", sucursalId);
    return q.range(d, h);
  });
  return filas.map((r) => ({
    id: String(r.id), creado_at: String(r.creado_at), sucursal_id: String(r.sucursal_id), producto_id: String(r.producto_id),
    producto: String((r.producto as { nombre?: string } | null)?.nombre ?? "—"), tipo: String(r.tipo), cantidad: n(r.cantidad),
    costo_unitario_mxn: r.costo_unitario_mxn == null ? null : n(r.costo_unitario_mxn), motivo: (r.motivo as string | null) ?? null,
  }));
}
