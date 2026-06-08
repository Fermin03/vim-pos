import { NextResponse } from "next/server";
import { autorizar, auditar } from "../../../lib/server";

// Detalle y acciones sobre un tenant (suspender/reactivar/cancelar, notas, plan).
// Todo auditado en super_admin_accesos. service_role, gated por X-Platform-Key.

const ESTADOS_VALIDOS = ["TRIAL", "ACTIVO", "SUSPENDIDO", "CANCELADO", "INTERNO"];

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;
  const { id } = await ctx.params;

  const { data: tenant, error } = await sb
    .from("tenants")
    .select(
      "id, codigo, nombre_comercial, estado, vertical_principal, razon_social, rfc, regimen_fiscal, " +
        "codigo_postal_fiscal, email_fiscal, fecha_alta, fecha_baja, motivo_baja, created_at, " +
        "plan:planes(id, codigo, nombre, precio_mensual_mxn), " +
        "onboarding:tenant_onboarding_estado(fase, fase_wizard, fecha_invitacion, fecha_activacion, fecha_go_live, notas_internas), " +
        "suscripcion:suscripciones(estado, precio_mensual_mxn, proxima_fecha_cobro, ciclo_facturacion)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tenant) return NextResponse.json({ error: "NO_EXISTE" }, { status: 404 });

  // Saldo de folios (último movimiento) + sucursales/usuarios para contexto.
  const { data: ultFolio } = await sb
    .from("folios_movimientos")
    .select("saldo_paquetes_resultante, created_at")
    .eq("tenant_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { count: nSucursales } = await sb.from("sucursales").select("id", { count: "exact", head: true }).eq("tenant_id", id).is("deleted_at", null);

  return NextResponse.json({
    tenant,
    foliosSaldo: ultFolio?.saldo_paquetes_resultante ?? 0,
    nSucursales: nSucursales ?? 0,
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const accion = String(body.accion ?? "");

  if (accion === "cambiar_estado") {
    const nuevo = String(body.estado ?? "");
    if (!ESTADOS_VALIDOS.includes(nuevo)) return NextResponse.json({ error: "ESTADO_INVALIDO" }, { status: 400 });
    const motivo = (body.motivo as string | undefined)?.trim() || null;
    const esBaja = nuevo === "SUSPENDIDO" || nuevo === "CANCELADO";
    const patch: Record<string, unknown> = { estado: nuevo };
    if (esBaja) { patch.fecha_baja = new Date().toISOString(); patch.motivo_baja = motivo; }
    else { patch.fecha_baja = null; patch.motivo_baja = null; }
    const { error } = await sb.from("tenants").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: `tenant.${nuevo.toLowerCase()}`, tenantId: id, motivo, payload: { estado: nuevo } });
    return NextResponse.json({ ok: true });
  }

  if (accion === "marcar_fase") {
    const fase = String(body.fase ?? "");
    if (!["INVITADO", "EN_CONFIGURACION", "GO_LIVE", "ABANDONADO"].includes(fase)) return NextResponse.json({ error: "FASE_INVALIDA" }, { status: 400 });
    // upsert: algunos tenants (sembrados/INTERNO) no tienen fila de onboarding.
    const { error } = await sb.from("tenant_onboarding_estado").upsert({ tenant_id: id, fase }, { onConflict: "tenant_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: "tenant.marcar_fase", tenantId: id, payload: { fase } });
    return NextResponse.json({ ok: true });
  }

  if (accion === "notas") {
    const notas = (body.notas as string | undefined) ?? "";
    const { error } = await sb.from("tenant_onboarding_estado").upsert({ tenant_id: id, notas_internas: notas }, { onConflict: "tenant_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: "tenant.notas", tenantId: id });
    return NextResponse.json({ ok: true });
  }

  if (accion === "ajustar_folios") {
    const cantidad = Math.trunc(Number(body.cantidad ?? 0));
    if (!cantidad) return NextResponse.json({ error: "CANTIDAD_REQUERIDA" }, { status: 400 });
    const motivo = (body.motivo as string | undefined)?.trim() || "Ajuste manual desde plataforma";
    // Saldo previo = saldo del último movimiento; el nuevo saldo lo recalcula sumando la cantidad.
    const { data: ult } = await sb.from("folios_movimientos").select("saldo_paquetes_resultante").eq("tenant_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const saldoPrevio = Number(ult?.saldo_paquetes_resultante ?? 0);
    const saldoNuevo = saldoPrevio + cantidad;
    if (saldoNuevo < 0) return NextResponse.json({ error: "SALDO_NEGATIVO" }, { status: 400 });
    const { error } = await sb.from("folios_movimientos").insert({
      tenant_id: id, tipo: "AJUSTE_MANUAL", cantidad, saldo_paquetes_resultante: saldoNuevo,
      dia_contable: new Date().toISOString().slice(0, 10),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: "tenant.ajustar_folios", tenantId: id, motivo, payload: { cantidad, saldo: saldoNuevo } });
    return NextResponse.json({ ok: true, saldo: saldoNuevo });
  }

  if (accion === "cambiar_plan") {
    const planId = String(body.plan_id ?? "");
    if (!planId) return NextResponse.json({ error: "PLAN_REQUERIDO" }, { status: 400 });
    const { error } = await sb.from("tenants").update({ plan_actual_id: planId }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: "tenant.cambiar_plan", tenantId: id, payload: { plan_id: planId } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "ACCION_DESCONOCIDA" }, { status: 400 });
}
