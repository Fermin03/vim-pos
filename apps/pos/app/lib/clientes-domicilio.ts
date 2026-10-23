"use client";
import { employeeClient } from "./supabase";
import type { ZonaEnvio } from "./zonas-envio";
import type { Colonia } from "./colonias";
import { normalizarTelefono } from "./telefono";

// CRM ligero para domicilios desde el POS. Busca por teléfono/nombre y registra
// cliente + direcciones (un cliente puede tener varias: Casa, Oficina, etc.).
// CP/ciudad/estado por defecto de la sucursal. RLS por tenant.

export type DireccionCliente = {
  id: string;
  etiqueta: string;
  preview: string;
  /** Calle y número por separado: los pide el formulario al editar la dirección. */
  calle: string;
  numero: string;
  colonia: string;
  referencias: string | null;
  /**
   * Zona de reparto de esta dirección, completa (no solo el id): el ticket lateral necesita
   * nombre y costo para pintar el renglón de envío antes de cobrar. null = todavía no se le
   * asignó (direcciones de antes de esta entrega, o el negocio no tiene zonas).
   */
  zona: ZonaEnvio | null;
};

export type ClienteDomicilio = {
  clienteId: string;
  nombre: string;
  telefono: string | null;
  /** Dirección elegida para ESTE pedido. */
  direccionId: string | null;
  direccionPreview: string | null;
  /** Zona de la dirección elegida para ESTE pedido (ver `DireccionCliente.zona`). */
  zona: ZonaEnvio | null;
  /** Todas las direcciones del cliente (Casa, Oficina, …). */
  direcciones: DireccionCliente[];
};

export const ETIQUETAS_DIRECCION = ["Casa", "Oficina", "Otra"] as const;

type FilaZonaEmbed = { id: string; nombre: string; costo_mxn: number } | null;
type FilaDir = {
  id: string; etiqueta: string | null; calle: string; numero_exterior: string; colonia: string; referencias: string | null;
  zona: FilaZonaEmbed;
};
type FilaCliente = {
  id: string;
  nombre: string;
  apellido_paterno: string | null;
  telefono: string | null;
  direcciones: FilaDir[] | null;
};

function mapZonaEmbed(z: FilaZonaEmbed): ZonaEnvio | null {
  return z ? { id: z.id, nombre: z.nombre, costoMxn: Number(z.costo_mxn) } : null;
}

function mapDir(d: FilaDir): DireccionCliente {
  return {
    id: d.id,
    etiqueta: d.etiqueta || "Principal",
    preview: `${d.calle} ${d.numero_exterior}, ${d.colonia}`,
    calle: d.calle,
    numero: d.numero_exterior,
    colonia: d.colonia,
    referencias: d.referencias ?? null,
    zona: mapZonaEmbed(d.zona),
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
    zona: d0?.zona ?? null,
    direcciones: dirs,
  };
}

/** Marca una dirección concreta como la elegida para el pedido. */
export function conDireccion(c: ClienteDomicilio, dir: DireccionCliente): ClienteDomicilio {
  return { ...c, direccionId: dir.id, direccionPreview: `${dir.etiqueta} · ${dir.preview}`, zona: dir.zona };
}

/**
 * Filtro `.or()` de la búsqueda de domicilio. Busca el texto tal cual (hay teléfonos viejos guardados
 * con espacios) y, si el texto trae un número con formato, también solo sus dígitos (así se guardan
 * desde la lealtad). Pura, con pruebas.
 */
export function filtroBusquedaDomicilio(q: string): string {
  const esc = q.trim().replace(/[%,()]/g, " ");
  const partes = [`telefono.ilike.%${esc}%`, `nombre.ilike.%${esc}%`];
  const digitos = normalizarTelefono(q);
  if (digitos.length >= 2 && digitos !== esc) partes.push(`telefono.ilike.%${digitos}%`);
  return partes.join(",");
}

const SELECT_CLIENTE = "id, nombre, apellido_paterno, telefono, direcciones:direcciones_cliente(id, etiqueta, calle, numero_exterior, colonia, referencias, zona:zonas_envio(id, nombre, costo_mxn))";

/** Busca clientes del tenant por teléfono o nombre (mínimo 2 caracteres), con TODAS sus direcciones. */
export async function buscarClientesDomicilio(token: string, q: string): Promise<ClienteDomicilio[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const sb = employeeClient(token);
  const { data, error } = await sb
    .from("clientes")
    .select(SELECT_CLIENTE)
    .or(filtroBusquedaDomicilio(term))
    .is("deleted_at", null)
    .limit(8);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaCliente[]).map(armar);
}

/** Un cliente con todas sus direcciones: el del pedido, cuando se abre el modal para cambiar su entrega. */
export async function leerClienteDomicilio(token: string, clienteId: string): Promise<ClienteDomicilio | null> {
  const { data, error } = await employeeClient(token).from("clientes").select(SELECT_CLIENTE).eq("id", clienteId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? armar(data as unknown as FilaCliente) : null;
}

export type DireccionInput = {
  etiqueta: string;
  calle: string;
  numero: string;
  colonia: string;
  referencias: string;
  /** Zona elegida en el formulario (objeto completo: se guarda tal cual en la dirección nueva). */
  zona: ZonaEnvio | null;
  /** La colonia elegida de las sugerencias (null = escrita a mano o sin catálogo). */
  coloniaCatalogo: Colonia | null;
  /** CP de la colonia elegida; null = el de la sucursal. */
  codigoPostal: string | null;
  /** Casilla «Guardar esta zona para la colonia» (cambiar una zona ya asignada pide PIN). */
  guardarZonaEnColonia: boolean;
  /** Escrita a mano y con homónimas en el catálogo: no se sabe cuál es, así que no se da de alta otra. */
  coloniaAmbigua?: boolean;
};

/** Qué hacerle al catálogo al guardar el domicilio. Pura, con pruebas. */
export function planColonia(dir: DireccionInput, hayCatalogo: boolean):
  { tipo: "nada" } | { tipo: "crear" } | { tipo: "asignar"; coloniaId: string } | { tipo: "cambiar"; coloniaId: string } {
  if (!hayCatalogo || !dir.colonia.trim()) return { tipo: "nada" };
  const c = dir.coloniaCatalogo;
  if (!c) return dir.coloniaAmbigua ? { tipo: "nada" } : { tipo: "crear" };
  if (!dir.zona) return { tipo: "nada" };
  if (!c.zona) return { tipo: "asignar", coloniaId: c.id };
  if (dir.zona.id !== c.zona.id && dir.guardarZonaEnColonia) return { tipo: "cambiar", coloniaId: c.id };
  return { tipo: "nada" };
}

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
      codigo_postal: args.dir.codigoPostal || s.codigo_postal || "00000",
      ciudad: s.ciudad || "—",
      estado_geo: s.estado_geo || "—",
      referencias: args.dir.referencias.trim() || null,
      zona_envio_id: args.dir.zona?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: (data as { id: string }).id,
    etiqueta,
    preview: `${args.dir.calle.trim()} ${numero}, ${args.dir.colonia.trim()}`,
    calle: args.dir.calle.trim(),
    numero,
    colonia: args.dir.colonia.trim(),
    referencias: args.dir.referencias.trim() || null,
    zona: args.dir.zona ?? null,
  };
}

/**
 * Corrige una dirección guardada. Cambia la del cliente, no solo la de este pedido: así sirve para
 * los siguientes. Un pedido ya cobrado que la use la mostrará corregida si se reimprime (el ticket
 * guarda qué dirección es, no una copia).
 */
export async function editarDireccionCliente(token: string, d: DireccionCliente, dir: DireccionInput): Promise<DireccionCliente> {
  const numero = dir.numero.trim() || "S/N";
  const etiqueta = dir.etiqueta.trim() || "Principal";
  const { error } = await employeeClient(token)
    .from("direcciones_cliente")
    .update({
      etiqueta,
      calle: dir.calle.trim(),
      numero_exterior: numero,
      colonia: dir.colonia.trim(),
      referencias: dir.referencias.trim() || null,
      zona_envio_id: dir.zona?.id ?? null,
      // Sin colonia del catálogo el CP se queda como estaba.
      ...(dir.codigoPostal ? { codigo_postal: dir.codigoPostal } : {}),
    })
    .eq("id", d.id);
  if (error) throw new Error(error.message);
  return {
    ...d,
    etiqueta,
    preview: `${dir.calle.trim()} ${numero}, ${dir.colonia.trim()}`,
    calle: dir.calle.trim(),
    numero,
    colonia: dir.colonia.trim(),
    referencias: dir.referencias.trim() || null,
    zona: dir.zona ?? null,
  };
}

/** Cliente y dirección de un pedido a domicilio ya abierto; el envío sigue a la zona (RPC 0262). */
export async function cambiarEntregaTicket(token: string, ticketId: string, clienteId: string, direccionId: string): Promise<void> {
  const { error } = await employeeClient(token).rpc("cambiar_entrega_ticket", {
    p_ticket_id: ticketId,
    p_cliente_id: clienteId,
    p_direccion_id: direccionId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Asigna la zona a una dirección ya guardada. Caso: se elige un cliente para un pedido y su
 * dirección no traía zona (de antes de esta entrega) pero el negocio sí tiene zonas activas —
 * el modal pide la zona antes de continuar y la deja registrada para la próxima vez.
 */
export async function fijarZonaDireccion(token: string, direccionId: string, zonaId: string): Promise<void> {
  const { error } = await employeeClient(token)
    .from("direcciones_cliente")
    .update({ zona_envio_id: zonaId })
    .eq("id", direccionId);
  if (error) throw new Error(error.message);
}

/** Registra un cliente nuevo + su primera dirección. Devuelve el cliente listo para asociar. */
export async function registrarClienteDomicilio(
  token: string,
  input: { nombre: string; telefono: string; tenantId: string; sucursalId: string; dir: DireccionInput },
): Promise<ClienteDomicilio> {
  const sb = employeeClient(token);
  // Solo dígitos, igual que clientes-cuenta.ts: la lealtad identifica al cliente por su teléfono y lo
  // compara por dígitos. El mismo número escrito de dos formas serían dos clientes con dos saldos.
  const telefono = normalizarTelefono(input.telefono) || null;
  if (telefono) {
    const { data: previo, error: e0 } = await sb
      .from("clientes")
      .select("id, nombre, apellido_paterno")
      .eq("telefono", telefono)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (e0) throw new Error(e0.message);
    if (previo) {
      const p = previo as { nombre: string; apellido_paterno: string | null };
      const quien = [p.nombre, p.apellido_paterno].filter(Boolean).join(" ").trim();
      throw new Error(`Ese teléfono ya es de ${quien}. Búscalo por su teléfono y elígelo de la lista.`);
    }
  }
  const { data: cli, error: e1 } = await sb
    .from("clientes")
    .insert({ tenant_id: input.tenantId, nombre: input.nombre.trim(), telefono })
    .select("id")
    .single();
  if (e1) throw new Error(e1.message);
  const clienteId = (cli as { id: string }).id;

  const dir = await agregarDireccionCliente(token, { clienteId, tenantId: input.tenantId, sucursalId: input.sucursalId, dir: input.dir });

  return {
    clienteId,
    nombre: input.nombre.trim(),
    telefono,
    direccionId: dir.id,
    direccionPreview: `${dir.etiqueta} · ${dir.preview}`,
    zona: dir.zona,
    direcciones: [dir],
  };
}
