"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";

// T3 — Promociones. Tabla promociones (RLS promociones_tenant FOR ALL). Alcance este slice:
// tipos simples (PORCENTAJE, MONTO_FIJO, PRECIO_ESPECIAL, CORTESIA_TOTAL) a nivel TICKET_COMPLETO,
// con vigencia (happy hour por rango de fecha/hora). Combo y compra-x-lleva-y se difieren.

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

const num = (v: unknown) => Number(v ?? 0);
const S = (v: unknown) => (v == null ? "" : String(v));

export type TipoPromo = "PORCENTAJE" | "MONTO_FIJO" | "PRECIO_ESPECIAL" | "CORTESIA_TOTAL";
export type EstadoPromo = "ACTIVA" | "PAUSADA" | "EXPIRADA" | "AGOTADA";

export const TIPOS_PROMO: { v: TipoPromo; l: string; necesitaValor: boolean; sufijo: string }[] = [
  { v: "PORCENTAJE", l: "% de descuento", necesitaValor: true, sufijo: "%" },
  { v: "MONTO_FIJO", l: "Monto fijo", necesitaValor: true, sufijo: "MXN" },
  { v: "PRECIO_ESPECIAL", l: "Precio especial", necesitaValor: true, sufijo: "MXN" },
  { v: "CORTESIA_TOTAL", l: "Cortesía total", necesitaValor: false, sufijo: "" },
];

export const promoSchema = z.object({
  nombre: z.string().trim().min(1, "Obligatorio").max(120),
  descripcion: z.string().trim().max(300).optional().or(z.literal("")),
  tipo: z.enum(["PORCENTAJE", "MONTO_FIJO", "PRECIO_ESPECIAL", "CORTESIA_TOTAL"]),
  valor: z.number().nonnegative().optional(),
  fecha_inicio: z.string().min(1, "Indica el inicio"),
  fecha_fin: z.string().optional().or(z.literal("")),
}).refine((d) => d.tipo === "CORTESIA_TOTAL" || (d.valor ?? 0) > 0, { message: "Indica el valor", path: ["valor"] })
  .refine((d) => d.tipo !== "PORCENTAJE" || (d.valor ?? 0) <= 100, { message: "El % no puede pasar de 100", path: ["valor"] });
export type PromoInput = z.infer<typeof promoSchema>;

export type Promo = {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: TipoPromo;
  valorTexto: string;
  estado: EstadoPromo;
  fechaInicio: string;
  fechaFin: string;
};

function valorTexto(p: Record<string, unknown>): string {
  const t = p.tipo as TipoPromo;
  if (t === "PORCENTAJE") return `${num(p.valor_porcentaje)}%`;
  if (t === "MONTO_FIJO") return `-$${num(p.valor_monto_mxn)}`;
  if (t === "PRECIO_ESPECIAL") return `$${num(p.precio_especial_mxn)}`;
  return "Cortesía";
}

export async function listarPromos(): Promise<Promo[]> {
  const { data, error } = await supabase
    .from("promociones")
    .select("id, nombre, descripcion, tipo, valor_porcentaje, valor_monto_mxn, precio_especial_mxn, estado, fecha_inicio, fecha_fin")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((p) => ({
    id: String(p.id),
    nombre: S(p.nombre),
    descripcion: S(p.descripcion),
    tipo: (p.tipo as TipoPromo) ?? "PORCENTAJE",
    valorTexto: valorTexto(p),
    estado: (p.estado as EstadoPromo) ?? "ACTIVA",
    fechaInicio: S(p.fecha_inicio),
    fechaFin: S(p.fecha_fin),
  }));
}

function payload(d: PromoInput) {
  const v = d.valor ?? 0;
  return {
    nombre: d.nombre,
    descripcion: d.descripcion || null,
    tipo: d.tipo,
    alcance: "TICKET_COMPLETO" as const,
    // El CHECK valor_consistente exige que SOLO el campo del tipo esté lleno.
    valor_porcentaje: d.tipo === "PORCENTAJE" ? v : null,
    valor_monto_mxn: d.tipo === "MONTO_FIJO" ? v : null,
    precio_especial_mxn: d.tipo === "PRECIO_ESPECIAL" ? v : null,
    fecha_inicio: new Date(d.fecha_inicio).toISOString(),
    fecha_fin: d.fecha_fin ? new Date(d.fecha_fin).toISOString() : null,
  };
}

export async function crearPromo(input: PromoInput): Promise<void> {
  const d = promoSchema.parse(input);
  const tid = await tenantId();
  const { error } = await supabase.from("promociones").insert({ tenant_id: tid, estado: "ACTIVA", ...payload(d) });
  if (error) throw new Error(error.message);
}

export async function actualizarPromo(id: string, input: PromoInput): Promise<void> {
  const d = promoSchema.parse(input);
  const { error } = await supabase.from("promociones").update(payload(d)).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function cambiarEstadoPromo(id: string, estado: EstadoPromo): Promise<void> {
  const { error } = await supabase.from("promociones").update({ estado }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function eliminarPromo(id: string): Promise<void> {
  const { error } = await supabase.from("promociones").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}
