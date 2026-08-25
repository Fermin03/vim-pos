import { NextResponse } from "next/server";
import { autorizar, auditar } from "../../../lib/server";
import { hoyMx, sumarMeses } from "@vim/fecha";

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

  // Saldo de folios: se lee de `tenant_folios_saldo`, que es la tabla que consulta el timbrado.
  //
  // Antes se derivaba del último movimiento del ledger. Parecía equivalente y no lo era: acreditar
  // solo insertaba en el ledger sin tocar el saldo, así que el panel enseñaba un número que el
  // timbrado no reconocía. La migración 0081 unificó las dos y esto lee la que manda.
  const { data: saldoRaw } = await sb
    .from("tenant_folios_saldo")
    .select("saldo_paquetes, folios_base_mensuales, folios_base_consumidos, periodo_actual")
    .eq("tenant_id", id)
    .maybeSingle();
  const saldo = saldoRaw as unknown as {
    saldo_paquetes: number; folios_base_mensuales: number; folios_base_consumidos: number; periodo_actual: string;
  } | null;

  const { data: addonsRaw } = await sb
    .from("tenant_addons")
    .select("id, activo, fecha_inicio, fecha_fin, precio_mensual_mxn, addon:addons(id, codigo, nombre, precio_mensual_mxn)")
    .eq("tenant_id", id)
    .order("fecha_inicio", { ascending: false });

  const { data: catalogoAddons } = await sb
    .from("addons")
    .select("id, codigo, nombre, descripcion, precio_mensual_mxn")
    .eq("activo", true)
    .order("orden_visualizacion");

  const { data: paquetes } = await sb
    .from("folios_paquetes")
    .select("id, codigo, nombre, cantidad_folios, precio_mxn")
    .eq("activo", true)
    .order("orden_visualizacion");

  const { count: nSucursales } = await sb.from("sucursales").select("id", { count: "exact", head: true }).eq("tenant_id", id).is("deleted_at", null);

  return NextResponse.json({
    tenant,
    foliosSaldo: saldo?.saldo_paquetes ?? 0,
    foliosBase: saldo
      ? { mensuales: saldo.folios_base_mensuales, consumidos: saldo.folios_base_consumidos, periodo: saldo.periodo_actual }
      : null,
    addons: addonsRaw ?? [],
    catalogoAddons: catalogoAddons ?? [],
    paquetes: paquetes ?? [],
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

  // Ajuste manual y venta de paquete son la misma operación con distinto origen, así que las dos
  // pasan por `acreditar_folios_cfdi`. Esa función mueve el saldo Y el ledger en una transacción,
  // con bloqueo de fila: antes esto insertaba en el ledger a mano, dejaba el saldo intacto —el
  // timbrado nunca veía los folios acreditados— y calculaba el saldo previo con un SELECT que dos
  // pestañas simultáneas podían leer igual.
  if (accion === "ajustar_folios" || accion === "acreditar_paquete") {
    let cantidad: number;
    let paqueteId: string | null = null;
    let precio: number | null = null;
    let tipo: "AJUSTE_MANUAL" | "COMPRA_PAQUETE" = "AJUSTE_MANUAL";
    let motivo = (body.motivo as string | undefined)?.trim() || "Ajuste manual desde plataforma";

    if (accion === "acreditar_paquete") {
      paqueteId = String(body.paquete_id ?? "");
      if (!paqueteId) return NextResponse.json({ error: "PAQUETE_REQUERIDO" }, { status: 400 });
      const { data: paqRaw } = await sb
        .from("folios_paquetes")
        .select("cantidad_folios, precio_mxn, nombre")
        .eq("id", paqueteId)
        .maybeSingle();
      const paq = paqRaw as unknown as { cantidad_folios: number; precio_mxn: number; nombre: string } | null;
      if (!paq) return NextResponse.json({ error: "PAQUETE_NO_EXISTE" }, { status: 404 });
      // La cantidad y el precio salen del catálogo, NUNCA del cuerpo de la petición: si vinieran
      // de fuera, quien alcance este endpoint podría acreditar mil folios al precio de cien.
      cantidad = paq.cantidad_folios;
      precio = Number(paq.precio_mxn);
      tipo = "COMPRA_PAQUETE";
      motivo = (body.motivo as string | undefined)?.trim() || `Alta de ${paq.nombre}`;
    } else {
      cantidad = Math.trunc(Number(body.cantidad ?? 0));
      if (!cantidad) return NextResponse.json({ error: "CANTIDAD_REQUERIDA" }, { status: 400 });
    }

    const { data, error } = await sb.rpc("acreditar_folios_cfdi", {
      p_tenant_id: id,
      p_cantidad: cantidad,
      p_tipo: tipo,
      p_paquete_id: paqueteId,
      p_precio_pagado_mxn: precio,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const res = data as unknown as { saldo_paquetes: number };
    await auditar(sb, {
      accion: accion === "acreditar_paquete" ? "tenant.acreditar_paquete" : "tenant.ajustar_folios",
      tenantId: id, motivo,
      payload: { cantidad, tipo, paquete_id: paqueteId, precio, saldo: res.saldo_paquetes },
    });
    return NextResponse.json({ ok: true, saldo: res.saldo_paquetes });
  }

  // ── Add-ons ────────────────────────────────────────────────────────────────────────────────
  //
  // Activar escribe en `tenant_addons`; el efecto en el producto lo resuelve `tenant_addon_activo()`.
  // Desactivar NO borra la fila: le pone fecha de fin. La historia de qué tuvo contratado un
  // cliente y hasta cuándo es justamente lo que hace falta cuando reclama un cobro.
  if (accion === "addon_activar") {
    const codigo = String(body.addon_codigo ?? "");
    if (!codigo) return NextResponse.json({ error: "ADDON_REQUERIDO" }, { status: 400 });
    const { data: addonRaw } = await sb
      .from("addons")
      .select("id, nombre, precio_mensual_mxn")
      .eq("codigo", codigo)
      .maybeSingle();
    const addon = addonRaw as unknown as { id: string; nombre: string; precio_mensual_mxn: number } | null;
    if (!addon) return NextResponse.json({ error: "ADDON_NO_EXISTE" }, { status: 404 });

    // Un add-on ya vigente no se vuelve a dar de alta: la restricción de la base solo impide
    // repetir la MISMA fecha de inicio, así que sin esto un doble clic al día siguiente dejaría
    // dos filas activas y el cliente aparecería pagándolo dos veces.
    const { data: yaRaw } = await sb
      .from("tenant_addons")
      .select("id")
      .eq("tenant_id", id)
      .eq("addon_id", addon.id)
      .eq("activo", true)
      .maybeSingle();
    if (yaRaw) return NextResponse.json({ ok: true, yaEstaba: true });

    const precio = body.precio_mensual_mxn != null ? Number(body.precio_mensual_mxn) : Number(addon.precio_mensual_mxn);
    const { error } = await sb.from("tenant_addons").insert({
      tenant_id: id, addon_id: addon.id, fecha_inicio: hoyMx(), activo: true,
      precio_mensual_mxn: precio, notas: (body.motivo as string | undefined)?.trim() || null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: "tenant.addon_activar", tenantId: id, motivo: `Alta del add-on ${addon.nombre}`, payload: { codigo, precio } });
    return NextResponse.json({ ok: true });
  }

  if (accion === "addon_desactivar") {
    const codigo = String(body.addon_codigo ?? "");
    if (!codigo) return NextResponse.json({ error: "ADDON_REQUERIDO" }, { status: 400 });
    const { data: addonRaw } = await sb.from("addons").select("id, nombre").eq("codigo", codigo).maybeSingle();
    const addon = addonRaw as unknown as { id: string; nombre: string } | null;
    if (!addon) return NextResponse.json({ error: "ADDON_NO_EXISTE" }, { status: 404 });
    const { error } = await sb
      .from("tenant_addons")
      .update({ activo: false, fecha_fin: hoyMx() })
      .eq("tenant_id", id)
      .eq("addon_id", addon.id)
      .eq("activo", true);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: "tenant.addon_desactivar", tenantId: id, motivo: `Baja del add-on ${addon.nombre}`, payload: { codigo } });
    return NextResponse.json({ ok: true });
  }

  if (accion === "cambiar_plan") {
    const planId = String(body.plan_id ?? "");
    if (!planId) return NextResponse.json({ error: "PLAN_REQUERIDO" }, { status: 400 });
    const { error } = await sb.from("tenants").update({ plan_actual_id: planId }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: "tenant.cambiar_plan", tenantId: id, payload: { plan_id: planId } });
    return NextResponse.json({ ok: true });
  }

  if (accion === "suscripcion_activar") {
    // Convierte un cliente en pagador: una suscripción ACTIVA con el precio del plan actual.
    const { data: t } = await sb.from("tenants").select("plan_actual_id, plan:planes(precio_mensual_mxn)").eq("id", id).maybeSingle();
    const planId = (t as { plan_actual_id?: string } | null)?.plan_actual_id;
    if (!planId) return NextResponse.json({ error: "TENANT_SIN_PLAN" }, { status: 400 });
    const precio = Number((body.precio as number | undefined) ?? (t as { plan?: { precio_mensual_mxn?: number } } | null)?.plan?.precio_mensual_mxn ?? 0);
    const ciclo = String(body.ciclo ?? "MENSUAL");
    // Fechas en hora de México, no del servidor: en UTC, activar una suscripción por la tarde
    // la dejaba fechada al día siguiente. `sumarMeses` además recorta al último día del mes, para
    // que un alta el 31 de enero cobre el 28 de febrero y no se desborde al 3 de marzo.
    const inicio = hoyMx();
    const prox = sumarMeses(inicio, ciclo === "ANUAL" ? 12 : 1);
    // Expira cualquier suscripción ACTIVA previa para que solo haya una vigente.
    await sb.from("suscripciones").update({ estado: "EXPIRADA", fecha_fin: inicio }).eq("tenant_id", id).eq("estado", "ACTIVA");
    const { error } = await sb.from("suscripciones").insert({
      tenant_id: id, plan_id: planId, fecha_inicio: inicio,
      estado: "ACTIVA", precio_mensual_mxn: precio, ciclo_facturacion: ciclo, proxima_fecha_cobro: prox,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Al activar el cobro, el tenant pasa a ACTIVO si estaba en TRIAL.
    await sb.from("tenants").update({ estado: "ACTIVO" }).eq("id", id).eq("estado", "TRIAL");
    await auditar(sb, { accion: "tenant.suscripcion_activar", tenantId: id, payload: { precio, ciclo } });
    return NextResponse.json({ ok: true });
  }

  if (accion === "suscripcion_estado") {
    const nuevo = String(body.estado ?? "");
    if (!["ACTIVA", "PAUSADA", "CANCELADA", "EXPIRADA"].includes(nuevo)) return NextResponse.json({ error: "ESTADO_INVALIDO" }, { status: 400 });
    const patch: Record<string, unknown> = { estado: nuevo };
    if (nuevo === "CANCELADA" || nuevo === "EXPIRADA") patch.fecha_fin = new Date().toISOString();
    const { error } = await sb.from("suscripciones").update(patch).eq("tenant_id", id).in("estado", ["ACTIVA", "PAUSADA"]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: `tenant.suscripcion_${nuevo.toLowerCase()}`, tenantId: id });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "ACCION_DESCONOCIDA" }, { status: 400 });
}
