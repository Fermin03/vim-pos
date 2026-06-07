"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";

// Tier1 — Inventario. Tablas insumos / insumo_stock_sucursal / movimientos_inventario (RLS *_tenant).
// Las unidades_medida se siembran server-side (migración 0035). El stock por sucursal lo mantiene
// el trigger del RPC aplicar_movimiento_inventario.

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

async function usuarioActualId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

const num = (v: unknown) => Number(v ?? 0);
const S = (v: unknown) => (v == null ? "" : String(v));

export type Unidad = { id: string; nombre: string; simbolo: string };
export async function listarUnidades(): Promise<Unidad[]> {
  const { data, error } = await supabase
    .from("unidades_medida")
    .select("id, nombre, simbolo")
    .eq("activa", true)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((u) => ({ id: String(u.id), nombre: S(u.nombre), simbolo: S(u.simbolo) }));
}

export const CATEGORIAS_INSUMO = [
  "CARNICOS", "LACTEOS", "VEGETALES", "FRUTAS", "PANIFICACION", "ABARROTES",
  "BEBIDAS", "CONDIMENTOS", "CONGELADOS", "EMPAQUE", "LIMPIEZA", "OTROS",
] as const;
export type CategoriaInsumo = (typeof CATEGORIAS_INSUMO)[number];
export const LABEL_CATEGORIA: Record<CategoriaInsumo, string> = {
  CARNICOS: "Cárnicos", LACTEOS: "Lácteos", VEGETALES: "Vegetales", FRUTAS: "Frutas",
  PANIFICACION: "Panificación", ABARROTES: "Abarrotes", BEBIDAS: "Bebidas", CONDIMENTOS: "Condimentos",
  CONGELADOS: "Congelados", EMPAQUE: "Empaque", LIMPIEZA: "Limpieza", OTROS: "Otros",
};

export const insumoSchema = z.object({
  nombre: z.string().trim().min(1, "Obligatorio").max(150),
  unidad_medida_id: z.string().uuid("Elige una unidad"),
  categoria: z.enum(CATEGORIAS_INSUMO),
  costo_unitario_mxn: z.number().nonnegative("No puede ser negativo"),
  stock_minimo_global: z.number().nonnegative().optional(),
});
export type InsumoInput = z.infer<typeof insumoSchema>;

export type Insumo = {
  id: string;
  nombre: string;
  categoria: string;
  unidadId: string;
  unidadSimbolo: string;
  costoUnitario: number;
  stockMinimo: number;
  stockActual: number;
  alerta: string | null;
};

/** Lista insumos con su stock agregado (suma de sucursales) + unidad. */
export async function listarInsumos(): Promise<Insumo[]> {
  const { data, error } = await supabase
    .from("insumos")
    .select(
      "id, nombre, categoria, costo_unitario_mxn, stock_minimo_global, unidad_medida_id, unidad:unidades_medida!unidad_medida_id(simbolo), stock:insumo_stock_sucursal(stock_actual, alerta_actual)",
    )
    .is("deleted_at", null)
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const stockRows = (r.stock as { stock_actual: number | string; alerta_actual: string | null }[] | null) ?? [];
    const stockActual = stockRows.reduce((a, s) => a + num(s.stock_actual), 0);
    const alerta = stockRows.find((s) => s.alerta_actual && s.alerta_actual !== "OK")?.alerta_actual ?? null;
    return {
      id: String(r.id),
      nombre: S(r.nombre),
      categoria: S(r.categoria),
      unidadId: S(r.unidad_medida_id),
      unidadSimbolo: ((r.unidad as { simbolo?: string } | null)?.simbolo) ?? "",
      costoUnitario: num(r.costo_unitario_mxn),
      stockMinimo: num(r.stock_minimo_global),
      stockActual,
      alerta,
    };
  });
}

export async function crearInsumo(input: InsumoInput): Promise<void> {
  const d = insumoSchema.parse(input);
  const tid = await tenantId();
  const { error } = await supabase.from("insumos").insert({
    tenant_id: tid,
    nombre: d.nombre,
    unidad_medida_id: d.unidad_medida_id,
    categoria: d.categoria,
    costo_unitario_mxn: d.costo_unitario_mxn,
    stock_minimo_global: d.stock_minimo_global ?? 0,
  });
  if (error) throw new Error(error.message);
}

export async function actualizarInsumo(id: string, input: InsumoInput): Promise<void> {
  const d = insumoSchema.parse(input);
  const { error } = await supabase
    .from("insumos")
    .update({
      nombre: d.nombre,
      unidad_medida_id: d.unidad_medida_id,
      categoria: d.categoria,
      costo_unitario_mxn: d.costo_unitario_mxn,
      stock_minimo_global: d.stock_minimo_global ?? 0,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function eliminarInsumo(id: string): Promise<void> {
  const { error } = await supabase.from("insumos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export type TipoMovimientoUI = "ENTRADA_COMPRA" | "MERMA" | "AJUSTE_POSITIVO" | "AJUSTE_NEGATIVO";
export const TIPOS_MOV: { v: TipoMovimientoUI; l: string }[] = [
  { v: "ENTRADA_COMPRA", l: "Entrada (compra)" },
  { v: "MERMA", l: "Merma" },
  { v: "AJUSTE_POSITIVO", l: "Ajuste +" },
  { v: "AJUSTE_NEGATIVO", l: "Ajuste −" },
];

/** Registra un movimiento de inventario en la sucursal vía RPC. El stock lo recalcula el trigger. */
export async function registrarMovimiento(args: {
  sucursalId: string;
  insumoId: string;
  tipo: TipoMovimientoUI;
  cantidad: number;
  costoUnitario?: number | null;
  motivo?: string;
}): Promise<void> {
  const tid = await tenantId();
  const usuarioId = await usuarioActualId();
  const { error } = await supabase.rpc("aplicar_movimiento_inventario", {
    p_tenant_id: tid,
    p_sucursal_id: args.sucursalId,
    p_insumo_id: args.insumoId,
    p_tipo: args.tipo,
    p_cantidad: args.cantidad,
    p_costo_unitario_mxn: args.costoUnitario ?? null,
    p_usuario_id: usuarioId,
    p_motivo: args.motivo ?? null,
  });
  if (error) throw new Error(error.message);
}

export type SucursalOpcion = { id: string; nombre: string };
export async function listarSucursalesOpciones(): Promise<SucursalOpcion[]> {
  const { data, error } = await supabase.from("sucursales").select("id, nombre").is("deleted_at", null).order("nombre");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((s) => ({ id: String(s.id), nombre: S(s.nombre) }));
}
