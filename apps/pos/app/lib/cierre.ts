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

/**
 * Cuenta tickets ABIERTOS (sin cobrar) del turno: cuentas de mesa/domicilio que siguen vivas.
 * Cerrar el turno con tickets abiertos los deja huérfanos (mesa trabada, venta sin cobrar),
 * así que el arqueo lo usa para advertir y bloquear el corte hasta resolverlos.
 */
export async function contarTicketsAbiertos(token: string, turnoId: string): Promise<number> {
  const { count, error } = await employeeClient(token)
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("turno_id", turnoId)
    .eq("estado_fiscal", "ABIERTO")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
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

// ─── F5.4soft: datos extra para el Reporte Z estilo Soft ────────────────────

export type DatosFiscales = {
  /** Razón social (vacío si tenant TRIAL). */
  razonSocial: string;
  rfc: string;
  /** Dirección formateada de la sucursal (línea única). */
  direccionSucursal: string;
  /** Teléfono de la sucursal (puede ir vacío). */
  telefonoSucursal: string;
};

/** Lee razón social + RFC del tenant y dirección de la sucursal. Bajo RLS. */
export async function leerDatosFiscales(token: string, tenantId: string, sucursalId: string): Promise<DatosFiscales> {
  const sb = employeeClient(token);
  const [tenRes, sucRes] = await Promise.all([
    sb.from("tenants").select("razon_social, rfc").eq("id", tenantId).maybeSingle(),
    sb.from("sucursales")
      .select("direccion_calle, direccion_numero, direccion_colonia, ciudad, estado_geo, codigo_postal, telefono")
      .eq("id", sucursalId).maybeSingle(),
  ]);
  const tn = (tenRes.data ?? {}) as Record<string, string | null>;
  const sc = (sucRes.data ?? {}) as Record<string, string | null>;
  const direccion = [
    [sc.direccion_calle, sc.direccion_numero].filter(Boolean).join(" "),
    sc.direccion_colonia,
    [sc.ciudad, sc.estado_geo].filter(Boolean).join(", "),
    sc.codigo_postal ? `CP ${sc.codigo_postal}` : null,
  ].filter(Boolean).join(", ");
  return {
    razonSocial: tn.razon_social ?? "",
    rfc: tn.rfc ?? "",
    direccionSucursal: direccion,
    telefonoSucursal: sc.telefono ?? "",
  };
}

export type MovimientosTurno = {
  /** Suma de movimientos que ENTRAN efectivo a la caja (INYECCION_FONDO + AJUSTE_POSITIVO). */
  depositosEntrantes: number;
  /** Suma de movimientos que SALEN efectivo de la caja (SANGRIA + DEPOSITO + PAGO_PROVEEDOR + AJUSTE_NEGATIVO + DEVOLUCION_EFECTIVO). */
  retirosSalientes: number;
  /** Lista para detalle (cada movimiento individual). */
  detalle: { tipo: string; folio: string; monto: number; motivo: string }[];
};

/** Lee los movimientos de caja del turno (suma firmada para el reporte Z). */
export async function leerMovimientosTurno(token: string, turnoId: string): Promise<MovimientosTurno> {
  const { data, error } = await employeeClient(token)
    .from("movimientos_caja")
    .select("tipo, folio, monto_mxn, motivo")
    .eq("turno_id", turnoId)
    .eq("cancelado", false);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { tipo: string; folio: string; monto_mxn: string | number; motivo: string }[];
  let entrantes = 0, salientes = 0;
  const detalle: { tipo: string; folio: string; monto: number; motivo: string }[] = [];
  for (const r of rows) {
    const m = Number(r.monto_mxn);
    if (r.tipo === "INYECCION_FONDO" || r.tipo === "AJUSTE_POSITIVO") entrantes += m;
    else if (r.tipo === "FONDO_APERTURA") continue;        // el fondo va aparte
    else salientes += m;                                    // SANGRIA, DEPOSITO, PAGO_PROVEEDOR, etc.
    detalle.push({ tipo: r.tipo, folio: r.folio, monto: m, motivo: r.motivo });
  }
  return {
    depositosEntrantes: Math.round(entrantes * 100) / 100,
    retirosSalientes: Math.round(salientes * 100) / 100,
    detalle,
  };
}

export type ModoServicioVenta = { modo: string; total: number; cantidad: number; porcentaje: number };
export type EstadisticasTurno = {
  cuentasNormales: number;        // = ticketsPagados
  cuentasCanceladas: number;
  cuentasConDescuento: number;    // tickets con descuentos_manuales_mxn > 0
  ticketPromedio: number;
  folioInicial: string | null;
  folioFinal: string | null;
  /** Venta por modo de servicio (COMER_AQUI / PARA_LLEVAR / DRIVE_THRU) con %. */
  ventaPorModoServicio: ModoServicioVenta[];
};

const MODO_LABEL_SOFT: Record<string, string> = {
  COMER_AQUI: "COMEDOR",
  PARA_LLEVAR: "PARA LLEVAR",
  DRIVE_THRU: "DRIVE-THRU",
};

/** Estadísticas adicionales del turno para el cierre estilo Soft. Bajo RLS. */
export async function leerEstadisticasTurno(token: string, turnoId: string): Promise<EstadisticasTurno> {
  const sb = employeeClient(token);
  const { data, error } = await sb
    .from("tickets")
    .select("folio_completo, estado_fiscal, total_mxn, descuentos_manuales_mxn, modo_servicio, created_at")
    .eq("turno_id", turnoId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    folio_completo: string | null;
    estado_fiscal: string;
    total_mxn: string | number;
    descuentos_manuales_mxn: string | number;
    modo_servicio: string;
    created_at: string;
  }[];

  const pagados = rows.filter((r) => r.estado_fiscal === "PAGADO" || r.estado_fiscal === "FACTURADO");
  const cancelados = rows.filter((r) => r.estado_fiscal === "CANCELADO");
  const conDescuento = pagados.filter((r) => Number(r.descuentos_manuales_mxn) > 0);
  const totalVendido = pagados.reduce((s, r) => s + Number(r.total_mxn), 0);
  const promedio = pagados.length > 0 ? totalVendido / pagados.length : 0;

  const conFolio = pagados.filter((r) => r.folio_completo != null).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const folioInicial = conFolio[0]?.folio_completo ?? null;
  const folioFinal = conFolio[conFolio.length - 1]?.folio_completo ?? null;

  // Venta por modo de servicio
  const porModo = new Map<string, { total: number; cantidad: number }>();
  for (const r of pagados) {
    const acc = porModo.get(r.modo_servicio) ?? { total: 0, cantidad: 0 };
    acc.total += Number(r.total_mxn);
    acc.cantidad += 1;
    porModo.set(r.modo_servicio, acc);
  }
  const ventaPorModoServicio: ModoServicioVenta[] = [...porModo.entries()].map(([modo, v]) => ({
    modo: MODO_LABEL_SOFT[modo] ?? modo,
    total: Math.round(v.total * 100) / 100,
    cantidad: v.cantidad,
    porcentaje: totalVendido > 0 ? Math.round((v.total / totalVendido) * 1000) / 10 : 0,
  })).sort((a, b) => b.total - a.total);

  return {
    cuentasNormales: pagados.length,
    cuentasCanceladas: cancelados.length,
    cuentasConDescuento: conDescuento.length,
    ticketPromedio: Math.round(promedio * 100) / 100,
    folioInicial,
    folioFinal,
    ventaPorModoServicio,
  };
}
