"use client";
import { employeeClient } from "./supabase";

// Consulta de cuentas — historial de tickets ya CERRADOS (PAGADO) o CANCELADO, para revisarlos,
// reimprimirlos y (fases siguientes) cancelar/reabrir/cambiar forma de pago. El detalle completo
// (items, pagos, totales) se lee con leerTicketParaImpresion (print/ticket-datos), reutilizado.
export type EstadoCuenta = "PAGADO" | "CANCELADO";

export type CuentaCerrada = {
  ticketId: string;
  folio: string | null;
  modo: string;
  total: number;
  estado: EstadoCuenta;
  fechaIso: string | null;    // fecha_pago ?? fecha_apertura
  cliente: string | null;
};

export type FiltroCuentas =
  | { tipo: "turno"; turnoId: string }
  | { tipo: "fechas"; sucursalId: string; desde: string; hasta: string }; // ISO (inclusive)

/** Lista las cuentas cerradas/canceladas según el filtro (turno actual o rango de fechas). */
export async function listarCuentas(token: string, filtro: FiltroCuentas): Promise<CuentaCerrada[]> {
  let q = employeeClient(token)
    .from("tickets")
    .select("id, folio_completo, modo_servicio, total_mxn, estado_fiscal, fecha_pago, fecha_apertura, cliente:clientes(nombre)")
    .in("estado_fiscal", ["PAGADO", "CANCELADO"]);
  if (filtro.tipo === "turno") {
    q = q.eq("turno_id", filtro.turnoId);
  } else {
    q = q.eq("sucursal_id", filtro.sucursalId).gte("fecha_apertura", filtro.desde).lte("fecha_apertura", filtro.hasta);
  }
  const { data, error } = await q.order("fecha_apertura", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((t) => ({
    ticketId: String(t.id),
    folio: (t.folio_completo as string) ?? null,
    modo: String(t.modo_servicio ?? ""),
    total: Number(t.total_mxn ?? 0),
    estado: (t.estado_fiscal as EstadoCuenta) ?? "PAGADO",
    fechaIso: (t.fecha_pago as string) ?? (t.fecha_apertura as string) ?? null,
    cliente: ((t.cliente as { nombre?: string } | null)?.nombre) ?? null,
  }));
}

const MODO_LABEL: Record<string, string> = {
  COMER_AQUI: "Comedor", MESA: "Mesa", PARA_LLEVAR: "Para llevar", DRIVE_THRU: "Pick-up", DELIVERY_PROPIO: "Domicilio",
};
export function labelModoCuenta(m: string): string {
  return MODO_LABEL[m] ?? m;
}
