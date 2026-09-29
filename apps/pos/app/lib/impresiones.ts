"use client";
import { employeeClient } from "./supabase";
import { subDeToken } from "./autorizacion";
import type { LineaComanda } from "./print/comanda-builder";

/**
 * Bitácora de lo que imprime la caja (0126).
 *
 * La base tenía desde la 0009 la tabla `comanda_impresiones`, la función `imprimir_comanda` y el
 * reporte "Reimpresiones por cajero", pero ninguna pantalla la llamaba: el reporte salía vacío y
 * reimprimir una comanda —la forma más barata de sacar comida sin cobrar— no dejaba rastro.
 *
 * Todo aquí es BEST-EFFORT: registrar nunca puede impedir que salga el papel. Si falla, se anota
 * en la consola y la impresión sigue; perder un renglón de bitácora es menos grave que dejar a la
 * cocina sin comanda.
 */

export type EventoComanda = "IMPRESION_INICIAL" | "REIMPRESION_CAJERO" | "ANULACION_COMANDA";
export type ResultadoComanda = "OK" | "IMPRESORA_OFFLINE" | "ERROR_DESCONOCIDO";

/** Lo que el llamador sabe de la impresión y que no viaja en el papel. */
export type RegistroComanda = {
  ticketId: string;
  evento: EventoComanda;
  /** Solo REIMPRESION_CAJERO: el motivo que eligió el cajero. */
  razon?: string;
  /** Solo REIMPRESION_CAJERO: la autorización (PIN de supervisor o la propia del rol). */
  autorizacionPinId?: string;
};

export async function registrarImpresionComanda(
  token: string,
  r: RegistroComanda & {
    areaId: string | null;
    impresora: string | null;
    lineas: LineaComanda[];
    resultado: ResultadoComanda;
    errorDetalle?: string | null;
  },
): Promise<void> {
  try {
    const { error } = await employeeClient(token).rpc("imprimir_comanda", {
      p_ticket_id: r.ticketId,
      p_area_cocina_id: r.areaId,
      p_impresora_identificador: r.impresora,
      p_items_incluidos: r.lineas.map((l) => ({ cantidad: l.cantidad, nombre: l.nombre, modificadores: l.modificadores })),
      p_evento_tipo: r.evento,
      p_resultado: r.resultado,
      p_error_detalle: r.errorDetalle ?? null,
      p_razon_reimpresion: r.razon ?? null,
      p_autorizacion_pin_id: r.autorizacionPinId ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.warn("[impresiones] no se registró la comanda:", e instanceof Error ? e.message : e);
  }
}

/** Desde dónde se reimprimió el ticket del cliente. */
export type OrigenReimpresionTicket = "CUENTAS" | "CONSULTA" | "COPIA_COBRO";

export async function registrarReimpresionTicket(
  token: string,
  r: {
    tenantId: string;
    sucursalId: string;
    cajaId: string | null;
    turnoId: string | null;
    ticketId: string;
    origen: OrigenReimpresionTicket;
    autorizacionPinId?: string | null;
  },
): Promise<void> {
  try {
    const { error } = await employeeClient(token).from("ticket_reimpresiones").insert({
      tenant_id: r.tenantId,
      sucursal_id: r.sucursalId,
      caja_id: r.cajaId,
      turno_id: r.turnoId,
      ticket_id: r.ticketId,
      usuario_id: subDeToken(token),
      origen: r.origen,
      autorizacion_pin_id: r.autorizacionPinId ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.warn("[impresiones] no se registró la reimpresión del ticket:", e instanceof Error ? e.message : e);
  }
}

/** Motivos para reimprimir una comanda. "Otro" pide texto. */
export const MOTIVOS_REIMPRESION_COMANDA = [
  { codigo: "IMPRESORA", label: "La impresora falló" },
  { codigo: "PERDIDA", label: "Se perdió la comanda" },
  { codigo: "COCINA_PIDIO", label: "Cocina la pidió de nuevo" },
  { codigo: "OTRO", label: "Otro" },
] as const;
export type MotivoReimpresionComanda = (typeof MOTIVOS_REIMPRESION_COMANDA)[number]["codigo"];

/** Roles que tienen `cocina.reimprimir_comanda` por defecto (0046): se autorizan solos. */
export const ROLES_REIMPRIMIR_COMANDA = ["SUPERVISOR", "ADMIN", "DUENO"];
