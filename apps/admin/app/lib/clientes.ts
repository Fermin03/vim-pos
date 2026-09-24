"use client";
import { z } from "zod";
import { supabase, leerSesion } from "./supabase";
import { CLIENTES_POR_PAGINA, filtroBusqueda, rangoPagina, ticketPromedio } from "./clientes-paginacion";

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

/** Comportamiento de compra del cliente (P-151), desde vw_clientes_lista (mig. 0118). */
export type ResumenCliente = {
  compras: number;
  gastoTotal: number;
  ultimaVisita: string | null;
};

export type ClienteConResumen = Cliente & ResumenCliente;

export type FiltroCliente = "TODOS" | "CON_RFC" | "RECURRENTES";

/** Indicadores del padrón COMPLETO (vw_clientes_kpis), no de la página que se está viendo. */
export type KpisClientes = { total: number; conRfc: number; recurrentes: number; ticketPromedio: number };

const S = (v: unknown) => (v == null ? "" : String(v));

/**
 * Una página de la lista de clientes, con su comportamiento de compra y el total que cumple el
 * filtro. Todo se resuelve en la base (vw_clientes_lista, mig. 0118): búsqueda, filtro, orden y
 * corte. Antes se pedían 200 clientes y se cruzaban en el navegador, y el que pasaba de 200 no se
 * veía en ningún lado.
 *
 * El orden lleva `id` de desempate: con solo `nombre`, dos clientes homónimos pueden cambiar de
 * lugar entre dos consultas y uno se repite en dos páginas mientras otro no sale en ninguna.
 */
export async function listarClientesPagina(args: {
  busqueda: string;
  filtro: FiltroCliente;
  pagina: number;
}): Promise<{ filas: ClienteConResumen[]; total: number }> {
  const tid = await tenantId();
  const { desde, hasta } = rangoPagina(args.pagina, CLIENTES_POR_PAGINA);
  let q = supabase
    .from("vw_clientes_lista")
    .select(
      "id, nombre, apellido_paterno, telefono, email, rfc, razon_social, codigo_postal_fiscal, tipo_fiscal, notas_internas, estado, compras, gasto_total_mxn, ultima_visita",
      { count: "exact" },
    )
    .eq("tenant_id", tid);
  const or = filtroBusqueda(args.busqueda);
  if (or) q = q.or(or);
  if (args.filtro === "CON_RFC") q = q.not("rfc", "is", null).neq("rfc", "");
  if (args.filtro === "RECURRENTES") q = q.gte("compras", 3);
  const { data, error, count } = await q
    .order("nombre", { ascending: true })
    .order("id", { ascending: true })
    .range(desde, hasta);
  if (error) throw new Error(error.message);
  const filas = ((data ?? []) as Record<string, unknown>[]).map((c) => ({
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
    compras: Number(c.compras ?? 0),
    gastoTotal: Number(c.gasto_total_mxn ?? 0),
    ultimaVisita: c.ultima_visita ? String(c.ultima_visita) : null,
  }));
  return { filas, total: count ?? filas.length };
}

/** Indicadores del padrón completo. Sin clientes, la vista no trae fila: todo en cero. */
export async function kpisClientes(): Promise<KpisClientes> {
  const tid = await tenantId();
  const { data, error } = await supabase
    .from("vw_clientes_kpis")
    .select("total, con_rfc, recurrentes, compras_totales, gasto_total_mxn")
    .eq("tenant_id", tid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const k = (data ?? {}) as Record<string, unknown>;
  return {
    total: Number(k.total ?? 0),
    conRfc: Number(k.con_rfc ?? 0),
    recurrentes: Number(k.recurrentes ?? 0),
    ticketPromedio: ticketPromedio(Number(k.gasto_total_mxn ?? 0), Number(k.compras_totales ?? 0)),
  };
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
