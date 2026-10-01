import { supabase, leerSesion } from "./supabase";
import { addonVigente, importeAddon, precioVigente, textoLimiteCajas, totalMensual, type AddonCobro, type MetodoCobro, type PrecioSuscripcion } from "@vim/db/cobro";
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
  /** Lo que tiene contratado aparte del plan: facturación, delivery y extras por cantidad (0147). */
  addons: AddonContratado[];
  /** Hasta dónde puede crecer hoy (`limites_efectivos`). null si la lectura falló. */
  limites: LimitesDueno | null;
};

/** Lo que el dueño necesita de `limites_efectivos()`. */
export type LimitesDueno = {
  max_sucursales: number | null; max_cajas_por_sucursal: number | null;
  cajas_adicionales?: number | null; cajas_adicionales_en_uso?: number | null;
};

/**
 * "Hasta 2 sucursales · 1 caja por sucursal + 2 cajas adicionales (1 en uso)". Las mismas palabras
 * que usa el panel de VIM (`textoLimiteCajas`): la base de cajas es por sucursal y las adicionales
 * son del negocio entero.
 */
export function textoLimites(l: LimitesDueno | null): string | null {
  if (!l) return null;
  const suc = l.max_sucursales == null ? "sucursales sin límite" : `hasta ${l.max_sucursales} ${l.max_sucursales === 1 ? "sucursal" : "sucursales"}`;
  const cajas = textoLimiteCajas({ base: l.max_cajas_por_sucursal, adicionales: l.cajas_adicionales, enUso: l.cajas_adicionales_en_uso });
  return `${suc[0]!.toUpperCase()}${suc.slice(1)} · ${cajas}`;
}

/** Una fila de `tenant_addons` con el nombre de su add-on, como la ve el dueño. */
export type AddonContratado = AddonCobro & { codigo: string; nombre: string; incluido_en_plan: boolean };

const pesos = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export type DesgloseMensual = {
  renglones: { clave: string; concepto: string; /** "2 × $249.00", "incluido en tu plan"… */ detalle: string | null; importe: number }[];
  /** Lo que se paga al mes. Cero sin cobro activo (en prueba no se cobra nada). */
  total: number;
  /** ¿Paga algo aparte del plan? Si no, el desglose no aporta y la pantalla no lo enseña. */
  hayExtras: boolean;
};

/**
 * Qué paga el negocio al mes, renglón por renglón: el plan al precio vigente y cada add-on vigente
 * con su cantidad. El total sale de `totalMensual` (@vim/db/cobro), la misma función que usa el
 * panel de VIM para el MRR y para registrar pagos.
 */
export function desgloseMensual(
  plan: { nombre: string } | null,
  suscripcion: PrecioSuscripcion | null,
  addons: AddonContratado[],
  hoy: string,
): DesgloseMensual {
  const renglones: DesgloseMensual["renglones"] = [];
  if (suscripcion) {
    renglones.push({ clave: "plan", concepto: plan?.nombre ? `Plan ${plan.nombre}` : "Tu plan", detalle: null, importe: precioVigente(suscripcion, hoy) });
  }
  const vigentes = addons.filter((a) => addonVigente(a, hoy));
  for (const a of vigentes) {
    const importe = importeAddon(a);
    const cantidad = a.cantidad ?? 1;
    renglones.push({
      clave: a.codigo,
      concepto: a.nombre,
      detalle: importe === 0 ? (a.incluido_en_plan ? "incluido en tu plan" : "sin costo")
        : cantidad > 1 ? `${cantidad} × ${pesos(Number(a.precio_mensual_mxn))}` : null,
      importe,
    });
  }
  return { renglones, total: totalMensual(suscripcion, addons, hoy).total, hayExtras: vigentes.some((a) => importeAddon(a) > 0) };
}

export async function leerPlanYPagos(): Promise<PlanYPagos> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  const tid = s.tenantId;

  const [t, sub, pag, dp, ad, lim] = await Promise.all([
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
    // RLS deja ver al negocio sus propios add-ons (0002). `cantidad` es de 0147.
    supabase
      .from("tenant_addons")
      .select("activo, precio_mensual_mxn, cantidad, fecha_inicio, fecha_fin, incluido_en_plan, addon:addons(codigo, nombre, orden_visualizacion)")
      .eq("tenant_id", tid)
      .eq("activo", true),
    supabase.rpc("limites_efectivos", { p_tenant: tid }),
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
    limites: lim.error ? null : ((lim.data ?? null) as LimitesDueno | null),
    // Si esta lectura falla, la pantalla sigue: enseña el plan sin el desglose.
    addons: ad.error ? [] : ((ad.data ?? []) as unknown as (AddonCobro & { incluido_en_plan?: boolean; addon?: { codigo?: string; nombre?: string; orden_visualizacion?: number } | null })[])
      .filter((f) => f.addon?.codigo)
      .sort((a, b) => (a.addon?.orden_visualizacion ?? 0) - (b.addon?.orden_visualizacion ?? 0))
      .map((f) => ({
        activo: f.activo, precio_mensual_mxn: f.precio_mensual_mxn, cantidad: f.cantidad ?? 1, fecha_inicio: f.fecha_inicio, fecha_fin: f.fecha_fin,
        codigo: String(f.addon?.codigo), nombre: String(f.addon?.nombre ?? f.addon?.codigo), incluido_en_plan: Boolean(f.incluido_en_plan),
      })),
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
