"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";

export const TIPO_SELECCION = {
  UNICA_OBLIGATORIA: "Elige una (obligatorio)",
  UNICA_OPCIONAL: "Elige una o ninguna",
  MULTIPLE_OPCIONAL: "Elige varias o ninguna",
  MULTIPLE_OBLIGATORIA_RANGO: "Elige entre N y M",
} as const;
export type TipoSeleccion = keyof typeof TIPO_SELECCION;

export const NATURALEZA = {
  EXTRA: "Extra (agrega ingredientes)",
  OMISION: "Sin / Omisión",
  PREPARACION: "Preparación (término, etc.)",
  NEUTRO: "Neutro (categórico)",
} as const;
export type Naturaleza = keyof typeof NATURALEZA;

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

// ── Grupos ───────────────────────────────────────────────────────────────────
export const grupoSchema = z
  .object({
    nombre: z.string().trim().min(1, "El nombre es obligatorio").max(150, "Máximo 150 caracteres"),
    descripcion: z.string().trim().max(300).optional().or(z.literal("")),
    tipo_seleccion: z.enum(["UNICA_OBLIGATORIA", "UNICA_OPCIONAL", "MULTIPLE_OPCIONAL", "MULTIPLE_OBLIGATORIA_RANGO"]),
    naturaleza: z.enum(["EXTRA", "OMISION", "PREPARACION", "NEUTRO"]),
    minimo_selecciones: z.number().int().min(0).nullable(),
    maximo_selecciones: z.number().int().min(1).nullable(),
    activo: z.boolean(),
  })
  .refine(
    (d) =>
      d.tipo_seleccion !== "MULTIPLE_OBLIGATORIA_RANGO" ||
      (d.minimo_selecciones !== null && d.maximo_selecciones !== null && d.maximo_selecciones >= d.minimo_selecciones),
    { message: "Define un rango válido (máximo ≥ mínimo)", path: ["maximo_selecciones"] },
  );
export type GrupoInput = z.infer<typeof grupoSchema>;

export type Grupo = {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipo_seleccion: TipoSeleccion;
  naturaleza: Naturaleza;
  minimo_selecciones: number | null;
  maximo_selecciones: number | null;
  activo: boolean;
  nOpciones: number;
};

type FilaGrupo = Omit<Grupo, "nOpciones"> & { opciones: { count: number }[] | null };

export async function listarGrupos(): Promise<Grupo[]> {
  const { data, error } = await supabase
    .from("grupos_modificadores")
    .select("id, nombre, descripcion, tipo_seleccion, naturaleza, minimo_selecciones, maximo_selecciones, activo, opciones:opciones_modificador(count)")
    .is("deleted_at", null)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaGrupo[]).map((f) => ({
    id: f.id,
    nombre: f.nombre,
    descripcion: f.descripcion,
    tipo_seleccion: f.tipo_seleccion,
    naturaleza: f.naturaleza,
    minimo_selecciones: f.minimo_selecciones,
    maximo_selecciones: f.maximo_selecciones,
    activo: f.activo,
    nOpciones: f.opciones?.[0]?.count ?? 0,
  }));
}

export async function obtenerGrupo(id: string): Promise<Grupo | null> {
  const { data, error } = await supabase
    .from("grupos_modificadores")
    .select("id, nombre, descripcion, tipo_seleccion, naturaleza, minimo_selecciones, maximo_selecciones, activo, opciones:opciones_modificador(count)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const f = data as unknown as FilaGrupo;
  return {
    id: f.id,
    nombre: f.nombre,
    descripcion: f.descripcion,
    tipo_seleccion: f.tipo_seleccion,
    naturaleza: f.naturaleza,
    minimo_selecciones: f.minimo_selecciones,
    maximo_selecciones: f.maximo_selecciones,
    activo: f.activo,
    nOpciones: f.opciones?.[0]?.count ?? 0,
  };
}

export async function crearGrupo(input: GrupoInput): Promise<string> {
  const datos = grupoSchema.parse(input);
  const tid = await tenantId();
  const { data: maxRow } = await supabase
    .from("grupos_modificadores")
    .select("orden_visualizacion")
    .is("deleted_at", null)
    .order("orden_visualizacion", { ascending: false })
    .limit(1)
    .maybeSingle();
  const orden = (maxRow?.orden_visualizacion ?? 0) + 1;
  const esRango = datos.tipo_seleccion === "MULTIPLE_OBLIGATORIA_RANGO";
  const { data, error } = await supabase
    .from("grupos_modificadores")
    .insert({
      tenant_id: tid,
      nombre: datos.nombre,
      descripcion: datos.descripcion || null,
      tipo_seleccion: datos.tipo_seleccion,
      naturaleza: datos.naturaleza,
      minimo_selecciones: esRango ? datos.minimo_selecciones : null,
      maximo_selecciones: esRango ? datos.maximo_selecciones : null,
      activo: datos.activo,
      orden_visualizacion: orden,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function actualizarGrupo(id: string, input: GrupoInput): Promise<void> {
  const datos = grupoSchema.parse(input);
  const esRango = datos.tipo_seleccion === "MULTIPLE_OBLIGATORIA_RANGO";
  const { error } = await supabase
    .from("grupos_modificadores")
    .update({
      nombre: datos.nombre,
      descripcion: datos.descripcion || null,
      tipo_seleccion: datos.tipo_seleccion,
      naturaleza: datos.naturaleza,
      minimo_selecciones: esRango ? datos.minimo_selecciones : null,
      maximo_selecciones: esRango ? datos.maximo_selecciones : null,
      activo: datos.activo,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function eliminarGrupo(id: string): Promise<void> {
  const { error } = await supabase
    .from("grupos_modificadores")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Opciones ─────────────────────────────────────────────────────────────────
export const opcionSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(150),
  precio_extra_mxn: z.number({ invalid_type_error: "Precio inválido" }),
  es_default: z.boolean(),
  activa: z.boolean(),
});
export type OpcionInput = z.infer<typeof opcionSchema>;

export type Opcion = {
  id: string;
  nombre: string;
  precio_extra_mxn: number;
  es_default: boolean;
  activa: boolean;
};

export async function listarOpciones(grupoId: string): Promise<Opcion[]> {
  const { data, error } = await supabase
    .from("opciones_modificador")
    .select("id, nombre, precio_extra_mxn, es_default, activa")
    .eq("grupo_id", grupoId)
    .is("deleted_at", null)
    .order("orden_visualizacion", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Opcion[]).map((o) => ({ ...o, precio_extra_mxn: Number(o.precio_extra_mxn) }));
}

export async function crearOpcion(grupoId: string, input: OpcionInput): Promise<void> {
  const datos = opcionSchema.parse(input);
  const tid = await tenantId();
  const { data: maxRow } = await supabase
    .from("opciones_modificador")
    .select("orden_visualizacion")
    .eq("grupo_id", grupoId)
    .is("deleted_at", null)
    .order("orden_visualizacion", { ascending: false })
    .limit(1)
    .maybeSingle();
  const orden = (maxRow?.orden_visualizacion ?? 0) + 1;
  if (datos.es_default) await limpiarDefault(grupoId);
  const { error } = await supabase.from("opciones_modificador").insert({
    tenant_id: tid,
    grupo_id: grupoId,
    nombre: datos.nombre,
    precio_extra_mxn: datos.precio_extra_mxn,
    es_default: datos.es_default,
    activa: datos.activa,
    orden_visualizacion: orden,
  });
  if (error) throw new Error(error.message);
}

export async function actualizarOpcion(grupoId: string, id: string, input: OpcionInput): Promise<void> {
  const datos = opcionSchema.parse(input);
  if (datos.es_default) await limpiarDefault(grupoId, id);
  const { error } = await supabase
    .from("opciones_modificador")
    .update({
      nombre: datos.nombre,
      precio_extra_mxn: datos.precio_extra_mxn,
      es_default: datos.es_default,
      activa: datos.activa,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// El índice único permite UNA sola default por grupo: limpiamos las demás antes.
async function limpiarDefault(grupoId: string, exceptoId?: string): Promise<void> {
  let q = supabase.from("opciones_modificador").update({ es_default: false }).eq("grupo_id", grupoId).eq("es_default", true);
  if (exceptoId) q = q.neq("id", exceptoId);
  await q;
}

export async function eliminarOpcion(id: string): Promise<void> {
  const { error } = await supabase
    .from("opciones_modificador")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export function precioExtra(n: number): string {
  if (n === 0) return "—";
  const s = n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  return n > 0 ? `+${s}` : s;
}
