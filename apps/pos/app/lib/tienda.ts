"use client";
import { deviceClient, employeeClient } from "./supabase";
import type { Producto } from "./catalogo";
import type { DatosCaja } from "./turno";

/** La caja de tienda es solo para el giro RETAIL; todo lo demás queda como estaba. */
export const esTienda = (caja: DatosCaja | null): boolean => caja?.giro === "RETAIL";

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
