"use client";
import { employeeClient } from "./supabase";

// F6.3 (Modelo B) — Devoluciones: la venta queda intacta (PAGADA) y la devolución es un
// documento aparte que baja el efectivo de la caja. Usa crear_devolucion + confirmar_devolucion.

export type VentaTurno = {
  ticketId: string;
  folio: string;
  total: number;
  fechaCobro: string | null;
  tieneDevolucion: boolean;
};

/** Ventas (tickets PAGADO/FACTURADO) del turno, para elegir cuál devolver. */
export async function leerVentasTurno(token: string, turnoId: string): Promise<VentaTurno[]> {
  const { data, error } = await employeeClient(token)
    .from("tickets")
    .select("id, folio_completo, total_mxn, fecha_pago, estado_fiscal")
    .eq("turno_id", turnoId)
    .in("estado_fiscal", ["PAGADO", "FACTURADO"])
    .order("fecha_pago", { ascending: false });
  if (error) throw new Error(error.message);

  const ids = ((data ?? []) as { id: string }[]).map((t) => t.id);
  // Marca cuáles ya tienen una devolución confirmada (para avisar en la UI).
  const conDev = new Set<string>();
  if (ids.length > 0) {
    const { data: devs } = await employeeClient(token)
      .from("devoluciones")
      .select("ticket_id")
      .in("ticket_id", ids)
      .eq("estado", "CONFIRMADA");
    for (const d of (devs ?? []) as { ticket_id: string }[]) conDev.add(d.ticket_id);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
    ticketId: String(t.id),
    folio: (t.folio_completo as string) ?? String(t.id).slice(-6),
    total: Number(t.total_mxn ?? 0),
    fechaCobro: (t.fecha_pago as string) ?? null,
    tieneDevolucion: conDev.has(String(t.id)),
  }));
}

export type ItemVenta = { ticketItemId: string; nombre: string; cantidad: number; totalItem: number };

/** Ítems no cancelados de una venta, para una devolución (total o parcial). */
export async function leerItemsVenta(token: string, ticketId: string): Promise<ItemVenta[]> {
  const { data, error } = await employeeClient(token)
    .from("ticket_items")
    .select("id, producto_nombre_snapshot, cantidad, total_item_mxn, cancelado")
    .eq("ticket_id", ticketId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[])
    .filter((i) => !i.cancelado)
    .map((i) => ({
      ticketItemId: String(i.id),
      nombre: String(i.producto_nombre_snapshot),
      cantidad: Number(i.cantidad),
      totalItem: Number(i.total_item_mxn ?? 0),
    }));
}

export type MotivoDevolucion =
  | "PRODUCTO_DEFECTUOSO" | "PRODUCTO_INCORRECTO" | "CLIENTE_NO_SATISFECHO"
  | "ERROR_COBRO" | "TIEMPO_EXCEDIDO" | "OTRO";
export type MedioDevolucion = "EFECTIVO" | "MISMO_METODO_PAGO" | "VALE_PROXIMA_COMPRA";

export const MOTIVOS_DEV: { codigo: MotivoDevolucion; label: string }[] = [
  { codigo: "PRODUCTO_DEFECTUOSO", label: "Producto defectuoso" },
  { codigo: "PRODUCTO_INCORRECTO", label: "Producto equivocado" },
  { codigo: "CLIENTE_NO_SATISFECHO", label: "Cliente insatisfecho" },
  { codigo: "ERROR_COBRO", label: "Error de cobro" },
  { codigo: "TIEMPO_EXCEDIDO", label: "Tardó demasiado" },
  { codigo: "OTRO", label: "Otro" },
];
export const MEDIOS_DEV: { codigo: MedioDevolucion; label: string }[] = [
  { codigo: "EFECTIVO", label: "Efectivo" },
  { codigo: "MISMO_METODO_PAGO", label: "Mismo método" },
  { codigo: "VALE_PROXIMA_COMPRA", label: "Vale" },
];

/**
 * Crea y confirma la devolución (Modelo B). p_items: todos los ítems con su cantidad (devolución total).
 * reversar_inventario=false: la reversa de inventario depende del módulo producto→insumos (ciclo aparte).
 */
export async function devolverVenta(
  token: string,
  args: {
    ticketId: string;
    cajaId: string;
    turnoId: string;
    items: { ticketItemId: string; cantidadDevuelta: number }[];
    motivo: MotivoDevolucion;
    motivoTexto?: string;
    medio: MedioDevolucion;
    autorizacionPinId: string;
    solicitanteId: string;
    autorizoId: string;
    nota?: string;
  },
): Promise<void> {
  const cli = employeeClient(token);
  const { data: devId, error: e1 } = await cli.rpc("crear_devolucion", {
    p_ticket_original_id: args.ticketId,
    p_caja_id: args.cajaId,
    p_turno_id: args.turnoId,
    p_alcance: "TOTAL",
    p_motivo: args.motivo,
    p_motivo_texto: args.motivoTexto || null,
    p_medio_devolucion: args.medio,
    p_autorizacion_pin_id: args.autorizacionPinId,
    p_usuario_solicitante_id: args.solicitanteId,
    p_usuario_autorizo_id: args.autorizoId,
    p_items: args.items.map((i) => ({ ticket_item_id: i.ticketItemId, cantidad_devuelta: i.cantidadDevuelta })),
    p_reversar_inventario: false,
    p_nota: args.nota || null,
  });
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await cli.rpc("confirmar_devolucion", {
    p_devolucion_id: String(devId),
    p_usuario_id: args.autorizoId,
  });
  if (e2) throw new Error(e2.message);
}

export function labelMotivoDev(m: MotivoDevolucion): string {
  return MOTIVOS_DEV.find((x) => x.codigo === m)?.label ?? m;
}
