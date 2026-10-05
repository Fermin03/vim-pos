"use client";
import { supabase, leerSesion } from "./supabase";
import { listarCajas, type Caja } from "./configuracion";

/**
 * Lo que una sucursal tiene propio dentro de su menú (ADR 0027, migración 0152): el «Agotado hoy»
 * y las cajas que aún no respetan el menú. La captura de precio y de «se vende» vive ahora en
 * `menus.ts` (ADR 0029, migración 0155): ahí el dueño edita el menú, y la base lo proyecta a
 * `productos_sucursal`. Desde 0155 el panel solo escribe `agotado_manual` en esa tabla.
 */

/** Primera versión del escritorio que respeta el menú por sucursal. Una caja anterior vende todo al precio general. */
export const VERSION_MINIMA_MENU_SUCURSAL = "0.4.110";

export type SucursalMenu = { id: string; nombre: string };

export type FilaMenuSucursal = {
  producto_id: string;
  sucursal_id: string;
  disponible: boolean;
  precio_mxn: number | null;
  agotado_manual: boolean;
  agotado_automatico: boolean;
};

export type EstadoEnSucursal = "ACTIVO" | "PAUSADO" | "AGOTADO" | "NO_SE_VENDE";

/** Una fila del formulario de producto. El precio va como texto: es lo que el dueño teclea. */
export type FilaFormMenu = { sucursalId: string; nombre: string; disponible: boolean; precio: string; agotado: boolean; agotadoAuto: boolean };

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

/**
 * El precio tal como lo teclea el dueño. Vacío = null. Un número con hasta
 * dos decimales es el precio. Lo demás no es precio: un «.» suelto (que limpiarPrecio deja en «0.»),
 * «12.» o «1.234» — sin esta regla, Number("0.") guardaba $0.00. Lo usan la lista, los combos y el formulario.
 */
export function precioValido(texto: string): number | null | "invalido" {
  const t = texto.trim();
  if (t === "") return null;
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : "invalido";
}

/** El estado en «todas»: las columnas agotado_* del producto son «agotado en todas» (0152). */
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
 * Cajas de escritorio activas (con latido) que todavía no respetan el menú por sucursal: versión
 * vieja o desconocida (NULL = anterior a 0.4.60, 0105). La caja web no cuenta: toma el código al
 * desplegar. Una caja desactivada tampoco: no vende, y mandar al dueño a actualizarla es ruido.
 */
export function cajasSinMenuPorSucursal<C extends Pick<Caja, "ultimoLatido" | "versionApp" | "activa">>(
  cajas: C[],
  minima: string = VERSION_MINIMA_MENU_SUCURSAL,
): C[] {
  return cajas.filter(
    (c) => c.activa && c.ultimoLatido !== null && (c.versionApp === null || versionMenor(c.versionApp, minima)),
  );
}

/** Qué sucursales mandar: las que ya tenían fila (aunque se des-agoten) y las que se agotan ahora. */
export function agotadosParaGuardar(
  productoId: string,
  filas: { sucursalId: string; agotado: boolean }[],
  existentes: Pick<FilaMenuSucursal, "sucursal_id">[],
): { producto_id: string; sucursal_id: string; agotado_manual: boolean }[] {
  const conFila = new Set(existentes.map((f) => f.sucursal_id));
  return filas
    .filter((f) => conFila.has(f.sucursalId) || f.agotado)
    .map((f) => ({ producto_id: productoId, sucursal_id: f.sucursalId, agotado_manual: f.agotado }));
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

/**
 * Guarda el «Agotado hoy» de un producto en cada sucursal. Es lo único de productos_sucursal que el
 * panel escribe desde 0155: «se vende» y el precio los pone la base a partir del menú de la sucursal
 * (la guardia los ignora si llegan por aquí).
 */
export async function guardarAgotado(filas: { producto_id: string; sucursal_id: string; agotado_manual: boolean }[]): Promise<void> {
  if (filas.length === 0) return;
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  const tenantId = s.tenantId;
  const { error } = await supabase
    .from("productos_sucursal")
    .upsert(filas.map((f) => ({ ...f, tenant_id: tenantId })), { onConflict: "producto_id,sucursal_id" });
  if (error) throw new Error(error.message);
}

/**
 * ¿Algún producto apagado, con otro precio o agotado a mano en alguna sucursal? Solo entonces importa
 * una caja vieja: lee «agotado en todas» del producto, así que tampoco ve el agotado de una sola.
 */
export async function hayMenuPorSucursal(): Promise<boolean> {
  const { count, error } = await supabase
    .from("productos_sucursal")
    .select("producto_id", { count: "exact", head: true })
    .or("disponible.eq.false,precio_mxn.not.is.null,agotado_manual.eq.true");
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/** Las cajas a nombrar en el aviso (§7.3 del spec). Vacío si el negocio no usa menú por sucursal. */
export async function cajasQueNoRespetanMenu(): Promise<Caja[]> {
  if (!(await hayMenuPorSucursal())) return [];
  return cajasSinMenuPorSucursal(await listarCajas());
}
