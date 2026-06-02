"use client";
import { employeeClient } from "./supabase";

export type Categoria = {
  id: string;
  nombre: string;
  color_hex: string | null;
  icono: string | null;
  orden: number;
};

export type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_base_mxn: number;
  categoria_id: string;
  agotado: boolean;
};

/** Lista de categorías activas del tenant, ordenadas. RLS por tenant. */
export async function listarCategoriasPos(token: string): Promise<Categoria[]> {
  const { data, error } = await employeeClient(token)
    .from("categorias")
    .select("id, nombre, color_hex, icono, orden_visualizacion")
    .is("deleted_at", null)
    .eq("activa", true)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((c: { id: string; nombre: string; color_hex: string | null; icono: string | null; orden_visualizacion: number }) => ({
    id: c.id,
    nombre: c.nombre,
    color_hex: c.color_hex,
    icono: c.icono,
    orden: c.orden_visualizacion,
  }));
}

/** Productos visibles en POS (ACTIVO/AGOTADO, no PAUSADO; visible_en_pos=true). */
export async function listarProductosPos(token: string): Promise<Producto[]> {
  const { data, error } = await employeeClient(token)
    .from("productos")
    .select("id, nombre, descripcion, precio_base_mxn, categoria_id, estado, agotado_manual, agotado_automatico, visible_en_pos")
    .is("deleted_at", null)
    .eq("visible_en_pos", true)
    .in("estado", ["ACTIVO", "AGOTADO"])
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((p: { id: string; nombre: string; descripcion: string | null; precio_base_mxn: string | number; categoria_id: string; estado: string; agotado_manual: boolean; agotado_automatico: boolean }) => ({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio_base_mxn: Number(p.precio_base_mxn),
    categoria_id: p.categoria_id,
    agotado: p.estado === "AGOTADO" || p.agotado_manual || p.agotado_automatico,
  }));
}

// Paleta de fallback si la categoría no tiene color asignado
const PALETA_FALLBACK: Record<string, { bg: string; ink: string }> = {
  blue: { bg: "#E6ECF5", ink: "#2C5AA0" },
  green: { bg: "#E7F1EC", ink: "#2E7D52" },
  teal: { bg: "#E2F0F1", ink: "#1F7A82" },
  violet: { bg: "#EDE8F5", ink: "#6B4FA0" },
  amber: { bg: "#F6EEDD", ink: "#B5701A" },
  wine: { bg: "#F4E5EA", ink: "#9A3050" },
};
const ORDEN_FALLBACK = Object.keys(PALETA_FALLBACK);

export function colorCategoria(cat: Categoria, idx: number): { bg: string; ink: string } {
  if (cat.color_hex) {
    // Mezcla suave: fondo claro + texto = color
    return { bg: `${cat.color_hex}1A`, ink: cat.color_hex };
  }
  const k = ORDEN_FALLBACK[idx % ORDEN_FALLBACK.length]!;
  return PALETA_FALLBACK[k]!;
}

export const ICONOS_POS: Record<string, string> = {
  star: "M12 2l2.9 6.3 6.6.7-4.9 4.5 1.4 6.5L12 17.3 5.9 20.5 7.3 14 2.4 9.5l6.6-.7z",
  burger: "M4 11h16M4 11a8 8 0 0 1 16 0M5 15h14a2 2 0 0 1 0 4H5a2 2 0 0 1 0-4z",
  fries: "M6 9l1.5 11h9L18 9M6 9h12M9 9V4M12 9V3M15 9V5",
  cup: "M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8zM8 8V5a4 4 0 0 1 8 0v3",
  cake: "M4 21h16M5 21v-7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v7M12 8V4M9 6h6",
  tag: "M3 7v5l9 9 5-5-9-9H3zM7 7h.01",
};
