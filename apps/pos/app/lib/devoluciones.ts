"use client";
import { hoyMx, sumarDias } from "@vim/fecha";
import { employeeClient } from "./supabase";
import type { Autorizacion } from "./autorizacion";
import { aGranel, tipoDesdeSat } from "./unidades";

/** Roles con `venta.devolucion` por omisión: se autorizan solos; los demás piden PIN. */
export const ROLES_DEVOLUCION = ["SUPERVISOR", "ADMIN", "DUENO"];

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
      // `ticket_original_id`, no `ticket_id`: la columna nunca se llamó así. Con el nombre
      // equivocado PostgREST devolvía error, y como aquí solo se lee `data`, el error se perdía y
      // el conjunto quedaba vacío — la UI nunca avisaba de que un ticket ya tenía devolución.
      .select("ticket_original_id")
      .in("ticket_original_id", ids)
      .eq("estado", "CONFIRMADA");
    for (const d of (devs ?? []) as { ticket_original_id: string }[]) conDev.add(d.ticket_original_id);
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
// Solo se ofrecen los medios con efecto real:
//  - EFECTIVO: sale efectivo del cajón (movimiento DEVOLUCION_EFECTIVO).
//  - MISMO_METODO_PAGO: el reembolso a tarjeta se procesa en la terminal manualmente (el sistema
//    deja el documento de devolución como registro).
// VALE_PROXIMA_COMPRA se omite hasta que exista el módulo de vales/saldo a favor (si no, sería un
// pasivo sin registro: el cliente queda con saldo y el sistema no lo guarda).
export const MEDIOS_DEV: { codigo: MedioDevolucion; label: string; nota?: string }[] = [
  { codigo: "EFECTIVO", label: "Efectivo" },
  { codigo: "MISMO_METODO_PAGO", label: "Mismo método", nota: "Si se cobró con la terminal desde la caja, el dinero regresa solo a la tarjeta. Si no, procesa el reembolso en la terminal de pago." },
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

// ---------------------------------------------------------------------------------------------
// Giro RETAIL: devolución parcial, por renglón y por pieza, con regreso al anaquel (pos-retail.md,
// «Devoluciones en una tienda»). La de restaurante (`devolverVenta`) no cambia.
// ---------------------------------------------------------------------------------------------

/** Los motivos que ve la caja. Una tienda no tiene «Tardó demasiado» ni «Producto equivocado». */
export function motivosDevolucion(tienda: boolean): { codigo: MotivoDevolucion; label: string }[] {
  if (!tienda) return MOTIVOS_DEV;
  return [
    { codigo: "PRODUCTO_DEFECTUOSO", label: "Producto defectuoso" },
    { codigo: "CLIENTE_NO_SATISFECHO", label: "No le gustó" },
    { codigo: "ERROR_COBRO", label: "Error de cobro" },
    { codigo: "OTRO", label: "Otro" },
  ];
}

/** Un renglón (no cancelado) de una venta cobrada, con lo que ya se devolvió de él. */
export type RenglonVenta = {
  ticket_item_id: string;
  producto_id: string | null;
  /** `producto_nombre_snapshot`: el nombre como se cobró («Playera Polo M Negra»). */
  nombre: string;
  cantidad: number;
  /** Piezas ya devueltas en devoluciones no CANCELADA (la misma cuenta que el tope de 0040). */
  devuelta: number;
  precio_unitario: number;
  /** `unidad_sat_snapshot`: KGM, MTR o LTR es a granel; H87, E48 o nada, pieza. */
  unidad_sat?: string | null;
  /** `total_item_mxn` del renglón completo, antes del descuento global del ticket. */
  total: number;
};

/**
 * Una venta PAGADO/FACTURADO lista para devolver o cambiar: trae todos sus renglones, así quien la
 * elige (Devoluciones, Cambio de talla) no vuelve a consultar.
 */
export type VentaDevolvible = {
  ticketId: string;
  folio: string;
  /** `total_mxn` del ticket: con el descuento global ya aplicado. */
  total: number;
  fechaCobro: string | null;
  /** Ya tiene CFDI: se devuelve, pero no se cambia (la factura pediría nota de crédito). */
  facturada?: boolean;
  /** Se cobró en línea (tienda): no se reabre ni se cambia el pago aquí, como en Cuentas cobradas. */
  pagadaEnLinea?: boolean;
  /**
   * El pago que «Cambiar pago» puede cambiar: el único pago vigente, sin contar el interno de la
   * venta de un cambio (`<llave del ticket>-pago`, la prenda que regresa, 0195/0201). `null` si no
   * queda ninguno (cambio pagado solo con la prenda) o hay más de uno (pago dividido).
   */
  pagoCambiable: { metodo: string } | null;
  /** Venta de un cambio: lo que cubre la prenda devuelta (su pago interno, que reabrir no anula). */
  pagoInterno?: number;
  renglones: RenglonVenta[];
};

export type RenglonDevolver = { ticket_item_id: string; cantidad: number; regresaAlAnaquel: boolean };

/** Lo que se devuelve de un renglón si se piden `n`: a granel, todo lo que queda o nada; piezas, entre 0 y lo que queda. */
export function cantidadADevolver(r: RenglonVenta, n: number): number {
  const disponible = Math.max(0, r.cantidad - r.devuelta);
  if (aGranel(tipoDesdeSat(r.unidad_sat))) return n > 0 ? disponible : 0;
  return Math.max(0, Math.min(disponible, n));
}

/** `p_items` de crear_devolucion: cada renglón dice si su pieza regresa a la existencia. */
export function itemsDevolucion(renglones: RenglonDevolver[]) {
  return renglones.map((r) => ({
    ticket_item_id: r.ticket_item_id,
    cantidad_devuelta: r.cantidad,
    reversar_inventario_item: r.regresaAlAnaquel,
  }));
}

/** TOTAL solo si, con lo ya devuelto, cada renglón de la venta queda devuelto completo (como 0195). */
export function alcanceDevolucion(venta: VentaDevolvible, renglones: RenglonDevolver[]): "TOTAL" | "PARCIAL" {
  const ahora = new Map<string, number>();
  for (const r of renglones) ahora.set(r.ticket_item_id, (ahora.get(r.ticket_item_id) ?? 0) + r.cantidad);
  const completo = venta.renglones.every((v) => v.devuelta + (ahora.get(v.ticket_item_id) ?? 0) >= v.cantidad - 0.0001);
  return completo ? "TOTAL" : "PARCIAL";
}

/** Pesos a centavos enteros (100.01 → 10001, sin el 10000.999… del flotante). */
export const aCentavos = (n: number) => Math.round(n * 100);

/**
 * VISTA PREVIA de lo que se reembolsa, calculada como crear_devolucion (0134): cada renglón en
 * proporción a sus piezas y al descuento global del ticket, redondeado renglón por renglón (mitad
 * hacia arriba, en centavos enteros). Lo que vale es el `total_devuelto_mxn` que guarda la base.
 */
export function totalDevolucion(venta: VentaDevolvible, renglones: RenglonDevolver[]): number {
  const bruto = venta.renglones.reduce((s, r) => s + aCentavos(r.total), 0);
  const neto = aCentavos(venta.total);
  let total = 0;
  for (const d of renglones) {
    const r = venta.renglones.find((x) => x.ticket_item_id === d.ticket_item_id);
    if (!r || r.cantidad <= 0) continue;
    const linea = (aCentavos(r.total) * d.cantidad) / r.cantidad;
    total += Math.round(bruto > 0 ? (linea * neto) / bruto : linea);
  }
  return total / 100;
}

/**
 * ¿Algún pago de la venta pasó por la terminal de Mercado Pago ligada a la caja? Es la misma señal
 * que el ticket impreso: solo esos cobros llenan `terminal_aprobacion` (ticket-datos.ts).
 */
export async function cobradoEnTerminal(token: string, ticketId: string): Promise<boolean> {
  const { data, error } = await employeeClient(token)
    .from("pagos").select("metodo_pago, terminal_aprobacion")
    .eq("ticket_id", ticketId).is("deleted_at", null);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { metodo_pago: string; terminal_aprobacion: string | null }[])
    .some((p) => p.metodo_pago.startsWith("TARJETA_") && Boolean(p.terminal_aprobacion));
}

type FilaTicket = { id: string; client_id_local: string | null; folio_completo: string | null; total_mxn: number | string | null; fecha_pago: string | null; estado_fiscal: string };
const COLUMNAS_TICKET = "id, client_id_local, folio_completo, total_mxn, fecha_pago, estado_fiscal";
const ESTADOS_DEVOLVIBLES = ["PAGADO", "FACTURADO"];

/** Partes de a lo más `n`: un `.in()` largo no cabe en la dirección de la petición. */
function enTrozos<T>(xs: T[], n = 50): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < xs.length; i += n) r.push(xs.slice(i, i + n));
  return r;
}

/** Arma las ventas con sus renglones, lo ya devuelto de cada uno y sus pagos (consultas de a 50 ids). */
async function conRenglones(token: string, tickets: FilaTicket[]): Promise<VentaDevolvible[]> {
  if (tickets.length === 0) return [];
  const cli = employeeClient(token);
  const filas: Record<string, unknown>[] = [];
  for (const ids of enTrozos(tickets.map((t) => t.id))) {
    const { data: items, error } = await cli
      .from("ticket_items")
      .select("id, ticket_id, producto_id, producto_nombre_snapshot, cantidad, precio_unitario_snapshot, unidad_sat_snapshot, total_item_mxn")
      .in("ticket_id", ids)
      .eq("cancelado", false)
      .order("created_at");
    if (error) throw new Error(error.message);
    filas.push(...((items ?? []) as Record<string, unknown>[]));
  }

  const devuelta = new Map<string, number>();
  for (const ids of enTrozos(filas.map((i) => String(i.id)))) {
    const { data: devs, error: e2 } = await cli
      .from("devolucion_items")
      .select("ticket_item_id_original, cantidad_devuelta, devoluciones!inner(estado, deleted_at)")
      .in("ticket_item_id_original", ids)
      .neq("devoluciones.estado", "CANCELADA")
      .is("devoluciones.deleted_at", null);
    if (e2) throw new Error(e2.message);
    for (const d of (devs ?? []) as Record<string, unknown>[]) {
      const id = String(d.ticket_item_id_original);
      devuelta.set(id, (devuelta.get(id) ?? 0) + Number(d.cantidad_devuelta));
    }
  }

  const pagos: { ticket_id: string; metodo_pago: string; client_id_local: string | null; monto_mxn: number | string }[] = [];
  for (const ids of enTrozos(tickets.map((t) => t.id))) {
    const { data, error: e3 } = await cli
      .from("pagos")
      .select("ticket_id, metodo_pago, client_id_local, monto_mxn")
      .in("ticket_id", ids)
      .in("estado", ["APLICADO", "CONCILIADO"])
      .is("deleted_at", null);
    if (e3) throw new Error(e3.message);
    pagos.push(...((data ?? []) as typeof pagos));
  }

  const cobro = (t: FilaTicket) => {
    const suyos = pagos.filter((p) => p.ticket_id === t.id);
    // El pago interno del cambio no se cambia (0201): se cuenta solo lo que pagó el cliente.
    const esInterno = (p: (typeof pagos)[number]) => !!t.client_id_local && p.client_id_local === `${t.client_id_local}-pago`;
    const reales = suyos.filter((p) => !esInterno(p));
    const interno = suyos.find(esInterno);
    const pagadaEnLinea = suyos.some((p) => p.metodo_pago === "PAGO_EN_LINEA");
    return {
      pagadaEnLinea,
      pagoCambiable: reales.length === 1 && !pagadaEnLinea ? { metodo: reales[0]!.metodo_pago } : null,
      ...(interno ? { pagoInterno: Number(interno.monto_mxn) } : {}),
    };
  };

  return tickets.map((t) => ({
    ticketId: t.id,
    folio: t.folio_completo ?? t.id.slice(-6),
    total: Number(t.total_mxn ?? 0),
    fechaCobro: t.fecha_pago,
    facturada: t.estado_fiscal === "FACTURADO",
    ...cobro(t),
    renglones: filas
      .filter((i) => i.ticket_id === t.id)
      .map((i) => ({
        ticket_item_id: String(i.id),
        producto_id: i.producto_id == null ? null : String(i.producto_id),
        nombre: String(i.producto_nombre_snapshot),
        cantidad: Number(i.cantidad),
        devuelta: devuelta.get(String(i.id)) ?? 0,
        precio_unitario: Number(i.precio_unitario_snapshot ?? 0),
        unidad_sat: i.unidad_sat_snapshot == null ? null : String(i.unidad_sat_snapshot),
        total: Number(i.total_item_mxn ?? 0),
      })),
  }));
}

/** Una venta (del turno, por ejemplo) con sus renglones, para devolverla por partes. */
export async function leerVentaDevolvible(token: string, ticketId: string): Promise<VentaDevolvible | null> {
  const { data, error } = await employeeClient(token)
    .from("tickets").select(COLUMNAS_TICKET)
    .eq("id", ticketId).in("estado_fiscal", ESTADOS_DEVOLVIBLES).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? ((await conRenglones(token, [data as FilaTicket]))[0] ?? null) : null;
}

/**
 * La venta con ese folio tal como sale impreso (`folio_completo`), si está PAGADO/FACTURADO.
 * El folio es único por sucursal (0008, `ticket_folio_unico_por_sucursal`), así que se busca en la
 * de la caja. El negocio lo pone RLS; en la caja instalada solo encuentra las ventas de esa caja.
 */
export async function buscarVentaPorFolio(token: string, folio: string, sucursalId: string): Promise<VentaDevolvible | null> {
  const f = folio.trim();
  if (!f) return null;
  const { data, error } = await employeeClient(token)
    .from("tickets").select(COLUMNAS_TICKET)
    .eq("sucursal_id", sucursalId).eq("folio_completo", f).in("estado_fiscal", ESTADOS_DEVOLVIBLES)
    .order("fecha_pago", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return (await conRenglones(token, (data ?? []) as FilaTicket[]))[0] ?? null;
}

/**
 * Ventas PAGADO/FACTURADO de los últimos `dias` (por día contable, en hora de México) con un
 * renglón no cancelado de ese producto, de la sucursal de la caja; la más reciente primero.
 * Mismo alcance que el folio.
 */
export async function buscarVentasConProducto(token: string, productoId: string, sucursalId: string, dias = 30): Promise<VentaDevolvible[]> {
  const { data, error } = await employeeClient(token)
    .from("tickets").select(`${COLUMNAS_TICKET}, ticket_items!inner(producto_id)`)
    .eq("sucursal_id", sucursalId)
    .eq("ticket_items.producto_id", productoId).eq("ticket_items.cancelado", false)
    .in("estado_fiscal", ESTADOS_DEVOLVIBLES)
    .gte("dia_contable", sumarDias(hoyMx(), -dias))
    .order("fecha_pago", { ascending: false })
    // ponytail: tope de 50 ventas; con más, se busca por folio.
    .limit(50);
  if (error) throw new Error(error.message);
  return conRenglones(token, (data ?? []) as FilaTicket[]);
}

/**
 * Devolución parcial (o TOTAL si completa la venta) de una tienda: cada renglón dice si su pieza
 * vuelve al anaquel (`reversar_inventario_item`); la existencia regresa al confirmar (0189).
 * Devuelve el id y el total que guardó la base: ése es el que se enseña, se imprime y se reembolsa
 * (`totalDevolucion` es solo la vista previa).
 */
export async function devolverRenglones(
  venta: VentaDevolvible,
  renglones: RenglonDevolver[],
  motivo: MotivoDevolucion,
  medio: MedioDevolucion,
  autorizacion: Autorizacion,
  ctx: { token: string; cajaId: string; turnoId: string; solicitanteId: string; motivoTexto?: string; nota?: string },
): Promise<{ id: string; total: number }> {
  const cli = employeeClient(ctx.token);
  const { data: devId, error: e1 } = await cli.rpc("crear_devolucion", {
    p_ticket_original_id: venta.ticketId,
    p_caja_id: ctx.cajaId,
    p_turno_id: ctx.turnoId,
    p_alcance: alcanceDevolucion(venta, renglones),
    p_motivo: motivo,
    p_motivo_texto: motivo === "OTRO" ? ctx.motivoTexto?.trim() || null : null,
    p_medio_devolucion: medio,
    p_autorizacion_pin_id: autorizacion.autorizacionPinId,
    p_usuario_solicitante_id: ctx.solicitanteId,
    p_usuario_autorizo_id: autorizacion.autorizoId,
    p_items: itemsDevolucion(renglones),
    p_reversar_inventario: true,
    p_nota: ctx.nota || null,
  });
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await cli.rpc("confirmar_devolucion", {
    p_devolucion_id: String(devId),
    p_usuario_id: autorizacion.autorizoId,
  });
  if (e2) throw new Error(e2.message);
  // Ya quedó confirmada: si esta relectura falla no se reporta error (un reintento chocaría con el
  // tope de 0040); se usa la vista previa, que coincide salvo algún centavo con descuento global.
  const { data: dev } = await cli.from("devoluciones").select("total_devuelto_mxn").eq("id", String(devId)).maybeSingle();
  const guardado = (dev as { total_devuelto_mxn: number | string | null } | null)?.total_devuelto_mxn;
  return { id: String(devId), total: guardado == null ? totalDevolucion(venta, renglones) : Number(guardado) };
}
