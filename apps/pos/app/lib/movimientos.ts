"use client";
import { employeeClient } from "./supabase";

/**
 * Tipos de movimiento de caja (enum movimiento_tipo en BD).
 * SEMÁNTICA del efectivo en la caja (calcular_efectivo_esperado):
 *  - SANGRIA / DEPOSITO / PAGO_PROVEEDOR / DEVOLUCION_EFECTIVO / AJUSTE_NEGATIVO → SALEN
 *  - INYECCION_FONDO / AJUSTE_POSITIVO → ENTRAN
 *  - FONDO_APERTURA se registra al abrir el turno (no se usa aquí)
 */
export type TipoMovimiento =
  | "SANGRIA"
  | "DEPOSITO"
  | "INYECCION_FONDO"
  | "PAGO_PROVEEDOR";

export type DefMovimiento = {
  codigo: TipoMovimiento;
  label: string;
  /** Texto operativo para el cajero (lo que entiende). */
  descripcion: string;
  /** Permiso requerido en BD (matriz §2.2). */
  permiso: string;
  /** -1 = sale efectivo; +1 = entra efectivo. */
  signo: -1 | 1;
};

export const TIPOS_MOVIMIENTO: DefMovimiento[] = [
  {
    codigo: "SANGRIA",
    label: "Sangría",
    descripcion: "Retiro de efectivo de la caja a la caja fuerte / bóveda.",
    permiso: "caja.sangria",
    signo: -1,
  },
  {
    codigo: "DEPOSITO",
    label: "Depósito al banco",
    descripcion: "Salida de efectivo de la caja para depósito bancario.",
    permiso: "caja.deposito",
    signo: -1,
  },
  {
    codigo: "INYECCION_FONDO",
    label: "Refuerzo de fondo",
    descripcion: "Entrada de efectivo a la caja (fondo adicional, cambio).",
    permiso: "caja.deposito",
    signo: 1,
  },
  {
    codigo: "PAGO_PROVEEDOR",
    label: "Pago a proveedor",
    descripcion: "Salida de efectivo de la caja para pagar a un proveedor.",
    permiso: "caja.sangria",
    signo: -1,
  },
];

/** Registra un movimiento de caja. RLS valida tenant+turno; el folio lo asigna el trigger 0023. */
export async function registrarMovimiento(
  token: string,
  args: {
    tenantId: string;
    sucursalId: string;
    cajaId: string;
    turnoId: string;
    diaContable: string;
    tipo: TipoMovimiento;
    montoMxn: number;
    motivo: string;
    descripcion?: string | null;
    usuarioSolicitanteId: string;
    autorizacionPinId?: string | null;
  },
): Promise<{ id: string; folio: string }> {
  const { data, error } = await employeeClient(token)
    .from("movimientos_caja")
    .insert({
      tenant_id: args.tenantId,
      sucursal_id: args.sucursalId,
      caja_id: args.cajaId,
      turno_id: args.turnoId,
      dia_contable: args.diaContable,
      tipo: args.tipo,
      monto_mxn: args.montoMxn,
      motivo: args.motivo,
      descripcion: args.descripcion ?? null,
      usuario_solicitante_id: args.usuarioSolicitanteId,
      autorizacion_pin_id: args.autorizacionPinId ?? null,
    })
    .select("id, folio")
    .single();
  if (error) throw new Error(error.message);
  const r = data as { id: string; folio: string };
  return { id: r.id, folio: r.folio };
}
