"use client";
import { employeeClient } from "./supabase";
import { type EstadoCocina } from "./kds-estado";

export { labelModo, siguienteEstado, minutosEnCocina, type EstadoCocina } from "./kds-estado";

export type ItemComanda = {
  id: string;
  cantidad: number;
  nombre: string;
  modificadores: string[];
  notaCocina: string | null;
};

export type ComandaKds = {
  ticketId: string;
  folio: string;
  folioCorto: string;
  modoServicio: string;
  estadoCocina: EstadoCocina;
  /** Cuándo entró a cocina (para el cronómetro). */
  fechaEnvio: string | null;
  items: ItemComanda[];
};

/**
 * Lee las comandas activas de la sucursal para el KDS: tickets EN_COCINA o LISTO,
 * con sus ítems no cancelados y modificadores. Orden: más antiguo primero (FIFO de cocina).
 */
export async function leerComandas(token: string, sucursalId: string): Promise<ComandaKds[]> {
  const { data, error } = await employeeClient(token)
    .from("tickets")
    .select(
      "id, folio_completo, modo_servicio, estado_cocina, fecha_envio_cocina, " +
        "ticket_items(id, cantidad, producto_nombre_snapshot, nota_cocina, cancelado, ticket_item_modificadores(opcion_nombre_snapshot))",
    )
    .eq("sucursal_id", sucursalId)
    .in("estado_cocina", ["EN_COCINA", "LISTO"])
    .order("fecha_envio_cocina", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as {
    id: string;
    folio_completo: string | null;
    modo_servicio: string;
    estado_cocina: EstadoCocina;
    fecha_envio_cocina: string | null;
    ticket_items:
      | {
          id: string;
          cantidad: number | string;
          producto_nombre_snapshot: string;
          nota_cocina: string | null;
          cancelado: boolean;
          ticket_item_modificadores: { opcion_nombre_snapshot: string }[] | null;
        }[]
      | null;
  }[];

  return rows.map((t) => {
    const folio = t.folio_completo ?? t.id;
    const items = (t.ticket_items ?? [])
      .filter((i) => !i.cancelado)
      .map((i) => ({
        id: i.id,
        cantidad: Number(i.cantidad),
        nombre: i.producto_nombre_snapshot,
        modificadores: (i.ticket_item_modificadores ?? []).map((m) => m.opcion_nombre_snapshot),
        notaCocina: i.nota_cocina,
      }));
    return {
      ticketId: t.id,
      folio,
      folioCorto: folio.slice(-4),
      modoServicio: t.modo_servicio,
      estadoCocina: t.estado_cocina,
      fechaEnvio: t.fecha_envio_cocina,
      items,
    };
  });
}

/**
 * Avanza el estado de cocina de un ticket (UPDATE normal — el validador permite avances
 * hacia adelante sin PIN y pone los timestamps; las reversas exigen autorización).
 *   EN_COCINA → LISTO → ENTREGADO
 */
export async function avanzarCocina(token: string, ticketId: string, nuevoEstado: EstadoCocina): Promise<void> {
  const { error } = await employeeClient(token)
    .from("tickets")
    .update({ estado_cocina: nuevoEstado })
    .eq("id", ticketId);
  if (error) throw new Error(error.message);
}
