"use client";
import { employeeClient } from "./supabase";

// CRM ligero para domicilios desde el POS. Busca por teléfono/nombre y registra
// cliente + direcciones (un cliente puede tener varias: Casa, Oficina, etc.).
// CP/ciudad/estado por defecto de la sucursal. RLS por tenant.

export type DireccionCliente = {
  id: string;
  etiqueta: string;
  preview: string;
  referencias: string | null;
};

export type ClienteDomicilio = {
  clienteId: string;
  nombre: string;
  telefono: string | null;
  /** Dirección elegida para ESTE pedido. */
  direccionId: string | null;
  direccionPreview: string | null;
  /** Todas las direcciones del cliente (Casa, Oficina, …). */
  direcciones: DireccionCliente[];
};

export const ETIQUETAS_DIRECCION = ["Casa", "Oficina", "Otra"] as const;

type FilaDir = { id: string; etiqueta: string | null; calle: string; numero_exterior: string; colonia: string; referencias: string | null };
type FilaCliente = {
  id: string;
  nombre: string;
  apellido_paterno: string | null;
  telefono: string | null;
  direcciones: FilaDir[] | null;
};

function mapDir(d: FilaDir): DireccionCliente {
  return {
    id: d.id,
    etiqueta: d.etiqueta || "Principal",
    preview: `${d.calle} ${d.numero_exterior}, ${d.colonia}`,
    referencias: d.referencias ?? null,
  };
}

function armar(c: FilaCliente): ClienteDomicilio {
  const dirs = (c.direcciones ?? []).map(mapDir);
  const d0 = dirs[0];
  return {
    clienteId: c.id,
    nombre: [c.nombre, c.apellido_paterno].filter(Boolean).join(" ").trim(),
    telefono: c.telefono,
    direccionId: d0?.id ?? null,
    direccionPreview: d0 ? `${d0.etiqueta} · ${d0.preview}` : null,
    direcciones: dirs,
  };
}

/** Marca una dirección concreta como la elegida para el pedido. */
export function conDireccion(c: ClienteDomicilio, dir: DireccionCliente): ClienteDomicilio {
  return { ...c, direccionId: dir.id, direccionPreview: `${dir.etiqueta} · ${dir.preview}` };
}

/** Busca clientes del tenant por teléfono o nombre (mínimo 2 caracteres), con TODAS sus direcciones. */
export async function buscarClientesDomicilio(token: string, q: string): Promise<ClienteDomicilio[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const sb = employeeClient(token);
  const esc = term.replace(/[%,()]/g, " ");
  const { data, error } = await sb
    .from("clientes")
    .select("id, nombre, apellido_paterno, telefono, direcciones:direcciones_cliente(id, etiqueta, calle, numero_exterior, colonia, referencias)")
    .or(`telefono.ilike.%${esc}%,nombre.ilike.%${esc}%`)
    .is("deleted_at", null)
    .limit(8);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaCliente[]).map(armar);
}

export type DireccionInput = {
  etiqueta: string;
  calle: string;
  numero: string;
  colonia: string;
  referencias: string;
};

/** Inserta una dirección para un cliente (defaults CP/ciudad/estado de la sucursal). */
export async function agregarDireccionCliente(
  token: string,
  args: { clienteId: string; tenantId: string; sucursalId: string; dir: DireccionInput },
): Promise<DireccionCliente> {
  const sb = employeeClient(token);
  const { data: suc } = await sb.from("sucursales").select("ciudad, estado_geo, codigo_postal").eq("id", args.sucursalId).maybeSingle();
  const s = (suc ?? {}) as { ciudad?: string | null; estado_geo?: string | null; codigo_postal?: string | null };
  const numero = args.dir.numero.trim() || "S/N";
  const etiqueta = args.dir.etiqueta.trim() || "Principal";

  const { data, error } = await sb
    .from("direcciones_cliente")
    .insert({
      tenant_id: args.tenantId,
      cliente_id: args.clienteId,
      etiqueta,
      calle: args.dir.calle.trim(),
      numero_exterior: numero,
      colonia: args.dir.colonia.trim(),
      codigo_postal: s.codigo_postal || "00000",
      ciudad: s.ciudad || "—",
      estado_geo: s.estado_geo || "—",
      referencias: args.dir.referencias.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: (data as { id: string }).id,
    etiqueta,
    preview: `${args.dir.calle.trim()} ${numero}, ${args.dir.colonia.trim()}`,
    referencias: args.dir.referencias.trim() || null,
  };
}

/** Registra un cliente nuevo + su primera dirección. Devuelve el cliente listo para asociar. */
export async function registrarClienteDomicilio(
  token: string,
  input: { nombre: string; telefono: string; tenantId: string; sucursalId: string; dir: DireccionInput },
): Promise<ClienteDomicilio> {
  const sb = employeeClient(token);
  const { data: cli, error: e1 } = await sb
    .from("clientes")
    .insert({ tenant_id: input.tenantId, nombre: input.nombre.trim(), telefono: input.telefono.trim() || null })
    .select("id")
    .single();
  if (e1) throw new Error(e1.message);
  const clienteId = (cli as { id: string }).id;

  const dir = await agregarDireccionCliente(token, { clienteId, tenantId: input.tenantId, sucursalId: input.sucursalId, dir: input.dir });

  return {
    clienteId,
    nombre: input.nombre.trim(),
    telefono: input.telefono.trim() || null,
    direccionId: dir.id,
    direccionPreview: `${dir.etiqueta} · ${dir.preview}`,
    direcciones: [dir],
  };
}
