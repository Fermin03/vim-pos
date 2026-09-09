"use client";
import { clienteConToken } from "./cliente";
import { type EstadoCocina } from "./estado";

export { labelModo, siguienteEstado, minutosEnCocina, type EstadoCocina } from "./estado";

export type ItemComanda = {
  id: string;
  cantidad: number;
  nombre: string;
  modificadores: string[];
  notaCocina: string | null;
  /** Área de cocina del ítem (para el filtro multi-área). null = sin área. */
  area: string | null;
  /** "Combo #2 · Para llevar": el hijo de un combo (ADR 0015) dice de cuál es y hereda los
   *  modificadores del padre, para que la estación sepa que este renglón va junto con los otros
   *  del mismo combo aunque salgan en tarjetas separadas. null en un ítem suelto o en un hijo
   *  huérfano (envío parcial donde el padre no llegó en esta lectura). */
  comboEtiqueta: string | null;
};

export type ComandaKds = {
  ticketId: string;
  folio: string;
  folioCorto: string;
  modoServicio: string;
  estadoCocina: EstadoCocina;
  /** Cuándo entró a cocina (para el cronómetro). */
  fechaEnvio: string | null;
  /** Nota de cocina de TODA la orden (tickets.nota_general). */
  notaOrden: string | null;
  items: ItemComanda[];
};

/**
 * Lee las comandas activas de la sucursal para el KDS: tickets EN_COCINA o LISTO,
 * con sus ítems no cancelados y modificadores. Orden: más antiguo primero (FIFO de cocina).
 */
export async function leerComandas(token: string, sucursalId: string): Promise<ComandaKds[]> {
  const { data, error } = await clienteConToken(token)
    .from("tickets")
    .select(
      "id, folio_completo, modo_servicio, estado_cocina, fecha_envio_cocina, nota_general, " +
        "ticket_items(id, cantidad, producto_nombre_snapshot, nota_cocina, cancelado, area_cocina_nombre_snapshot, " +
        "parent_item_id, combo_rol, orden_visualizacion, ticket_item_modificadores(opcion_nombre_snapshot))",
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
    nota_general: string | null;
    ticket_items:
      | {
          id: string;
          cantidad: number | string;
          producto_nombre_snapshot: string;
          nota_cocina: string | null;
          cancelado: boolean;
          area_cocina_nombre_snapshot: string | null;
          parent_item_id: string | null;
          combo_rol: "PADRE" | "HIJO" | null;
          orden_visualizacion: number;
          ticket_item_modificadores: { opcion_nombre_snapshot: string }[] | null;
        }[]
      | null;
  }[];

  return rows.map((t) => {
    const folio = t.folio_completo ?? t.id;
    // Combos (ADR 0015): el PADRE no va a cocina —se prepara la comida, no "un combo"— y cada
    // HIJO lleva "Combo #n", n = el lugar del padre entre los renglones PADRE. Misma regla que
    // lineasParaComanda (comanda-builder.ts) para que el papel y la pantalla coincidan.
    //
    // Entre PADRES y no entre "todos los renglones no-hijo vivos": esta pantalla recalcula en vivo
    // y el papel ya se imprimió. Cancelar un producto suelto que estuviera encima del combo
    // renumeraba aquí y no allá, y la plancha y la barra acababan mirando números distintos.
    const vivos = (t.ticket_items ?? []).filter((i) => !i.cancelado).sort((a, b) => a.orden_visualizacion - b.orden_visualizacion);
    const numero = new Map<string, number>();
    const ctxPadre = new Map<string, string[]>();
    let n = 0;
    for (const i of vivos) {
      if (i.combo_rol !== "PADRE") continue;
      n += 1;
      numero.set(i.id, n);
      ctxPadre.set(i.id, (i.ticket_item_modificadores ?? []).map((m) => m.opcion_nombre_snapshot));
    }
    const items = vivos
      .filter((i) => i.combo_rol !== "PADRE")
      .map((i) => ({
        id: i.id,
        cantidad: Number(i.cantidad),
        nombre: i.producto_nombre_snapshot,
        modificadores: (i.ticket_item_modificadores ?? []).map((m) => m.opcion_nombre_snapshot),
        notaCocina: i.nota_cocina,
        area: i.area_cocina_nombre_snapshot,
        comboEtiqueta: i.combo_rol === "HIJO" && i.parent_item_id && numero.has(i.parent_item_id)
          ? [`Combo #${numero.get(i.parent_item_id)}`, ...(ctxPadre.get(i.parent_item_id) ?? [])].join(" · ")
          : null,
      }));
    return {
      ticketId: t.id,
      folio,
      folioCorto: folio.slice(-4),
      modoServicio: t.modo_servicio,
      estadoCocina: t.estado_cocina,
      fechaEnvio: t.fecha_envio_cocina,
      notaOrden: t.nota_general,
      items,
    };
  });
}

/**
 * Avanza el estado de cocina de un ticket (UPDATE normal — el validador permite avances hacia
 * adelante sin PIN y pone los timestamps; las reversas exigen autorización).
 *   EN_COCINA → LISTO → ENTREGADO
 */
export async function avanzarCocina(token: string, ticketId: string, nuevoEstado: EstadoCocina): Promise<void> {
  const { error } = await clienteConToken(token)
    .from("tickets")
    .update({ estado_cocina: nuevoEstado })
    .eq("id", ticketId);
  if (error) throw new Error(error.message);
}

/**
 * Un solo toque "LISTO" cierra la comanda: queda ENTREGADO y sale del panel.
 * El validador exige pasos (EN_COCINA→LISTO→ENTREGADO), así que encadena los updates.
 */
export async function cerrarComanda(token: string, ticketId: string, estadoActual: EstadoCocina): Promise<void> {
  if (estadoActual === "EN_COCINA") {
    await avanzarCocina(token, ticketId, "LISTO");
  }
  await avanzarCocina(token, ticketId, "ENTREGADO");
}
