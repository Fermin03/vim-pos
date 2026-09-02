"use client";
// Pedidos que llegan de las apps de delivery (ADR 0011). Lectura bajo RLS (delivery_pedidos) y
// acciones vía la edge function delivery-accion: el POS nunca habla con Uber/DiDi/Rappi.
import { employeeClient } from "./supabase";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type PedidoAppEstado =
  | "RECIBIDO" | "ACEPTADO" | "RECHAZADO" | "EN_PREPARACION" | "LISTO" | "ENTREGADO" | "CANCELADO" | "EXPIRADO" | "ERROR";
export type AppPedido = "APP_UBEREATS" | "APP_DIDI" | "APP_RAPPI";

export type PedidoAppItem = {
  nombreApp: string; cantidad: number; precioUnitario: number; nota: string | null; mapeado: boolean;
  modificadores: { nombreApp: string; cantidad: number }[];
};
export type PedidoApp = {
  id: string; app: AppPedido; idExterno: string; folioCorto: string | null; estado: PedidoAppEstado;
  tipoEntrega: string | null; clienteNombre: string | null; notaCliente: string | null; items: PedidoAppItem[];
  totalCliente: number | null; venceAceptacion: string | null; recibidoAt: string; ticketId: string | null;
  ticketFolio: string | null; ultimoError: string | null;
};

const ACTIVOS: PedidoAppEstado[] = ["RECIBIDO", "ACEPTADO", "EN_PREPARACION", "LISTO", "ERROR"];

/** Activos de la sucursal + los cerrados de la última media hora (para que el cajero vea qué pasó). */
export async function leerPedidosApps(token: string, sucursalId: string): Promise<PedidoApp[]> {
  const desde = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data, error } = await employeeClient(token)
    .from("delivery_pedidos")
    .select("id, app, id_externo, folio_corto, estado, tipo_entrega, cliente_nombre, nota_cliente, items, total_cliente_mxn, vence_aceptacion, recibido_at, ticket_id, ultimo_error, ticket:tickets(folio_completo)")
    .eq("sucursal_id", sucursalId)
    .or(`estado.in.(${ACTIVOS.join(",")}),recibido_at.gte.${desde}`)
    .order("recibido_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    app: r.app as AppPedido,
    idExterno: String(r.id_externo),
    folioCorto: (r.folio_corto as string | null) ?? null,
    estado: r.estado as PedidoAppEstado,
    tipoEntrega: (r.tipo_entrega as string | null) ?? null,
    clienteNombre: (r.cliente_nombre as string | null) ?? null,
    notaCliente: (r.nota_cliente as string | null) ?? null,
    items: itemsDesdeJson(r.items),
    totalCliente: r.total_cliente_mxn == null ? null : Number(r.total_cliente_mxn),
    venceAceptacion: (r.vence_aceptacion as string | null) ?? null,
    recibidoAt: String(r.recibido_at),
    ticketId: (r.ticket_id as string | null) ?? null,
    ticketFolio: ((r.ticket as { folio_completo?: string } | null)?.folio_completo) ?? null,
    ultimoError: (r.ultimo_error as string | null) ?? null,
  }));
}

function itemsDesdeJson(v: unknown): PedidoAppItem[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => {
    const it = (x ?? {}) as Record<string, unknown>;
    const mods = Array.isArray(it.modificadores) ? (it.modificadores as Record<string, unknown>[]) : [];
    return {
      nombreApp: String(it.nombre_app ?? ""),
      cantidad: Number(it.cantidad ?? 1),
      precioUnitario: Number(it.precio_unitario_mxn ?? 0),
      nota: (it.nota as string | null) ?? null,
      mapeado: typeof it.producto_id === "string" && it.producto_id.length > 0,
      modificadores: mods.map((m) => ({ nombreApp: String(m.nombre_app ?? ""), cantidad: Number(m.cantidad ?? 1) })),
    };
  });
}

export async function accionPedidoApp(
  token: string,
  args: { pedidoId: string; accion: "aceptar" | "rechazar" | "listo"; motivo?: string; detalle?: string; tiempoPrepMin?: number },
): Promise<{ ok: true; ticketId?: string } | { ok: false; error: string; detalle?: string }> {
  try {
    const r = await fetch(`${URL}/functions/v1/delivery-accion`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        pedido_id: args.pedidoId, accion: args.accion, motivo: args.motivo, detalle: args.detalle, tiempo_prep_min: args.tiempoPrepMin,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; ticket_id?: string; error?: string; detalle?: string };
    if (r.ok && j.ok) return { ok: true, ticketId: j.ticket_id };
    return { ok: false, error: j.error ?? `HTTP_${r.status}`, detalle: j.detalle };
  } catch (e) {
    return { ok: false, error: "SIN_RED", detalle: e instanceof Error ? e.message : String(e) };
  }
}

export function segundosRestantes(venceAceptacion: string | null, ahora: Date): number | null {
  if (!venceAceptacion) return null;
  return Math.max(0, Math.round((new Date(venceAceptacion).getTime() - ahora.getTime()) / 1000));
}

export function etiquetaApp(app: AppPedido): string {
  return { APP_UBEREATS: "Uber Eats", APP_DIDI: "DiDi Food", APP_RAPPI: "Rappi" }[app];
}

const ETIQUETA_ESTADO: Record<PedidoAppEstado, string> = {
  RECIBIDO: "Por aceptar", ACEPTADO: "En preparación", EN_PREPARACION: "En preparación", LISTO: "Listo",
  ENTREGADO: "Entregado", RECHAZADO: "Rechazado", CANCELADO: "Cancelado por la app", EXPIRADO: "Expirado", ERROR: "Con error",
};
export function etiquetaEstado(estado: PedidoAppEstado): string {
  return ETIQUETA_ESTADO[estado] ?? estado;
}

const PRIORIDAD: Record<PedidoAppEstado, number> = {
  RECIBIDO: 0, ERROR: 0, ACEPTADO: 1, EN_PREPARACION: 1, LISTO: 2, ENTREGADO: 3, RECHAZADO: 3, CANCELADO: 3, EXPIRADO: 3,
};
/** Pendientes con menos tiempo primero, luego en preparación, luego listos, luego cerrados (más recientes arriba). */
export function ordenarPedidos(pedidos: PedidoApp[]): PedidoApp[] {
  return [...pedidos].sort((a, b) => {
    const pa = PRIORIDAD[a.estado], pb = PRIORIDAD[b.estado];
    if (pa !== pb) return pa - pb;
    if (pa === 0) return (a.venceAceptacion ?? "").localeCompare(b.venceAceptacion ?? "");
    return b.recibidoAt.localeCompare(a.recibidoAt);
  });
}

export function idsNuevos(antes: PedidoApp[], ahora: PedidoApp[]): string[] {
  const vistos = new Set(antes.map((p) => p.id));
  return ahora.filter((p) => !vistos.has(p.id)).map((p) => p.id);
}
