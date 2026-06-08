import { NextResponse } from "next/server";
import { autorizar } from "../../lib/server";

// Métricas globales del negocio VIM (doc 12 §6.1 "Métricas globales"). service_role.

export async function GET(req: Request) {
  const auth = autorizar(req);
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

  // MRR = suma de la mensualidad de las suscripciones ACTIVAS.
  const { data: subs } = await sb.from("suscripciones").select("estado, precio_mensual_mxn").limit(1000);
  const mrr = ((subs ?? []) as { estado: string; precio_mensual_mxn: number }[])
    .filter((s) => s.estado === "ACTIVA" || s.estado === "ACTIVO")
    .reduce((acc, s) => acc + Number(s.precio_mensual_mxn ?? 0), 0);

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
    foliosVendidos30d: foliosVendidos,
  });
}
