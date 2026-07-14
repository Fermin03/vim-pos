"use client";
import { employeeClient } from "./supabase";
import type { ModoServicio } from "./carrito";

// Cuentas ABIERTAS por modo de servicio: tickets comprometidos (BORRADOR/ABIERTO) que NO están en
// espera ni pagados. Se usan en "Ver cuentas" de cada pestaña: Pick-up (por recolectar) y Domicilio
// (pedidos activos). El modelo ya trae todo lo necesario — sin migración:
//   comanda_impresa_at → marca de "salió/impreso" (etapa de entrega en domicilio).
export type CuentaAbierta = {
  ticketId: string;
  folio: string | null;
  total: number;
  pendiente: number;
  nItems: number;
  desdeIso: string | null;        // fecha_apertura
  estadoCocina: string;           // SIN_ENVIAR | EN_COCINA | LISTO | ENTREGADO…
  impresaAt: string | null;       // comanda_impresa_at → ya salió/se imprimió
  cliente: string | null;         // nombre del cliente (domicilio)
};

/** Cuentas abiertas de un modo en la SUCURSAL (Pick-up: DRIVE_THRU, Domicilio: DELIVERY_PROPIO).
 *  Sucursal-wide para que cualquier caja pueda completarlas. */
export async function listarCuentasAbiertas(token: string, sucursalId: string, modo: ModoServicio): Promise<CuentaAbierta[]> {
  const { data, error } = await employeeClient(token)
    .from("tickets")
    .select("id, folio_completo, total_mxn, monto_pendiente_mxn, fecha_apertura, estado_cocina, comanda_impresa_at, cliente:clientes(nombre), ticket_items(cantidad, cancelado)")
    .eq("sucursal_id", sucursalId)
    .eq("modo_servicio", modo)
    .eq("en_espera", false)
    .in("estado_fiscal", ["BORRADOR", "ABIERTO"])
    .order("fecha_apertura", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((t) => ({
    ticketId: String(t.id),
    folio: (t.folio_completo as string) ?? null,
    total: Number(t.total_mxn ?? 0),
    pendiente: Number(t.monto_pendiente_mxn ?? 0),
    nItems: (((t.ticket_items as { cantidad: number; cancelado: boolean }[]) ?? [])
      .filter((i) => !i.cancelado)
      .reduce((a, i) => a + Number(i.cantidad), 0)),
    desdeIso: (t.fecha_apertura as string) ?? null,
    estadoCocina: String(t.estado_cocina ?? "SIN_ENVIAR"),
    impresaAt: (t.comanda_impresa_at as string) ?? null,
    cliente: ((t.cliente as { nombre?: string } | null)?.nombre) ?? null,
  }));
}

/** Minutos desde que se abrió la cuenta (para la lista). Puro. */
export function minutosAbierta(desdeIso: string | null, ahora: Date = new Date()): number {
  if (!desdeIso) return 0;
  const d = new Date(desdeIso).getTime();
  if (Number.isNaN(d)) return 0;
  return Math.max(0, Math.floor((ahora.getTime() - d) / 60000));
}
