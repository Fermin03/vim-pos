"use client";
import { employeeClient } from "./supabase";
import { aplicarSucursal, type FilaProductoSucursal } from "./catalogo-sucursal";

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
  esCombo: boolean;
  /**
   * false = esta sucursal no lo vende (productos_sucursal, 0152). Se carga igual —la reapertura de
   * cuentas lo necesita— pero no se pinta. `precio_base_mxn` y `agotado` ya son los de la sucursal.
   */
  seVendeAqui: boolean;
  // Giro RETAIL (opcionales: el cache de Dexie guarda formas anteriores).
  producto_padre_id?: string | null;
  variante_ejes?: string[] | null;
  variante_valores?: Record<string, string> | null;
  controla_existencias?: boolean;
  codigo_barras?: string | null;
  codigo_interno?: string | null;
  imagen_url?: string | null;
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

/**
 * Productos visibles en POS (ACTIVO/AGOTADO, no PAUSADO; visible_en_pos=true), ya ajustados a la
 * sucursal de la caja (ADR 0027): su precio, su agotado y si se vende aquí. RLS por tenant.
 */
export async function listarProductosPos(token: string, sucursalId: string): Promise<Producto[]> {
  const sb = employeeClient(token);
  const [{ data, error }, { data: filas, error: errorFilas }] = await Promise.all([
    sb
      .from("productos")
      .select("id, nombre, descripcion, precio_base_mxn, categoria_id, estado, visible_en_pos, es_combo, producto_padre_id, variante_ejes, variante_valores, controla_existencias, codigo_barras, codigo_interno, imagen_url")
      .is("deleted_at", null)
      .eq("visible_en_pos", true)
      .in("estado", ["ACTIVO", "AGOTADO"])
      .order("orden_visualizacion", { ascending: true })
      .order("created_at", { ascending: true }), // hijas: el orden en que el admin las guardó
    sb
      .from("productos_sucursal")
      .select("producto_id, disponible, precio_mxn, agotado_manual, agotado_automatico")
      .eq("sucursal_id", sucursalId),
  ]);
  if (error) throw new Error(error.message);
  if (errorFilas) throw new Error(errorFilas.message);
  const base = (data ?? []).map((row): Producto => {
    const p = row as Record<string, unknown>;
    return {
      id: String(p.id),
      nombre: String(p.nombre),
      descripcion: (p.descripcion as string) ?? null,
      precio_base_mxn: Number(p.precio_base_mxn),
      categoria_id: String(p.categoria_id),
      // Las columnas agotado_* del producto ahora son «agotado en todas» (0152): el agotado de esta
      // sucursal sale de su fila. Aquí solo cuenta un estado AGOTADO heredado de antes de 0152.
      agotado: p.estado === "AGOTADO",
      esCombo: Boolean(p.es_combo),
      seVendeAqui: true,
      producto_padre_id: (p.producto_padre_id as string) ?? null,
      variante_ejes: (p.variante_ejes as string[]) ?? null,
      variante_valores: (p.variante_valores as Record<string, string>) ?? null,
      controla_existencias: Boolean(p.controla_existencias),
      codigo_barras: (p.codigo_barras as string) ?? null,
      codigo_interno: (p.codigo_interno as string) ?? null,
      imagen_url: (p.imagen_url as string) ?? null,
    };
  });
  return aplicarSucursal(base, (filas ?? []) as FilaProductoSucursal[]);
}

/** "¿Lo hacemos combo?" por negocio. Sin fila o sin red se asume encendido: es el default de la columna. */
export async function leerComboUpsellActivo(token: string): Promise<boolean> {
  const { data, error } = await employeeClient(token).from("configuracion_tenant").select("combo_upsell_activo").maybeSingle();
  if (error || !data) return true;
  return (data as { combo_upsell_activo: boolean | null }).combo_upsell_activo !== false;
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
