"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

// Tier1 — Clientes / CRM. Tabla `clientes` (RLS clientes_tenant FOR ALL). Datos fiscales para
// factura a cliente frecuente. nombre es lo único obligatorio.

export const clienteSchema = z.object({
  nombre: z.string().trim().min(1, "Obligatorio").max(150),
  apellido_paterno: z.string().trim().max(100).optional().or(z.literal("")),
  telefono: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email("Correo inválido").max(150).optional().or(z.literal("")),
  rfc: z.string().trim().toUpperCase().regex(/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/, "RFC inválido").optional().or(z.literal("")),
  razon_social: z.string().trim().max(200).optional().or(z.literal("")),
  codigo_postal_fiscal: z.string().trim().regex(/^\d{5}$/, "CP de 5 dígitos").optional().or(z.literal("")),
  tipo_fiscal: z.enum(["PERSONA_FISICA", "PERSONA_MORAL", "EVENTUAL"]),
  notas_internas: z.string().trim().max(500).optional().or(z.literal("")),
});
export type ClienteInput = z.infer<typeof clienteSchema>;
export type Cliente = ClienteInput & { id: string; estado: "ACTIVO" | "BLOQUEADO" };

const S = (v: unknown) => (v == null ? "" : String(v));

export async function listarClientes(busqueda = ""): Promise<Cliente[]> {
  let q = supabase
    .from("clientes")
    .select("id, nombre, apellido_paterno, telefono, email, rfc, razon_social, codigo_postal_fiscal, tipo_fiscal, notas_internas, estado")
    .is("deleted_at", null)
    .order("nombre", { ascending: true })
    .limit(200);
  if (busqueda.trim()) {
    const b = busqueda.trim();
    q = q.or(`nombre.ilike.%${b}%,telefono.ilike.%${b}%,rfc.ilike.%${b}%,email.ilike.%${b}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
    id: String(c.id),
    nombre: S(c.nombre),
    apellido_paterno: S(c.apellido_paterno),
    telefono: S(c.telefono),
    email: S(c.email),
    rfc: S(c.rfc),
    razon_social: S(c.razon_social),
    codigo_postal_fiscal: S(c.codigo_postal_fiscal),
    tipo_fiscal: (c.tipo_fiscal as Cliente["tipo_fiscal"]) ?? "PERSONA_FISICA",
    notas_internas: S(c.notas_internas),
    estado: (c.estado as Cliente["estado"]) ?? "ACTIVO",
  }));
}

function payload(d: ClienteInput) {
  return {
    nombre: d.nombre,
    apellido_paterno: d.apellido_paterno || null,
    telefono: d.telefono || null,
    email: d.email || null,
    rfc: d.rfc || null,
    razon_social: d.razon_social || null,
    codigo_postal_fiscal: d.codigo_postal_fiscal || null,
    tipo_fiscal: d.tipo_fiscal,
    notas_internas: d.notas_internas || null,
  };
}

export async function crearCliente(input: ClienteInput): Promise<void> {
  const d = clienteSchema.parse(input);
  const tid = await tenantId();
  const { error } = await supabase.from("clientes").insert({ tenant_id: tid, ...payload(d) });
  if (error) throw new Error(error.message);
}

export async function actualizarCliente(id: string, input: ClienteInput): Promise<void> {
  const d = clienteSchema.parse(input);
  const { error } = await supabase.from("clientes").update(payload(d)).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function cambiarEstadoCliente(
  id: string,
  estado: "ACTIVO" | "BLOQUEADO",
  motivo?: string,
): Promise<void> {
  // El CHECK bloqueo_consistente exige motivo_bloqueo cuando estado=BLOQUEADO.
  const patch =
    estado === "BLOQUEADO"
      ? { estado, motivo_bloqueo: motivo?.trim() || "Bloqueado desde admin", fecha_bloqueo: new Date().toISOString() }
      : { estado, motivo_bloqueo: null, fecha_bloqueo: null };
  const { error } = await supabase.from("clientes").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function eliminarCliente(id: string): Promise<void> {
  const { error } = await supabase.from("clientes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}
