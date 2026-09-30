import { supabase, leerSesion } from "./supabase";
import type { MetodoCobro } from "@vim/db/cobro";

/** Lo que el dueño ve de su contrato con VIM: plan, cobro y pagos (0130). Solo lectura. */
export type PlanYPagos = {
  plan: { nombre: string; precio_mensual_mxn: number } | null;
  suscripcion: {
    estado: string;
    precio_mensual_mxn: number;
    ciclo_facturacion: string;
    proxima_fecha_cobro: string | null;
    fecha_inicio: string;
  } | null;
  pagos: {
    id: string;
    monto_mxn: number;
    metodo: MetodoCobro;
    referencia: string | null;
    pagado_el: string;
    cubre_desde: string;
    cubre_hasta: string;
    anulado_at: string | null;
  }[];
};

export async function leerPlanYPagos(): Promise<PlanYPagos> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  const tid = s.tenantId;

  const [t, sub, pag] = await Promise.all([
    supabase.from("tenants").select("plan:planes(nombre, precio_mensual_mxn)").eq("id", tid).maybeSingle(),
    supabase
      .from("suscripciones")
      .select("estado, precio_mensual_mxn, ciclo_facturacion, proxima_fecha_cobro, fecha_inicio")
      .eq("tenant_id", tid)
      .in("estado", ["ACTIVA", "PAUSADA"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // RLS deja ver los pagos solo al dueño y a los administradores (0130).
    supabase
      .from("pagos_suscripcion")
      .select("id, monto_mxn, metodo, referencia, pagado_el, cubre_desde, cubre_hasta, anulado_at")
      .eq("tenant_id", tid)
      .order("cubre_desde", { ascending: false })
      .limit(36),
  ]);
  if (t.error) throw t.error;
  if (sub.error) throw sub.error;
  if (pag.error) throw pag.error;

  return {
    plan: ((t.data as { plan?: PlanYPagos["plan"] } | null)?.plan) ?? null,
    suscripcion: (sub.data as PlanYPagos["suscripcion"]) ?? null,
    pagos: (pag.data ?? []) as PlanYPagos["pagos"],
  };
}
