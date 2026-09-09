"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";

export const MODO_PRECIO = {
  DELTA: "Solo el delta de la opción",
  SUMA_PRECIO_PRODUCTO: "Se suma el precio del producto elegido",
} as const;
export type ModoPrecio = keyof typeof MODO_PRECIO;

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}
const r2 = (n: number): number => Math.round(n * 100) / 100;

// ── Combos (productos con es_combo) ──────────────────────────────────────────
export const comboSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  categoria_id: z.string().uuid("Elige una categoría"),
  precio_base_mxn: z.number({ invalid_type_error: "Precio inválido" }).min(0, "El precio no puede ser negativo"),
  descripcion: z.string().trim().max(500).optional().or(z.literal("")),
  clave_sat: z.string().trim().regex(/^\d{8}$/, "La clave del SAT son 8 dígitos").optional().or(z.literal("")),
  tasa_iva: z.number().min(0).max(100),
  iva_incluido_en_precio: z.boolean(),
  visible_en_pos: z.boolean(),
  estado: z.enum(["ACTIVO", "PAUSADO"]),
});
export type ComboInput = z.infer<typeof comboSchema>;
/** Clave sugerida al crear: comida rápida (spec §5). */
export const CLAVE_SAT_COMBO = "90101503";

export type ComboResumen = { id: string; nombre: string; categoriaNombre: string; precio_base_mxn: number; estado: string; nSlots: number };

export async function listarCombos(): Promise<ComboResumen[]> {
  const { data, error } = await supabase
    .from("productos")
    .select("id, nombre, precio_base_mxn, estado, categoria:categorias(nombre), slots:combo_grupos(count)")
    .eq("es_combo", true)
    .is("deleted_at", null)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((f) => ({
    id: String(f.id),
    nombre: String(f.nombre),
    categoriaNombre: ((f.categoria as { nombre?: string } | null)?.nombre) ?? "—",
    precio_base_mxn: Number(f.precio_base_mxn),
    estado: String(f.estado),
    nSlots: ((f.slots as { count: number }[] | null)?.[0]?.count) ?? 0,
  }));
}

export async function crearCombo(input: ComboInput): Promise<string> {
  const d = comboSchema.parse(input);
  const tid = await tenantId();
  const { data: maxRow } = await supabase.from("productos").select("orden_visualizacion").is("deleted_at", null).order("orden_visualizacion", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from("productos").insert({
    tenant_id: tid, es_combo: true, nombre: d.nombre, categoria_id: d.categoria_id, precio_base_mxn: d.precio_base_mxn,
    descripcion: d.descripcion || null, clave_sat: d.clave_sat || null, tasa_iva: d.tasa_iva, iva_incluido_en_precio: d.iva_incluido_en_precio,
    visible_en_pos: d.visible_en_pos, estado: d.estado, orden_visualizacion: (maxRow?.orden_visualizacion ?? 0) + 1,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

// ── Slots ────────────────────────────────────────────────────────────────────
export const slotSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  minimo_selecciones: z.number().int().min(0),
  maximo_selecciones: z.number().int().min(1),
  modo_precio: z.enum(["DELTA", "SUMA_PRECIO_PRODUCTO"]),
  categoria_id: z.string().uuid().nullable(),
  activo: z.boolean(),
}).refine((d) => d.maximo_selecciones >= d.minimo_selecciones, { message: "El máximo debe ser ≥ el mínimo", path: ["maximo_selecciones"] });
export type SlotInput = z.infer<typeof slotSchema>;
export type Slot = SlotInput & { id: string; orden_visualizacion: number };

export async function listarSlots(comboId: string): Promise<Slot[]> {
  const { data, error } = await supabase
    .from("combo_grupos")
    .select("id, nombre, orden_visualizacion, minimo_selecciones, maximo_selecciones, modo_precio, categoria_id, activo")
    .eq("combo_producto_id", comboId)
    .is("deleted_at", null)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Slot[];
}

export async function crearSlot(comboId: string, input: SlotInput): Promise<string> {
  const d = slotSchema.parse(input);
  const tid = await tenantId();
  const actuales = await listarSlots(comboId);
  const { data, error } = await supabase.from("combo_grupos")
    .insert({ tenant_id: tid, combo_producto_id: comboId, ...d, orden_visualizacion: actuales.length + 1 })
    .select("id").single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function actualizarSlot(id: string, input: SlotInput): Promise<void> {
  const d = slotSchema.parse(input);
  const { error } = await supabase.from("combo_grupos").update(d).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function reordenarSlots(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase.from("combo_grupos").update({ orden_visualizacion: i + 1 }).eq("id", ids[i]);
    if (error) throw new Error(error.message);
  }
}

export async function eliminarSlot(id: string): Promise<void> {
  const { error } = await supabase.from("combo_grupos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Opciones ─────────────────────────────────────────────────────────────────
export const opcionSchema = z.object({
  precio_delta_mxn: z.number({ invalid_type_error: "Delta inválido" }),
  es_default: z.boolean(),
  activa: z.boolean(),
});
export type OpcionInput = z.infer<typeof opcionSchema>;
export type Opcion = OpcionInput & { id: string; producto_id: string; nombre: string; precio: number; orden_visualizacion: number };

export async function listarOpciones(slotId: string): Promise<Opcion[]> {
  const { data, error } = await supabase
    .from("combo_opciones")
    .select("id, producto_id, precio_delta_mxn, es_default, activa, orden_visualizacion, producto:productos(nombre, precio_base_mxn)")
    .eq("grupo_id", slotId)
    .is("deleted_at", null)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((f) => ({
    id: String(f.id), producto_id: String(f.producto_id), precio_delta_mxn: Number(f.precio_delta_mxn), es_default: Boolean(f.es_default),
    activa: Boolean(f.activa), orden_visualizacion: Number(f.orden_visualizacion),
    nombre: ((f.producto as { nombre?: string } | null)?.nombre) ?? "—", precio: Number((f.producto as { precio_base_mxn?: number } | null)?.precio_base_mxn ?? 0),
  }));
}

/** Crea o actualiza la fila (grupo, producto). Solo una default por slot (índice único parcial). */
export async function guardarOpcion(slotId: string, productoId: string, input: OpcionInput): Promise<void> {
  const d = opcionSchema.parse(input);
  const tid = await tenantId();
  if (d.es_default) await supabase.from("combo_opciones").update({ es_default: false }).eq("grupo_id", slotId).eq("es_default", true).neq("producto_id", productoId);
  const { error } = await supabase.from("combo_opciones").upsert(
    { tenant_id: tid, grupo_id: slotId, producto_id: productoId, ...d, deleted_at: null },
    { onConflict: "grupo_id,producto_id" },
  );
  if (error) throw new Error(error.message);
}

export async function eliminarOpcion(id: string): Promise<void> {
  const { error } = await supabase.from("combo_opciones").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Precio (misma fórmula que apps/pos/app/lib/combos.ts: prueba de paridad) ─
export type SlotConOpciones = {
  id: string; nombre: string; modo_precio: ModoPrecio; minimo_selecciones: number; maximo_selecciones: number; categoria_id: string | null;
  opciones: { producto_id: string; nombre: string; precio: number; delta: number; es_default: boolean }[];
};

/** `eleccion` = producto elegido por slot (una selección por slot; la vista previa no cubre max > 1). */
export function precioCombo(base: number, slots: SlotConOpciones[], eleccion: Record<string, string>): number {
  let total = base;
  for (const s of slots) {
    const o = s.opciones.find((x) => x.producto_id === eleccion[s.id]);
    if (!o) continue;
    total += (s.modo_precio === "SUMA_PRECIO_PRODUCTO" ? o.precio : 0) + o.delta;
  }
  return r2(total);
}

export function vistaPrevia(base: number, slots: SlotConOpciones[]): { principales: { nombre: string; precio: number }[]; deltas: { slot: string; nombre: string; delta: number }[] } {
  const [primero, ...resto] = slots;
  // Con noUncheckedIndexedAccess la desestructuración tipa `primero` como posiblemente undefined
  // aunque slots.length === 0 ya cubra el caso vacío en runtime; este guard es para TS, no lógica nueva.
  if (!primero) return { principales: [], deltas: [] };
  const defaults: Record<string, string> = {};
  for (const s of resto) { const d = s.opciones.find((o) => o.es_default) ?? s.opciones[0]; if (d && s.minimo_selecciones > 0) defaults[s.id] = d.producto_id; }
  return {
    principales: primero.opciones.map((o) => ({ nombre: o.nombre, precio: precioCombo(base, slots, { ...defaults, [primero.id]: o.producto_id }) })),
    deltas: resto.flatMap((s) => s.opciones.filter((o) => o.delta !== 0).map((o) => ({ slot: s.nombre, nombre: o.nombre, delta: o.delta }))),
  };
}

/** Resuelve las opciones de un slot como las verá la caja: por categoría o explícitas. */
export async function slotsConOpciones(comboId: string): Promise<SlotConOpciones[]> {
  const slots = await listarSlots(comboId);
  const { data: prods, error } = await supabase.from("productos").select("id, nombre, precio_base_mxn, categoria_id, es_combo, visible_en_pos").is("deleted_at", null).eq("estado", "ACTIVO");
  if (error) throw new Error(error.message);
  const productos = (prods ?? []) as unknown as { id: string; nombre: string; precio_base_mxn: number; categoria_id: string; es_combo: boolean; visible_en_pos: boolean }[];
  const out: SlotConOpciones[] = [];
  for (const s of slots) {
    const explicitas = await listarOpciones(s.id);
    let opciones: SlotConOpciones["opciones"];
    if (s.categoria_id) {
      const excluidos = new Set(explicitas.filter((o) => !o.activa).map((o) => o.producto_id));
      opciones = productos.filter((p) => p.categoria_id === s.categoria_id && !p.es_combo && p.visible_en_pos && !excluidos.has(p.id)).map((p) => {
        const o = explicitas.find((x) => x.producto_id === p.id);
        return { producto_id: p.id, nombre: p.nombre, precio: Number(p.precio_base_mxn), delta: o?.precio_delta_mxn ?? 0, es_default: Boolean(o?.es_default) };
      });
    } else {
      opciones = explicitas.filter((o) => o.activa).map((o) => ({ producto_id: o.producto_id, nombre: o.nombre, precio: o.precio, delta: o.precio_delta_mxn, es_default: o.es_default }));
    }
    out.push({ id: s.id, nombre: s.nombre, modo_precio: s.modo_precio, minimo_selecciones: s.minimo_selecciones, maximo_selecciones: s.maximo_selecciones, categoria_id: s.categoria_id, opciones });
  }
  return out;
}
