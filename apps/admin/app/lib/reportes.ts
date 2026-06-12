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

// ── Batch T3: reportes adicionales (vistas existentes, agregadas por entidad en el rango) ────

async function leerVista(vista: string, cols: string, desde: string, hasta: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from(vista)
    .select(cols)
    .gte("dia_contable", desde)
    .lte("dia_contable", hasta);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Record<string, unknown>[];
}

// Ventas por mesero (P-186)
export type FilaMesero = { clave: string; nombre: string; tickets: number; total: number; propinas: number; promedio: number };
export async function leerVentasPorMesero(desde: string, hasta: string): Promise<FilaMesero[]> {
  const filas = await leerVista("vw_ventas_por_mesero", "mesero_id, mesero_email, tickets_atendidos, total_vendido_mxn, propinas_capturadas_mxn", desde, hasta);
  const map = new Map<string, FilaMesero>();
  for (const f of filas) {
    const k = String(f.mesero_id ?? f.mesero_email ?? "—");
    const cur = map.get(k) ?? { clave: k, nombre: String(f.mesero_email ?? "—"), tickets: 0, total: 0, propinas: 0, promedio: 0 };
    cur.tickets += num(f.tickets_atendidos); cur.total += num(f.total_vendido_mxn); cur.propinas += num(f.propinas_capturadas_mxn);
    map.set(k, cur);
  }
  return [...map.values()].map((m) => ({ ...m, promedio: m.tickets > 0 ? m.total / m.tickets : 0 })).sort((a, b) => b.total - a.total);
}

// Ventas por área de cocina (P-187)
export type FilaArea = { clave: string; area: string; tickets: number; unidades: number; total: number };
export async function leerVentasPorArea(desde: string, hasta: string): Promise<FilaArea[]> {
  const filas = await leerVista("vw_ventas_por_area_cocina", "area_cocina, tickets_con_area, unidades_preparadas, total_vendido_mxn", desde, hasta);
  const map = new Map<string, FilaArea>();
  for (const f of filas) {
    const k = String(f.area_cocina ?? "General");
    const cur = map.get(k) ?? { clave: k, area: k, tickets: 0, unidades: 0, total: 0 };
    cur.tickets += num(f.tickets_con_area); cur.unidades += num(f.unidades_preparadas); cur.total += num(f.total_vendido_mxn);
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

// Ventas por marca virtual (P-189)
export type FilaMarca = { clave: string; nombre: string; color: string; tickets: number; total: number; promedio: number };
export async function leerVentasPorMarca(desde: string, hasta: string): Promise<FilaMarca[]> {
  const filas = await leerVista("vw_ventas_por_marca", "marca_virtual_id, marca_nombre, marca_color, tickets_completados, total_neto_mxn", desde, hasta);
  const map = new Map<string, FilaMarca>();
  for (const f of filas) {
    const k = String(f.marca_virtual_id ?? f.marca_nombre ?? "—");
    const cur = map.get(k) ?? { clave: k, nombre: String(f.marca_nombre ?? "Sin marca"), color: String(f.marca_color ?? "#999"), tickets: 0, total: 0, promedio: 0 };
    cur.tickets += num(f.tickets_completados); cur.total += num(f.total_neto_mxn);
    map.set(k, cur);
  }
  return [...map.values()].map((m) => ({ ...m, promedio: m.tickets > 0 ? m.total / m.tickets : 0 })).sort((a, b) => b.total - a.total);
}

// Tiempos de cocina (P-190)
export type FilaTiempos = { modo: string; tickets: number; promedio: number; bajo15: number; entre16y30: number; mayor30: number };
export async function leerTiemposCocina(desde: string, hasta: string): Promise<FilaTiempos[]> {
  const filas = await leerVista("vw_cumplimiento_tiempos_cocina_agregado", "modo_servicio, tickets_total, minutos_cocina_promedio, tickets_cocina_bajo_15min, tickets_cocina_16_30min, tickets_cocina_mayor_30min", desde, hasta);
  const map = new Map<string, FilaTiempos & { _sumProm: number; _dias: number }>();
  for (const f of filas) {
    const k = String(f.modo_servicio ?? "—");
    const cur = map.get(k) ?? { modo: k, tickets: 0, promedio: 0, bajo15: 0, entre16y30: 0, mayor30: 0, _sumProm: 0, _dias: 0 };
    cur.tickets += num(f.tickets_total); cur.bajo15 += num(f.tickets_cocina_bajo_15min);
    cur.entre16y30 += num(f.tickets_cocina_16_30min); cur.mayor30 += num(f.tickets_cocina_mayor_30min);
    cur._sumProm += num(f.minutos_cocina_promedio); cur._dias += 1;
    map.set(k, cur);
  }
  return [...map.values()].map((m) => ({ modo: m.modo, tickets: m.tickets, promedio: m._dias > 0 ? m._sumProm / m._dias : 0, bajo15: m.bajo15, entre16y30: m.entre16y30, mayor30: m.mayor30 }));
}

// Descuentos por usuario (P-194)
export type FilaDescuento = { clave: string; usuario: string; cantidad: number; total: number; promedio: number };
export async function leerDescuentosPorUsuario(desde: string, hasta: string): Promise<FilaDescuento[]> {
  const filas = await leerVista("vw_descuentos_por_usuario", "usuario_id, usuario_email, cantidad_descuentos, total_descontado_mxn", desde, hasta);
  const map = new Map<string, FilaDescuento>();
  for (const f of filas) {
    const k = String(f.usuario_id ?? f.usuario_email ?? "—");
    const cur = map.get(k) ?? { clave: k, usuario: String(f.usuario_email ?? "—"), cantidad: 0, total: 0, promedio: 0 };
    cur.cantidad += num(f.cantidad_descuentos); cur.total += num(f.total_descontado_mxn);
    map.set(k, cur);
  }
  return [...map.values()].map((m) => ({ ...m, promedio: m.cantidad > 0 ? m.total / m.cantidad : 0 })).sort((a, b) => b.total - a.total);
}

// B3 Foodtruck — ventas por evento (vw_ventas_por_evento, 0049)
export type FilaEvento = {
  evento: string; tipo: string | null; turnos: number; primerDia: string; ultimoDia: string;
  tickets: number; total: number; propinas: number; comision: number; neto: number;
};
export async function leerVentasPorEvento(): Promise<FilaEvento[]> {
  const { data, error } = await supabase
    .from("vw_ventas_por_evento")
    .select("evento_nombre, evento_tipo, turnos, primer_dia, ultimo_dia, tickets, total_vendido_mxn, propinas_mxn, comision_mxn, neto_mxn")
    .order("ultimo_dia", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const f = r as Record<string, unknown>;
    return {
      evento: String(f.evento_nombre), tipo: (f.evento_tipo as string) ?? null, turnos: num(f.turnos),
      primerDia: String(f.primer_dia ?? ""), ultimoDia: String(f.ultimo_dia ?? ""), tickets: num(f.tickets),
      total: num(f.total_vendido_mxn), propinas: num(f.propinas_mxn), comision: num(f.comision_mxn), neto: num(f.neto_mxn),
    };
  });
}

// Antifraude — reimpresiones de comanda por cajero (vw_reimpresiones_por_cajero, doc 11 §8).
// Reimpresión frecuente = posible salida de producto sin cobrar.
export type FilaReimpresion = { clave: string; cajero: string; reimpresiones: number; ticketsDistintos: number };
export async function leerReimpresionesPorCajero(desde: string, hasta: string): Promise<FilaReimpresion[]> {
  const { data, error } = await supabase
    .from("vw_reimpresiones_por_cajero")
    .select("cajero_id, cajero_email, reimpresiones_count, tickets_distintos, dia")
    .gte("dia", desde)
    .lte("dia", hasta);
  if (error) throw new Error(error.message);
  const map = new Map<string, FilaReimpresion>();
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    const k = String(r.cajero_id ?? r.cajero_email ?? "—");
    const cur = map.get(k) ?? { clave: k, cajero: String(r.cajero_email ?? "—"), reimpresiones: 0, ticketsDistintos: 0 };
    cur.reimpresiones += num(r.reimpresiones_count);
    cur.ticketsDistintos += num(r.tickets_distintos);
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.reimpresiones - a.reimpresiones);
}

// Apps externas — ventas Rappi/Uber/DiDi con estado de conciliación (vw_ventas_apps_externas).
export type FilaAppExterna = {
  ticketId: string; folioPos: string | null; folioApp: string | null; app: string; dia: string;
  totalPos: number; comision: number; netoApp: number; estado: string;
};
export async function leerVentasAppsExternas(desde: string, hasta: string): Promise<FilaAppExterna[]> {
  const { data, error } = await supabase
    .from("vw_ventas_apps_externas")
    .select("ticket_id, folio_pos, folio_app, app_externa, dia_contable, total_pos_mxn, comision_app, monto_neto_liquidado_app, estado_conciliacion")
    .gte("dia_contable", desde)
    .lte("dia_contable", hasta)
    .order("dia_contable", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    ticketId: String(r.ticket_id),
    folioPos: (r.folio_pos as string) ?? null,
    folioApp: (r.folio_app as string) ?? null,
    app: String(r.app_externa ?? "—").replace(/^APP_/, ""),
    dia: String(r.dia_contable),
    totalPos: num(r.total_pos_mxn),
    comision: num(r.comision_app),
    netoApp: num(r.monto_neto_liquidado_app),
    estado: String(r.estado_conciliacion ?? "—"),
  }));
}

// Reservaciones — no-shows por día (vw_no_shows_reservaciones).
export type FilaNoShow = {
  dia: string; total: number; llegaron: number; terminadas: number; canceladas: number;
  noShows: number; tasaPct: number; comensalesPerdidos: number;
};
export async function leerNoShows(desde: string, hasta: string): Promise<FilaNoShow[]> {
  const { data, error } = await supabase
    .from("vw_no_shows_reservaciones")
    .select("dia_reserva, reservas_total, llegaron, terminadas, canceladas, no_shows, tasa_no_show_pct, comensales_no_show")
    .gte("dia_reserva", desde)
    .lte("dia_reserva", hasta)
    .order("dia_reserva", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    dia: String(r.dia_reserva),
    total: num(r.reservas_total),
    llegaron: num(r.llegaron),
    terminadas: num(r.terminadas),
    canceladas: num(r.canceladas),
    noShows: num(r.no_shows),
    tasaPct: num(r.tasa_no_show_pct),
    comensalesPerdidos: num(r.comensales_no_show),
  }));
}
