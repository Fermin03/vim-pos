"use client";
import { employeeClient } from "./supabase";
import { cacheGet, cachePut } from "./outbox";
import type { Producto } from "./catalogo";
import type { ModificadorSel } from "./carrito";

export type ModoPrecioSlot = "DELTA" | "SUMA_PRECIO_PRODUCTO";
export type OpcionSlot = { producto: Producto; delta: number; esDefault: boolean };
export type SlotCombo = { id: string; nombre: string; orden: number; min: number; max: number; modo: ModoPrecioSlot; opciones: OpcionSlot[] };
export type ComboDef = { producto: Producto; slots: SlotCombo[] };
export type ComponenteSel = {
  grupoId: string;
  grupoNombre: string;
  producto: Producto;
  cantidad: number;
  modificadores: ModificadorSel[];
  notaCocina: string | null;
  clientId: string;
};

/** Una fila de combo_grupos con sus combo_opciones, tal como la devuelve PostgREST. */
export type FilaComboGrupo = {
  id: string;
  combo_producto_id: string;
  nombre: string;
  orden_visualizacion: number;
  minimo_selecciones: number;
  maximo_selecciones: number;
  modo_precio: ModoPrecioSlot;
  categoria_id: string | null;
  opciones: { producto_id: string; precio_delta_mxn: number | string; es_default: boolean; activa: boolean; deleted_at: string | null; orden_visualizacion: number }[] | null;
};

const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Resuelve las opciones de cada slot (spec §4.3): por categoría son todos los productos visibles
 * de esa categoría que no sean combos, y una fila explícita solo aporta delta/default o excluye
 * (activa=false); sin categoría, las filas explícitas activas son las opciones.
 */
export function armarCombos(filas: FilaComboGrupo[], productos: Producto[]): ComboDef[] {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const porCombo = new Map<string, SlotCombo[]>();
  for (const f of [...filas].sort((a, b) => a.orden_visualizacion - b.orden_visualizacion)) {
    const combo = porId.get(f.combo_producto_id);
    if (!combo || !combo.esCombo) continue;
    const explicitas = (f.opciones ?? []).filter((o) => o.deleted_at === null);
    let opciones: OpcionSlot[];
    if (f.categoria_id) {
      const excluidos = new Set(explicitas.filter((o) => !o.activa).map((o) => o.producto_id));
      opciones = productos
        .filter((p) => p.categoria_id === f.categoria_id && !p.esCombo && !excluidos.has(p.id))
        .map((p) => {
          const o = explicitas.find((x) => x.producto_id === p.id);
          return { producto: p, delta: Number(o?.precio_delta_mxn ?? 0), esDefault: Boolean(o?.es_default) };
        });
    } else {
      opciones = explicitas
        .filter((o) => o.activa)
        .sort((a, b) => a.orden_visualizacion - b.orden_visualizacion)
        .flatMap((o) => { const p = porId.get(o.producto_id); return p && !p.esCombo ? [{ producto: p, delta: Number(o.precio_delta_mxn), esDefault: o.es_default }] : []; });
    }
    const slot: SlotCombo = { id: f.id, nombre: f.nombre, orden: f.orden_visualizacion, min: f.minimo_selecciones, max: f.maximo_selecciones, modo: f.modo_precio, opciones };
    porCombo.set(combo.id, [...(porCombo.get(combo.id) ?? []), slot]);
  }
  return [...porCombo.entries()].map(([id, slots]) => ({ producto: porId.get(id)!, slots }));
}

export function deltaDe(slot: SlotCombo, productoId: string): number {
  return slot.opciones.find((o) => o.producto.id === productoId)?.delta ?? 0;
}

/** Misma fórmula que la RPC (spec §4.5 paso 4). Sin extras de modificadores. */
export function precioCombo(combo: ComboDef, componentes: ComponenteSel[]): number {
  let total = combo.producto.precio_base_mxn;
  for (const c of componentes) {
    const slot = combo.slots.find((s) => s.id === c.grupoId);
    if (!slot) continue;
    const base = slot.modo === "SUMA_PRECIO_PRODUCTO" ? c.producto.precio_base_mxn : 0;
    total += (base + deltaDe(slot, c.producto.id)) * c.cantidad;
  }
  return r2(total);
}

export function slotValido(slot: SlotCombo, componentes: ComponenteSel[]): boolean {
  const n = componentes.filter((c) => c.grupoId === slot.id).reduce((s, c) => s + c.cantidad, 0);
  return n >= slot.min && n <= slot.max;
}

export function nuevoClientIdComponente(): string {
  return `comp-${crypto.randomUUID()}`;
}

/** El default de cada slot obligatorio, si no está agotado. */
export function componentesPorDefecto(combo: ComboDef): ComponenteSel[] {
  const out: ComponenteSel[] = [];
  for (const s of combo.slots) {
    if (s.min === 0) continue;
    const d = s.opciones.find((o) => o.esDefault && !o.producto.agotado);
    if (d) out.push({ grupoId: s.id, grupoNombre: s.nombre, producto: d.producto, cantidad: 1, modificadores: [], notaCocina: null, clientId: nuevoClientIdComponente() });
  }
  return out;
}

/** Combos cuyo PRIMER slot admite el producto (spec §6.5). */
export function combosQueAdmiten(producto: Producto, combos: ComboDef[]): ComboDef[] {
  return combos.filter((c) => !c.producto.agotado && c.slots[0]?.opciones.some((o) => o.producto.id === producto.id));
}

/** Cuánto cuesta "hacerlo combo" con defaults, y qué trae de más. */
export function diferencialCombo(combo: ComboDef, producto: Producto): { extra: number; resto: string[] } {
  const primero = combo.slots[0]!;
  const defaults = componentesPorDefecto(combo).filter((c) => c.grupoId !== primero.id);
  const conProducto: ComponenteSel = { grupoId: primero.id, grupoNombre: primero.nombre, producto, cantidad: 1, modificadores: [], notaCocina: null, clientId: "" };
  return {
    extra: r2(precioCombo(combo, [conProducto, ...defaults]) - producto.precio_base_mxn),
    resto: defaults.map((d) => d.producto.nombre.toLowerCase()),
  };
}

/** Todos los combos del negocio con sus slots resueltos. Cachea en IndexedDB para el modo sin red. */
export async function listarCombos(token: string, productos: Producto[]): Promise<ComboDef[]> {
  const { data, error } = await employeeClient(token)
    .from("combo_grupos")
    .select("id, combo_producto_id, nombre, orden_visualizacion, minimo_selecciones, maximo_selecciones, modo_precio, categoria_id, opciones:combo_opciones(producto_id, precio_delta_mxn, es_default, activa, deleted_at, orden_visualizacion)")
    .eq("activo", true)
    .is("deleted_at", null)
    .order("orden_visualizacion", { ascending: true });
  if (error) {
    const cacheado = await cacheGet<FilaComboGrupo[]>("combos");
    if (cacheado) return armarCombos(cacheado, productos);
    throw new Error(error.message);
  }
  const filas = (data ?? []) as unknown as FilaComboGrupo[];
  cachePut("combos", filas);
  return armarCombos(filas, productos);
}
