"use client";
// El libro de la lealtad visto desde el admin (spec §7, pestaña Movimientos): cuatro cifras, los
// movimientos con nombres y la vista de control. Y el ajuste manual de un saldo, que usa Clientes.
// Todo es lectura bajo RLS; el ajuste va por `lealtad_ajustar_saldo` (0156), que lo deja en el libro
// con quién lo hizo y por qué.
import { z } from "zod";
import { supabase } from "./supabase";
import { mensajeLealtad } from "./lealtad";

export type TipoMov = "GANADO" | "CANJE" | "REVERSA_GANADO" | "REVERSA_CANJE" | "AJUSTE" | "VENCIMIENTO";

const ETIQUETAS: Record<string, string> = {
  GANADO: "Ganó",
  CANJE: "Canjeó",
  REVERSA_GANADO: "Se le quitó lo ganado",
  REVERSA_CANJE: "Canje devuelto",
  AJUSTE: "Ajuste",
  VENCIMIENTO: "Venció",
};
export const TIPOS: TipoMov[] = ["GANADO", "CANJE", "REVERSA_GANADO", "REVERSA_CANJE", "AJUSTE", "VENCIMIENTO"];
export function etiquetaTipo(t: string): string {
  return ETIQUETAS[t] ?? t;
}

// ── Fechas: el negocio vive en hora de México (UTC−6 fijo, sin horario de verano) ──────────────

export function hoyMexico(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
}

function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Los últimos 30 días, contando hoy. */
export function rangoPorDefecto(ahora: Date = new Date()): { desde: string; hasta: string } {
  const hasta = hoyMexico(ahora);
  return { desde: sumarDias(hasta, -29), hasta };
}

/** Por qué no se puede consultar ese rango, o null si sí (regla de admin.md: se dice por qué). */
export function errorDeRango(desde: string, hasta: string, hoy: string): string | null {
  if (!desde || !hasta) return "Elige las dos fechas.";
  if (desde > hasta) return "El inicio no puede ser posterior al fin.";
  if (hasta > hoy) return "No se puede consultar el futuro.";
  return null;
}

// ── El libro ─────────────────────────────────────────────────────────────────

export type MovimientoLibro = {
  id: string;
  fecha: string;
  tipo: string;
  /** Con signo: positivo suma, negativo resta. */
  puntos: number;
  /** El saldo tal como quedó donde se escribió el movimiento. */
  saldoVisto: number | null;
  motivo: string | null;
  cliente: string;
  telefono: string | null;
  sucursal: string | null;
  usuario: string | null;
  folio: string | null;
};

export const MOVS_POR_PAGINA = 50;
const COLUMNAS = "id, fecha, tipo, puntos, saldo_visto, motivo, cliente_nombre, cliente_telefono, sucursal_nombre, usuario_nombre, ticket_folio";

function aMovimiento(f: Record<string, unknown>): MovimientoLibro {
  const texto = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
  return {
    id: String(f.id),
    fecha: String(f.fecha),
    tipo: String(f.tipo),
    puntos: Number(f.puntos) || 0,
    saldoVisto: f.saldo_visto == null ? null : Number(f.saldo_visto),
    motivo: texto(f.motivo),
    cliente: texto(f.cliente_nombre) ?? "Sin nombre",
    telefono: texto(f.cliente_telefono),
    sucursal: texto(f.sucursal_nombre),
    usuario: texto(f.usuario_nombre),
    folio: texto(f.ticket_folio),
  };
}

export async function listarMovimientos(a: {
  desde: string; hasta: string; sucursalId: string | null; tipo: TipoMov | "TODOS"; busqueda: string; pagina: number;
}): Promise<{ filas: MovimientoLibro[]; total: number }> {
  let q = supabase
    .from("vw_lealtad_movimientos")
    .select(COLUMNAS, { count: "exact" })
    // El día completo en México: desde su medianoche hasta la medianoche del día siguiente.
    .gte("fecha", `${a.desde}T00:00:00-06:00`)
    .lt("fecha", `${sumarDias(a.hasta, 1)}T00:00:00-06:00`);
  if (a.sucursalId) q = q.eq("sucursal_id", a.sucursalId);
  if (a.tipo !== "TODOS") q = q.eq("tipo", a.tipo);
  const texto = a.busqueda.trim().replace(/[%,()]+/g, " ");
  if (texto.trim()) {
    const digitos = a.busqueda.replace(/\D/g, "");
    const partes = [`cliente_nombre.ilike.%${texto}%`];
    if (digitos.length >= 3) partes.push(`cliente_telefono.ilike.%${digitos}%`);
    q = q.or(partes.join(","));
  }
  const desde = (Math.max(1, a.pagina) - 1) * MOVS_POR_PAGINA;
  const { data, error, count } = await q
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .range(desde, desde + MOVS_POR_PAGINA - 1);
  if (error) throw new Error(mensajeLealtad(error, "No se pudieron leer los movimientos"));
  return { filas: ((data ?? []) as Record<string, unknown>[]).map(aMovimiento), total: count ?? 0 };
}

/** Los últimos 30 movimientos de un cliente, del más reciente al más viejo. */
export async function historialCliente(clienteId: string): Promise<MovimientoLibro[]> {
  const { data, error } = await supabase
    .from("vw_lealtad_movimientos")
    .select(COLUMNAS)
    .eq("cliente_id", clienteId)
    .order("fecha", { ascending: false })
    .limit(30);
  if (error) throw new Error(mensajeLealtad(error, "No se pudo leer el historial"));
  return ((data ?? []) as Record<string, unknown>[]).map(aMovimiento);
}

// ── Cifras y control ─────────────────────────────────────────────────────────

export type ResumenLealtad = { emitido: number; canjeado: number; saldoVivo: number; clientesConSaldo: number };

export async function leerResumen(desde: string, hasta: string, sucursalId: string | null): Promise<ResumenLealtad> {
  const { data, error } = await supabase.rpc("lealtad_resumen", { p_desde: desde, p_hasta: hasta, p_sucursal: sucursalId });
  if (error) throw new Error(mensajeLealtad(error, "No se pudieron leer las cifras"));
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    emitido: Number(r.emitido) || 0,
    canjeado: Number(r.canjeado) || 0,
    saldoVivo: Number(r.saldo_vivo) || 0,
    clientesConSaldo: Number(r.clientes_con_saldo) || 0,
  };
}

export type ControlLealtad = {
  /** Clientes que llegaron al tope de compras del día dos días o más. */
  clientesAlTope: { clienteId: string; nombre: string; diasAlTope: number }[];
  /** Cajeros con tres canjes o más, del más concentrado en un solo cliente al menos. */
  cajeros: { usuarioId: string; nombre: string; canjes: number; clientes: number; puntos: number; delClienteTop: number }[];
};

export async function leerControl(desde: string, hasta: string): Promise<ControlLealtad> {
  const { data, error } = await supabase.rpc("lealtad_control", { p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(mensajeLealtad(error, "No se pudo leer la vista de control"));
  const r = (data ?? {}) as { clientes_al_tope?: Record<string, unknown>[]; cajeros?: Record<string, unknown>[] };
  return {
    clientesAlTope: (r.clientes_al_tope ?? []).map((c) => ({
      clienteId: String(c.cliente_id), nombre: String(c.cliente_nombre || "Sin nombre"), diasAlTope: Number(c.dias_al_tope) || 0,
    })),
    cajeros: (r.cajeros ?? []).map((c) => ({
      usuarioId: String(c.usuario_id), nombre: String(c.usuario_nombre || "Sin nombre"),
      canjes: Number(c.canjes) || 0, clientes: Number(c.clientes) || 0, puntos: Number(c.puntos) || 0, delClienteTop: Number(c.del_cliente_top) || 0,
    })),
  };
}

// ── Ajuste manual ─────────────────────────────────────────────────────────────

export const ajusteSchema = z.object({
  puntos: z.string().trim().regex(/^-?\d+$/, "Escribe un número entero. Con signo menos para quitar.")
    .refine((s) => Number(s) !== 0, "El ajuste no puede ser cero.")
    .refine((s) => Math.abs(Number(s)) <= 100000, "Un ajuste no puede pasar de 100,000."),
  motivo: z.string().trim().min(3, "Escribe el motivo: queda guardado con tu nombre.").max(200),
});

/** Suma o resta a mano. Devuelve el saldo nuevo. Queda en el libro con quién lo hizo y el motivo. */
export async function ajustarSaldo(clienteId: string, puntos: number, motivo: string): Promise<number> {
  const { data, error } = await supabase.rpc("lealtad_ajustar_saldo", { p_cliente_id: clienteId, p_puntos: puntos, p_motivo: motivo.trim() });
  if (error) throw new Error(mensajeLealtad(error, "No se pudo ajustar el saldo"));
  return Number(data ?? 0);
}
