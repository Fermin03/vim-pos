import { supabase, leerSesion } from "./supabase";
import type { MetodoCobro, PrecioSuscripcion } from "@vim/db/cobro";
import type { DatosPago } from "./datos-pago";

/** Lo que el dueño ve de su contrato con VIM: plan, cobro, prueba, pagos y a dónde pagar (0130, 0141). Solo lectura. */
export type PlanYPagos = {
  negocio: { nombre_comercial: string; estado: string; prueba_hasta: string | null } | null;
  plan: { nombre: string; precio_mensual_mxn: number } | null;
  suscripcion: (PrecioSuscripcion & {
    estado: string;
    ciclo_facturacion: string;
    proxima_fecha_cobro: string | null;
    fecha_inicio: string;
  }) | null;
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
  /** null si VIM no los ha capturado o si el rol no alcanza (la RPC devuelve cero filas). */
  datosPago: DatosPago | null;
};

export async function leerPlanYPagos(): Promise<PlanYPagos> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  const tid = s.tenantId;

  const [t, sub, pag, dp] = await Promise.all([
    supabase.from("tenants").select("nombre_comercial, estado, prueba_hasta, plan:planes(nombre, precio_mensual_mxn)").eq("id", tid).maybeSingle(),
    supabase
      .from("suscripciones")
      .select("estado, precio_mensual_mxn, precio_promocional_mxn, promocion_hasta, promocion_nombre, ciclo_facturacion, proxima_fecha_cobro, fecha_inicio")
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
    // Los datos para pagarle a VIM solo salen por esta RPC (0141): la tabla no se lee desde aquí.
    supabase.rpc("datos_pago_plataforma"),
  ]);
  if (t.error) throw t.error;
  if (sub.error) throw sub.error;
  if (pag.error) throw pag.error;
  // Sin datos de pago la pantalla sigue sirviendo: se cae al texto neutro, no a un error.
  const filaPago = !dp.error && Array.isArray(dp.data) ? ((dp.data[0] ?? null) as DatosPago | null) : null;

  const td = t.data as { nombre_comercial?: string; estado?: string; prueba_hasta?: string | null; plan?: PlanYPagos["plan"] } | null;
  return {
    negocio: td ? { nombre_comercial: td.nombre_comercial ?? "", estado: td.estado ?? "", prueba_hasta: td.prueba_hasta ?? null } : null,
    plan: td?.plan ?? null,
    suscripcion: (sub.data as PlanYPagos["suscripcion"]) ?? null,
    pagos: (pag.data ?? []) as PlanYPagos["pagos"],
    datosPago: filaPago,
  };
}

/** Solo lo de la prueba, para el aviso del dashboard: una consulta chica en vez de todo el plan. */
export async function leerPrueba(): Promise<{ estado: string; prueba_hasta: string | null } | null> {
  const s = await leerSesion();
  if (!s?.tenantId) return null;
  const { data, error } = await supabase.from("tenants").select("estado, prueba_hasta").eq("id", s.tenantId).maybeSingle();
  if (error || !data) return null;
  return data as { estado: string; prueba_hasta: string | null };
}
