"use client";
import { deviceClient, employeeClient } from "./supabase";
import type { Producto } from "./catalogo";
import type { DatosCaja } from "./turno";

/** La caja de tienda es solo para el giro RETAIL; todo lo demás queda como estaba. */
export const esTienda = (caja: DatosCaja | null): boolean => caja?.giro === "RETAIL";

/** Destinos de la barra inferior de la caja de tienda (pos-retail.md, «Versión 2»). */
export type SeccionTienda = "panel" | "inventario" | "transacciones" | "notificaciones" | "configuracion";

/** Con un cobro o un diálogo encima la barra no navega: sería trabajo que se pierde de vista. */
export const puedeCambiarSeccion = (capasAbiertas: boolean, cobroAbierto: boolean): boolean => !capasAbiertas && !cobroAbierto;

/**
 * Un paso de la fila de agregados con tope de tiempo. Resuelve `true` si `paso` terminó (o falló:
 * el error sube) y `false` si pasaron `ms`: la fila sigue. `vigente()` es false desde el vencimiento:
 * el paso lo consulta antes de escribir, así una respuesta tardía no agrega la pieza después.
 */
export function pasoConLimite(paso: (vigente: () => boolean) => Promise<void>, ms = 8000): Promise<boolean> {
  let vencido = false;
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<boolean>((ok) => { reloj = setTimeout(() => { vencido = true; ok(false); }, ms); });
  const hecho = paso(() => !vencido).then(() => true);
  hecho.catch(() => { /* tras vencer, nadie espera este error */ });
  return Promise.race([hecho, limite]).finally(() => clearTimeout(reloj));
}

export type Existencia = { producto_id: string; sucursal_id: string; cantidad: number; minimo: number | null };
export type EstadoExistencia = "normal" | "pocas" | "agotada";

/**
 * Existencias de todas las sucursales del negocio. En la caja instalada el gateway lee la copia
 * local; en el POS web, la nube bajo RLS. Con `token` va como empleado; sin él, como el dispositivo.
 */
export async function leerExistencias(token?: string): Promise<Existencia[]> {
  const sb = token ? employeeClient(token) : deviceClient;
  const filas: Existencia[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb
      .from("producto_existencias")
      .select("producto_id, sucursal_id, cantidad, minimo")
      .order("sucursal_id").order("producto_id")
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const f of data ?? []) {
      filas.push({ producto_id: f.producto_id, sucursal_id: f.sucursal_id, cantidad: Number(f.cantidad), minimo: f.minimo == null ? null : Number(f.minimo) });
    }
    if ((data ?? []).length < 1000) return filas;
  }
}

/** «Pocas» = en el mínimo de la sucursal o debajo; sin mínimo, 2 o menos (plan, decisión 4). */
export function estadoExistencia(cantidad: number, minimo: number | null): EstadoExistencia {
  if (cantidad <= 0) return "agotada";
  return cantidad <= (minimo ?? 2) ? "pocas" : "normal";
}

/** La etiqueta de la tarjeta: solo «pocas» o «agotada». `null` (sin existencias cargadas) tampoco enseña nada. */
export function etiquetaExistencia(estado: EstadoExistencia | null): "pocas" | "agotada" | null {
  return estado === "pocas" || estado === "agotada" ? estado : null;
}

export type PadreTienda = { padre: Producto; hijas: Producto[]; ejes: string[] };

/** Vitrina = padres y productos sin variantes. Las hijas viven dentro de su padre, en el orden recibido. */
export function agruparTienda(productos: Producto[]): { vitrina: Producto[]; padres: Map<string, PadreTienda> } {
  const padres = new Map<string, PadreTienda>();
  for (const p of productos) {
    if (p.variante_ejes?.length) padres.set(p.id, { padre: p, hijas: [], ejes: p.variante_ejes });
  }
  for (const p of productos) {
    if (p.producto_padre_id) padres.get(p.producto_padre_id)?.hijas.push(p);
  }
  return { vitrina: productos.filter((p) => !p.producto_padre_id), padres };
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** Coincidencia exacta: primero código de barras, luego SKU. Nunca un padre (no se vende). */
export function buscarPorCodigo(productos: Producto[], codigo: string): Producto | null {
  const c = norm(codigo);
  if (!c) return null;
  const vendibles = productos.filter((p) => !p.variante_ejes?.length);
  return (
    vendibles.find((p) => p.codigo_barras && norm(p.codigo_barras) === c) ??
    vendibles.find((p) => p.codigo_interno && norm(p.codigo_interno) === c) ??
    null
  );
}

const cantidadDe = (id: string, existencias: Existencia[], sucursalId: string) =>
  existencias.find((e) => e.producto_id === id && e.sucursal_id === sucursalId);

export type CeldaVariante = { hija: Producto; cantidad: number; estado: EstadoExistencia };

/** Columnas = primer eje, renglones = segundo (o `[""]`), en orden de primera aparición entre las hijas. */
export function matrizVariantes(p: PadreTienda, existencias: Existencia[], sucursalId: string) {
  const [ejeCol, ejeRen] = p.ejes;
  const valor = (h: Producto, eje: string | undefined) => (eje ? h.variante_valores?.[eje] ?? "" : "");
  const unicos = (eje: string | undefined) => [...new Set(p.hijas.map((h) => valor(h, eje)))];
  return {
    columnas: unicos(ejeCol),
    renglones: unicos(ejeRen),
    celda(col: string, ren: string): CeldaVariante | null {
      const hija = p.hijas.find((h) => valor(h, ejeCol) === col && valor(h, ejeRen) === ren);
      if (!hija) return null;
      const e = cantidadDe(hija.id, existencias, sucursalId);
      const cantidad = e?.cantidad ?? 0;
      return { hija, cantidad, estado: estadoExistencia(cantidad, e?.minimo ?? null) };
    },
  };
}

/** Lo que dice la tarjeta de la vitrina: piezas, estado y «desde $X» si las variantes difieren de precio. */
export function resumenVitrina(p: Producto, padres: Map<string, PadreTienda>, existencias: Existencia[], sucursalId: string) {
  const hijas = padres.get(p.id)?.hijas;
  if (!hijas) {
    const e = cantidadDe(p.id, existencias, sucursalId);
    const piezas = e?.cantidad ?? 0;
    return { piezas, estado: estadoExistencia(piezas, e?.minimo ?? null), precioDesde: null as number | null };
  }
  const piezas = hijas.reduce((s, h) => s + (cantidadDe(h.id, existencias, sucursalId)?.cantidad ?? 0), 0);
  const precios = hijas.map((h) => h.precio_base_mxn);
  const min = Math.min(...precios);
  return { piezas, estado: estadoExistencia(piezas, null), precioDesde: precios.length && min !== Math.max(...precios) ? min : null };
}

/** Sucursales vivas del negocio, para consultar su existencia desde el selector. */
export async function leerSucursales(token: string): Promise<{ id: string; nombre: string }[]> {
  const { data, error } = await employeeClient(token).from("sucursales").select("id, nombre").is("deleted_at", null).order("nombre");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * El renglón del ticket de tienda: el nombre del padre y, debajo, «M · Negra · POL-M-NEG» (valores
 * en el orden de los ejes, luego el SKU). Sin el padre en el catálogo se queda el nombre del producto.
 */
export function renglonTienda(p: Producto, productos: Producto[]): { nombre: string; detalle: string | undefined } {
  const padre = p.producto_padre_id ? productos.find((x) => x.id === p.producto_padre_id) : undefined;
  if (p.producto_padre_id && !padre) return { nombre: p.nombre, detalle: undefined };
  const valores = padre?.variante_ejes?.map((e) => p.variante_valores?.[e]).filter(Boolean) ?? [];
  const detalle = [...valores, p.codigo_interno].filter(Boolean).join(" · ");
  return { nombre: padre?.nombre ?? p.nombre, detalle: detalle || undefined };
}

/** ¿Vender `enCarrito` piezas dejaría la existencia de esta sucursal en cero o menos? No impide nada. */
export function sinExistencia(p: Producto, enCarrito: number, existencias: Existencia[] | null, sucursalId: string): boolean {
  // null = todavía no se leyeron: sin datos no se avisa (un aviso falso en cada renglón es peor que ninguno).
  return !!existencias && !!p.controla_existencias && (cantidadDe(p.id, existencias, sucursalId)?.cantidad ?? 0) - enCarrito <= 0;
}

export type Escaneo =
  | { tipo: "ignorar" }
  | { tipo: "cobro" }
  | { tipo: "agregar"; producto: Producto }
  | { tipo: "selector"; padre: Producto }
  | { tipo: "no-encontrado" };

/**
 * Qué hace la caja con un código leído (pos-retail.md, «Escáner»). Bajo un PIN, el aviso de un
 * pedido u otro diálogo se ignora; con el cobro abierto no se agrega nada. El código de un padre
 * abre su selector: un padre nunca llega al ticket.
 */
export function decidirEscaneo(productos: Producto[], codigo: string, { cobroAbierto, ignorar }: { cobroAbierto: boolean; ignorar: boolean }): Escaneo {
  if (ignorar) return { tipo: "ignorar" };
  if (cobroAbierto) return { tipo: "cobro" };
  const producto = buscarPorCodigo(productos, codigo);
  if (producto) return { tipo: "agregar", producto };
  const c = norm(codigo);
  const padre = c ? productos.find((p) => p.variante_ejes?.length && [p.codigo_barras, p.codigo_interno].some((k) => k && norm(k) === c)) : undefined;
  return padre ? { tipo: "selector", padre } : { tipo: "no-encontrado" };
}

/** Un renglón de «Cuentas abiertas» en Transacciones: abiertas de Para llevar y, si quedaron, en espera. */
export type FilaCuenta = { ticketId: string; titulo: string; folio: string | null; monto: number; etiquetaEspera: string | null };

/**
 * Transacciones (pos-retail.md, «Versión 2»): primero las cuentas abiertas, con lo que falta por
 * cobrar (la de un cambio con diferencia solo debe la diferencia); luego las que quedaron en espera
 * de antes, que la tienda ya no crea pero se retoman como siempre.
 */
export function filasCuentas(
  abiertas: { ticketId: string; folio: string | null; cliente: string | null; total: number; pendiente: number }[],
  espera: { ticketId: string; folio: string | null; etiqueta: string; total: number }[],
): FilaCuenta[] {
  return [
    ...abiertas.map((c) => ({ ticketId: c.ticketId, titulo: c.cliente ?? c.folio ?? "Cuenta abierta", folio: c.cliente ? c.folio : null, monto: c.pendiente > 0 ? c.pendiente : c.total, etiquetaEspera: null })),
    ...espera.map((t) => ({ ticketId: t.ticketId, titulo: t.etiqueta, folio: t.folio, monto: t.total, etiquetaEspera: t.etiqueta })),
  ];
}

/** El renglón de una venta como el del ticket: padre y variante si la prenda sigue en el catálogo; si no, el nombre con que se cobró. */
export function renglonVenta(r: { producto_id: string | null; nombre: string }, productos: Producto[]): { nombre: string; detalle: string | undefined } {
  const p = r.producto_id ? productos.find((x) => x.id === r.producto_id) : undefined;
  return p ? renglonTienda(p, productos) : { nombre: r.nombre, detalle: undefined };
}
