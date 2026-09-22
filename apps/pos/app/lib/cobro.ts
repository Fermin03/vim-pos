"use client";
import { employeeClient } from "./supabase";
import type { LineaCarrito, ModoServicio } from "./carrito";
import { componentesJsonb } from "./cuenta-mesa";
import { fijarEnvioTicket } from "./zonas-envio";

export type MetodoPago =
  | "EFECTIVO"
  | "TARJETA_CREDITO"
  | "TARJETA_DEBITO"
  | "TRANSFERENCIA"
  | "APP_OTRO";

export type PagoInput = {
  metodo: MetodoPago;
  monto: number;
  montoRecibido?: number; // solo efectivo
  referencia?: string;
};

export type TotalesTicket = {
  ticketId: string;
  subtotal: number;
  iva: number;
  descuentos: number;
  /** Lo rebajado por promociones del negocio. Va aparte de `descuentos`, que son los
   *  manuales: en el ticket y en los reportes son dos cosas distintas. */
  promociones: number;
  total: number;
  montoPagado: number;
  cambio: number;
  pendiente: number;
  estadoFiscal: string;
  folio: string | null;
};

type CtxCobro = {
  token: string;
  sucursalId: string;
  cajaId: string;
  turnoId: string;
};

function modifsJsonb(linea: LineaCarrito): { opcion_modificador_id: string; cantidad: number }[] {
  return linea.modificadores.map((m) => ({ opcion_modificador_id: m.opcionId, cantidad: m.cantidad }));
}

/** Persiste el ticket completo (abrir + items) y devuelve los totales autoritativos de la BD. */
export async function persistirTicket(
  ctx: CtxCobro,
  modoServicio: ModoServicio,
  lineas: LineaCarrito[],
  ticketClientId: string,
  clienteId?: string | null,
  direccionEntregaId?: string | null,
  notaOrden?: string | null,
  nombreCliente?: string | null,
  /** Zona de reparto del pedido. El cargo entra como renglón, después de los productos: la RPC
   *  hereda la política de IVA del primer renglón, así que los productos tienen que existir ya. */
  envioZonaId?: string | null,
): Promise<TotalesTicket> {
  const sb = employeeClient(ctx.token);

  const { data: ticketId, error: e1 } = await sb.rpc("abrir_ticket", {
    p_sucursal_id: ctx.sucursalId,
    p_caja_id: ctx.cajaId,
    p_turno_id: ctx.turnoId,
    p_modo_servicio: modoServicio,
    p_cliente_id: clienteId ?? null,
    p_client_id_local: ticketClientId,
  });
  if (e1) throw new Error(e1.message);
  const tid = ticketId as string;

  // Domicilio: persistir QUÉ dirección del cliente es la entrega (requiere cliente_id, ya puesto).
  if (direccionEntregaId && clienteId) {
    await sb.from("tickets").update({ direccion_entrega_id: direccionEntregaId }).eq("id", tid);
  }

  // Pick-up: nombre suelto para identificar la cuenta. Etiqueta del ticket, no un cliente
  // registrado (no se toca `clientes` ni `cliente_id`).
  if (nombreCliente?.trim()) {
    await sb.from("tickets").update({ nombre_cliente: nombreCliente.trim().slice(0, 100) }).eq("id", tid);
  }

  // Nota de cocina de TODA la orden → tickets.nota_general (la lee el KDS y la comanda).
  if (notaOrden?.trim()) {
    await sb.from("tickets").update({ nota_general: notaOrden.trim(), nota_imprime_en_comanda: true }).eq("id", tid);
  }

  for (const l of lineas) {
    const { error } = l.combo
      ? await sb.rpc("agregar_combo_a_ticket", {
          p_ticket_id: tid,
          p_combo_producto_id: l.producto.id,
          p_cantidad: l.cantidad,
          p_componentes: componentesJsonb(l.combo.componentes),
          p_modificadores: modifsJsonb(l),
          p_nota_cocina: l.notaCocina,
          p_client_id_local: l.clientId,
        })
      : await sb.rpc("agregar_item_a_ticket", {
          p_ticket_id: tid,
          p_producto_id: l.producto.id,
          p_cantidad: l.cantidad,
          p_nota_cocina: l.notaCocina,
          p_modificadores: modifsJsonb(l),
          p_client_id_local: l.clientId,
        });
    if (error) throw new Error(error.message);
  }

  // El envío entra DESPUÉS del bucle de renglones: fijar_envio_ticket hereda la tasa de IVA y el
  // "incluido en precio" del primer renglón de producto (0116_zonas_envio.sql), así que ese
  // renglón tiene que existir ya cuando se llama.
  if (envioZonaId) {
    const { error } = await sb.rpc("fijar_envio_ticket", { p_ticket_id: tid, p_zona_id: envioZonaId });
    if (error) throw new Error(error.message);
  }

  return leerTotales(ctx.token, tid);
}

/** Relee los totales autoritativos de la fila tickets. */
export async function leerTotales(token: string, ticketId: string): Promise<TotalesTicket> {
  const { data, error } = await employeeClient(token)
    .from("tickets")
    .select("id, subtotal_mxn, iva_mxn, descuentos_manuales_mxn, promociones_mxn, total_mxn, monto_pagado_mxn, cambio_mxn, monto_pendiente_mxn, estado_fiscal, folio_completo")
    .eq("id", ticketId)
    .single();
  if (error) throw new Error(error.message);
  const t = data as {
    id: string; subtotal_mxn: string | number; iva_mxn: string | number;
    descuentos_manuales_mxn: string | number; promociones_mxn: string | number; total_mxn: string | number;
    monto_pagado_mxn: string | number; cambio_mxn: string | number; monto_pendiente_mxn: string | number;
    estado_fiscal: string; folio_completo: string | null;
  };
  return {
    ticketId: t.id,
    subtotal: Number(t.subtotal_mxn),
    iva: Number(t.iva_mxn),
    descuentos: Number(t.descuentos_manuales_mxn),
    promociones: Number(t.promociones_mxn),
    total: Number(t.total_mxn),
    montoPagado: Number(t.monto_pagado_mxn),
    cambio: Number(t.cambio_mxn),
    pendiente: Number(t.monto_pendiente_mxn),
    estadoFiscal: t.estado_fiscal,
    folio: t.folio_completo,
  };
}

/**
 * Cambia (o quita, con `zonaId` null) la zona de reparto de un pedido que YA tiene ticket, y
 * relee los totales autoritativos — para que el renglón de envío del ticket lateral y el total
 * del pie se muevan juntos (Task 7, ronda de arreglos 1/5).
 *
 * `ticketId: null` significa "el pedido todavía no se persistió": no hay nada que reescribir en
 * BD, así que no toca la red y devuelve `null` — el caller decide qué hacer con el carrito local
 * en ese caso (para un ticket sin persistir, cambiar de zona es solo un `dispatch`).
 *
 * Si `fijarEnvioTicket` truena (zona inactiva, de otra sucursal, o el ticket ya no está en
 * BORRADOR/ABIERTO — ver `fijar_envio_ticket` en `0116_zonas_envio.sql`), el error se propaga tal
 * cual y `leerTotales` nunca se llama: el caller no debe actualizar el carrito con una zona que la
 * base rechazó.
 */
export async function cambiarZonaDePedido(
  token: string,
  ticketId: string | null,
  zonaId: string | null,
): Promise<TotalesTicket | null> {
  if (!ticketId) return null;
  await fijarEnvioTicket(token, ticketId, zonaId);
  return leerTotales(token, ticketId);
}

/** F5.2b — fija la propina del ticket (RPC establecer_propina_ticket, bajo RLS). */
export async function establecerPropina(token: string, ticketId: string, monto: number): Promise<void> {
  const { error } = await employeeClient(token).rpc("establecer_propina_ticket", {
    p_ticket_id: ticketId,
    p_monto_mxn: monto,
  });
  if (error) throw new Error(error.message);
}

export type SugerenciasPropina = {
  porcentajes: number[];
  capturar: boolean;
  libre: boolean;
  sin: boolean;
};

/** F5.2b — lee la config de propina de la sucursal (con defaults si no hay fila). */
export async function leerSugerenciasPropina(token: string, sucursalId: string): Promise<SugerenciasPropina> {
  const { data } = await employeeClient(token)
    .from("sucursal_propinas_config")
    .select("porcentajes_sugeridos, capturar_propina, permitir_monto_libre, permitir_sin_propina")
    .eq("sucursal_id", sucursalId)
    .maybeSingle();
  const cfg = data as {
    porcentajes_sugeridos: number[] | null;
    capturar_propina: boolean | null;
    permitir_monto_libre: boolean | null;
    permitir_sin_propina: boolean | null;
  } | null;
  return {
    porcentajes: cfg?.porcentajes_sugeridos ?? [10, 15, 20],
    capturar: cfg?.capturar_propina ?? true,
    libre: cfg?.permitir_monto_libre ?? true,
    sin: cfg?.permitir_sin_propina ?? true,
  };
}

/** Aplica un pago contra el ticket. Devuelve los totales actualizados. */
export async function aplicarPago(
  token: string,
  ticketId: string,
  pago: PagoInput,
  pagoClientId: string,
): Promise<TotalesTicket> {
  const { error } = await employeeClient(token).rpc("aplicar_pago", {
    p_ticket_id: ticketId,
    p_metodo_pago: pago.metodo,
    p_monto_mxn: pago.monto,
    p_monto_recibido_mxn: pago.metodo === "EFECTIVO" ? (pago.montoRecibido ?? pago.monto) : null,
    p_referencia: pago.referencia ?? null,
    p_client_id_local: pagoClientId,
  });
  if (error) throw new Error(error.message);
  return leerTotales(token, ticketId);
}
