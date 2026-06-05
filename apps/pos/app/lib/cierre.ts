"use client";
import { employeeClient } from "./supabase";

const num = (v: unknown) => Number(v ?? 0);

export type PagoMetodo = { metodo: string; total: number; cantidad: number };
export type ReporteXResumen = {
  efectivoEsperado: number;
  fondoApertura: number;
  fechaApertura: string | null;
  ticketsPagados: number;
  ticketsCancelados: number;
  ventaNeta: number;
  iva: number;
  descuentos: number;
  propinaTotal: number;
  devoluciones: number;
  pagosPorMetodo: PagoMetodo[];
};

/** Lectura intermedia del turno (no cierra nada). Bajo RLS del empleado. */
export async function leerReporteX(token: string, turnoId: string): Promise<ReporteXResumen> {
  const { data, error } = await employeeClient(token).rpc("reporte_x", { p_turno_id: turnoId });
  if (error) throw new Error(error.message);
  const x = (data ?? {}) as Record<string, unknown>;
  const tk = (x.tickets ?? {}) as Record<string, unknown>;
  const dev = (x.devoluciones ?? {}) as Record<string, unknown>;
  const pagos = (x.pagos_por_metodo ?? []) as Record<string, unknown>[];
  return {
    efectivoEsperado: num(x.efectivo_esperado_mxn),
    fondoApertura: num(x.fondo_apertura_mxn),
    fechaApertura: (x.fecha_apertura as string) ?? null,
    ticketsPagados: num(tk.total_tickets_pagados),
    ticketsCancelados: num(tk.total_tickets_cancelados),
    ventaNeta: num(tk.total_neto_mxn),
    iva: num(tk.iva_neto_mxn),
    descuentos: num(tk.descuentos_manuales_mxn),
    propinaTotal: num(tk.propina_total_mxn),
    devoluciones: num(dev.total_mxn),
    pagosPorMetodo: pagos.map((p) => ({
      metodo: String(p.metodo_pago),
      total: num(p.monto_total_mxn),
      cantidad: num(p.cantidad_pagos),
    })),
  };
}

export type DeclaracionMetodo = { metodoPago: string; montoDeclarado: number; nota?: string };
export type CorteDetalle = { metodo: string; esperado: number; declarado: number; diferencia: number };
export type CorteResultado = {
  corteCajaId: string;
  totalEsperado: number;
  totalDeclarado: number;
  diferenciaTotal: number;
  detalle: CorteDetalle[];
};

/** Genera el corte de caja (esperado vs declarado por método). */
export async function arquearCaja(
  token: string,
  args: { turnoId: string; declaraciones: DeclaracionMetodo[]; usuarioId: string; autorizacionPinId?: string | null },
): Promise<CorteResultado> {
  const { data, error } = await employeeClient(token).rpc("arquear_caja", {
    p_turno_id: args.turnoId,
    p_declaraciones: args.declaraciones.map((d) => ({
      metodo_pago: d.metodoPago,
      monto_declarado_mxn: d.montoDeclarado,
      nota: d.nota ?? null,
    })),
    p_motivo_corte: "CIERRE_TURNO",
    p_usuario_id: args.usuarioId,
    p_autorizacion_pin_id: args.autorizacionPinId ?? null,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as Record<string, unknown>;
  const det = (r.detalle ?? []) as Record<string, unknown>[];
  return {
    corteCajaId: String(r.corte_caja_id),
    totalEsperado: num(r.total_esperado_mxn),
    totalDeclarado: num(r.total_declarado_mxn),
    diferenciaTotal: num(r.diferencia_total_mxn),
    detalle: det.map((d) => ({
      metodo: String(d.metodo_pago),
      esperado: num(d.esperado),
      declarado: num(d.declarado),
      diferencia: num(d.diferencia),
    })),
  };
}

export type CierreZ = { estado: string; reporteZId: string; folioZ: string | null; payload: Record<string, unknown> };

/** Cierra el turno generando el Reporte Z (inmutable). Exige autorizacion_pin_id (D64). */
export async function cerrarTurnoZ(
  token: string,
  args: { turnoId: string; efectivoDeclarado: number; autorizacionPinId: string; usuarioId: string; nota?: string | null },
): Promise<CierreZ> {
  const { data, error } = await employeeClient(token).rpc("reporte_z", {
    p_turno_id: args.turnoId,
    p_efectivo_declarado_mxn: args.efectivoDeclarado,
    p_autorizacion_pin_id: args.autorizacionPinId,
    p_cerrado_por_usuario_id: args.usuarioId,
    p_nota: args.nota ?? null,
  });
  if (error) throw new Error(error.message);
  const z = (data ?? {}) as Record<string, unknown>;
  const payload = (z.payload ?? {}) as Record<string, unknown>;
  const reporteZId = String(z.reporte_z_id);
  // El folio_z lo asigna un trigger al insertar; no viene en el payload de la RPC → leerlo.
  let folioZ: string | null = (payload.folio_z as string | undefined) ?? null;
  if (!folioZ && reporteZId) {
    const { data: row } = await employeeClient(token)
      .from("reportes_z_historico")
      .select("folio_z")
      .eq("id", reporteZId)
      .maybeSingle();
    folioZ = (row as { folio_z: string } | null)?.folio_z ?? null;
  }
  return { estado: String(z.estado), reporteZId, folioZ, payload };
}
