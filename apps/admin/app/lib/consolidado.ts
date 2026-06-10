"use client";
import { supabase } from "./supabase";

// B5 Enterprise · reporteo central: consolidado comparativo por sucursal sobre
// vw_estado_resultados_dia (una fila por sucursal/día, RLS por tenant). Sin migración.

const num = (v: unknown): number => Number(v ?? 0);

export type FilaConsolidado = {
  sucursalId: string;
  sucursal: string;
  tickets: number;
  cancelados: number;
  venta: number;
  ticketPromedio: number;
  propinas: number;
  descuentos: number;
  devoluciones: number;
  /** Participación de la sucursal en la venta total del rango (0..100). */
  participacionPct: number;
};

export type Consolidado = {
  filas: FilaConsolidado[];
  total: Omit<FilaConsolidado, "sucursalId" | "sucursal" | "participacionPct">;
};

/** Agrega filas (sucursal/día) en un comparativo por sucursal + fila total. Puro, testeable. */
export function consolidarFilas(
  filas: { sucursal_id: string; tickets_completados: number; tickets_cancelados: number; total_neto_mxn: number; propinas_capturadas_mxn: number; descuentos_manuales_mxn: number; devoluciones_mxn: number }[],
  nombres: Map<string, string>,
): Consolidado {
  const por = new Map<string, FilaConsolidado>();
  for (const f of filas) {
    const k = f.sucursal_id;
    const cur = por.get(k) ?? {
      sucursalId: k, sucursal: nombres.get(k) ?? "Sucursal", tickets: 0, cancelados: 0,
      venta: 0, ticketPromedio: 0, propinas: 0, descuentos: 0, devoluciones: 0, participacionPct: 0,
    };
    cur.tickets += num(f.tickets_completados);
    cur.cancelados += num(f.tickets_cancelados);
    cur.venta += num(f.total_neto_mxn);
    cur.propinas += num(f.propinas_capturadas_mxn);
    cur.descuentos += num(f.descuentos_manuales_mxn);
    cur.devoluciones += num(f.devoluciones_mxn);
    por.set(k, cur);
  }
  const lista = [...por.values()];
  const ventaTotal = lista.reduce((a, s) => a + s.venta, 0);
  for (const s of lista) {
    s.ticketPromedio = s.tickets > 0 ? Math.round((s.venta / s.tickets) * 100) / 100 : 0;
    s.participacionPct = ventaTotal > 0 ? Math.round((s.venta / ventaTotal) * 1000) / 10 : 0;
    s.venta = Math.round(s.venta * 100) / 100;
  }
  lista.sort((a, b) => b.venta - a.venta);
  const tickets = lista.reduce((a, s) => a + s.tickets, 0);
  return {
    filas: lista,
    total: {
      tickets,
      cancelados: lista.reduce((a, s) => a + s.cancelados, 0),
      venta: Math.round(ventaTotal * 100) / 100,
      ticketPromedio: tickets > 0 ? Math.round((ventaTotal / tickets) * 100) / 100 : 0,
      propinas: lista.reduce((a, s) => a + s.propinas, 0),
      descuentos: lista.reduce((a, s) => a + s.descuentos, 0),
      devoluciones: lista.reduce((a, s) => a + s.devoluciones, 0),
    },
  };
}

export async function leerConsolidadoPorSucursal(desde: string, hasta: string): Promise<Consolidado> {
  const [{ data: er, error: e1 }, { data: sucs, error: e2 }] = await Promise.all([
    supabase
      .from("vw_estado_resultados_dia")
      .select("sucursal_id, tickets_completados, tickets_cancelados, total_neto_mxn, propinas_capturadas_mxn, descuentos_manuales_mxn, devoluciones_mxn")
      .gte("dia_contable", desde)
      .lte("dia_contable", hasta),
    supabase.from("sucursales").select("id, nombre").is("deleted_at", null),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  const nombres = new Map((sucs ?? []).map((s) => [String((s as { id: string }).id), String((s as { nombre: string }).nombre)]));
  return consolidarFilas((er ?? []) as Parameters<typeof consolidarFilas>[0], nombres);
}
