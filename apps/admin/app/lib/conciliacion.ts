"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";
import { conciliarItems, resumenConciliacion, type LiqItem, type TicketPos } from "./conciliacion-match";

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

const N = (v: unknown): number => Number(v ?? 0);
export const APPS = ["APP_RAPPI", "APP_UBEREATS", "APP_DIDI", "APP_IFOOD", "APP_OTRO"] as const;
export type AppExterna = (typeof APPS)[number];
export const LABEL_APP: Record<AppExterna, string> = {
  APP_RAPPI: "Rappi", APP_UBEREATS: "Uber Eats", APP_DIDI: "DiDi Food", APP_IFOOD: "iFood", APP_OTRO: "Otra",
};

export type Liquidacion = {
  id: string;
  appExterna: AppExterna;
  folio: string;
  periodoInicio: string;
  periodoFin: string;
  totalVentasBrutasMxn: number;
  totalLiquidadoMxn: number;
  totalPosMxn: number | null;
  diferenciaMxn: number | null;
  porcentajeMatch: number | null;
  estado: string;
};

function mapLiq(d: Record<string, unknown>): Liquidacion {
  return {
    id: String(d.id),
    appExterna: d.app_externa as AppExterna,
    folio: String(d.folio_liquidacion_app),
    periodoInicio: String(d.periodo_inicio),
    periodoFin: String(d.periodo_fin),
    totalVentasBrutasMxn: N(d.total_ventas_brutas_mxn),
    totalLiquidadoMxn: N(d.total_liquidado_mxn),
    totalPosMxn: d.total_pos_mxn == null ? null : N(d.total_pos_mxn),
    diferenciaMxn: d.diferencia_mxn == null ? null : N(d.diferencia_mxn),
    porcentajeMatch: d.porcentaje_match == null ? null : N(d.porcentaje_match),
    estado: String(d.estado),
  };
}

export async function listarLiquidaciones(): Promise<Liquidacion[]> {
  const { data, error } = await supabase
    .from("apps_liquidaciones")
    .select("id, app_externa, folio_liquidacion_app, periodo_inicio, periodo_fin, total_ventas_brutas_mxn, total_liquidado_mxn, total_pos_mxn, diferencia_mxn, porcentaje_match, estado")
    .order("periodo_fin", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => mapLiq(d as Record<string, unknown>));
}

// ── Alta: cabecera + renglones (de un CSV/pegado parseado) ────────────────────
export const renglonSchema = z.object({
  folioExternoApp: z.string().trim().min(1),
  montoVentaMxn: z.number(),
  montoComisionMxn: z.number().default(0),
  montoPropinaMxn: z.number().default(0),
  montoNetoMxn: z.number(),
  fechaOrden: z.string().nullable().default(null),
});
export type Renglon = z.infer<typeof renglonSchema>;

export const nuevaLiquidacionSchema = z.object({
  appExterna: z.enum(APPS),
  folio: z.string().trim().min(1, "Folio de la liquidación obligatorio"),
  periodoInicio: z.string().min(1, "Fecha inicio"),
  periodoFin: z.string().min(1, "Fecha fin"),
  totalLiquidadoMxn: z.number(),
  renglones: z.array(renglonSchema).min(1, "Sube al menos un renglón"),
});
export type NuevaLiquidacion = z.infer<typeof nuevaLiquidacionSchema>;

export async function crearLiquidacion(input: NuevaLiquidacion): Promise<string> {
  const d = nuevaLiquidacionSchema.parse(input);
  const tid = await tenantId();
  const brutas = d.renglones.reduce((s, r) => s + r.montoVentaMxn, 0);
  const comis = d.renglones.reduce((s, r) => s + r.montoComisionMxn, 0);
  const props = d.renglones.reduce((s, r) => s + r.montoPropinaMxn, 0);

  const { data: liq, error: e1 } = await supabase
    .from("apps_liquidaciones")
    .insert({
      tenant_id: tid, app_externa: d.appExterna, folio_liquidacion_app: d.folio,
      periodo_inicio: d.periodoInicio, periodo_fin: d.periodoFin,
      total_ventas_brutas_mxn: brutas, total_comisiones_mxn: comis, total_propinas_mxn: props,
      total_liquidado_mxn: d.totalLiquidadoMxn, ingesta_metodo: "MANUAL", estado: "PENDIENTE",
    })
    .select("id").single();
  if (e1) throw new Error(e1.message);
  const liqId = (liq as { id: string }).id;

  const items = d.renglones.map((r) => ({
    tenant_id: tid, liquidacion_id: liqId, folio_externo_app: r.folioExternoApp,
    fecha_orden_app: r.fechaOrden, monto_venta_mxn: r.montoVentaMxn, monto_comision_mxn: r.montoComisionMxn,
    monto_propina_mxn: r.montoPropinaMxn, monto_neto_mxn: r.montoNetoMxn,
  }));
  const { error: e2 } = await supabase.from("apps_liquidacion_items").insert(items);
  if (e2) throw new Error(e2.message);
  return liqId;
}

// ── Conciliar: corre el motor contra los tickets del POS y persiste el match ──
export type ItemConciliado = {
  id: string;
  folioExternoApp: string;
  montoVentaMxn: number;
  ticketIdMatch: string | null;
  matchMetodo: string | null;
  diferenciaMxn: number | null;
  ticketFolio: string | null;
};

export async function conciliarLiquidacion(liqId: string): Promise<{ porcentajeMatch: number; estado: string }> {
  const tid = await tenantId();
  const { data: liqRaw, error: eL } = await supabase
    .from("apps_liquidaciones").select("app_externa, periodo_inicio, periodo_fin").eq("id", liqId).single();
  if (eL || !liqRaw) throw new Error(eL?.message ?? "Liquidación no encontrada");
  const liq = liqRaw as { app_externa: string; periodo_inicio: string; periodo_fin: string };

  const { data: itemsRaw, error: eI } = await supabase
    .from("apps_liquidacion_items").select("id, folio_externo_app, monto_venta_mxn, fecha_orden_app").eq("liquidacion_id", liqId);
  if (eI) throw new Error(eI.message);
  const items: LiqItem[] = (itemsRaw ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return { id: String(x.id), folioExternoApp: String(x.folio_externo_app), montoVentaMxn: N(x.monto_venta_mxn), fechaOrden: x.fecha_orden_app as string | null };
  });

  // Tickets del POS de esa app en el período (pagados).
  const { data: ticksRaw, error: eT } = await supabase
    .from("tickets").select("id, folio_externo_app, folio_completo, total_mxn, fecha_apertura")
    .eq("modo_servicio", liq.app_externa)
    .gte("dia_contable", liq.periodo_inicio).lte("dia_contable", liq.periodo_fin)
    .in("estado_fiscal", ["PAGADO", "FACTURADO"]);
  if (eT) throw new Error(eT.message);
  const folioPorTicket = new Map<string, string>();
  const tickets: TicketPos[] = (ticksRaw ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    folioPorTicket.set(String(x.id), (x.folio_completo as string) ?? "");
    return { id: String(x.id), folioExternoApp: x.folio_externo_app as string | null, totalMxn: N(x.total_mxn), fecha: String(x.fecha_apertura) };
  });

  const resultados = conciliarItems(items, tickets);
  const resumen = resumenConciliacion(items, tickets, resultados);

  // Persistir match por ítem.
  for (const r of resultados) {
    await supabase.from("apps_liquidacion_items").update({
      ticket_id_match: r.ticketId, match_metodo: r.metodo, monto_diferencia_mxn: r.diferenciaMxn,
      match_at: r.ticketId ? new Date().toISOString() : null,
    }).eq("id", r.itemId);
  }
  // Actualizar cabecera.
  const { error: eU } = await supabase.from("apps_liquidaciones").update({
    total_pos_mxn: resumen.totalPosMxn, diferencia_mxn: resumen.diferenciaTotalMxn,
    porcentaje_match: resumen.porcentajeMatch, estado: resumen.estado, conciliado_at: new Date().toISOString(),
  }).eq("id", liqId);
  if (eU) throw new Error(eU.message);

  return { porcentajeMatch: resumen.porcentajeMatch, estado: resumen.estado };
}

export async function leerItemsConciliados(liqId: string): Promise<ItemConciliado[]> {
  const { data, error } = await supabase
    .from("apps_liquidacion_items")
    .select("id, folio_externo_app, monto_venta_mxn, ticket_id_match, match_metodo, monto_diferencia_mxn, ticket:tickets(folio_completo)")
    .eq("liquidacion_id", liqId)
    .order("folio_externo_app");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    const t = x.ticket as { folio_completo?: string } | null;
    return {
      id: String(x.id), folioExternoApp: String(x.folio_externo_app), montoVentaMxn: N(x.monto_venta_mxn),
      ticketIdMatch: (x.ticket_id_match as string) ?? null, matchMetodo: (x.match_metodo as string) ?? null,
      diferenciaMxn: x.monto_diferencia_mxn == null ? null : N(x.monto_diferencia_mxn),
      ticketFolio: t?.folio_completo ?? null,
    };
  });
}
