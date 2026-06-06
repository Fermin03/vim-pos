"use client";
import { supabase } from "./supabase";

// F13 — Reportes y analítica. Las vistas SQL ya existen (0011/0012); el admin solo las
// consume bajo RLS (heredan del tenant_id de las tablas base). Rangos por día_contable.

const num = (v: unknown) => Number(v ?? 0);

/** Rango "últimos N días contables" (incluye hoy). */
export function rangoUltimosDias(n: number): { desde: string; hasta: string } {
  const hoy = new Date();
  const hasta = hoy.toISOString().slice(0, 10);
  const d = new Date(hoy);
  d.setDate(d.getDate() - (n - 1));
  return { desde: d.toISOString().slice(0, 10), hasta };
}

// ── Reporte Z histórico (P-181) ─────────────────────────────────────────────
export type FilaZHistorico = {
  id: string;
  folio_z: string;
  dia_contable: string;
  fecha_cierre: string;
  total_ventas: number;
  total_propinas: number;
  total_tickets: number;
  efectivo_esperado: number;
  efectivo_declarado: number;
  diferencia_efectivo: number;
};

export async function leerZHistorico(desde: string, hasta: string): Promise<FilaZHistorico[]> {
  const { data, error } = await supabase
    .from("reportes_z_historico")
    .select(
      "id, folio_z, dia_contable, fecha_cierre, total_ventas_mxn, total_propinas_mxn, total_tickets, efectivo_esperado_mxn, efectivo_declarado_mxn, diferencia_efectivo_mxn",
    )
    .gte("dia_contable", desde)
    .lte("dia_contable", hasta)
    .order("fecha_cierre", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    folio_z: String(r.folio_z ?? "—"),
    dia_contable: String(r.dia_contable),
    fecha_cierre: String(r.fecha_cierre),
    total_ventas: num(r.total_ventas_mxn),
    total_propinas: num(r.total_propinas_mxn),
    total_tickets: num(r.total_tickets),
    efectivo_esperado: num(r.efectivo_esperado_mxn),
    efectivo_declarado: num(r.efectivo_declarado_mxn),
    diferencia_efectivo: num(r.diferencia_efectivo_mxn),
  }));
}

// ── Ventas por producto (P-185) ─────────────────────────────────────────────
export type FilaProducto = {
  producto_id: string;
  producto_nombre: string;
  unidades: number;
  total_mxn: number;
  tickets_con_producto: number;
};

export async function leerVentasPorProducto(desde: string, hasta: string): Promise<FilaProducto[]> {
  const { data, error } = await supabase
    .from("vw_ventas_por_producto")
    .select("producto_id, producto_nombre, unidades_vendidas, total_mxn, tickets_con_producto, dia_contable")
    .gte("dia_contable", desde)
    .lte("dia_contable", hasta);
  if (error) throw new Error(error.message);
  // Agregamos por producto sobre el rango (la vista es por día).
  const agg = new Map<string, FilaProducto>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const id = String(r.producto_id);
    const x = agg.get(id) ?? {
      producto_id: id,
      producto_nombre: String(r.producto_nombre ?? "—"),
      unidades: 0,
      total_mxn: 0,
      tickets_con_producto: 0,
    };
    x.unidades += num(r.unidades_vendidas);
    x.total_mxn += num(r.total_mxn);
    x.tickets_con_producto += num(r.tickets_con_producto);
    agg.set(id, x);
  }
  return [...agg.values()].sort((a, b) => b.total_mxn - a.total_mxn);
}

// ── Ventas por categoría (P-184) ────────────────────────────────────────────
export type FilaCategoria = {
  categoria: string;
  unidades: number;
  total_mxn: number;
  tickets: number;
};

export async function leerVentasPorCategoria(desde: string, hasta: string): Promise<FilaCategoria[]> {
  const { data, error } = await supabase
    .from("vw_ventas_por_categoria")
    .select("categoria, unidades_vendidas, total_mxn, tickets_con_categoria, dia_contable")
    .gte("dia_contable", desde)
    .lte("dia_contable", hasta);
  if (error) throw new Error(error.message);
  const agg = new Map<string, FilaCategoria>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const cat = String(r.categoria ?? "—");
    const x = agg.get(cat) ?? { categoria: cat, unidades: 0, total_mxn: 0, tickets: 0 };
    x.unidades += num(r.unidades_vendidas);
    x.total_mxn += num(r.total_mxn);
    x.tickets += num(r.tickets_con_categoria);
    agg.set(cat, x);
  }
  return [...agg.values()].sort((a, b) => b.total_mxn - a.total_mxn);
}

// ── Ventas por modo de servicio (P-188) ─────────────────────────────────────
export type FilaModo = { modo: string; total_mxn: number; tickets: number; porcentaje: number };

export async function leerVentasPorModo(desde: string, hasta: string): Promise<FilaModo[]> {
  const { data, error } = await supabase
    .from("vw_ventas_por_modo_servicio")
    .select("*")
    .gte("dia_contable", desde)
    .lte("dia_contable", hasta);
  if (error) throw new Error(error.message);
  // La vista tiene un set de columnas distinto por implementación; lo robusto es agregar
  // por la primera columna textual que parezca el modo.
  const agg = new Map<string, { total: number; tickets: number }>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const modo = String(r.modo_servicio ?? r.modo ?? "—");
    const x = agg.get(modo) ?? { total: 0, tickets: 0 };
    x.total += num(r.total_mxn ?? r.subtotal_mxn);
    x.tickets += num(r.tickets ?? r.tickets_con_modo ?? r.cantidad_tickets);
    agg.set(modo, x);
  }
  const granTotal = [...agg.values()].reduce((s, v) => s + v.total, 0) || 1;
  return [...agg.entries()]
    .map(([modo, v]) => ({
      modo,
      total_mxn: v.total,
      tickets: v.tickets,
      porcentaje: Math.round((v.total / granTotal) * 1000) / 10,
    }))
    .sort((a, b) => b.total_mxn - a.total_mxn);
}

/** Formato MXN. */
export function fmtMxn(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}
