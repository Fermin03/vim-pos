"use client";
import { employeeClient } from "./supabase";
import { agregarDireccionCliente, type DireccionInput } from "./clientes-domicilio";

// Cliente registrado de una cuenta de Comedor, Para llevar o Pick-up. Es opcional: una cuenta sin
// cliente se vende igual que siempre. Sirve para que las compras le cuenten al cliente (panel de
// clientes y, más adelante, lealtad). Domicilio no pasa por aquí: tiene su propio flujo con
// dirección (clientes-domicilio.ts). RLS por tenant.

export type ClienteCuenta = {
  clienteId: string;
  nombre: string;
  telefono: string | null;
  /** Un cliente bloqueado desde el panel aparece en la búsqueda, pero no se puede asignar. */
  bloqueado?: boolean;
};

export type DatosRegistro = {
  nombre: string;
  apellido: string;
  telefono: string;
  email: string;
  /** Alergias o preferencias; van a `clientes.notas_internas`. */
  notas: string;
};

/**
 * El mismo teléfono escrito de dos formas ("477 123 4567" y "4771234567") no debe dar dos clientes:
 * el índice único es por texto exacto. Se guarda solo con dígitos.
 */
export function normalizarTelefono(t: string): string {
  return t.replace(/\D/g, "");
}

/** Nombre y teléfono obligatorios (10 dígitos); correo opcional pero válido. `null` si está bien. */
export function validarRegistro(d: DatosRegistro): string | null {
  if (!d.nombre.trim()) return "El nombre es obligatorio.";
  const tel = normalizarTelefono(d.telefono);
  if (!tel) return "El teléfono es obligatorio.";
  if (tel.length < 10) return "El teléfono debe tener 10 dígitos.";
  if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) return "El correo no es válido.";
  return null;
}

/** El teléfono ya es de otro cliente. Trae a ese cliente para ofrecer asignarlo en vez de duplicarlo. */
export class TelefonoDuplicado extends Error {
  constructor(public cliente: ClienteCuenta) {
    super(`Ese teléfono ya es de ${cliente.nombre}.`);
    this.name = "TelefonoDuplicado";
  }
}

type FilaCliente = { id: string; nombre: string; apellido_paterno: string | null; telefono: string | null; estado?: string | null };

function aCliente(c: FilaCliente): ClienteCuenta {
  return {
    clienteId: c.id,
    nombre: [c.nombre, c.apellido_paterno].filter(Boolean).join(" ").trim(),
    telefono: c.telefono,
    ...(c.estado === "BLOQUEADO" ? { bloqueado: true } : {}),
  };
}

/**
 * Filtro `.or()` de la búsqueda. Cada palabra tiene que aparecer en `nombre_completo_busqueda`
 * (nombre + apellidos en minúsculas y sin acentos; columna generada de la tabla): así "ana pru" y
 * "prueba ana" encuentran a Ana Prueba aunque nombre y apellido vivan en columnas distintas. Si el
 * término trae dígitos, también busca por teléfono (se guarda solo con dígitos).
 *
 * Coma, paréntesis, punto, `%`, `*` y `\` se quitan: dentro de `.or()` partirían el filtro.
 */
export function filtroBusquedaCliente(q: string): string | null {
  const palabras = q
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[%,().*\\]/g, " ")
    .split(/\s+/).filter(Boolean);
  const porNombre = palabras.map((w) => `nombre_completo_busqueda.ilike.%${w}%`);
  const condiciones: string[] = [];
  if (porNombre.length === 1) condiciones.push(...porNombre);
  else if (porNombre.length > 1) condiciones.push(`and(${porNombre.join(",")})`);
  const digitos = normalizarTelefono(q);
  if (digitos.length >= 2) condiciones.push(`telefono.ilike.%${digitos}%`);
  return condiciones.length ? condiciones.join(",") : null;
}

/** Busca por nombre completo o teléfono (mínimo 2 caracteres). Ver `filtroBusquedaCliente`. */
export async function buscarClientesCuenta(token: string, q: string): Promise<ClienteCuenta[]> {
  if (q.trim().length < 2) return [];
  const filtro = filtroBusquedaCliente(q);
  if (!filtro) return [];
  const { data, error } = await employeeClient(token)
    .from("clientes")
    .select("id, nombre, apellido_paterno, telefono, estado")
    .or(filtro)
    .is("deleted_at", null)
    .order("nombre", { ascending: true })
    .limit(8);
  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaCliente[]).map(aCliente);
}

/**
 * Registra un cliente nuevo (y, si se capturó, su domicilio) y lo devuelve listo para asignar.
 *
 * Antes de insertar se busca el teléfono: si ya es de alguien, lanza `TelefonoDuplicado` con ese
 * cliente. Sin esto, el índice único rechazaría el alta con un error técnico y el cajero no sabría
 * que el cliente ya existía.
 */
export async function registrarClienteCuenta(
  token: string,
  input: DatosRegistro & { tenantId: string; sucursalId: string; dir: DireccionInput | null },
): Promise<ClienteCuenta> {
  const sb = employeeClient(token);
  const telefono = normalizarTelefono(input.telefono);

  const { data: previo, error: e0 } = await sb
    .from("clientes")
    .select("id, nombre, apellido_paterno, telefono, estado")
    .eq("telefono", telefono)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (e0) throw new Error(e0.message);
  if (previo) throw new TelefonoDuplicado(aCliente(previo as FilaCliente));

  const { data, error } = await sb
    .from("clientes")
    .insert({
      tenant_id: input.tenantId,
      nombre: input.nombre.trim(),
      apellido_paterno: input.apellido.trim() || null,
      telefono,
      email: input.email.trim() || null,
      notas_internas: input.notas.trim() || null,
    })
    .select("id, nombre, apellido_paterno, telefono")
    .single();
  if (error) throw new Error(error.message);
  const cliente = aCliente(data as FilaCliente);

  if (input.dir) {
    await agregarDireccionCliente(token, { clienteId: cliente.clienteId, tenantId: input.tenantId, sucursalId: input.sucursalId, dir: input.dir });
  }
  return cliente;
}

/**
 * Pone (o quita, con `null`) el cliente de una cuenta que YA existe: comedor y pick-up la abren
 * desde el principio, y una cuenta retomada también. Solo cuentas sin cobrar: una venta pagada ya
 * subió así a la nube y no se reescribe desde la caja.
 */
export async function asignarClienteTicket(token: string, ticketId: string, clienteId: string | null): Promise<void> {
  const { data, error } = await employeeClient(token)
    .from("tickets")
    .update({ cliente_id: clienteId })
    .eq("id", ticketId)
    .in("estado_fiscal", ["BORRADOR", "ABIERTO"])
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Esta cuenta ya se cobró: su cliente ya no se puede cambiar.");
}
