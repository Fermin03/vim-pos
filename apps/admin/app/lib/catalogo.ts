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
