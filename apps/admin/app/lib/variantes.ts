"use client";
import { supabase } from "./supabase";

export type FilaVariante = {
  id?: string;
  valores: Record<string, string>;
  codigo_interno: string;
  codigo_barras: string;
  generar_codigo: boolean;
  precio: string;
  costo: string;
  existencia_inicial: string;
  activa: boolean;
};
export type Eje = { nombre: string; valores: string[] };

export const claveValores = (v: Record<string, string>): string =>
  JSON.stringify(Object.keys(v).sort().map((k) => [k, v[k]!.trim().toLowerCase()]));

export function parsearValoresEje(texto: string): string[] {
  const vistos = new Set<string>();
  return texto.split(",").map((s) => s.trim()).filter((s) => {
    const k = s.toLowerCase();
    if (!s || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

/** El producto cartesiano de los ejes. Lo que ya existía se conserva; lo que ya no cabe se desactiva. */
export function armarMatriz(ejes: Eje[], existentes: FilaVariante[], precioBase: string): FilaVariante[] {
  const combos = ejes.reduce<Record<string, string>[]>(
    (acc, e) => acc.flatMap((c) => e.valores.map((v) => ({ ...c, [e.nombre]: v }))), [{}]);
  const porClave = new Map(existentes.map((f) => [claveValores(f.valores), f]));
  const nuevas = ejes.length === 0 ? [] : combos.map((valores) => {
    const k = claveValores(valores);
    const vieja = porClave.get(k);
    porClave.delete(k);
    return vieja ? { ...vieja, activa: true } : {
      valores, codigo_interno: "", codigo_barras: "", generar_codigo: true,
      precio: precioBase, costo: "", existencia_inicial: "", activa: true,
    };
  });
  const sobran = [...porClave.values()].filter((f) => f.id).map((f) => ({ ...f, activa: false }));
  return [...nuevas, ...sobran];
}

type FilaBase = {
  id: string; variante_valores: Record<string, string>; codigo_interno: string | null; codigo_barras: string | null;
  precio_base_mxn: number; costo_mxn: number | null; deleted_at: string | null;
};

export async function listarVariantes(padreId: string): Promise<FilaVariante[]> {
  const { data, error } = await supabase
    .from("productos")
    .select("id, variante_valores, codigo_interno, codigo_barras, precio_base_mxn, costo_mxn, deleted_at")
    .eq("producto_padre_id", padreId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaBase[]).map((f) => ({
    id: f.id, valores: f.variante_valores, codigo_interno: f.codigo_interno ?? "", codigo_barras: f.codigo_barras ?? "",
    generar_codigo: false, precio: String(f.precio_base_mxn), costo: f.costo_mxn == null ? "" : String(f.costo_mxn),
    existencia_inicial: "", activa: f.deleted_at == null,
  }));
}

export async function guardarVariantes(padreId: string, ejes: string[], filas: FilaVariante[], sucursalId: string | null): Promise<void> {
  const { error } = await supabase.rpc("guardar_variantes", {
    p_padre: padreId,
    p_ejes: ejes,
    p_sucursal: sucursalId,
    // Una fila nueva que se quitó antes de guardar no se manda: crearía una variante ya borrada.
    p_filas: filas.filter((f) => f.id || f.activa).map((f) => ({
      id: f.id ?? null, valores: f.valores, codigo_interno: f.codigo_interno, codigo_barras: f.codigo_barras,
      generar_codigo: f.generar_codigo, precio: f.precio, costo: f.costo, activa: f.activa,
      existencia_inicial: f.id ? null : f.existencia_inicial,
    })),
  });
  if (error) throw new Error(error.message);
}

export async function generarCodigoInterno(): Promise<string> {
  const { data, error } = await supabase.rpc("generar_codigo_interno");
  if (error) throw new Error(error.message);
  return String(data);
}
