"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

// ── Credenciales de dispositivo de una caja (provisionar-dispositivo) ─────────
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type CredencialesDispositivo = { identificador: string; clave: string; caja_nombre: string };

/** Genera/regenera las credenciales del dispositivo de una caja (DUEÑO/ADMIN). Se muestran una vez. */
export async function provisionarDispositivo(cajaId: string): Promise<CredencialesDispositivo> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token ?? SB_ANON;
  const res = await fetch(`${SB_URL}/functions/v1/provisionar-dispositivo`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ caja_id: cajaId }),
  });
  const data = (await res.json().catch(() => ({}))) as { identificador?: string; clave?: string; caja_nombre?: string; error?: string };
  if (!res.ok || !data.identificador || !data.clave) throw new Error(data.error ?? `HTTP ${res.status}`);
  return { identificador: data.identificador, clave: data.clave, caja_nombre: data.caja_nombre ?? "" };
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

// ── Datos fiscales (P-163) ───────────────────────────────────────────────────
// Régimenes fiscales SAT soportados (enum regimen_fiscal en BD). El catálogo SAT es
// más amplio; aquí van los relevantes para restauranteros (PM y PF).
export const REGIMENES_FISCALES: { codigo: string; label: string; persona: "MORAL" | "FISICA" }[] = [
  { codigo: "601", label: "General de Ley Personas Morales", persona: "MORAL" },
  { codigo: "603", label: "Personas Morales con Fines no Lucrativos", persona: "MORAL" },
  { codigo: "605", label: "Sueldos y Salarios e Ingresos Asimilados a Salarios", persona: "FISICA" },
  { codigo: "612", label: "Personas Físicas con Actividades Empresariales y Profesionales", persona: "FISICA" },
  { codigo: "621", label: "Incorporación Fiscal", persona: "FISICA" },
  { codigo: "625", label: "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas", persona: "FISICA" },
  { codigo: "626", label: "Régimen Simplificado de Confianza (RESICO)", persona: "FISICA" },
];

const RFC_REGEX = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

export const datosFiscalesSchema = z.object({
  // RFC en mayúsculas, 12 (moral) o 13 (física) caracteres, con formato SAT.
  rfc: z.string().trim().toUpperCase().regex(RFC_REGEX, "RFC inválido (formato SAT)"),
  razon_social: z.string().trim().min(1, "Obligatorio").max(255),
  regimen_fiscal: z.enum(["601", "603", "605", "612", "621", "625", "626"]),
  // CP fiscal = lugar de expedición; obligatorio en CFDI 4.0.
  codigo_postal_fiscal: z.string().trim().regex(/^\d{5}$/, "5 dígitos"),
  email_fiscal: z.string().trim().toLowerCase().email("Correo inválido").max(255).optional().or(z.literal("")),
});
export type DatosFiscalesInput = z.infer<typeof datosFiscalesSchema>;

export type DatosFiscales = {
  rfc: string;
  razon_social: string;
  regimen_fiscal: string | null;
  codigo_postal_fiscal: string;
  email_fiscal: string;
  /** Si ya hay un emisor CFDI configurado y activo (controla el aviso "facturación activa"). */
  facturacionActiva: boolean;
};

export async function leerDatosFiscales(): Promise<DatosFiscales> {
  const tid = await tenantId();
  const [tenRes, emiRes] = await Promise.all([
    supabase
      .from("tenants")
      .select("rfc, razon_social, regimen_fiscal, codigo_postal_fiscal, email_fiscal")
      .eq("id", tid)
      .maybeSingle(),
    supabase.from("tenant_cfdi_emisor").select("estado").eq("tenant_id", tid).maybeSingle(),
  ]);
  if (tenRes.error) throw new Error(tenRes.error.message);
  const t = (tenRes.data ?? {}) as Record<string, string | null>;
  const emi = emiRes.data as { estado?: string } | null;
  return {
    rfc: t.rfc ?? "",
    razon_social: t.razon_social ?? "",
    regimen_fiscal: t.regimen_fiscal ?? null,
    codigo_postal_fiscal: t.codigo_postal_fiscal ?? "",
    email_fiscal: t.email_fiscal ?? "",
    facturacionActiva: emi?.estado === "ACTIVO",
  };
}

export async function actualizarDatosFiscales(input: DatosFiscalesInput): Promise<void> {
  const datos = datosFiscalesSchema.parse(input);
  const tid = await tenantId();
  const { error } = await supabase
    .from("tenants")
    .update({
      rfc: datos.rfc,
      razon_social: datos.razon_social,
      regimen_fiscal: datos.regimen_fiscal,
      codigo_postal_fiscal: datos.codigo_postal_fiscal,
      email_fiscal: datos.email_fiscal || null,
    })
    .eq("id", tid);
  if (error) throw new Error(error.message);
}

// ── Marcas virtuales (P-172) — F17/F20 ───────────────────────────────────────
// Marcas/cocinas fantasma: un mismo local opera varias marcas (ghost kitchen, foodtruck
// multi-concepto, dark kitchen). Cada marca tiene su identidad y se asocia a productos/áreas.
export const marcaSchema = z.object({
  codigo: z.string().trim().min(1, "Obligatorio").max(50).regex(/^[a-z0-9-]+$/i, "Solo letras, números o guiones"),
  nombre: z.string().trim().min(1, "Obligatorio").max(150),
  descripcion: z.string().trim().max(500).optional().or(z.literal("")),
  color_primario_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color hex (#RRGGBB)").optional().or(z.literal("")),
  activa: z.boolean(),
});
export type MarcaInput = z.infer<typeof marcaSchema>;
export type Marca = MarcaInput & { id: string };

export async function listarMarcas(): Promise<Marca[]> {
  const { data, error } = await supabase
    .from("marcas_virtuales")
    .select("id, codigo, nombre, descripcion, color_primario_hex, activa")
    .is("deleted_at", null)
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, string | boolean | null>[]).map((m) => ({
    id: String(m.id),
    codigo: String(m.codigo),
    nombre: String(m.nombre),
    descripcion: (m.descripcion as string) ?? "",
    color_primario_hex: (m.color_primario_hex as string) ?? "",
    activa: Boolean(m.activa),
  }));
}

export async function crearMarca(input: MarcaInput): Promise<void> {
  const datos = marcaSchema.parse(input);
  const tid = await tenantId();
  const { error } = await supabase.from("marcas_virtuales").insert({
    tenant_id: tid,
    codigo: datos.codigo,
    nombre: datos.nombre,
    descripcion: datos.descripcion || null,
    color_primario_hex: datos.color_primario_hex || null,
    activa: datos.activa,
  });
  if (error) throw new Error(error.message);
}

export async function actualizarMarca(id: string, input: MarcaInput): Promise<void> {
  const datos = marcaSchema.parse(input);
  const { error } = await supabase
    .from("marcas_virtuales")
    .update({
      codigo: datos.codigo,
      nombre: datos.nombre,
      descripcion: datos.descripcion || null,
      color_primario_hex: datos.color_primario_hex || null,
      activa: datos.activa,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function eliminarMarca(id: string): Promise<void> {
  const { error } = await supabase
    .from("marcas_virtuales")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── CFDI / PAC emisor (P-018) ────────────────────────────────────────────────
export const PROVEEDORES_PAC = ["FACTURAPI", "SOLUCIONFACTIBLE", "FINKOK", "EDICOM", "PRODIGIA", "OTRO"] as const;
export type ProveedorPac = (typeof PROVEEDORES_PAC)[number];

export const cfdiEmisorSchema = z.object({
  rfc: z.string().trim().toUpperCase().regex(/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/, "RFC inválido"),
  proveedor_pac: z.enum(PROVEEDORES_PAC),
  facturama_issuer_ref: z.string().trim().max(100).optional().or(z.literal("")),
  csd_vigencia_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").optional().or(z.literal("")),
  estado: z.enum(["ACTIVO", "INACTIVO", "PRUEBA"]),
});
export type CfdiEmisorInput = z.infer<typeof cfdiEmisorSchema>;
export type CfdiEmisor = CfdiEmisorInput & { existe: boolean };

export async function leerCfdiEmisor(): Promise<CfdiEmisor> {
  const tid = await tenantId();
  const { data, error } = await supabase
    .from("tenant_cfdi_emisor")
    .select("rfc, proveedor_pac, facturama_issuer_ref, csd_vigencia_hasta, estado")
    .eq("tenant_id", tid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    // Prefill RFC desde los datos fiscales del tenant si aún no hay emisor.
    const ten = await supabase.from("tenants").select("rfc").eq("id", tid).maybeSingle();
    return {
      rfc: (ten.data as { rfc?: string } | null)?.rfc ?? "",
      proveedor_pac: "FACTURAPI",
      facturama_issuer_ref: "",
      csd_vigencia_hasta: "",
      estado: "PRUEBA",
      existe: false,
    };
  }
  const d = data as Record<string, string | null>;
  return {
    rfc: d.rfc ?? "",
    proveedor_pac: (d.proveedor_pac as ProveedorPac) ?? "FACTURAPI",
    facturama_issuer_ref: d.facturama_issuer_ref ?? "",
    csd_vigencia_hasta: d.csd_vigencia_hasta ?? "",
    estado: (d.estado as CfdiEmisorInput["estado"]) ?? "PRUEBA",
    existe: true,
  };
}

export async function guardarCfdiEmisor(input: CfdiEmisorInput): Promise<void> {
  const datos = cfdiEmisorSchema.parse(input);
  const tid = await tenantId();
  const { error } = await supabase.from("tenant_cfdi_emisor").upsert(
    {
      tenant_id: tid,
      rfc: datos.rfc,
      proveedor_pac: datos.proveedor_pac,
      facturama_issuer_ref: datos.facturama_issuer_ref || datos.rfc, // NOT NULL en BD
      csd_vigencia_hasta: datos.csd_vigencia_hasta || null,
      estado: datos.estado,
    },
    { onConflict: "tenant_id" },
  );
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
