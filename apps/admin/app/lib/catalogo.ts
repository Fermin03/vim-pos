"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";

// Paleta funcional de categorías (del design system; NUNCA el naranja de marca).
export const COLORES: { hex: string; bg: string }[] = [
  { hex: "#2C5AA0", bg: "#E6ECF5" }, // azul
  { hex: "#2E7D52", bg: "#E7F1EC" }, // verde
  { hex: "#1F7A82", bg: "#E2F0F1" }, // teal
  { hex: "#6B4FA0", bg: "#EDE8F5" }, // violeta
  { hex: "#B5701A", bg: "#F6EEDD" }, // ámbar
  { hex: "#9A3050", bg: "#F4E5EA" }, // vino
];

export function bgDe(hex: string | null): string {
  return COLORES.find((c) => c.hex === hex)?.bg ?? "#F6F6F4";
}

// Íconos disponibles (nombre → path SVG, viewBox 24). Subset curado para QSR.
export const ICONOS: Record<string, string> = {
  star: "M12 2l2.9 6.3 6.6.7-4.9 4.5 1.4 6.5L12 17.3 5.9 20.5 7.3 14 2.4 9.5l6.6-.7z",
  burger: "M4 11h16M4 11a8 8 0 0 1 16 0M5 15h14a2 2 0 0 1 0 4H5a2 2 0 0 1 0-4z",
  fries: "M6 9l1.5 11h9L18 9M6 9h12M9 9V4M12 9V3M15 9V5",
  cup: "M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8zM8 8V5a4 4 0 0 1 8 0v3",
  cake: "M4 21h16M5 21v-7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v7M12 8V4M9 6h6",
  tag: "M3 7v5l9 9 5-5-9-9H3zM7 7h.01",
};
export const ICONO_DEFAULT = "tag";

export const categoriaSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(40, "Máximo 40 caracteres"),
  descripcion: z.string().trim().max(80, "Máximo 80 caracteres").optional().or(z.literal("")),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color inválido").nullable().optional(),
  icono: z.string().max(50).nullable().optional(),
  activa: z.boolean(),
});
export type CategoriaInput = z.infer<typeof categoriaSchema>;

export type Categoria = {
  id: string;
  nombre: string;
  descripcion: string | null;
  color_hex: string | null;
  icono: string | null;
  orden_visualizacion: number;
  activa: boolean;
  nProductos: number;
};

type Fila = Omit<Categoria, "nProductos"> & { productos: { count: number }[] | null };

export async function listarCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nombre, descripcion, color_hex, icono, orden_visualizacion, activa, productos(count)")
    .is("deleted_at", null)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Fila[]).map((f) => ({
    id: f.id,
    nombre: f.nombre,
    descripcion: f.descripcion,
    color_hex: f.color_hex,
    icono: f.icono,
    orden_visualizacion: f.orden_visualizacion,
    activa: f.activa,
    nProductos: f.productos?.[0]?.count ?? 0,
  }));
}

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

export async function crearCategoria(input: CategoriaInput): Promise<void> {
  const datos = categoriaSchema.parse(input);
  const tid = await tenantId();
  // orden = siguiente disponible
  const { data: maxRow } = await supabase
    .from("categorias")
    .select("orden_visualizacion")
    .is("deleted_at", null)
    .order("orden_visualizacion", { ascending: false })
    .limit(1)
    .maybeSingle();
  const orden = (maxRow?.orden_visualizacion ?? 0) + 1;

  const { error } = await supabase.from("categorias").insert({
    tenant_id: tid,
    nombre: datos.nombre,
    descripcion: datos.descripcion || null,
    color_hex: datos.color_hex ?? null,
    icono: datos.icono ?? null,
    activa: datos.activa,
    orden_visualizacion: orden,
  });
  if (error) throw new Error(error.message);
}

export async function actualizarCategoria(id: string, input: CategoriaInput): Promise<void> {
  const datos = categoriaSchema.parse(input);
  const { error } = await supabase
    .from("categorias")
    .update({
      nombre: datos.nombre,
      descripcion: datos.descripcion || null,
      color_hex: datos.color_hex ?? null,
      icono: datos.icono ?? null,
      activa: datos.activa,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function toggleActiva(id: string, activa: boolean): Promise<void> {
  const { error } = await supabase.from("categorias").update({ activa }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Soft delete (set deleted_at). El POS y la lista filtran deleted_at IS NULL. */
export async function eliminarCategoria(id: string): Promise<void> {
  const { error } = await supabase
    .from("categorias")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Categorías (versión simple para selects) ─────────────────────────────────
export type CategoriaOpcion = { id: string; nombre: string };
export async function listarCategoriasOpciones(): Promise<CategoriaOpcion[]> {
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nombre")
    .is("deleted_at", null)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CategoriaOpcion[];
}

// ── Productos ────────────────────────────────────────────────────────────────
export const productoSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(200, "Máximo 200 caracteres"),
  categoria_id: z.string().uuid("Elige una categoría"),
  precio_base_mxn: z.number({ invalid_type_error: "Precio inválido" }).min(0, "El precio no puede ser negativo"),
  descripcion: z.string().trim().max(500).optional().or(z.literal("")),
  codigo_interno: z.string().trim().max(50).optional().or(z.literal("")),
  estado: z.enum(["ACTIVO", "PAUSADO"]),
  agotado: z.boolean(),
  visible_en_pos: z.boolean(),
});
export type ProductoInput = z.infer<typeof productoSchema>;

export type EstadoProducto = "ACTIVO" | "PAUSADO" | "AGOTADO";
export type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  codigo_interno: string | null;
  precio_base_mxn: number;
  categoria_id: string;
  categoriaNombre: string;
  estado: EstadoProducto;
  agotado_manual: boolean;
  visible_en_pos: boolean;
};

type FilaProd = Omit<Producto, "categoriaNombre"> & { categoria: { nombre: string } | null };

export async function listarProductos(): Promise<Producto[]> {
  const { data, error } = await supabase
    .from("productos")
    .select(
      "id, nombre, descripcion, codigo_interno, precio_base_mxn, categoria_id, estado, agotado_manual, visible_en_pos, categoria:categorias(nombre)",
    )
    .is("deleted_at", null)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaProd[]).map((f) => ({
    id: f.id,
    nombre: f.nombre,
    descripcion: f.descripcion,
    codigo_interno: f.codigo_interno,
    precio_base_mxn: Number(f.precio_base_mxn),
    categoria_id: f.categoria_id,
    categoriaNombre: f.categoria?.nombre ?? "—",
    estado: f.estado,
    agotado_manual: f.agotado_manual,
    visible_en_pos: f.visible_en_pos,
  }));
}

export async function obtenerProducto(id: string): Promise<Producto | null> {
  const { data, error } = await supabase
    .from("productos")
    .select(
      "id, nombre, descripcion, codigo_interno, precio_base_mxn, categoria_id, estado, agotado_manual, visible_en_pos, categoria:categorias(nombre)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const f = data as unknown as FilaProd;
  return {
    id: f.id,
    nombre: f.nombre,
    descripcion: f.descripcion,
    codigo_interno: f.codigo_interno,
    precio_base_mxn: Number(f.precio_base_mxn),
    categoria_id: f.categoria_id,
    categoriaNombre: f.categoria?.nombre ?? "—",
    estado: f.estado,
    agotado_manual: f.agotado_manual,
    visible_en_pos: f.visible_en_pos,
  };
}

// Resuelve estado final + agotado_manual respetando el CHECK estado_consistente.
function resolverEstado(input: ProductoInput): { estado: EstadoProducto; agotado_manual: boolean } {
  if (input.agotado) return { estado: "AGOTADO", agotado_manual: true };
  return { estado: input.estado, agotado_manual: false };
}

export async function crearProducto(input: ProductoInput): Promise<void> {
  const datos = productoSchema.parse(input);
  const tid = await tenantId();
  const { estado, agotado_manual } = resolverEstado(datos);
  const { data: maxRow } = await supabase
    .from("productos")
    .select("orden_visualizacion")
    .is("deleted_at", null)
    .order("orden_visualizacion", { ascending: false })
    .limit(1)
    .maybeSingle();
  const orden = (maxRow?.orden_visualizacion ?? 0) + 1;
  const { error } = await supabase.from("productos").insert({
    tenant_id: tid,
    nombre: datos.nombre,
    categoria_id: datos.categoria_id,
    precio_base_mxn: datos.precio_base_mxn,
    descripcion: datos.descripcion || null,
    codigo_interno: datos.codigo_interno || null,
    estado,
    agotado_manual,
    visible_en_pos: datos.visible_en_pos,
    orden_visualizacion: orden,
  });
  if (error) throw new Error(error.message);
}

export async function actualizarProducto(id: string, input: ProductoInput): Promise<void> {
  const datos = productoSchema.parse(input);
  const { estado, agotado_manual } = resolverEstado(datos);
  const { error } = await supabase
    .from("productos")
    .update({
      nombre: datos.nombre,
      categoria_id: datos.categoria_id,
      precio_base_mxn: datos.precio_base_mxn,
      descripcion: datos.descripcion || null,
      codigo_interno: datos.codigo_interno || null,
      estado,
      agotado_manual,
      visible_en_pos: datos.visible_en_pos,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function eliminarProducto(id: string): Promise<void> {
  const { error } = await supabase
    .from("productos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export function precioMxn(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
