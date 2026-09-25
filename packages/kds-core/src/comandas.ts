"use client";
import { clienteConToken } from "./cliente";
import { type EstadoCocina } from "./estado";

export { labelModo, siguienteEstado, minutosEnCocina, type EstadoCocina } from "./estado";

export type ItemComanda = {
  id: string;
  cantidad: number;
  nombre: string;
  /** Lo que se agrega o se prepara distinto ("Término medio", "Extra queso"). */
  modificadores: string[];
  /** Lo que se QUITA ("Sin cebolla"): naturaleza OMISION. Va aparte y en negritas porque confundir
   *  un "sin" con un "extra" es el error de cocina que más cuesta. */
  sin: string[];
  notaCocina: string | null;
  /** Área de cocina del ítem (para el filtro multi-área). null = sin área. */
  area: string | null;
  /** "Combo #2 · Para llevar": el hijo de un combo (ADR 0015) dice de cuál es y hereda los
   *  modificadores del padre, para que la estación sepa que este renglón va junto con los otros
   *  del mismo combo aunque salgan en tarjetas separadas. null en un ítem suelto o en un hijo
   *  huérfano (envío parcial donde el padre no llegó en esta lectura). */
  comboEtiqueta: string | null;
  /** Su estación ya lo marcó LISTO (ticket_items.listo_at, ADR 0018). */
  listo: boolean;
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
  /** A quién o de dónde: "Mesa 4", el nombre del cliente, o el código del pedido de la app. */
  detalle: string | null;
  items: ItemComanda[];
};

/** Una fila de `ticket_items` tal cual la devuelve PostgREST con {@link SELECCION_TICKET_ITEMS_KDS}. */
export type FilaItemKds = {
  id: string;
  cantidad: number | string;
  producto_nombre_snapshot: string;
  nota_cocina: string | null;
  cancelado: boolean;
  area_cocina_nombre_snapshot: string | null;
  parent_item_id: string | null;
  combo_rol: "PADRE" | "HIJO" | null;
  orden_visualizacion: number;
  cargo_tipo: string | null;
  listo_at: string | null;
  ticket_item_modificadores: { opcion_nombre_snapshot: string; naturaleza_snapshot?: string | null }[] | null;
};

/** Una fila de `tickets` con sus `ticket_items` anidados, tal cual la devuelve `leerComandas`. */
export type FilaTicketKds = {
  id: string;
  folio_completo: string | null;
  modo_servicio: string;
  estado_cocina: EstadoCocina;
  fecha_envio_cocina: string | null;
  nota_general: string | null;
  nombre_cliente?: string | null;
  folio_externo_app?: string | null;
  ticket_items: FilaItemKds[] | null;
};

/**
 * Proyección de `ticket_items` que pide `leerComandas`, como constante y no como texto suelto
 * dentro del `.select()`: así una prueba puede afirmar que `cargo_tipo` sigue en la lista.
 *
 * Sin `cargo_tipo` aquí, PostgREST devuelve esa columna como `undefined` en TODAS las filas,
 * `!i.cargo_tipo` se vuelve `true` para TODAS —incluidas las de envío— y `comandasDesdeFilas` deja
 * de filtrar los cargos EN SILENCIO: sin excepción, sin prueba en rojo (las pruebas de
 * `comandasDesdeFilas` usan fixtures que ya traen el campo) y sin error de tipos, porque el cast
 * `as unknown as FilaTicketKds[]` de más abajo no verifica que el dato real tenga la forma que dice
 * tener.
 */
export const SELECCION_TICKET_ITEMS_KDS =
  "id, cantidad, producto_nombre_snapshot, nota_cocina, cancelado, area_cocina_nombre_snapshot, " +
  "parent_item_id, combo_rol, orden_visualizacion, cargo_tipo, listo_at, ticket_item_modificadores(opcion_nombre_snapshot, naturaleza_snapshot)";

/**
 * De las filas crudas de `tickets`+`ticket_items` a las comandas que pinta el KDS: descarta
 * cancelados y cargos, numera los combos entre PADRES y arma cada `ItemComanda`.
 *
 * Función PURA, sin red — separada de `leerComandas` para poder probarla con un fixture plano, sin
 * mockear `@supabase/supabase-js` (mismo motivo por el que `lineasParaComanda` vive aparte de
 * `leerTicketParaImpresion` en `comanda-builder.ts`).
 */
export function comandasDesdeFilas(rows: FilaTicketKds[]): ComandaKds[] {
  return rows.map((t) => {
    const folio = t.folio_completo ?? t.id;
    // Combos (ADR 0015): el PADRE no va a cocina —se prepara la comida, no "un combo"— y cada
    // HIJO lleva "Combo #n", n = el lugar del padre entre los renglones PADRE. Misma regla que
    // lineasParaComanda (comanda-builder.ts) para que el papel y la pantalla coincidan.
    //
    // Entre PADRES y no entre "todos los renglones no-hijo vivos": esta pantalla recalcula en vivo
    // y el papel ya se imprimió. Cancelar un producto suelto que estuviera encima del combo
    // renumeraba aquí y no allá, y la plancha y la barra acababan mirando números distintos.
    //
    // `!i.cargo_tipo` fuera de "vivos" también: un cargo (envío) no es comida, nunca es PADRE/HIJO,
    // así que quitarlo aquí no mueve la numeración de combos. Filtra por `cargo_tipo`, no por
    // `producto_id` — un producto borrado del catálogo también deja ese campo en null, y "sin
    // producto" no es lo mismo que "es un cargo". Misma regla en `comanda-builder.ts`.
    const vivos = (t.ticket_items ?? [])
      .filter((i) => !i.cancelado && !i.cargo_tipo)
      .sort((a, b) => a.orden_visualizacion - b.orden_visualizacion);
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
        modificadores: (i.ticket_item_modificadores ?? [])
          .filter((m) => m.naturaleza_snapshot !== "OMISION")
          .map((m) => m.opcion_nombre_snapshot),
        sin: (i.ticket_item_modificadores ?? [])
          .filter((m) => m.naturaleza_snapshot === "OMISION")
          .map((m) => m.opcion_nombre_snapshot),
        notaCocina: i.nota_cocina,
        area: i.area_cocina_nombre_snapshot,
        comboEtiqueta: i.combo_rol === "HIJO" && i.parent_item_id && numero.has(i.parent_item_id)
          ? [`Combo #${numero.get(i.parent_item_id)}`, ...(ctxPadre.get(i.parent_item_id) ?? [])].join(" · ")
          : null,
        listo: Boolean(i.listo_at),
      }));
    return {
      ticketId: t.id,
      folio,
      folioCorto: folio.slice(-4),
      modoServicio: t.modo_servicio,
      estadoCocina: t.estado_cocina,
      fechaEnvio: t.fecha_envio_cocina,
      notaOrden: t.nota_general,
      detalle: t.folio_externo_app?.trim() || t.nombre_cliente?.trim() || null,
      items,
    };
  });
}

/**
 * Lee las comandas activas de la sucursal para el KDS: tickets EN_COCINA o LISTO,
 * con sus ítems no cancelados y modificadores. Orden: más antiguo primero (FIFO de cocina).
 */
export async function leerComandas(token: string, sucursalId: string): Promise<ComandaKds[]> {
  const { data, error } = await clienteConToken(token)
    .from("tickets")
    .select(
      "id, folio_completo, modo_servicio, estado_cocina, fecha_envio_cocina, nota_general, nombre_cliente, folio_externo_app, " +
        `ticket_items(${SELECCION_TICKET_ITEMS_KDS})`,
    )
    .eq("sucursal_id", sucursalId)
    // Un ticket borrado no se cocina. Sin este filtro seguía en la pantalla para siempre.
    .is("deleted_at", null)
    .in("estado_cocina", ["EN_COCINA", "LISTO"])
    .order("fecha_envio_cocina", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as FilaTicketKds[];
  const comandas = comandasDesdeFilas(rows);
  const mesas = await mesasDeTickets(token, comandas.map((c) => c.ticketId));
  return comandas.map((c) => (mesas.has(c.ticketId) ? { ...c, detalle: `Mesa ${mesas.get(c.ticketId)}` } : c));
}

/**
 * Número de mesa de cada ticket de comedor, para "Mesa 4" en la tarjeta.
 *
 * Aparte de `leerComandas` y a prueba de fallas: si esta lectura truena (una base local sin la
 * relación, un permiso), la cocina sigue enseñando sus comandas, solo sin el número de mesa. El
 * nombre de la relación va explícito porque `tickets_mesas` apunta dos veces a `mesas`
 * (la actual y la anterior de un cambio de mesa).
 */
async function mesasDeTickets(token: string, ticketIds: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (ticketIds.length === 0) return mapa;
  try {
    const { data, error } = await clienteConToken(token)
      .from("tickets_mesas")
      .select("ticket_id, es_mesa_principal, mesas!tickets_mesas_mesa_id_fkey(numero)")
      .in("ticket_id", ticketIds)
      .is("fecha_liberacion", null);
    if (error) return mapa;
    const filas = (data ?? []) as unknown as { ticket_id: string; es_mesa_principal: boolean | null; mesas: { numero: string | number } | null }[];
    for (const f of filas) {
      if (!f.mesas) continue;
      if (!mapa.has(f.ticket_id) || f.es_mesa_principal) mapa.set(f.ticket_id, String(f.mesas.numero));
    }
  } catch {
    /* sin número de mesa: la comanda se enseña igual */
  }
  return mapa;
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

export type ResultadoListo = { cerrada: boolean; pendientes: string[] };

/**
 * LISTO de una estación (ADR 0018): marca los renglones pendientes de `area` —`null` es el área
 * "General"— o de todas (`todas`), y la base cierra la orden sola cuando ya no queda ninguno. Es
 * un RPC y no dos UPDATE desde aquí para que dos estaciones que marcan casi a la vez no dejen la
 * orden abierta ni la cierren dos veces: `marcar_listo_cocina` bloquea el ticket y decide.
 */
export async function marcarListoCocina(
  token: string,
  ticketId: string,
  area: string | null,
  todas: boolean,
): Promise<ResultadoListo> {
  const { data, error } = await clienteConToken(token).rpc("marcar_listo_cocina", {
    p_ticket_id: ticketId,
    p_area: area,
    p_todas: todas,
  });
  if (error) throw new Error(error.message);
  const r = data as { ok: boolean; motivo?: string; cerrada?: boolean; pendientes?: string[] } | null;
  if (!r?.ok) throw new Error(r?.motivo ?? "No se pudo marcar la comanda");
  return { cerrada: Boolean(r.cerrada), pendientes: r.pendientes ?? [] };
}

/**
 * Cierra la orden entera con dos UPDATE. Es lo que hacía LISTO antes de 0120; lo reemplaza
 * {@link marcarListoCocina}, que además respeta las estaciones. Se conserva exportado para quien
 * aún lo importe.
 */
export async function cerrarComanda(token: string, ticketId: string, estadoActual: EstadoCocina): Promise<void> {
  if (estadoActual === "EN_COCINA") {
    await avanzarCocina(token, ticketId, "LISTO");
  }
  await avanzarCocina(token, ticketId, "ENTREGADO");
}
