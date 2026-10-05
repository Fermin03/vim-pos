"use client";
import { supabase } from "./supabase";

/**
 * Menús del catálogo (ADR 0029, migración 0155). El dueño crea menús con nombre y los asigna a
 * sucursales; cada sucursal usa exactamente uno. El General es el catálogo de siempre
 * (`productos.precio_base_mxn`, `productos.en_menu_general`) y no tiene fila en `menus`. Un menú
 * propio guarda una fila por producto en `menu_productos`, con su disponible y su precio.
 *
 * La base copia sola a `productos_sucursal` lo que el menú de cada sucursal dice (proyectar_menu):
 * la caja, la venta y Uber leen eso y no saben de menús. Aquí nunca se escribe `productos_sucursal`
 * para precio o disponibilidad.
 */

export const MENU_GENERAL = "general";
/** El id de un menú propio, o `MENU_GENERAL`. */
export type MenuId = string;

export type SucursalDeMenu = { id: string; nombre: string; menuId: string | null };
export type Menu = { id: string; nombre: string; sucursales: { id: string; nombre: string }[] };
/** Lo que un menú dice de un producto. En el General sale del producto mismo. */
export type FilaDeMenu = { disponible: boolean; precio_mxn: number };
export type EstadoEnMenu = "ACTIVO" | "PAUSADO" | "NO_SE_VENDE";
export type EstadoCategoria = "encendida" | "apagada" | "parcial" | "vacia";

export function armarMenus(filas: { id: string; nombre: string }[], sucursales: SucursalDeMenu[]): Menu[] {
  return filas.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    sucursales: sucursales.filter((s) => s.menuId === m.id).map((s) => ({ id: s.id, nombre: s.nombre })),
  }));
}

/** Las sucursales que usan ese menú (el General = las que no tienen menú propio). */
export function sucursalesDe(menu: MenuId, sucursales: SucursalDeMenu[]): SucursalDeMenu[] {
  return sucursales.filter((s) => (menu === MENU_GENERAL ? s.menuId === null : s.menuId === menu));
}

/** ¿Se pinta el selector? Con una sola sucursal y sin menús propios, el Catálogo se ve como siempre. */
export function hayMenus(menus: Menu[], sucursales: SucursalDeMenu[]): boolean {
  return menus.length > 0 || sucursales.length >= 2;
}

/** Elige con lo que hay: URL → lo último que se usó → el General. Un menú que ya no existe no cuenta. */
export function elegirMenuInicial(menus: Menu[], url: string | null, guardado: string | null): MenuId {
  for (const v of [url, guardado]) {
    if (v === MENU_GENERAL) return MENU_GENERAL;
    if (v && menus.some((m) => m.id === v)) return v;
  }
  return MENU_GENERAL;
}

/**
 * El enlace a otra pantalla del Catálogo, con el menú que se está viendo (`?menu=`). Sin esto la
 * pantalla siguiente abriría con «lo último que se usó», que con dos pestañas en menús distintos
 * puede ser el menú de la otra. `null` = no hay menús que elegir: el enlace queda como siempre.
 */
export function hrefConMenu(href: string, menu: MenuId | null): string {
  if (!menu) return href;
  return `${href}${href.includes("?") ? "&" : "?"}menu=${encodeURIComponent(menu)}`;
}

/** Pausar es global y gana; apagado en el menú es «no se vende aquí». El agotado no es del menú. */
export function estadoEnMenu(estadoProducto: string, disponible: boolean): EstadoEnMenu {
  if (estadoProducto === "PAUSADO") return "PAUSADO";
  return disponible ? "ACTIVO" : "NO_SE_VENDE";
}

/** Una categoría no tiene estado propio por menú: es lo que resulta de sus productos. */
export function estadoCategoria(seVenden: number, total: number): EstadoCategoria {
  if (total === 0) return "vacia";
  if (seVenden === 0) return "apagada";
  return seVenden === total ? "encendida" : "parcial";
}

/** Por categoría: cuántos productos tiene y cuántos se venden en el menú. Sin fila = se vende. */
export function conteoPorCategoria(
  productos: { id: string; categoria_id: string }[],
  filas: Map<string, FilaDeMenu>,
): Map<string, { seVenden: number; total: number }> {
  const conteo = new Map<string, { seVenden: number; total: number }>();
  for (const p of productos) {
    const c = conteo.get(p.categoria_id) ?? { seVenden: 0, total: 0 };
    c.total += 1;
    if (filas.get(p.id)?.disponible ?? true) c.seVenden += 1;
    conteo.set(p.categoria_id, c);
  }
  return conteo;
}

export function filasDelGeneral(
  productos: { id: string; precio_base_mxn: number; en_menu_general: boolean }[],
): Map<string, FilaDeMenu> {
  return new Map(productos.map((p) => [p.id, { disponible: p.en_menu_general, precio_mxn: p.precio_base_mxn }]));
}

/**
 * Lo que el modal avisa antes de guardar: qué sucursales salen de OTRO menú propio para entrar a
 * este. Salir del General no se avisa (no se pierde nada), ni las que ya eran de este menú.
 */
export function avisoAlMover(elegidas: string[], menuDestino: string | null, sucursales: SucursalDeMenu[], menus: Menu[]): string[] {
  return elegidas.flatMap((id) => {
    const s = sucursales.find((x) => x.id === id);
    if (!s || s.menuId === null || s.menuId === menuDestino) return [];
    const origen = menus.find((m) => m.id === s.menuId);
    return origen ? [`${s.nombre} dejará de usar ${origen.nombre}.`] : [];
  });
}

// ── Datos ────────────────────────────────────────────────────────────────────

/** Los menús propios vivos y las sucursales activas con el menú que usa cada una. */
export async function listarMenus(): Promise<{ menus: Menu[]; sucursales: SucursalDeMenu[] }> {
  const [{ data: ms, error: e1 }, { data: ss, error: e2 }] = await Promise.all([
    supabase.from("menus").select("id, nombre").is("deleted_at", null).order("nombre", { ascending: true }),
    supabase.from("sucursales").select("id, nombre, menu_id").eq("activa", true).is("deleted_at", null).order("nombre", { ascending: true }),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  const sucursales = ((ss ?? []) as { id: string; nombre: string; menu_id: string | null }[]).map((s) => ({
    id: s.id,
    nombre: s.nombre,
    menuId: s.menu_id ?? null,
  }));
  return { menus: armarMenus((ms ?? []) as { id: string; nombre: string }[], sucursales), sucursales };
}

export async function crearMenu(nombre: string, sucursalIds: string[]): Promise<string> {
  const { data, error } = await supabase.rpc("crear_menu", { p_nombre: nombre, p_sucursales: sucursalIds });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function actualizarMenu(menuId: string, nombre: string, sucursalIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("actualizar_menu", { p_menu: menuId, p_nombre: nombre, p_sucursales: sucursalIds });
  if (error) throw new Error(error.message);
}

export async function eliminarMenu(menuId: string): Promise<void> {
  const { error } = await supabase.rpc("eliminar_menu", { p_menu: menuId });
  if (error) throw new Error(error.message);
}

/** Las filas de un menú PROPIO, por producto. Las del General salen de los productos (`filasDelGeneral`). */
export async function leerFilasDeMenu(menuId: string): Promise<Map<string, FilaDeMenu>> {
  const { data, error } = await supabase.from("menu_productos").select("producto_id, disponible, precio_mxn").eq("menu_id", menuId);
  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as { producto_id: string; disponible: boolean; precio_mxn: number | string }[]).map((f) => [
      f.producto_id,
      { disponible: f.disponible !== false, precio_mxn: Number(f.precio_mxn) },
    ]),
  );
}

/** La fila de UN producto en un menú propio (el formulario no necesita las demás). `null` = no está en ese menú. */
export async function leerFilaDeMenu(menuId: string, productoId: string): Promise<FilaDeMenu | null> {
  const { data, error } = await supabase
    .from("menu_productos")
    .select("disponible, precio_mxn")
    .eq("menu_id", menuId)
    .eq("producto_id", productoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const f = data as { disponible: boolean; precio_mxn: number | string };
  return { disponible: f.disponible !== false, precio_mxn: Number(f.precio_mxn) };
}

/**
 * Cambia «se vende» o el precio de un producto en un menú. En el General escribe el producto
 * (`en_menu_general`, `precio_base_mxn`); en un menú propio, su fila de `menu_productos`.
 */
export async function guardarFilaDeMenu(menu: MenuId, productoId: string, cambio: Partial<FilaDeMenu>): Promise<void> {
  if (menu === MENU_GENERAL) {
    const valores: Record<string, boolean | number> = {};
    if (cambio.disponible !== undefined) valores.en_menu_general = cambio.disponible;
    if (cambio.precio_mxn !== undefined) valores.precio_base_mxn = cambio.precio_mxn;
    const { error } = await supabase.from("productos").update(valores).eq("id", productoId);
    if (error) throw new Error(error.message);
    return;
  }
  const { data, error } = await supabase
    .from("menu_productos")
    .update(cambio)
    .eq("menu_id", menu)
    .eq("producto_id", productoId)
    .select("producto_id");
  if (error) throw new Error(error.message);
  if ((data ?? []).length === 0) throw new Error("Ese producto no está en este menú. Recarga la página.");
}

/** Enciende o apaga TODOS los productos de una categoría en un menú (spec §5.4: es una acción, no un estado). */
export async function encenderCategoria(menu: MenuId, categoriaId: string, encender: boolean): Promise<void> {
  if (menu === MENU_GENERAL) {
    const { error } = await supabase.from("productos").update({ en_menu_general: encender }).eq("categoria_id", categoriaId).is("deleted_at", null);
    if (error) throw new Error(error.message);
    return;
  }
  const { data: prods, error: e1 } = await supabase.from("productos").select("id").eq("categoria_id", categoriaId).is("deleted_at", null);
  if (e1) throw new Error(e1.message);
  const ids = ((prods ?? []) as { id: string }[]).map((p) => p.id);
  if (ids.length === 0) return;
  const { error } = await supabase.from("menu_productos").update({ disponible: encender }).eq("menu_id", menu).in("producto_id", ids);
  if (error) throw new Error(error.message);
}
