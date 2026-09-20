"use client";
import { employeeClient } from "./supabase";

export type DeliveryEstado =
  | "ASIGNADO" | "EN_RUTA" | "EN_DESTINO" | "ENTREGADO"
  | "NO_ENTREGADO" | "EN_REGRESO" | "LIQUIDADO" | "CANCELADO";

export type DeliveryAsignacion = {
  id: string;
  ticketId: string;
  ticketFolio: string | null;
  repartidorId: string | null;
  repartidorNombre: string;
  estado: DeliveryEstado;
  montoALiquidar: number;
  propinaRepartidor: number;
  tiempoPromesa: number | null;
  fechaAsignacion: string;
  /**
   * Cuándo salió de verdad. NULL mientras el pedido siga en el local.
   *
   * No es lo mismo que `fechaAsignacion` y por eso viajan las dos: al REASIGNAR, la RPC
   * (0114) pone `fecha_salida = now()` y deja `fecha_asignacion` como estaba. Contar los minutos
   * fuera desde la asignación hacía que un pedido reasignado dos horas después marcara "120 min
   * fuera" en un viaje que acababa de arrancar, y lo pintaba tarde sin serlo.
   */
  fechaSalida: string | null;
  /** Los pedidos que salieron juntos comparten este id. NULL en los anteriores a la 0114. */
  viajeId: string | null;
};

/** Lee las asignaciones de delivery del turno (cola de domicilios). */
export async function leerDeliveries(token: string, sucursalId: string): Promise<DeliveryAsignacion[]> {
  const { data, error } = await employeeClient(token)
    .from("delivery_asignaciones")
    // El nombre del repartidor NO se puede traer con un embed: `repartidor_id` apunta a
    // `auth.users`, no a `usuarios_perfil`, así que no hay clave foránea que PostgREST pueda
    // recorrer y respondía PGRST200. Se resuelve abajo con una segunda consulta.
    //
    // `repartidor_catalogo_id` (0078) es el camino nuevo y ese sí tiene FK al catálogo, así que
    // para los repartidores dados de alta ahí el nombre llega directo.
    .select(
      "id, ticket_id, repartidor_id, repartidor_nombre, estado, monto_a_liquidar_mxn, propina_repartidor_mxn, tiempo_promesa_minutos, fecha_asignacion, fecha_salida, viaje_id, " +
        "ticket:tickets(folio_completo), catalogo:repartidores(nombre)",
    )
    .eq("sucursal_id", sucursalId)
    .not("estado", "in", "(LIQUIDADO,CANCELADO)")
    .order("fecha_asignacion", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    ticketId: String(r.ticket_id),
    ticketFolio: ((r.ticket as { folio_completo?: string } | null)?.folio_completo) ?? null,
    repartidorId: (r.repartidor_id as string) ?? null,
    // Orden de preferencia: el catálogo (0078), luego el nombre que se guardó al asignar, y solo
    // entonces el guion. Antes venía del embed roto, así que siempre salía "—".
    repartidorNombre:
      ((r.catalogo as { nombre?: string } | null)?.nombre)
      ?? (r.repartidor_nombre as string | null)
      ?? "—",
    estado: (r.estado as DeliveryEstado) ?? "ASIGNADO",
    montoALiquidar: Number(r.monto_a_liquidar_mxn ?? 0),
    propinaRepartidor: Number(r.propina_repartidor_mxn ?? 0),
    tiempoPromesa: r.tiempo_promesa_minutos != null ? Number(r.tiempo_promesa_minutos) : null,
    fechaAsignacion: String(r.fecha_asignacion),
    fechaSalida: r.fecha_salida != null ? String(r.fecha_salida) : null,
    viajeId: (r.viaje_id as string) ?? null,
  }));
}

/** Un repartidor del catálogo del negocio (se dan de alta en el panel). */
export type Repartidor = { id: string; nombre: string; telefono: string | null };

/**
 * Repartidores dados de alta y activos.
 *
 * Se eligen de una lista en vez de teclear el nombre en cada salida: además de más rápido, evita
 * que el mismo "Luis" acabe escrito de cuatro maneras y deje de poder cuadrarse.
 */
export async function listarRepartidores(token: string): Promise<Repartidor[]> {
  const { data, error } = await employeeClient(token)
    .from("repartidores")
    .select("id, nombre, telefono")
    .eq("activo", true)
    .is("deleted_at", null)
    .order("nombre");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    nombre: String(r.nombre),
    telefono: (r.telefono as string) ?? null,
  }));
}

/** Asigna el pedido a un repartidor del catálogo. */
export async function asignarRepartidor(
  token: string,
  args: { ticketId: string; repartidorId: string; montoALiquidar: number; tiempoPromesa?: number | null },
): Promise<string> {
  const { data, error } = await employeeClient(token).rpc("asignar_delivery_repartidor", {
    p_ticket_id: args.ticketId,
    p_repartidor_id: args.repartidorId,
    p_monto_a_liquidar_mxn: args.montoALiquidar,
    p_tiempo_promesa_minutos: args.tiempoPromesa ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

/**
 * Asigna uno o varios pedidos al mismo repartidor y los deja en reparto.
 *
 * Asignar ES salir: no hay un segundo paso que confirmar. Antes eran dos llamadas
 * (`asignar_delivery_repartidor` + `confirmar_salida_delivery`) y existía un tercer camino que se
 * las saltaba —imprimir el ticket marcaba la salida sin repartidor—, así que había pedidos
 * "salidos" que nadie llevaba.
 *
 * El monto NO se manda: lo calcula la RPC desde `tickets.total_mxn`. Es el dinero que el repartidor
 * tiene que traer de vuelta y lo decide quien manda, no esta pantalla.
 */
export async function asignarLote(
  token: string,
  args: { ticketIds: string[]; repartidorId: string; tiempoPromesa?: number | null },
): Promise<string> {
  const { data, error } = await employeeClient(token).rpc("asignar_delivery_lote", {
    p_ticket_ids: args.ticketIds,
    p_repartidor_id: args.repartidorId,
    p_tiempo_promesa_minutos: args.tiempoPromesa ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

/**
 * Da de alta un repartidor desde la caja.
 *
 * El catálogo se administra en el panel, pero desde que asignar es obligatorio la caja necesita una
 * salida: si nadie dio de alta a nadie, sin esto ningún domicilio podría salir hasta que alguien
 * entre al panel web — y eso es trabar la caja en hora pico por un trámite.
 */
export async function crearRepartidor(
  token: string,
  tenantId: string,
  args: { nombre: string; telefono?: string | null },
): Promise<Repartidor> {
  const nombre = args.nombre.trim();
  const telefono = args.telefono?.trim() ? args.telefono.trim() : null;
  const { data, error } = await employeeClient(token)
    .from("repartidores")
    .insert({ tenant_id: tenantId, nombre, telefono })
    .select("id, nombre, telefono")
    .single();
  // El choque del índice único llega como jerga de Postgres; aquí se dice lo que pasó.
  if (error) {
    throw new Error(
      error.message.includes("repartidor_nombre_uq")
        ? "Ya hay un repartidor con ese nombre."
        : error.message,
    );
  }
  const r = data as Record<string, unknown>;
  return { id: String(r.id), nombre: String(r.nombre), telefono: (r.telefono as string) ?? null };
}

/**
 * Asignación contra una CUENTA de usuario. No se usa hoy —los repartidores no entran al sistema—
 * y se conserva para cuando exista la app del repartidor, que sí tendrá cuentas propias.
 */
export async function asignarDelivery(
  token: string,
  args: { ticketId: string; repartidorId: string; montoALiquidar: number; tiempoPromesa?: number | null },
): Promise<string> {
  const { data, error } = await employeeClient(token).rpc("asignar_delivery", {
    p_ticket_id: args.ticketId,
    p_repartidor_id: args.repartidorId,
    p_monto_a_liquidar_mxn: args.montoALiquidar,
    p_tiempo_promesa_minutos: args.tiempoPromesa ?? null,
    p_destino_lat: null,
    p_destino_lng: null,
    p_distancia_km_estimada: null,
    p_client_id_local: null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function confirmarSalida(token: string, asignacionId: string): Promise<void> {
  const { error } = await employeeClient(token).rpc("confirmar_salida_delivery", { p_asignacion_id: asignacionId });
  if (error) throw new Error(error.message);
}

export async function confirmarEntrega(token: string, asignacionId: string, propina = 0): Promise<void> {
  const { error } = await employeeClient(token).rpc("confirmar_entrega_delivery", {
    p_asignacion_id: asignacionId,
    p_propina_repartidor_mxn: propina,
  });
  if (error) throw new Error(error.message);
}

export async function liquidarDelivery(
  token: string,
  args: { asignacionId: string; efectivo: number; tarjeta: number; liquidadoPorId: string; nota?: string | null },
): Promise<void> {
  const { error } = await employeeClient(token).rpc("liquidar_delivery", {
    p_asignacion_id: args.asignacionId,
    p_monto_efectivo_mxn: args.efectivo,
    p_monto_tarjeta_mxn: args.tarjeta,
    p_liquidado_por_id: args.liquidadoPorId,
    p_liquidacion_nota: args.nota ?? null,
  });
  if (error) throw new Error(error.message);
}

// "En reparto", no "En ruta": es como lo dice el negocio. El valor del enum en la base sigue siendo
// EN_RUTA — renombrarlo arrastraría migración, la vista vw_cumplimiento_tiempos_delivery y el
// espejo de escritorio por una palabra que solo se lee en pantalla.
const ESTADO_LABEL: Record<DeliveryEstado, string> = {
  ASIGNADO: "Asignado", EN_RUTA: "En reparto", EN_DESTINO: "En destino", ENTREGADO: "Entregado",
  NO_ENTREGADO: "No entregado", EN_REGRESO: "En regreso", LIQUIDADO: "Liquidado", CANCELADO: "Cancelado",
};
export function labelDeliveryEstado(e: DeliveryEstado): string {
  return ESTADO_LABEL[e] ?? e;
}

/** El siguiente paso del repartidor según el estado (para el botón de acción). */
export function siguienteAccionDelivery(e: DeliveryEstado): { destino: "salida" | "entrega" | "liquidar"; label: string } | null {
  if (e === "ASIGNADO") return { destino: "salida", label: "Marcar salida" };
  if (e === "EN_RUTA" || e === "EN_DESTINO") return { destino: "entrega", label: "Confirmar entrega" };
  if (e === "ENTREGADO") return { destino: "liquidar", label: "Liquidar" };
  // liquidar_delivery también acepta NO_ENTREGADO y EN_REGRESO; sin esto quedaban colgados sin acción.
  if (e === "NO_ENTREGADO" || e === "EN_REGRESO") return { destino: "liquidar", label: "Liquidar" };
  return null;
}

/** La asignación viva de un ticket, si la tiene. Null si el pedido salió sin repartidor. */
export async function asignacionDeTicket(
  token: string,
  ticketId: string,
): Promise<{ id: string; estado: DeliveryEstado; montoALiquidar: number } | null> {
  const { data, error } = await employeeClient(token)
    .from("delivery_asignaciones")
    .select("id, estado, monto_a_liquidar_mxn")
    .eq("ticket_id", ticketId)
    .not("estado", "in", "(LIQUIDADO,CANCELADO)")
    .order("fecha_asignacion", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const f = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!f) return null;
  return {
    id: String(f.id),
    estado: (f.estado as DeliveryEstado) ?? "ASIGNADO",
    montoALiquidar: Number(f.monto_a_liquidar_mxn ?? 0),
  };
}

/**
 * Cierra el reparto con el dinero que de verdad entró: confirma la entrega si hacía falta y
 * liquida al repartidor.
 *
 * Se llama al COBRAR, no en un paso aparte. En este negocio el repartidor cobra en la puerta y el
 * cajero registra el ticket cuando vuelve: ese momento ya es la entrega del dinero, y pedir una
 * segunda confirmación por la misma plata solo invita a que se salte.
 *
 * Best-effort a propósito: la venta ya está cobrada y registrada. Si esto falla, se pierde el
 * detalle de la liquidación —molesto— pero no el dinero, y tumbar un cobro cerrado por eso sería
 * mucho peor.
 */
export async function cerrarRepartoAlCobrar(
  token: string,
  args: { ticketId: string; efectivo: number; tarjeta: number; liquidadoPorId: string },
): Promise<{ liquidada: boolean; motivo?: string }> {
  try {
    const a = await asignacionDeTicket(token, args.ticketId);
    if (!a) return { liquidada: false, motivo: "sin asignación" };
    // liquidar_delivery exige ENTREGADO/NO_ENTREGADO/EN_REGRESO. Si el pedido sigue marcado en
    // ruta, el cobro ES la prueba de que se entregó.
    if (a.estado === "ASIGNADO" || a.estado === "EN_RUTA" || a.estado === "EN_DESTINO") {
      await confirmarEntrega(token, a.id, 0);
    }
    await liquidarDelivery(token, {
      asignacionId: a.id,
      efectivo: args.efectivo,
      tarjeta: args.tarjeta,
      liquidadoPorId: args.liquidadoPorId,
      nota: "Liquidado automáticamente al cobrar el ticket",
    });
    return { liquidada: true };
  } catch (e) {
    return { liquidada: false, motivo: e instanceof Error ? e.message : "error" };
  }
}
