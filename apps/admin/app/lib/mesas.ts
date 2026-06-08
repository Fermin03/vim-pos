"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";

// BUG C — Editor de mesas. La pantalla de Mesas del POS dirige aquí ("el dueño las da de alta
// en el admin"), pero no existía. Tabla `mesas` (RLS mesas_select/insert/update por tenant).
// Sin política DELETE -> baja lógica vía update deleted_at.

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

const S = (v: unknown) => (v == null ? "" : String(v));
const N = (v: unknown) => Number(v ?? 0);

export type FormaMesa = "RECTANGULAR" | "CUADRADA" | "REDONDA" | "BARRA";
export type EstadoMesa = "LIBRE" | "OCUPADA" | "RESERVADA" | "EN_LIMPIEZA" | "FUERA_DE_SERVICIO";

export const FORMAS: { v: FormaMesa; l: string }[] = [
  { v: "RECTANGULAR", l: "Rectangular" },
  { v: "CUADRADA", l: "Cuadrada" },
  { v: "REDONDA", l: "Redonda" },
  { v: "BARRA", l: "Barra" },
];

export const ESTADO_LABEL: Record<EstadoMesa, string> = {
  LIBRE: "Libre", OCUPADA: "Ocupada", RESERVADA: "Reservada", EN_LIMPIEZA: "En limpieza", FUERA_DE_SERVICIO: "Fuera de servicio",
};

export type Sucursal = { id: string; nombre: string };

export type Mesa = {
  id: string;
  sucursalId: string;
  sucursalNombre: string;
  numero: string;
  nombre: string;
  capacidad: number;
  forma: FormaMesa;
  estado: EstadoMesa;
  activa: boolean;
};

export const mesaSchema = z.object({
  sucursal_id: z.string().uuid("Elige una sucursal"),
  numero: z.string().trim().min(1, "Indica el número").max(20),
  nombre: z.string().trim().max(60).optional().or(z.literal("")),
  capacidad: z.number().int().min(1, "Mínimo 1").max(50, "Máximo 50"),
  forma: z.enum(["RECTANGULAR", "CUADRADA", "REDONDA", "BARRA"]),
});
export type MesaInput = z.infer<typeof mesaSchema>;

export async function listarSucursalesMesas(): Promise<Sucursal[]> {
  const { data, error } = await supabase
    .from("sucursales")
    .select("id, nombre")
    .is("deleted_at", null)
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((s) => ({ id: String(s.id), nombre: S(s.nombre) }));
}

export async function listarMesas(): Promise<Mesa[]> {
  const { data, error } = await supabase
    .from("mesas")
    .select("id, sucursal_id, numero, nombre, capacidad, forma, estado, activa, sucursal:sucursales(nombre)")
    .is("deleted_at", null)
    .order("numero", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((m) => ({
    id: String(m.id),
    sucursalId: String(m.sucursal_id),
    sucursalNombre: S((m.sucursal as { nombre?: string } | null)?.nombre) || "Sucursal",
    numero: S(m.numero),
    nombre: S(m.nombre),
    capacidad: N(m.capacidad),
    forma: (m.forma as FormaMesa) ?? "RECTANGULAR",
    estado: (m.estado as EstadoMesa) ?? "LIBRE",
    activa: m.activa !== false,
  }));
}

function payload(d: MesaInput) {
  return {
    sucursal_id: d.sucursal_id,
    numero: d.numero,
    nombre: d.nombre || null,
    capacidad: d.capacidad,
    forma: d.forma,
  };
}

export async function crearMesa(input: MesaInput): Promise<void> {
  const d = mesaSchema.parse(input);
  const tid = await tenantId();
  const { error } = await supabase.from("mesas").insert({ tenant_id: tid, estado: "LIBRE", ...payload(d) });
  if (error) throw new Error(error.message);
}

export async function actualizarMesa(id: string, input: MesaInput): Promise<void> {
  const d = mesaSchema.parse(input);
  const { error } = await supabase.from("mesas").update(payload(d)).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Pone/quita la mesa fuera de servicio. No tocar si está OCUPADA (cuenta viva). */
export async function alternarFueraDeServicio(id: string, fuera: boolean): Promise<void> {
  const { error } = await supabase.from("mesas").update({ estado: fuera ? "FUERA_DE_SERVICIO" : "LIBRE" }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function eliminarMesa(id: string): Promise<void> {
  const { error } = await supabase.from("mesas").update({ deleted_at: new Date().toISOString(), activa: false }).eq("id", id);
  if (error) throw new Error(error.message);
}
