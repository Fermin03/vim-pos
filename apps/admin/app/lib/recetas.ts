"use client";
import { supabase, leerSesion } from "./supabase";

// Recetas con costeo (ADR 0012, spec 2026-09-03 §4.3 y §6). La cantidad operativa de un
// componente va SIEMPRE en la unidad del insumo; aquí se convierte lo que el cocinero captura.

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}
const num = (v: unknown) => Number(v ?? 0);
const S = (v: unknown) => (v == null ? "" : String(v));
const redondear = (n: number, dec: number) => Math.round(n * 10 ** dec) / 10 ** dec;

export type UnidadDetalle = { id: string; codigo: string; nombre: string; simbolo: string; dimension: string };
export type Conversion = { origenId: string; destinoId: string; factor: number };

/** Conversiones del sistema por código; las unidades se siembran por tenant (0035) así que el id cambia pero el código no. */
const SISTEMA: Record<string, number> = {
  "KG>G": 1000,
  "L>ML": 1000,
  "OZ>G": 28.3495,
  "KG>OZ": 35.274,
};

function factorEntre(origen: UnidadDetalle, destino: UnidadDetalle, conversiones: Conversion[]): number | null {
  const directa = conversiones.find((c) => c.origenId === origen.id && c.destinoId === destino.id);
  if (directa) return directa.factor;
  const inversa = conversiones.find((c) => c.origenId === destino.id && c.destinoId === origen.id);
  if (inversa) return 1 / inversa.factor;
  const sd = SISTEMA[`${origen.codigo}>${destino.codigo}`];
  if (sd) return sd;
  const si = SISTEMA[`${destino.codigo}>${origen.codigo}`];
  if (si) return 1 / si;
  return null;
}

/** Convierte `cantidad` de `origen` a `destino`. Lanza con instrucción si no hay cómo. Resultado a 3 decimales. */
export function convertirCantidad(cantidad: number, origen: UnidadDetalle, destino: UnidadDetalle, conversiones: Conversion[]): number {
  if (origen.id === destino.id) return cantidad;
  const factor = origen.dimension === destino.dimension ? factorEntre(origen, destino, conversiones) : null;
  if (factor == null) {
    throw new Error(`No hay conversión de ${origen.simbolo} a ${destino.simbolo}; captura la cantidad en ${destino.simbolo}`);
  }
  return redondear(cantidad * factor, 3);
}

export function costoReceta(componentes: { cantidad: number; costoUnitario: number }[]): number {
  return redondear(componentes.reduce((a, c) => a + c.cantidad * c.costoUnitario, 0), 4);
}

export function margen(precioSinIvaMxn: number, costo: number): { pesos: number; porcentaje: number | null } {
  const pesos = redondear(precioSinIvaMxn - costo, 2);
  return { pesos, porcentaje: precioSinIvaMxn > 0 ? redondear(pesos / precioSinIvaMxn, 4) : null };
}

/** `tasaIvaPorcentaje` es la tasa tal como se guarda en `productos.tasa_iva` (16 = 16 %, no 0.16). */
export function precioSinIva(precioConIva: number, tasaIvaPorcentaje: number, ivaIncluido: boolean): number {
  return ivaIncluido ? redondear(precioConIva / (1 + tasaIvaPorcentaje / 100), 2) : precioConIva;
}

// ---------------------------------------------------------------- datos

export async function listarUnidadesDetalle(): Promise<UnidadDetalle[]> {
  const { data, error } = await supabase
    .from("unidades_medida")
    .select("id, codigo, nombre, simbolo, dimension")
    .eq("activa", true)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((u) => ({
    id: S(u.id), codigo: S(u.codigo), nombre: S(u.nombre), simbolo: S(u.simbolo), dimension: S(u.dimension),
  }));
}

export async function listarConversiones(): Promise<Conversion[]> {
  const { data, error } = await supabase.from("conversiones_unidades").select("unidad_origen_id, unidad_destino_id, factor");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
    origenId: S(c.unidad_origen_id), destinoId: S(c.unidad_destino_id), factor: num(c.factor),
  }));
}

export type InsumoOpcion = { id: string; nombre: string; categoria: string; unidadId: string; costoUnitario: number };
export async function listarInsumosOpciones(): Promise<InsumoOpcion[]> {
  const { data, error } = await supabase
    .from("insumos")
    .select("id, nombre, categoria, unidad_medida_id, costo_unitario_mxn")
    .is("deleted_at", null)
    .eq("estado", "ACTIVO")
    .order("nombre");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((i) => ({
    id: S(i.id), nombre: S(i.nombre), categoria: S(i.categoria), unidadId: S(i.unidad_medida_id), costoUnitario: num(i.costo_unitario_mxn),
  }));
}

export type RecetaResumen = {
  productoId: string; nombre: string; categoriaNombre: string;
  precioSinIva: number; costo: number | null; activa: boolean | null;
};

/** Productos activos con su receta (si la tienen). `costo`/`activa` null = sin receta. */
export async function listarRecetasResumen(): Promise<RecetaResumen[]> {
  const { data, error } = await supabase
    .from("productos")
    .select("id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio, categoria:categorias!categoria_id(nombre), receta:recetas(costo_total_mxn, activa)")
    .is("deleted_at", null)
    .order("nombre");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((p) => {
    const r = p.receta as Record<string, unknown> | Record<string, unknown>[] | null;
    const receta = Array.isArray(r) ? r[0] ?? null : r;
    return {
      productoId: S(p.id),
      nombre: S(p.nombre),
      categoriaNombre: ((p.categoria as { nombre?: string } | null)?.nombre) ?? "",
      precioSinIva: precioSinIva(num(p.precio_base_mxn), num(p.tasa_iva ?? 16), p.iva_incluido_en_precio !== false),
      costo: receta ? num(receta.costo_total_mxn) : null,
      activa: receta ? Boolean(receta.activa) : null,
    };
  });
}

export type ComponenteReceta = {
  insumoId: string; cantidad: number; cantidadCapturada: number | null; unidadCapturadaId: string | null;
  esCritico: boolean; notas: string | null; orden: number;
};
export type Receta = { id: string | null; productoId: string; activa: boolean; notas: string | null; costo: number; componentes: ComponenteReceta[] };

export async function obtenerReceta(productoId: string): Promise<Receta> {
  const { data, error } = await supabase
    .from("recetas")
    .select("id, activa, notas_preparacion, costo_total_mxn, componentes:receta_componentes(insumo_id, cantidad, cantidad_capturada, unidad_capturada_id, es_critico, notas, orden_visualizacion)")
    .eq("producto_id", productoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { id: null, productoId, activa: true, notas: null, costo: 0, componentes: [] };
  const r = data as unknown as Record<string, unknown>;
  const comps = ((r.componentes as Record<string, unknown>[] | null) ?? [])
    .map((c) => ({
      insumoId: S(c.insumo_id), cantidad: num(c.cantidad),
      cantidadCapturada: c.cantidad_capturada == null ? null : num(c.cantidad_capturada),
      unidadCapturadaId: c.unidad_capturada_id == null ? null : S(c.unidad_capturada_id),
      esCritico: c.es_critico !== false, notas: c.notas == null ? null : S(c.notas), orden: num(c.orden_visualizacion),
    }))
    .sort((a, b) => a.orden - b.orden);
  return { id: S(r.id), productoId, activa: r.activa !== false, notas: r.notas_preparacion == null ? null : S(r.notas_preparacion), costo: num(r.costo_total_mxn), componentes: comps };
}

export async function guardarReceta(input: { productoId: string; activa: boolean; notas: string | null; componentes: ComponenteReceta[] }): Promise<string> {
  await tenantId();
  const { data, error } = await supabase.rpc("guardar_receta", {
    p_producto_id: input.productoId,
    p_activa: input.activa,
    p_notas: input.notas,
    p_componentes: input.componentes.map((c, i) => ({
      insumo_id: c.insumoId, cantidad: c.cantidad, cantidad_capturada: c.cantidadCapturada,
      unidad_capturada_id: c.unidadCapturadaId, es_critico: c.esCritico, notas: c.notas, orden: i,
    })),
  });
  if (error) throw new Error(error.message);
  return String(data);
}
