"use client";
import { employeeClient } from "./supabase";

// CRM ligero para domicilios desde el POS. Busca por teléfono/nombre y registra
// cliente + dirección (CP/ciudad/estado por defecto de la sucursal). RLS por tenant.

export type ClienteDomicilio = {
  clienteId: string;
  nombre: string;
  telefono: string | null;
  direccionId: string | null;
  direccionPreview: string | null;
};

type FilaCliente = {
  id: string;
  nombre: string;
  apellido_paterno: string | null;
  telefono: string | null;
  direcciones: { id: string; calle: string; numero_exterior: string; colonia: string }[] | null;
};

function armar(c: FilaCliente): ClienteDomicilio {
  const d = (c.direcciones ?? [])[0];
  return {
    clienteId: c.id,
    nombre: [c.nombre, c.apellido_paterno].filter(Boolean).join(" ").trim(),
    telefono: c.telefono,
    direccionId: d?.id ?? null,
    direccionPreview: d ? `${d.calle} ${d.numero_exterior}, ${d.colonia}` : null,
  };
}

/** Busca clientes del tenant por teléfono o nombre (mínimo 2 caracteres). */
export async function buscarClientesDomicilio(token: string, q: string): Promise<ClienteDomicilio[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const sb = employeeClient(token);
  const esc = term.replace(/[%,()]/g, " ");
  const { data, error } = await sb
    .from("clientes")
    .select("id, nombre, apellido_paterno, telefono, direcciones:direcciones_cliente(id, calle, numero_exterior, colonia)")
    .or(`telefono.ilike.%${esc}%,nombre.ilike.%${esc}%`)
    .is("deleted_at", null)
    .limit(8);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaCliente[]).map(armar);
}

/** Registra un cliente nuevo + su dirección principal. Devuelve el cliente listo para asociar. */
export async function registrarClienteDomicilio(
  token: string,
  input: { nombre: string; telefono: string; calle: string; numero: string; colonia: string; referencias: string; tenantId: string; sucursalId: string },
): Promise<ClienteDomicilio> {
  const sb = employeeClient(token);
  const { data: suc } = await sb.from("sucursales").select("ciudad, estado_geo, codigo_postal").eq("id", input.sucursalId).maybeSingle();
  const s = (suc ?? {}) as { ciudad?: string | null; estado_geo?: string | null; codigo_postal?: string | null };

  const { data: cli, error: e1 } = await sb
    .from("clientes")
    .insert({ tenant_id: input.tenantId, nombre: input.nombre.trim(), telefono: input.telefono.trim() || null })
    .select("id")
    .single();
  if (e1) throw new Error(e1.message);
  const clienteId = (cli as { id: string }).id;

  const numero = input.numero.trim() || "S/N";
  const { data: dir, error: e2 } = await sb
    .from("direcciones_cliente")
    .insert({
      tenant_id: input.tenantId,
      cliente_id: clienteId,
      etiqueta: "Principal",
      calle: input.calle.trim(),
      numero_exterior: numero,
      colonia: input.colonia.trim(),
      codigo_postal: s.codigo_postal || "00000",
      ciudad: s.ciudad || "—",
      estado_geo: s.estado_geo || "—",
      referencias: input.referencias.trim() || null,
    })
    .select("id")
    .single();
  if (e2) throw new Error(e2.message);

  return {
    clienteId,
    nombre: input.nombre.trim(),
    telefono: input.telefono.trim() || null,
    direccionId: (dir as { id: string }).id,
    direccionPreview: `${input.calle.trim()} ${numero}, ${input.colonia.trim()}`,
  };
}
