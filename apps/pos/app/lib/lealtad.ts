"use client";
// Lealtad en el POS (ADR 0030): lo que LEE bajo RLS y lo que LLAMA. El POS no escribe el libro, ni
// los saldos, ni los canjes: eso lo hacen funciones de la base. Sus únicas escrituras directas son
// quitar el canje de una cuenta abierta y agregar el renglón de un premio.
//
// El canje va por la Edge Function `lealtad-canje`, igual desde el POS web que desde la caja: en la
// caja el gateway local la atiende y la reenvía a la nube (desktop/src/lealtad-puente.mjs).
import { employeeClient, encabezadosFuncion, urlFuncion } from "./supabase";
import { inicioDelDiaMexico, type Mecanica, type Premio, type Programa } from "./lealtad-reglas";

const num = (v: unknown): number => Number(v ?? 0);

/** El programa del negocio, o null si el dueño todavía no lo configura. */
export async function leerPrograma(token: string): Promise<Programa | null> {
  const { data, error } = await employeeClient(token)
    .from("lealtad_programa")
    .select("mecanica, version, porcentaje, pesos_por_punto, compra_minima_mxn, tope_compras_dia")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const p = data as {
    mecanica: Mecanica; version: number; porcentaje: string | number | null; pesos_por_punto: string | number | null;
    compra_minima_mxn: string | number; tope_compras_dia: number;
  };
  return {
    mecanica: p.mecanica,
    version: Number(p.version),
    porcentaje: p.porcentaje == null ? null : Number(p.porcentaje),
    pesosPorPunto: p.pesos_por_punto == null ? null : Number(p.pesos_por_punto),
    compraMinima: num(p.compra_minima_mxn),
    topeComprasDia: Number(p.tope_compras_dia),
  };
}

/** Premios activos con el nombre de su producto. Uno cuyo producto ya no existe no se ofrece. */
export async function leerPremios(token: string): Promise<Premio[]> {
  const { data, error } = await employeeClient(token)
    .from("lealtad_premios")
    .select("id, costo, producto:productos(id, nombre)")
    .eq("activo", true)
    .is("deleted_at", null)
    .order("costo", { ascending: true });
  if (error) throw new Error(error.message);
  type Fila = { id: string; costo: number; producto: { id: string; nombre: string } | { id: string; nombre: string }[] | null };
  return ((data ?? []) as unknown as Fila[]).flatMap((f) => {
    const prod = Array.isArray(f.producto) ? f.producto[0] : f.producto;
    return prod ? [{ id: f.id, productoId: prod.id, nombre: prod.nombre, costo: Number(f.costo) }] : [];
  });
}

export type ClienteLealtad = { clienteId: string; nombre: string; telefono: string | null };

export async function leerClienteLealtad(token: string, clienteId: string): Promise<ClienteLealtad | null> {
  const { data, error } = await employeeClient(token)
    .from("clientes")
    .select("id, nombre, apellido_paterno, telefono")
    .eq("id", clienteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const c = data as { id: string; nombre: string; apellido_paterno: string | null; telefono: string | null };
  return { clienteId: c.id, nombre: [c.nombre, c.apellido_paterno].filter(Boolean).join(" ").trim(), telefono: c.telefono };
}

export type SaldoCliente = { saldo: number; venceEl: string | null };

/**
 * El saldo que esta base conoce. En la caja es la copia que baja el pull más lo ganado aquí sin
 * subir: sirve para MOSTRAR, también sin internet. Para canjear manda el de la nube (consultarSaldo).
 */
export async function leerSaldoLocal(token: string, clienteId: string, version: number): Promise<SaldoCliente> {
  const { data, error } = await employeeClient(token)
    .from("lealtad_saldos")
    .select("saldo, vence_el, programa_version")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const s = data as { saldo: number; vence_el: string | null; programa_version: number } | null;
  // Un saldo de otra versión del programa ya no vale (el dueño cambió de mecánica).
  if (!s || Number(s.programa_version) !== version) return { saldo: 0, venceEl: null };
  return { saldo: Number(s.saldo), venceEl: s.vence_el };
}

/**
 * Cuántas cuentas de HOY ya le sumaron a este cliente en esta base, para anunciar el tope diario.
 * Aproxima la regla de `lealtad_acumular_por_ticket`: no descuenta las compras revertidas del día.
 * Solo decide un texto en pantalla; quien otorga o no los puntos es la base.
 */
export async function comprasQueSumanHoy(token: string, clienteId: string, ahora: Date = new Date()): Promise<number> {
  const { data, error } = await employeeClient(token)
    .from("lealtad_movimientos")
    .select("ticket_id")
    .eq("cliente_id", clienteId)
    .eq("tipo", "GANADO")
    .gte("fecha", inicioDelDiaMexico(ahora));
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { ticket_id: string | null }[]).map((m) => m.ticket_id).filter(Boolean)).size;
}

export type CanjeVivo = { id: string; puntos: number; monto: number; premioId: string | null; ticketItemId: string | null };

/** El canje vivo de una cuenta (solo cabe uno), o null. */
export async function leerCanjeDelTicket(token: string, ticketId: string): Promise<CanjeVivo | null> {
  const { data, error } = await employeeClient(token)
    .from("ticket_canjes_lealtad")
    .select("id, puntos, monto_descontado_mxn, premio_id, ticket_item_id")
    .eq("ticket_id", ticketId)
    .eq("revertido", false)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const c = data as { id: string; puntos: number; monto_descontado_mxn: string | number; premio_id: string | null; ticket_item_id: string | null };
  return { id: c.id, puntos: Number(c.puntos), monto: num(c.monto_descontado_mxn), premioId: c.premio_id, ticketItemId: c.ticket_item_id };
}

/** Quita el canje de una cuenta que sigue abierta: los puntos vuelven. Funciona sin internet. */
export async function quitarCanje(token: string, ticketId: string): Promise<number> {
  const { data, error } = await employeeClient(token).rpc("quitar_canje_lealtad", { p_ticket_id: ticketId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/**
 * El renglón de un premio: el producto, UNA pieza, sin modificadores (así lo exige
 * `lealtad_asentar_canje`). Devuelve el id del renglón, que es lo que se manda al asentar.
 * Repetirlo con el mismo `clientId` no agrega otro: `agregar_item_a_ticket` es idempotente por él.
 */
export async function agregarRenglonPremio(
  token: string,
  a: { ticketId: string; productoId: string; clientId: string },
): Promise<string> {
  const { data, error } = await employeeClient(token).rpc("agregar_item_a_ticket", {
    p_ticket_id: a.ticketId,
    p_producto_id: a.productoId,
    p_cantidad: 1,
    p_nota_cocina: "Premio de lealtad",
    p_modificadores: [],
    p_client_id_local: a.clientId,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

// ── Edge Function lealtad-canje ───────────────────────────────────────────────────────────────

export type RespuestaLealtad<T> = ({ ok: true } & T) | { ok: false; error: string; saldo?: number };

export type SaldoNube = { cliente_id: string; saldo: number; vence_el: string | null; mecanica: Mecanica; programa_version: number };
export type CanjeAutorizado = {
  canje_id: string; puntos: number; monto_mxn: number | null; premio_id: string | null; producto_id: string | null;
  saldo: number; repetido: boolean;
};

async function llamar<T>(token: string, cuerpo: Record<string, unknown>): Promise<RespuestaLealtad<T>> {
  let r: Response;
  try {
    r = await fetch(urlFuncion("lealtad-canje"), {
      method: "POST",
      headers: encabezadosFuncion(token),
      body: JSON.stringify(cuerpo),
      // La caja espera hasta 15 s a la nube (lealtad-puente.mjs); aquí un poco más, para no rendirse antes.
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, error: "SIN_RED" };
  }
  const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  if (r.ok && j?.ok === true) return j as unknown as { ok: true } & T;
  // Un 2xx sin `ok: true` no es un rechazo: no se sabe qué hizo la nube. Va como respuesta inválida
  // —ambigua, igual que en el puente de la caja— para que un canje no se dé por «no descontado».
  if (r.ok) return { ok: false, error: "RESPUESTA_INVALIDA" };
  const error = typeof j?.error === "string" ? j.error : `HTTP_${r.status}`;
  return { ok: false, error, ...(typeof j?.saldo === "number" ? { saldo: j.saldo } : {}) };
}

/** Solo viajan los campos que tienen valor: `validarCuerpo` rechaza un uuid vacío. */
function sinVacios(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ""));
}

/** El saldo de verdad, el de la nube. Es también la prueba de que hay conexión para canjear. */
export function consultarSaldo(token: string, c: { clienteId: string; telefono: string | null }): Promise<RespuestaLealtad<SaldoNube>> {
  return llamar<SaldoNube>(token, sinVacios({ accion: "saldo", cliente_id: c.clienteId, telefono: c.telefono }));
}

/** Paso 1: la nube descuenta. Repetir con el mismo `canjeId` devuelve lo mismo y no descuenta dos veces. */
export function canjear(
  token: string,
  a: { canjeId: string; ticketId: string; clienteId: string; telefono: string | null; puntos?: number; premioId?: string; sucursalId: string },
): Promise<RespuestaLealtad<CanjeAutorizado>> {
  return llamar<CanjeAutorizado>(token, sinVacios({
    accion: "canjear", canje_id: a.canjeId, ticket_id: a.ticketId, cliente_id: a.clienteId, telefono: a.telefono,
    puntos: a.puntos, premio_id: a.premioId, sucursal_id: a.sucursalId,
  }));
}

/** Paso 2: el canje autorizado se pega a la cuenta, en la base donde vive (la caja o la nube). */
export function asentar(
  token: string,
  a: { canjeId: string; ticketId: string; ticketItemId?: string | null },
): Promise<RespuestaLealtad<{ canje_id: string }>> {
  return llamar<{ canje_id: string }>(token, sinVacios({
    accion: "asentar", canje_id: a.canjeId, ticket_id: a.ticketId, ticket_item_id: a.ticketItemId,
  }));
}
