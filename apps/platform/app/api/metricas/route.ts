import { NextResponse } from "next/server";
import { autorizar } from "../../lib/server";
import { hoyMx } from "@vim/fecha";
import { totalMensual, type AddonCobro, type PrecioSuscripcion } from "@vim/db/cobro";

// Métricas globales del negocio VIM (doc 12 §6.1 "Métricas globales"). service_role.

export async function GET(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  const { data: tenants } = await sb
    .from("tenants")
    .select("estado, vertical_principal, fecha_alta")
    .is("deleted_at", null)
    .limit(1000);
  const lista = (tenants ?? []) as { estado: string; vertical_principal: string; fecha_alta: string | null }[];

  const porEstado: Record<string, number> = {};
  const porVertical: Record<string, number> = {};
  for (const t of lista) {
    porEstado[t.estado] = (porEstado[t.estado] ?? 0) + 1;
    porVertical[t.vertical_principal] = (porVertical[t.vertical_principal] ?? 0) + 1;
  }

  // MRR = lo que HOY paga cada negocio con cobro ACTIVO: su suscripción al precio vigente (con
  // promoción mientras dure, 0141) MÁS los add-ons que paga aparte, por su cantidad (0147). El
  // número sale de `totalMensual`, la misma función que usan la ficha y "Plan y pagos" del dueño:
  // antes aquí solo se sumaba la suscripción y una sucursal adicional no existía para el panel.
  const [{ data: subs }, { data: addonsRaw }] = await Promise.all([
    sb.from("suscripciones")
      .select("tenant_id, estado, precio_mensual_mxn, precio_promocional_mxn, promocion_hasta")
      .limit(1000),
    sb.from("tenant_addons")
      .select("tenant_id, activo, precio_mensual_mxn, cantidad, fecha_inicio, fecha_fin, incluido_en_plan")
      .eq("activo", true)
      .limit(5000),
  ]);
  const hoy = hoyMx();
  const addonsDe = new Map<string, AddonCobro[]>();
  for (const a of (addonsRaw ?? []) as (AddonCobro & { tenant_id: string })[]) {
    addonsDe.set(a.tenant_id, [...(addonsDe.get(a.tenant_id) ?? []), a]);
  }
  let mrrSuscripciones = 0;
  let mrrAddons = 0;
  const yaSumados = new Set<string>();
  for (const s of (subs ?? []) as ({ tenant_id: string; estado: string } & PrecioSuscripcion)[]) {
    if (s.estado !== "ACTIVA") continue;
    // Los add-ons de un negocio se suman UNA vez aunque tuviera dos suscripciones activas.
    const t = totalMensual(s, yaSumados.has(s.tenant_id) ? [] : (addonsDe.get(s.tenant_id) ?? []), hoy);
    yaSumados.add(s.tenant_id);
    mrrSuscripciones += t.suscripcion;
    mrrAddons += t.addons;
  }
  const centavos = (n: number) => Math.round(n * 100) / 100;
  const mrr = centavos(mrrSuscripciones + mrrAddons);

  // Folios vendidos (compras de paquetes) en los últimos 30 días.
  const hace30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: folios } = await sb
    .from("folios_movimientos")
    .select("tipo, cantidad, created_at")
    .gte("created_at", hace30)
    .limit(2000);
  const foliosVendidos = ((folios ?? []) as { tipo: string; cantidad: number }[])
    .filter((f) => f.tipo === "COMPRA_PAQUETE")
    .reduce((acc, f) => acc + Number(f.cantidad ?? 0), 0);

  return NextResponse.json({
    totalTenants: lista.length,
    activos: porEstado["ACTIVO"] ?? 0,
    trial: porEstado["TRIAL"] ?? 0,
    suspendidos: porEstado["SUSPENDIDO"] ?? 0,
    cancelados: porEstado["CANCELADO"] ?? 0,
    porEstado,
    porVertical,
    mrr,
    /** El desglose del MRR: planes y add-ons (extras, facturación, delivery) pagados aparte. */
    mrrSuscripciones: centavos(mrrSuscripciones),
    mrrAddons: centavos(mrrAddons),
    foliosVendidos30d: foliosVendidos,
  });
}
