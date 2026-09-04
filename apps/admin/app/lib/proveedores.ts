"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";

// Catálogo de proveedores (ADR 0012). Tabla proveedores con RLS por tenant y baja lógica.

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}
const S = (v: unknown) => (v == null ? "" : String(v));
const opc = (v: unknown) => (v == null || v === "" ? null : String(v));

export const RFC_REGEX = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

export const proveedorSchema = z.object({
  nombre: z.string().trim().min(1, "Obligatorio").max(200),
  rfc: z.string().trim().toUpperCase().regex(RFC_REGEX, "RFC inválido").or(z.literal("")).optional(),
  telefono: z.string().trim().max(30).optional(),
  email: z.string().trim().email("Correo inválido").or(z.literal("")).optional(),
  notas: z.string().trim().max(2000).optional(),
});
export type ProveedorInput = z.infer<typeof proveedorSchema>;

export type Proveedor = {
  id: string; nombre: string; rfc: string | null; telefono: string | null; email: string | null;
  notas: string | null; activo: boolean; compras: number;
};

function mapear(r: Record<string, unknown>): Proveedor {
  const compras = r.compras as { count?: number }[] | null;
  return {
    id: S(r.id), nombre: S(r.nombre), rfc: opc(r.rfc), telefono: opc(r.telefono), email: opc(r.email),
    notas: opc(r.notas), activo: r.activo !== false, compras: Number(compras?.[0]?.count ?? 0),
  };
}

export async function listarProveedores(): Promise<Proveedor[]> {
  const { data, error } = await supabase
    .from("proveedores")
    .select("id, nombre, rfc, telefono, email, notas, activo, compras(count)")
    .is("deleted_at", null)
    .order("nombre");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapear);
}

function aFila(d: ProveedorInput) {
  return { nombre: d.nombre, rfc: d.rfc || null, telefono: d.telefono || null, email: d.email || null, notas: d.notas || null };
}

export async function crearProveedor(input: ProveedorInput): Promise<string> {
  const d = proveedorSchema.parse(input);
  const tid = await tenantId();
  const { data, error } = await supabase.from("proveedores").insert({ tenant_id: tid, ...aFila(d) }).select("id").single();
  if (error) throw new Error(error.message);
  return S((data as { id: unknown }).id);
}

export async function actualizarProveedor(id: string, input: ProveedorInput): Promise<void> {
  const d = proveedorSchema.parse(input);
  const { error } = await supabase.from("proveedores").update(aFila(d)).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function eliminarProveedor(id: string): Promise<void> {
  const { error } = await supabase.from("proveedores").update({ deleted_at: new Date().toISOString(), activo: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function buscarProveedorPorRfc(rfc: string): Promise<Proveedor | null> {
  const { data, error } = await supabase
    .from("proveedores")
    .select("id, nombre, rfc, telefono, email, notas, activo, compras(count)")
    .is("deleted_at", null)
    .eq("rfc", rfc.trim().toUpperCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapear(data as unknown as Record<string, unknown>) : null;
}
