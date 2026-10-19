"use client";
import { supabase } from "./supabase";
import { tenantId } from "./datos";

// Cotizaciones (retail 2, 0212). El dueño las enciende, fija cuántos días valen y ve la lista.
// Una cotización no es venta: aquí solo se lee. «Vencida» no es un estado de la base.

/** Los centavos de un monto que llega de la base como texto o número: la suma no arrastra floats. */
const cent = (v: unknown) => Math.round(Number(v ?? 0) * 100);

// ── Configuración del negocio ────────────────────────────────────────────────

export type ConfigCotizaciones = { activo: boolean; vigenciaDias: number };

export const vigenciaValida = (v: string): boolean => /^\d+$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 365;

/** Sin fila en `configuracion_tenant` las cotizaciones están apagadas y valen 15 días. */
export async function leerConfigCotizaciones(): Promise<ConfigCotizaciones> {
  const tid = await tenantId();
  const { data, error } = await supabase
    .from("configuracion_tenant")
    .select("modulo_cotizaciones_activo, cotizacion_vigencia_dias")
    .eq("tenant_id", tid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { activo: data?.modulo_cotizaciones_activo === true, vigenciaDias: data?.cotizacion_vigencia_dias ?? 15 };
}

/** Mismo upsert que el crédito; la base lo deja cambiar solo al dueño o a un administrador (0212). */
export async function guardarConfigCotizaciones(cambio: Partial<ConfigCotizaciones>): Promise<void> {
  const tid = await tenantId();
  const fila: Record<string, unknown> = { tenant_id: tid };
  if (cambio.activo !== undefined) fila.modulo_cotizaciones_activo = cambio.activo;
  if (cambio.vigenciaDias !== undefined) fila.cotizacion_vigencia_dias = cambio.vigenciaDias;
  const { error } = await supabase.from("configuracion_tenant").upsert(fila, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);
}

// ── La lista ─────────────────────────────────────────────────────────────────

export type EstadoCotizacion = "VIGENTE" | "VENCIDA" | "CONVERTIDA" | "CANCELADA";
export type FiltroCotizacion = EstadoCotizacion | "TODAS";

export type Cotizacion = {
  id: string; folio: string; estado: EstadoCotizacion; creada: string; vigenteHasta: string;
  total: number; cliente: string | null; sucursal: string; folioVenta: string | null;
};

type FilaCotizacion = {
  id: string; folio: string; estado: string; vigente_hasta: string; total_mxn: unknown;
  cliente_id: string | null; sucursal_id: string; ticket_id: string | null; created_at: string;
};

/** La fecha (AAAA-MM-DD) de un instante en la zona del negocio. */
export function diaEnZona(iso: string, zona: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** VIGENTE con la vigencia ya pasada se muestra como VENCIDA; el último día aún vale. */
export function estadoVisible(estado: string, vigenteHasta: string, hoy: string): EstadoCotizacion {
  if (estado === "CONVERTIDA" || estado === "CANCELADA") return estado;
  return vigenteHasta < hoy ? "VENCIDA" : "VIGENTE";
}

export function armarCotizaciones(
  filas: FilaCotizacion[],
  ctx: { hoy: string; nombres: Map<string, string>; sucursales: Map<string, string>; ventas: Map<string, string> },
): Cotizacion[] {
  return filas
    .map((f) => ({
      id: f.id, folio: f.folio, estado: estadoVisible(f.estado, f.vigente_hasta, ctx.hoy),
      creada: f.created_at, vigenteHasta: f.vigente_hasta, total: cent(f.total_mxn) / 100,
      cliente: (f.cliente_id && ctx.nombres.get(f.cliente_id)) || null,
      sucursal: ctx.sucursales.get(f.sucursal_id) ?? "—",
      folioVenta: (f.ticket_id && ctx.ventas.get(f.ticket_id)) || null,
    }))
    .sort((a, b) => b.creada.localeCompare(a.creada));
}

export const filtrarPorEstado = (l: Cotizacion[], f: FiltroCotizacion): Cotizacion[] =>
  f === "TODAS" ? l : l.filter((c) => c.estado === f);

/** Cotizado este mes (sin canceladas) y cuánto de eso se convirtió en venta. */
export function totalesCotizaciones(l: Cotizacion[], hoy: string, zona: string): { cotizado: number; convertido: number } {
  const mes = hoy.slice(0, 7);
  let cotizado = 0;
  let convertido = 0;
  for (const c of l) {
    if (c.estado === "CANCELADA" || diaEnZona(c.creada, zona).slice(0, 7) !== mes) continue;
    cotizado += cent(c.total);
    if (c.estado === "CONVERTIDA") convertido += cent(c.total);
  }
  return { cotizado: cotizado / 100, convertido: convertido / 100 };
}

export type ListaCotizaciones = { cotizaciones: Cotizacion[]; hoy: string; zona: string };

export async function listarCotizaciones(): Promise<ListaCotizaciones> {
  const tid = await tenantId();
  const [ten, cot, suc] = await Promise.all([
    supabase.from("tenants").select("timezone").eq("id", tid).maybeSingle(),
    supabase.from("cotizaciones")
      .select("id, folio, estado, vigente_hasta, total_mxn, cliente_id, sucursal_id, ticket_id, created_at")
      .eq("tenant_id", tid).order("created_at", { ascending: false }).limit(500),
    supabase.from("sucursales").select("id, nombre").is("deleted_at", null),
  ]);
  if (ten.error) throw new Error(ten.error.message);
  if (cot.error) throw new Error(cot.error.message);
  if (suc.error) throw new Error(suc.error.message);
  const zona = ten.data?.timezone || "America/Mexico_City";
  const filas = (cot.data ?? []) as FilaCotizacion[];

  const clienteIds = [...new Set(filas.map((f) => f.cliente_id).filter((x): x is string => !!x))];
  const ticketIds = [...new Set(filas.map((f) => f.ticket_id).filter((x): x is string => !!x))];
  const [cl, tk] = await Promise.all([
    clienteIds.length ? supabase.from("clientes").select("id, nombre, apellido_paterno").in("id", clienteIds) : null,
    ticketIds.length ? supabase.from("tickets").select("id, folio_completo").in("id", ticketIds) : null,
  ]);
  if (cl?.error) throw new Error(cl.error.message);
  if (tk?.error) throw new Error(tk.error.message);
  const nombres = new Map((cl?.data ?? []).map((c) => [c.id, [c.nombre, c.apellido_paterno].filter(Boolean).join(" ")]));
  const ventas = new Map((tk?.data ?? []).flatMap((t) => (t.folio_completo ? [[t.id, t.folio_completo] as const] : [])));
  const sucursales = new Map((suc.data ?? []).map((s) => [s.id, s.nombre]));

  const hoy = diaEnZona(new Date().toISOString(), zona);
  return { cotizaciones: armarCotizaciones(filas, { hoy, nombres, sucursales, ventas }), hoy, zona };
}
