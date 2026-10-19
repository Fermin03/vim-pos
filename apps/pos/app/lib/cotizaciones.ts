"use client";
import { enlaceWhatsapp } from "@vim/db/soporte";
import { employeeClient } from "./supabase";
import { nuevoClientId, type LineaCarrito } from "./carrito";
import type { Producto } from "./catalogo";
import type { ClienteCuenta } from "./clientes-cuenta";
import { clienteDeTicket } from "./cuenta-mesa";
import { motivoDeLaBase } from "./credito";
import { redondearCentavos } from "./dinero";
import { fechaCorta } from "./lealtad-reglas";
import type { Almacen } from "./lealtad-canje";
import { fmtMxn } from "./turno";
import { COLUMNAS_SUCURSAL, PORTAL_FACTURA, direccionSucursal } from "./print/ticket-datos";

// Cotizaciones en la caja de la tienda (retail 2, entrega 3; 0212/0213). Una cotización no es venta:
// la base calcula precios e IVA al guardarla; aquí solo se llaman sus RPC y se arma lo que se ve.

export type ItemCotizacion = {
  productoId: string | null;
  nombre: string;
  sku: string | null;
  cantidad: number;
  precioUnitario: number;
  /** KGM, MTR, LTR a granel; H87 o nada, pieza. */
  unidadSat: string | null;
  total: number;
};

export type Cotizacion = {
  id: string;
  folio: string;
  estado: "VIGENTE" | "CONVERTIDA" | "CANCELADA";
  creadaIso: string;
  /** YYYY-MM-DD. */
  vigenteHasta: string;
  token: string;
  cliente: ClienteCuenta | null;
  items: ItemCotizacion[];
  subtotal: number;
  iva: number;
  total: number;
};

/** «Guardar como cotización» va con el módulo, con renglones y con un carrito suelto (no una cuenta guardada). */
export const puedeCotizar = (e: { modulo: boolean; lineas: number; guardada: boolean }) => e.modulo && e.lineas > 0 && !e.guardada;

/** El enlace público de la cotización, en el portal donde ya vive la autofactura. */
export const urlCotizacion = (token: string) => `${PORTAL_FACTURA}/c/${encodeURIComponent(token)}`;

export function textoWhatsappCotizacion(c: { folio: string; negocio: string; total: number; vigenteHasta: string; url: string }): string {
  return `Cotización ${c.folio} de ${c.negocio}: ${fmtMxn(c.total)}, válida hasta ${fechaCorta(c.vigenteHasta)}. Ver: ${c.url}`;
}

/**
 * wa.me al teléfono del cliente. Un número de 10 dígitos es de México y wa.me lo pide con el 52.
 * Sin número (o uno que no sirve), wa.me sin destinatario: el cajero elige el contacto.
 */
export function enlaceWhatsappCotizacion(telefono: string | null | undefined, texto: string): string {
  const n = (telefono ?? "").replace(/\D/g, "");
  return enlaceWhatsapp(n.length === 10 ? `52${n}` : n, texto) ?? `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

/** «Vencida» no es estado: vale hasta su día, en México (ponytail: como el crédito, sin `tenants.timezone`). */
export const estaVencida = (vigenteHasta: string, hoy: string) => vigenteHasta < hoy;

/**
 * Renglones de la cotización → carrito, con el producto del catálogo de HOY (su precio, su unidad).
 * Lo que ya no está en el catálogo, se agotó o no se vende en esta sucursal se omite.
 */
export function lineasDeCotizacion(items: ItemCotizacion[], productos: Producto[]): { lineas: LineaCarrito[]; cambiaronPrecio: number; omitidos: string[] } {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const lineas: LineaCarrito[] = [];
  const omitidos: string[] = [];
  let cambiaronPrecio = 0;
  for (const i of items) {
    const p = i.productoId ? porId.get(i.productoId) : undefined;
    if (!p || p.agotado || !p.seVendeAqui) { omitidos.push(i.nombre); continue; }
    if (redondearCentavos(p.precio_base_mxn) !== redondearCentavos(i.precioUnitario)) cambiaronPrecio++;
    lineas.push({ clientId: nuevoClientId(), producto: p, cantidad: i.cantidad, modificadores: [], notaCocina: null });
  }
  return { lineas, cambiaronPrecio, omitidos };
}

export function avisosConversion(e: { cambiaronPrecio: number; omitidos: string[]; vigenteHasta: string; hoy: string }): string[] {
  return [
    ...(e.cambiaronPrecio > 0 ? [`Precios de hoy: ${e.cambiaronPrecio} producto(s) cambiaron.`] : []),
    ...(estaVencida(e.vigenteHasta, e.hoy) ? [`Esta cotización venció el ${fechaCorta(e.vigenteHasta)}.`] : []),
    ...(e.omitidos.length > 0 ? [`Se omitió lo que ya no se vende o está agotado: ${e.omitidos.join(", ")}.`] : []),
  ];
}

/** Por folio (sus dígitos bastan) o por el nombre del cliente, sin acentos ni mayúsculas. */
export function filtrarCotizaciones(lista: Cotizacion[], texto: string): Cotizacion[] {
  const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = plano(texto.trim());
  if (!q) return lista;
  return lista.filter((c) => plano(c.folio).includes(q) || plano(c.cliente?.nombre ?? "").includes(q));
}

// ─── Base ────────────────────────────────────────────────────────────────────

const COLUMNAS = "id, folio, estado, created_at, vigente_hasta, token_publico, subtotal_mxn, iva_mxn, total_mxn, "
  + "cliente:clientes(id, nombre, apellido_paterno, telefono), "
  + "cotizacion_items(producto_id, producto_nombre_snapshot, producto_sku_snapshot, cantidad, precio_unitario_snapshot, unidad_sat_snapshot, total_item_mxn, orden_visualizacion)";

type Num = number | string;
type Fila = {
  id: string; folio: string; estado: Cotizacion["estado"]; created_at: string; vigente_hasta: string; token_publico: string;
  subtotal_mxn: Num; iva_mxn: Num; total_mxn: Num; cliente: unknown;
  cotizacion_items: { producto_id: string | null; producto_nombre_snapshot: string; producto_sku_snapshot: string | null; cantidad: Num;
    precio_unitario_snapshot: Num; unidad_sat_snapshot: string | null; total_item_mxn: Num; orden_visualizacion: number }[] | null;
};

function aCotizacion(f: Fila): Cotizacion {
  return {
    id: f.id, folio: f.folio, estado: f.estado, creadaIso: f.created_at, vigenteHasta: f.vigente_hasta, token: f.token_publico,
    cliente: clienteDeTicket(f.cliente),
    items: [...(f.cotizacion_items ?? [])].sort((a, b) => a.orden_visualizacion - b.orden_visualizacion).map((i) => ({
      productoId: i.producto_id, nombre: i.producto_nombre_snapshot, sku: i.producto_sku_snapshot, cantidad: Number(i.cantidad),
      precioUnitario: Number(i.precio_unitario_snapshot), unidadSat: i.unidad_sat_snapshot, total: Number(i.total_item_mxn),
    })),
    subtotal: Number(f.subtotal_mxn), iva: Number(f.iva_mxn), total: Number(f.total_mxn),
  };
}

/** Guarda el carrito como cotización. La base pone precios, IVA, folio y vigencia. Idempotente por `clientId`. */
export async function guardarCotizacion(token: string, a: {
  sucursalId: string; cajaId: string; clienteId: string | null; lineas: LineaCarrito[]; clientId: string;
}): Promise<string> {
  const { data, error } = await employeeClient(token).rpc("guardar_cotizacion", {
    p_sucursal_id: a.sucursalId,
    p_caja_id: a.cajaId,
    p_cliente_id: a.clienteId,
    p_items: a.lineas.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
    p_client_id_local: a.clientId,
  });
  if (error) throw new Error(motivoDeLaBase(error.message));
  return String((data as { id: string }).id);
}

export async function leerCotizacion(token: string, id: string): Promise<Cotizacion> {
  const { data, error } = await employeeClient(token).from("cotizaciones").select(COLUMNAS).eq("id", id).single();
  if (error) throw new Error(error.message);
  return aCotizacion(data as unknown as Fila);
}

/** Las vigentes de esta caja (las vencidas también: siguen VIGENTE en la base), la más nueva primero. */
export async function listarCotizaciones(token: string, cajaId: string): Promise<Cotizacion[]> {
  const { data, error } = await employeeClient(token)
    .from("cotizaciones").select(COLUMNAS)
    .eq("caja_id", cajaId).eq("estado", "VIGENTE")
    .order("created_at", { ascending: false })
    .limit(200); // ponytail: tope fijo; paginar si una caja junta más vigentes
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Fila[]).map(aCotizacion);
}

export async function cancelarCotizacion(token: string, id: string): Promise<void> {
  const { error } = await employeeClient(token).rpc("cancelar_cotizacion", { p_id: id });
  if (error) throw new Error(motivoDeLaBase(error.message));
}

export type Encabezado = { negocio: string; rfc: string | null; direccion: string | null; telefono: string | null };

/** Lo de arriba del papel: el negocio y su sucursal, como en el ticket. */
export async function leerEncabezado(token: string, tenantId: string, sucursalId: string, negocio: string): Promise<Encabezado> {
  const sb = employeeClient(token);
  const [s, t] = await Promise.all([
    sb.from("sucursales").select(COLUMNAS_SUCURSAL).eq("id", sucursalId).maybeSingle(),
    sb.from("tenants").select("rfc").eq("id", tenantId).maybeSingle(),
  ]);
  const suc = (s.data ?? {}) as Record<string, string | null>;
  return { negocio, rfc: (t.data as { rfc: string | null } | null)?.rfc ?? null, direccion: direccionSucursal(suc), telefono: suc.telefono ?? null };
}

// ─── Marcar CONVERTIDA sin detener el cobro ─────────────────────────────────

export type PorMarcar = { cotizacionId: string; ticketId: string };
const LLAVE = "vim.cotizaciones.por-marcar";

export function porMarcar(a: Almacen): PorMarcar[] {
  try {
    const v: unknown = JSON.parse(a.getItem(LLAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is PorMarcar => typeof x?.cotizacionId === "string" && typeof x?.ticketId === "string") : [];
  } catch {
    return [];
  }
}

const guardarPorMarcar = (a: Almacen, l: PorMarcar[]) => { try { a.setItem(LLAVE, JSON.stringify(l)); } catch { /* sin almacén, se pierde al cerrar */ } };

export function anotarPorMarcar(a: Almacen, p: PorMarcar): void {
  guardarPorMarcar(a, [...porMarcar(a).filter((x) => x.cotizacionId !== p.cotizacionId), p]);
}

/** Intenta cada pendiente; lo que falla se queda para la siguiente vez. */
export async function marcarPendientes(a: Almacen, marcar: (p: PorMarcar) => Promise<void>): Promise<void> {
  for (const p of porMarcar(a)) {
    try {
      await marcar(p);
      guardarPorMarcar(a, porMarcar(a).filter((x) => x.cotizacionId !== p.cotizacionId));
    } catch { /* se reintenta en el siguiente cobro o al abrir Cotizaciones */ }
  }
}

export async function marcarConvertida(token: string, p: PorMarcar): Promise<void> {
  const { error } = await employeeClient(token).rpc("marcar_cotizacion_convertida", { p_cotizacion_id: p.cotizacionId, p_ticket_id: p.ticketId });
  // Cancelada, convertida con otra venta o borrada: reintentar no la arregla, se suelta.
  if (error && !esRechazoFinal(error.message)) throw new Error(motivoDeLaBase(error.message));
}

/** Los rechazos de `marcar_cotizacion_convertida` que no cambian por reintentar. */
export const esRechazoFinal = (mensaje: string) => /ya está (cancelada|convertida)|la cotización no existe/.test(mensaje);
