"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

// ── Negocio (P-162) ──────────────────────────────────────────────────────────
export const negocioSchema = z.object({
  nombre_comercial: z.string().trim().min(1, "Obligatorio").max(150),
  codigo: z.string().trim().min(1, "Obligatorio").max(50).regex(/^[a-z0-9-]+$/i, "Solo letras, números o guiones"),
  timezone: z.string().min(1).max(50),
  hora_cierre_dia_contable: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Formato HH:MM"),
});
export type NegocioInput = z.infer<typeof negocioSchema>;

export type Negocio = NegocioInput & {
  id: string;
  vertical_principal: string;
  estado: string;
};

export async function leerNegocio(): Promise<Negocio | null> {
  const tid = await tenantId();
  const { data, error } = await supabase
    .from("tenants")
    .select("id, nombre_comercial, codigo, timezone, hora_cierre_dia_contable, vertical_principal, estado")
    .eq("id", tid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Negocio) ?? null;
}

export async function actualizarNegocio(input: NegocioInput): Promise<void> {
  const datos = negocioSchema.parse(input);
  const tid = await tenantId();
  const { error } = await supabase
    .from("tenants")
    .update({
      nombre_comercial: datos.nombre_comercial,
      codigo: datos.codigo,
      timezone: datos.timezone,
      hora_cierre_dia_contable: datos.hora_cierre_dia_contable,
    })
    .eq("id", tid);
  if (error) throw new Error(error.message);
}

// ── Sucursales (P-165/166) ───────────────────────────────────────────────────
export const sucursalSchema = z.object({
  codigo: z.string().trim().min(1, "Obligatorio").max(10).regex(/^[A-Z0-9]+$/, "Solo mayúsculas y números"),
  nombre: z.string().trim().min(1, "Obligatorio").max(150),
  direccion_calle: z.string().trim().max(255).optional().or(z.literal("")),
  ciudad: z.string().trim().max(100).optional().or(z.literal("")),
  estado_geo: z.string().trim().max(50).optional().or(z.literal("")),
  telefono: z.string().trim().max(20).optional().or(z.literal("")),
  activa: z.boolean(),
});
export type SucursalInput = z.infer<typeof sucursalSchema>;

export type Sucursal = SucursalInput & {
  id: string;
  nCajas: number;
};

type FilaSuc = Omit<Sucursal, "nCajas"> & { cajas: { count: number }[] | null };

export async function listarSucursales(): Promise<Sucursal[]> {
  const { data, error } = await supabase
    .from("sucursales")
    .select("id, codigo, nombre, direccion_calle, ciudad, estado_geo, telefono, activa, cajas(count)")
    .is("deleted_at", null)
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaSuc[]).map((f) => ({
    id: f.id,
    codigo: f.codigo,
    nombre: f.nombre,
    direccion_calle: f.direccion_calle ?? "",
    ciudad: f.ciudad ?? "",
    estado_geo: f.estado_geo ?? "",
    telefono: f.telefono ?? "",
    activa: f.activa,
    nCajas: f.cajas?.[0]?.count ?? 0,
  }));
}

export async function obtenerSucursal(id: string): Promise<Sucursal | null> {
  const { data, error } = await supabase
    .from("sucursales")
    .select("id, codigo, nombre, direccion_calle, ciudad, estado_geo, telefono, activa, cajas(count)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const f = data as unknown as FilaSuc;
  return {
    id: f.id,
    codigo: f.codigo,
    nombre: f.nombre,
    direccion_calle: f.direccion_calle ?? "",
    ciudad: f.ciudad ?? "",
    estado_geo: f.estado_geo ?? "",
    telefono: f.telefono ?? "",
    activa: f.activa,
    nCajas: f.cajas?.[0]?.count ?? 0,
  };
}

export async function crearSucursal(input: SucursalInput): Promise<void> {
  const datos = sucursalSchema.parse(input);
  const tid = await tenantId();
  const { error } = await supabase.from("sucursales").insert({
    tenant_id: tid,
    codigo: datos.codigo,
    nombre: datos.nombre,
    direccion_calle: datos.direccion_calle || null,
    ciudad: datos.ciudad || null,
    estado_geo: datos.estado_geo || null,
    telefono: datos.telefono || null,
    activa: datos.activa,
  });
  if (error) throw new Error(error.message);
}

export async function actualizarSucursal(id: string, input: SucursalInput): Promise<void> {
  const datos = sucursalSchema.parse(input);
  const { error } = await supabase
    .from("sucursales")
    .update({
      codigo: datos.codigo,
      nombre: datos.nombre,
      direccion_calle: datos.direccion_calle || null,
      ciudad: datos.ciudad || null,
      estado_geo: datos.estado_geo || null,
      telefono: datos.telefono || null,
      activa: datos.activa,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function eliminarSucursal(id: string): Promise<void> {
  const { error } = await supabase
    .from("sucursales")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Cajas (P-167/168) ─────────────────────────────────────────────────────────
export const cajaSchema = z.object({
  sucursal_id: z.string().uuid("Elige una sucursal"),
  numero: z.number().int().min(1, "Mínimo 1"),
  nombre: z.string().trim().min(1, "Obligatorio").max(100),
  activa: z.boolean(),
});
export type CajaInput = z.infer<typeof cajaSchema>;

export type Caja = CajaInput & {
  id: string;
  sucursalNombre: string;
  bloqueada: boolean;
};

type FilaCaja = Omit<Caja, "sucursalNombre"> & { sucursal: { nombre: string } | null };

export async function listarCajas(): Promise<Caja[]> {
  const { data, error } = await supabase
    .from("cajas")
    .select("id, sucursal_id, numero, nombre, activa, bloqueada, sucursal:sucursales(nombre)")
    .is("deleted_at", null)
    .order("sucursal_id", { ascending: true })
    .order("numero", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaCaja[]).map((f) => ({
    id: f.id,
    sucursal_id: f.sucursal_id,
    numero: f.numero,
    nombre: f.nombre,
    activa: f.activa,
    bloqueada: f.bloqueada,
    sucursalNombre: f.sucursal?.nombre ?? "—",
  }));
}

export async function crearCaja(input: CajaInput): Promise<void> {
  const datos = cajaSchema.parse(input);
  const tid = await tenantId();
  const { error } = await supabase.from("cajas").insert({
    tenant_id: tid,
    sucursal_id: datos.sucursal_id,
    numero: datos.numero,
    nombre: datos.nombre,
    activa: datos.activa,
  });
  if (error) throw new Error(error.message);
}

export async function actualizarCaja(id: string, input: CajaInput): Promise<void> {
  const datos = cajaSchema.parse(input);
  const { error } = await supabase
    .from("cajas")
    .update({
      sucursal_id: datos.sucursal_id,
      numero: datos.numero,
      nombre: datos.nombre,
      activa: datos.activa,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function eliminarCaja(id: string): Promise<void> {
  const { error } = await supabase
    .from("cajas")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Propinas (P-173) ──────────────────────────────────────────────────────────
export const propinasSchema = z.object({
  capturar_propina: z.boolean(),
  porcentajes_sugeridos: z.array(z.number().int().min(0).max(100)).min(0).max(6),
  permitir_monto_libre: z.boolean(),
  permitir_sin_propina: z.boolean(),
  redondear_a_pesos: z.boolean(),
});
export type PropinasInput = z.infer<typeof propinasSchema>;

export type Propinas = PropinasInput & { sucursal_id: string };

export async function leerPropinas(sucursalId: string): Promise<Propinas | null> {
  const { data, error } = await supabase
    .from("sucursal_propinas_config")
    .select("sucursal_id, capturar_propina, porcentajes_sugeridos, permitir_monto_libre, permitir_sin_propina, redondear_a_pesos")
    .eq("sucursal_id", sucursalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Propinas) ?? null;
}

export async function guardarPropinas(sucursalId: string, input: PropinasInput): Promise<void> {
  const datos = propinasSchema.parse(input);
  const tid = await tenantId();
  // upsert por sucursal_id (UNIQUE)
  const { error } = await supabase
    .from("sucursal_propinas_config")
    .upsert(
      {
        tenant_id: tid,
        sucursal_id: sucursalId,
        ...datos,
      },
      { onConflict: "sucursal_id" },
    );
  if (error) throw new Error(error.message);
}
