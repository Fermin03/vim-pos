"use client";
import { employeeClient } from "./supabase";

/**
 * Movimientos de caja durante el turno: solo DOS, retiro y depósito.
 *
 * POR QUÉ DOS Y NO CUATRO
 *
 * Había cuatro tipos en pantalla —sangría, depósito al banco, refuerzo de fondo y pago a
 * proveedor— y el cajero tenía que clasificar antes de capturar. Pero para la caja solo existen
 * dos hechos: el efectivo SALE o el efectivo ENTRA. Todo lo demás (a quién, para qué, con qué
 * folio) es el motivo, y el motivo se escribe igual de bien en un campo que en un botón.
 *
 * Cuatro botones también invitaban a elegir mal: "depósito" y "sangría" restan lo mismo, así que
 * equivocarse no cambiaba el efectivo pero sí ensuciaba el reporte por tipo. Con dos, lo único
 * que hay que acertar es la dirección del dinero — y esa sí se ve a simple vista.
 *
 * EL ENUM DE LA BD NO CAMBIA
 *
 * `movimiento_tipo` sigue teniendo sus valores y el histórico se queda como está. Lo que cambia
 * es qué produce la caja de hoy en adelante:
 *
 *   Retiro   → SANGRIA          (sale efectivo)
 *   Depósito → INYECCION_FONDO  (entra efectivo)
 *
 * `DEPOSITO` y `PAGO_PROVEEDOR` dejan de generarse desde el POS; ahora viajan como motivo de un
 * retiro. `calcular_efectivo_esperado` los sigue entendiendo, así que los turnos viejos cuadran
 * igual que antes.
 *
 * OJO CON EL NOMBRE: el enum `DEPOSITO` es el depósito AL BANCO, que resta efectivo. El botón
 * "Depósito" de esta pantalla es lo contrario —dinero que entra a la caja— y por eso mapea a
 * `INYECCION_FONDO`. Si alguna vez alguien los empareja por el nombre, el corte se va al doble
 * del monto en sentido contrario.
 */
export type TipoMovimiento =
  | "SANGRIA"
  | "DEPOSITO"
  | "INYECCION_FONDO"
  | "PAGO_PROVEEDOR";

export type DefMovimiento = {
  codigo: TipoMovimiento;
  label: string;
  /** Lo que le pasa al efectivo, dicho como lo diría el cajero. */
  descripcion: string;
  /** Permiso requerido en BD (matriz §2.2). */
  permiso: string;
  /** -1 = sale efectivo; +1 = entra efectivo. */
  signo: -1 | 1;
  /** Motivos frecuentes. El último siempre deja escribir a mano. */
  motivos: string[];
};

export const TIPOS_MOVIMIENTO: DefMovimiento[] = [
  {
    codigo: "SANGRIA",
    label: "Retiro",
    descripcion: "Sale efectivo de la caja",
    permiso: "caja.sangria",
    signo: -1,
    // Los tres primeros son los tipos que antes eran botones (P-098 los lista como motivos).
    motivos: [
      "Depósito al banco",
      "Pago a proveedor",
      "Retiro a caja fuerte",
      "Cambio para otra caja",
      "Gasto operativo",
    ],
  },
  {
    codigo: "INYECCION_FONDO",
    label: "Depósito",
    descripcion: "Entra efectivo a la caja",
    permiso: "caja.deposito",
    signo: 1,
    motivos: [
      "Refuerzo de fondo",
      "Cambio para la caja",
      "Devolución de un retiro",
    ],
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
