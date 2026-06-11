"use client";
import type { LineaCarrito, ModoServicio } from "./carrito";
import { precioUnitarioLinea } from "./carrito";
import type { OperacionOffline } from "./outbox";
import { encolar, contarPendientes } from "./outbox";

// Fase 3 · cobro offline. Convierte una venta (ticket + items + pago) en operaciones de
// sync idempotentes que el servidor reconstruye al volver la red (sync_aplicar_operacion
// soporta tickets/ticket_items/pagos INSERT). Los snapshots fiscales viajan en el payload
// porque el servidor NO los deriva del producto al sincronizar.

export type CtxOffline = {
  sucursalId: string;
  cajaId: string;
  turnoId: string;
  usuarioId: string;
};

export type PagoOffline = {
  metodo: string;
  montoMxn: number;
  montoRecibidoMxn?: number | null;
  cambioMxn?: number | null;
  referencia?: string | null;
};

export type ExtrasCobro = {
  clienteId?: string | null;
  direccionEntregaId?: string | null;
  notaOrden?: string | null;
};

type Op = Omit<OperacionOffline, "intentos">;

/**
 * Arma las operaciones de una venta offline. PURO y determinista: recibe los generadores
 * de id/fecha para poder testear. El item referencia al ticket por su id LOCAL; el servidor
 * los re-liga por client_id_local.
 */
export function construirOpsCobro(
  ctx: CtxOffline,
  modoServicio: ModoServicio,
  lineas: LineaCarrito[],
  pago: PagoOffline,
  extras: ExtrasCobro,
  gen: { id: () => string; clientId: () => string; ahora: () => string },
): Op[] {
  const fecha = gen.ahora();
  const ticketLocalId = gen.id();
  const ticketClientId = gen.clientId();
  const ops: Op[] = [];

  // 1) El ticket entra BORRADOR (sin folio); el folio lo asigna el trigger al pasar a ABIERTO.
  ops.push({
    clientIdLocal: ticketClientId,
    tabla: "tickets",
    operacion: "INSERT",
    entidadIdLocal: ticketLocalId,
    fechaOperacion: fecha,
    payload: {
      sucursal_id: ctx.sucursalId,
      caja_id: ctx.cajaId,
      turno_id: ctx.turnoId,
      modo_servicio: modoServicio,
      cliente_id: extras.clienteId ?? null,
      direccion_entrega_id: extras.direccionEntregaId ?? null,
      nota_general: extras.notaOrden ?? null,
      nota_imprime_en_comanda: Boolean(extras.notaOrden),
      usuario_apertura_id: ctx.usuarioId,
      fecha_apertura: fecha,
      client_id_local: ticketClientId,
    },
  });

  // 2) Transición a ABIERTO → el trigger asigna folio (verificado en smoke_cobro_offline).
  ops.push({
    clientIdLocal: gen.clientId(),
    tabla: "tickets",
    operacion: "UPDATE",
    entidadIdLocal: ticketLocalId,
    fechaOperacion: fecha,
    payload: { estado_fiscal: "ABIERTO" },
  });

  lineas.forEach((l, i) => {
    ops.push({
      clientIdLocal: gen.clientId(),
      tabla: "ticket_items",
      operacion: "INSERT",
      entidadIdLocal: gen.id(),
      fechaOperacion: fecha,
      payload: {
        ticket_id: ticketLocalId,
        producto_id: l.producto.id,
        cantidad: l.cantidad,
        orden_visualizacion: i + 1,
        producto_nombre_snapshot: l.producto.nombre,
        producto_sku_snapshot: l.producto.sku,
        precio_unitario_snapshot: precioUnitarioLinea(l),
        tasa_iva_snapshot: l.producto.tasaIva,
        iva_incluido_en_precio_snapshot: l.producto.ivaIncluido,
        clave_sat_snapshot: l.producto.claveSat,
        unidad_sat_snapshot: l.producto.unidadSat,
        categoria_nombre_snapshot: l.producto.categoriaNombre,
        nota_cocina: l.notaCocina ?? null,
      },
    });
  });

  ops.push({
    clientIdLocal: gen.clientId(),
    tabla: "pagos",
    operacion: "INSERT",
    entidadIdLocal: gen.id(),
    fechaOperacion: fecha,
    payload: {
      sucursal_id: ctx.sucursalId,
      caja_id: ctx.cajaId,
      turno_id: ctx.turnoId,
      ticket_id: ticketLocalId,
      metodo_pago: pago.metodo,
      monto_mxn: pago.montoMxn,
      monto_recibido_mxn: pago.montoRecibidoMxn ?? null,
      cambio_mxn: pago.cambioMxn ?? null,
      referencia: pago.referencia ?? null,
      es_pago_al_recibir: false,
      estado: "APLICADO",
      usuario_id: ctx.usuarioId,
    },
  });

  return ops;
}

/** Encola una venta offline. Devuelve el id local del ticket + cuántas operaciones quedaron pendientes. */
export async function cobrarOffline(
  ctx: CtxOffline,
  modoServicio: ModoServicio,
  lineas: LineaCarrito[],
  pago: PagoOffline,
  extras: ExtrasCobro,
): Promise<{ ticketLocalId: string; pendientes: number }> {
  const ops = construirOpsCobro(ctx, modoServicio, lineas, pago, extras, {
    id: () => crypto.randomUUID(),
    clientId: () => crypto.randomUUID(),
    ahora: () => new Date().toISOString(),
  });
  const ticketLocalId = String(ops[0]?.entidadIdLocal ?? "");
  for (const op of ops) await encolar(op);
  return { ticketLocalId, pendientes: await contarPendientes() };
}
