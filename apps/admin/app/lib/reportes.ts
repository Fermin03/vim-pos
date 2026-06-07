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

// ── Dashboard (P-177) ───────────────────────────────────────────────────────
export type ResumenDia = {
  dia: string;
  ticketsCompletados: number;
  ticketsCancelados: number;
  totalNeto: number;
  ticketPromedio: number;
  descuentos: number;
  propinas: number;
  devoluciones: number;
  paraLlevar: number;
  comerAqui: number;
  delivery: number;
  apps: number;
};

export type TopProducto = { nombre: string; unidades: number; total: number };

export type Dashboard = {
  hoy: ResumenDia;
  topProductos: TopProducto[];
  /** Serie de total_neto por día (para la mini-tendencia), del más antiguo al más reciente. */
  tendencia: { dia: string; total: number }[];
};

/** Suma las filas (una por sucursal) de vw_estado_resultados_dia en un resumen del día. */
function sumarDia(filas: Record<string, unknown>[], dia: string): ResumenDia {
  const completados = filas.reduce((a, f) => a + num(f.tickets_completados), 0);
  const totalNeto = filas.reduce((a, f) => a + num(f.total_neto_mxn), 0);
  return {
    dia,
    ticketsCompletados: completados,
    ticketsCancelados: filas.reduce((a, f) => a + num(f.tickets_cancelados), 0),
    totalNeto,
    ticketPromedio: completados > 0 ? Math.round((totalNeto / completados) * 100) / 100 : 0,
    descuentos: filas.reduce((a, f) => a + num(f.descuentos_manuales_mxn), 0),
    propinas: filas.reduce((a, f) => a + num(f.propinas_capturadas_mxn), 0),
    devoluciones: filas.reduce((a, f) => a + num(f.devoluciones_mxn), 0),
    paraLlevar: filas.reduce((a, f) => a + num(f.tickets_para_llevar), 0),
    comerAqui: filas.reduce((a, f) => a + num(f.tickets_comer_aqui), 0),
    delivery: filas.reduce((a, f) => a + num(f.tickets_delivery_propio), 0),
    apps: filas.reduce((a, f) => a + num(f.tickets_apps), 0),
  };
}

export async function leerDashboard(): Promise<Dashboard> {
  const { desde, hasta } = rangoUltimosDias(7);

  // Estado de resultados por día (todas las sucursales del tenant, bajo RLS).
  const { data: er, error: e1 } = await supabase
    .from("vw_estado_resultados_dia")
    .select(
      "dia_contable, tickets_completados, tickets_cancelados, total_neto_mxn, descuentos_manuales_mxn, propinas_capturadas_mxn, devoluciones_mxn, tickets_para_llevar, tickets_comer_aqui, tickets_delivery_propio, tickets_apps",
    )
    .gte("dia_contable", desde)
    .lte("dia_contable", hasta);
  if (e1) throw new Error(e1.message);
  const filas = (er ?? []) as Record<string, unknown>[];

  // Agrupa por día para la tendencia y separa el más reciente para "hoy".
  const porDia = new Map<string, Record<string, unknown>[]>();
  for (const f of filas) {
    const d = String(f.dia_contable);
    porDia.set(d, [...(porDia.get(d) ?? []), f]);
  }
  const dias = [...porDia.keys()].sort();
  const tendencia = dias.map((d) => ({
    dia: d,
    total: (porDia.get(d) ?? []).reduce((a, f) => a + num(f.total_neto_mxn), 0),
  }));
  const diaReciente = dias[dias.length - 1] ?? hasta;
  const hoy = sumarDia(porDia.get(diaReciente) ?? [], diaReciente);

  // Top productos del día más reciente.
  const { data: tp, error: e2 } = await supabase
    .from("vw_ventas_por_producto")
    .select("producto_nombre, unidades_vendidas, total_mxn, dia_contable")
    .eq("dia_contable", diaReciente)
    .order("total_mxn", { ascending: false })
    .limit(6);
  if (e2) throw new Error(e2.message);
  const topProductos = ((tp ?? []) as Record<string, unknown>[]).map((r) => ({
    nombre: String(r.producto_nombre ?? "—"),
    unidades: num(r.unidades_vendidas),
    total: num(r.total_mxn),
  }));

  return { hoy, topProductos, tendencia };
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
