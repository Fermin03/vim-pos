"use client";
import { supabase, leerSesion } from "./supabase";
import { listarCajas, type Caja } from "./configuracion";

/**
 * Menú por sucursal (ADR 0027, migración 0151). Una fila por producto y sucursal guarda solo lo que
 * cambia ahí; sin fila, el producto se vende al precio general y sin agotar. La regla es la misma
 * que precio_producto_en_sucursal / motivo_no_disponible_en_sucursal (0151) y que aplicarSucursal
 * de la caja (apps/pos/app/lib/catalogo-sucursal.ts).
 */

/** Primera versión del escritorio que respeta el menú por sucursal. Una caja anterior vende todo al precio general. */
export const VERSION_MINIMA_MENU_SUCURSAL = "0.4.109";

export type SucursalMenu = { id: string; nombre: string };

export type FilaMenuSucursal = {
  producto_id: string;
  sucursal_id: string;
  disponible: boolean;
  precio_mxn: number | null;
  agotado_manual: boolean;
  agotado_automatico: boolean;
};

/** Lo que el dueño edita de una fila. El agotado por inventario no: lo escribe la base. */
export type EdicionMenuSucursal = Pick<FilaMenuSucursal, "producto_id" | "sucursal_id" | "disponible" | "precio_mxn" | "agotado_manual">;

export type EstadoEnSucursal = "ACTIVO" | "PAUSADO" | "AGOTADO" | "NO_SE_VENDE";

/** Una fila del formulario de producto. El precio va como texto: es lo que el dueño teclea. */
export type FilaFormMenu = { sucursalId: string; nombre: string; disponible: boolean; precio: string; agotado: boolean; agotadoAuto: boolean };

export function filaPorDefecto(producto_id: string, sucursal_id: string): FilaMenuSucursal {
  return { producto_id, sucursal_id, disponible: true, precio_mxn: null, agotado_manual: false, agotado_automatico: false };
}

/** ¿Deja la fila igual que no tenerla? */
export function esPorDefecto(e: Pick<EdicionMenuSucursal, "disponible" | "precio_mxn" | "agotado_manual">): boolean {
  return e.disponible && e.precio_mxn === null && !e.agotado_manual;
}

/**
 * Qué mandar al guardar. Una sucursal sin fila y en los valores por defecto no se manda (el menú
 * queda escaso). Una que ya tenía fila se manda siempre, aunque vuelva a lo general: las filas no
 * se borran, porque el pull de la caja no trae bajas.
 */
export function filasParaGuardar(ediciones: EdicionMenuSucursal[], existentes: Pick<FilaMenuSucursal, "sucursal_id">[]): EdicionMenuSucursal[] {
  const conFila = new Set(existentes.map((f) => f.sucursal_id));
  return ediciones.filter((e) => conFila.has(e.sucursal_id) || !esPorDefecto(e));
}

export function filasFormIniciales(sucursales: SucursalMenu[], filas: FilaMenuSucursal[]): FilaFormMenu[] {
  const porSucursal = new Map(filas.map((f) => [f.sucursal_id, f]));
  return sucursales.map((s) => {
    const f = porSucursal.get(s.id);
    return {
      sucursalId: s.id,
      nombre: s.nombre,
      disponible: f?.disponible ?? true,
      precio: f?.precio_mxn === null || f?.precio_mxn === undefined ? "" : String(f.precio_mxn),
      agotado: f?.agotado_manual ?? false,
      agotadoAuto: f?.agotado_automatico ?? false,
    };
  });
}

/** Del formulario a lo que se guarda. Precio vacío = el general (null). */
export function edicionesDeForm(productoId: string, filas: FilaFormMenu[]): EdicionMenuSucursal[] {
  return filas.map((f) => ({
    producto_id: productoId,
    sucursal_id: f.sucursalId,
    disponible: f.disponible,
    precio_mxn: f.precio.trim() === "" ? null : Number(f.precio),
    agotado_manual: f.agotado,
  }));
}

/** El estado en una sucursal, con el mismo orden que motivo_no_disponible_en_sucursal (0151). */
export function estadoEnSucursal(estadoProducto: string, fila: FilaMenuSucursal | undefined): EstadoEnSucursal {
  if (estadoProducto === "PAUSADO") return "PAUSADO";
  if (fila && !fila.disponible) return "NO_SE_VENDE";
  if (estadoProducto === "AGOTADO" || fila?.agotado_manual || fila?.agotado_automatico) return "AGOTADO";
  return "ACTIVO";
}

/** El estado en «todas»: las columnas agotado_* del producto son «agotado en todas» (0151). */
export function estadoGeneral(p: { estado: string; agotado_manual: boolean; agotado_automatico: boolean }): EstadoEnSucursal {
  if (p.estado === "PAUSADO") return "PAUSADO";
  if (p.estado === "AGOTADO" || p.agotado_manual || p.agotado_automatico) return "AGOTADO";
  return "ACTIVO";
}

/** "0.4.9" < "0.4.10". Una versión ilegible cuenta como vieja: es más seguro avisar de más. */
export function versionMenor(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  if (pa.some((n) => !Number.isFinite(n))) return true;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/**
 * Cajas de escritorio (con latido) que todavía no respetan el menú por sucursal: versión vieja o
 * desconocida (NULL = anterior a 0.4.60, 0105). La caja web no cuenta: toma el código al desplegar.
 */
export function cajasSinMenuPorSucursal<C extends Pick<Caja, "ultimoLatido" | "versionApp">>(
  cajas: C[],
  minima: string = VERSION_MINIMA_MENU_SUCURSAL,
): C[] {
  return cajas.filter((c) => c.ultimoLatido !== null && (c.versionApp === null || versionMenor(c.versionApp, minima)));
}

// ── Datos ────────────────────────────────────────────────────────────────────
const COLUMNAS = "producto_id, sucursal_id, disponible, precio_mxn, agotado_manual, agotado_automatico";

function aFila(f: Record<string, unknown>): FilaMenuSucursal {
  return {
    producto_id: String(f.producto_id),
    sucursal_id: String(f.sucursal_id),
    disponible: f.disponible !== false,
    precio_mxn: f.precio_mxn === null || f.precio_mxn === undefined ? null : Number(f.precio_mxn),
    agotado_manual: f.agotado_manual === true,
    agotado_automatico: f.agotado_automatico === true,
  };
}

/** Sucursales activas del negocio, por nombre. Con menos de dos no hay menú por sucursal que mostrar. */
export async function listarSucursalesMenu(): Promise<SucursalMenu[]> {
  const { data, error } = await supabase
    .from("sucursales")
    .select("id, nombre")
    .eq("activa", true)
    .is("deleted_at", null)
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; nombre: string }[]).map((s) => ({ id: s.id, nombre: s.nombre }));
}

export async function leerMenuDeProducto(productoId: string): Promise<FilaMenuSucursal[]> {
  const { data, error } = await supabase.from("productos_sucursal").select(COLUMNAS).eq("producto_id", productoId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(aFila);
}

export async function leerMenuDeSucursal(sucursalId: string): Promise<FilaMenuSucursal[]> {
  const { data, error } = await supabase.from("productos_sucursal").select(COLUMNAS).eq("sucursal_id", sucursalId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(aFila);
}

/** Upsert por (producto, sucursal). No manda agotado_automatico: lo escribe la base y la guardia lo protege. */
export async function guardarMenuSucursal(filas: EdicionMenuSucursal[]): Promise<void> {
  if (filas.length === 0) return;
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  const tenantId = s.tenantId;
  const { error } = await supabase
    .from("productos_sucursal")
    .upsert(filas.map((f) => ({ ...f, tenant_id: tenantId })), { onConflict: "producto_id,sucursal_id" });
  if (error) throw new Error(error.message);
}

/** ¿Algún producto apagado o con otro precio en alguna sucursal? Solo entonces importa una caja vieja. */
export async function hayMenuPorSucursal(): Promise<boolean> {
  const { count, error } = await supabase
    .from("productos_sucursal")
    .select("producto_id", { count: "exact", head: true })
    .or("disponible.eq.false,precio_mxn.not.is.null");
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/** Las cajas a nombrar en el aviso (§7.3 del spec). Vacío si el negocio no usa menú por sucursal. */
export async function cajasQueNoRespetanMenu(): Promise<Caja[]> {
  if (!(await hayMenuPorSucursal())) return [];
  return cajasSinMenuPorSucursal(await listarCajas());
}
