import { NextResponse } from "next/server";
import { hoyMx } from "@vim/fecha";
import { autorizar, auditar } from "../../../../lib/server";
import { motivoValido } from "../../../../lib/operadores";

/**
 * Pagos de la suscripción de un negocio (0130).
 *
 *   GET   — la lista, anulados incluidos (se ven tachados: un pago anulado también es historia).
 *   POST  — registrar un pago: monto, método, fecha, cuántos periodos cubre. El periodo lo calcula
 *           la base desde la fecha que tocaba cobrar; aquí no se captura.
 *   PATCH — anular el último pago vigente, con motivo.
 *
 * Se registra a nombre del operador que entró (A8): la bitácora y el propio pago lo dicen.
 */

const METODOS = ["TRANSFERENCIA", "EFECTIVO", "TARJETA", "DEPOSITO", "OTRO"];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Los errores de las RPC, en palabras del operador. */
const MENSAJES: Record<string, string> = {
  SIN_SUSCRIPCION: "Este cliente no tiene cobro activo. Actívalo antes de registrar pagos.",
  PERIODOS_INVALIDOS: "Un pago cubre de 1 a 12 periodos.",
  MONTO_INVALIDO: "El monto tiene que ser mayor a cero.",
  NO_ES_EL_ULTIMO: "Solo se puede anular el pago más reciente. Si el error es de antes, anula primero los que siguen.",
  PAGO_YA_ANULADO: "Ese pago ya estaba anulado.",
  PAGO_NO_EXISTE: "Ese pago no existe.",
  MOTIVO_REQUERIDO: "Escribe el motivo (10 caracteres o más).",
};
const errorRpc = (m: string) => NextResponse.json({ error: m, detalle: MENSAJES[m] ?? m }, { status: MENSAJES[m] ? 400 : 500 });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const { data, error } = await auth.sb
    .from("pagos_suscripcion")
    .select("id, monto_mxn, metodo, referencia, pagado_el, cubre_desde, cubre_hasta, notas, created_at, anulado_at, anulado_motivo")
    .eq("tenant_id", id)
    .order("cubre_desde", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pagos: data ?? [] });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const { sb, actor } = auth;
  const { id } = await ctx.params;

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const monto = Math.round(Number(b.monto) * 100) / 100;
  const metodo = String(b.metodo ?? "");
  const pagadoEl = String(b.pagado_el ?? "");
  const periodos = Math.trunc(Number(b.periodos ?? 1));
  if (!(monto > 0)) return errorRpc("MONTO_INVALIDO");
  if (!METODOS.includes(metodo)) return NextResponse.json({ error: "METODO_INVALIDO", detalle: "Elige cómo pagó." }, { status: 400 });
  // Un pago con fecha futura es casi siempre un dedo que se fue de mes: se rechaza.
  if (!FECHA.test(pagadoEl) || pagadoEl > hoyMx()) {
    return NextResponse.json({ error: "FECHA_INVALIDA", detalle: "La fecha del pago no puede ser posterior a hoy." }, { status: 400 });
  }

  const { data, error } = await sb.rpc("registrar_pago_suscripcion", {
    p_tenant_id: id,
    p_monto: monto,
    p_metodo: metodo,
    p_pagado_el: pagadoEl,
    p_periodos: periodos,
    p_referencia: String(b.referencia ?? "").slice(0, 120) || null,
    p_notas: String(b.notas ?? "").slice(0, 500) || null,
    p_registrado_por: actor.id,
  });
  if (error) return errorRpc(error.message);

  const r = data as { pago_id: string; cubre_desde: string; cubre_hasta: string; proxima_fecha_cobro: string };
  await auditar(sb, {
    accion: "tenant.pago_registrar",
    tenantId: id,
    motivo: `Pago de $${monto.toFixed(2)} (${metodo.toLowerCase()}) del ${r.cubre_desde} al ${r.cubre_hasta}`,
    payload: { pago_id: r.pago_id, monto, metodo, periodos, proxima: r.proxima_fecha_cobro },
  });
  return NextResponse.json({ ok: true, ...r });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const { sb, actor } = auth;
  const { id } = await ctx.params;

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const motivo = motivoValido(b.motivo);
  if (!motivo) return errorRpc("MOTIVO_REQUERIDO");
  const pagoId = String(b.pago_id ?? "");

  // El pago tiene que ser de ESTE negocio: la RPC no lo revisa (recibe solo el id del pago).
  const { data: p } = await sb.from("pagos_suscripcion").select("id").eq("id", pagoId).eq("tenant_id", id).maybeSingle();
  if (!p) return errorRpc("PAGO_NO_EXISTE");

  const { data, error } = await sb.rpc("anular_pago_suscripcion", { p_pago_id: pagoId, p_motivo: motivo, p_anulado_por: actor.id });
  if (error) return errorRpc(error.message);
  await auditar(sb, { accion: "tenant.pago_anular", tenantId: id, motivo, payload: { pago_id: pagoId, ...(data as object) } });
  return NextResponse.json({ ok: true });
}
