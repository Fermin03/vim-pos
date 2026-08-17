import { NextResponse } from "next/server";
import { autorizar } from "../../lib/server";

/**
 * Bandeja de "requiere tu atención": lo que hay que hacer HOY, no lo que pasó.
 *
 * Las métricas globales dicen cómo va el negocio, pero no señalan a nadie. Un cliente cuya caja
 * lleva tres días sin conectarse, un trial que vence mañana o un tenant que se quedó sin folios
 * son cosas que solo se descubren si alguien las busca — y en un SaaS de un solo operador nadie
 * las busca hasta que el cliente llama enojado. Esto las trae al frente, ordenadas por urgencia.
 *
 * La señal de vida de un cliente es LA ÚLTIMA VENTA QUE LLEGÓ A LA NUBE, no un "last seen":
 * `cajas.ultima_conexion` está declarada desde la migración 0003 pero ningún código la escribe,
 * y `sync_eventos` no lo llena el push del escritorio. El ticket sí sube, así que su fecha es lo
 * único que prueba a la vez que el negocio opera y que la sincronización funciona — que son
 * justo las dos formas de perder a un cliente sin enterarse.
 */

export type Severidad = "critica" | "alta" | "media";

export type Alerta = {
  id: string;
  severidad: Severidad;
  tipo: string;
  tenantId: string | null;
  tenant: string;
  titulo: string;
  detalle: string;
  /** Para ordenar dentro de la misma severidad: más chico = más urgente. */
  orden: number;
};

const DIA = 24 * 3600 * 1000;

/** Días transcurridos desde una fecha ISO (negativo si es futura). */
function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DIA);
}

function plural(n: number, sing: string, pl: string): string {
  return `${n} ${n === 1 ? sing : pl}`;
}

export async function GET(req: Request) {
  const auth = autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  const { data: tenantsRaw } = await sb
    .from("tenants")
    .select("id, codigo, nombre_comercial, estado, fecha_alta")
    .is("deleted_at", null)
    .limit(1000);
  const tenants = (tenantsRaw ?? []) as {
    id: string; codigo: string; nombre_comercial: string; estado: string; fecha_alta: string | null;
  }[];
  const nombreDe = new Map(tenants.map((t) => [t.id, t.nombre_comercial]));
  const activos = new Set(tenants.filter((t) => t.estado !== "CANCELADO" && t.estado !== "BAJA").map((t) => t.id));

  const [cajasRes, subsRes, foliosRes, onbRes, ventasRes] = await Promise.all([
    sb.from("cajas").select("id, nombre, tenant_id, activa, bloqueada, bloqueo_motivo").is("deleted_at", null).limit(2000),
    sb.from("suscripciones").select("tenant_id, estado, fecha_fin, proxima_fecha_cobro, precio_mensual_mxn").limit(1000),
    sb.from("tenant_folios_saldo").select("tenant_id, folios_base_mensuales, folios_base_consumidos, saldo_paquetes, umbral_alerta").limit(1000),
    sb.from("tenant_onboarding_estado").select("tenant_id, fase, fecha_go_live, updated_at").limit(1000),
    // Una sola pasada por los tickets recientes: basta la fecha más nueva por tenant.
    sb.from("tickets").select("tenant_id, created_at").is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(5000),
  ]);

  const ultimaVenta = new Map<string, string>();
  for (const t of (ventasRes.data ?? []) as { tenant_id: string; created_at: string }[]) {
    if (!ultimaVenta.has(t.tenant_id)) ultimaVenta.set(t.tenant_id, t.created_at);
  }

  const alertas: Alerta[] = [];

  // ── Clientes que dejaron de mandar ventas ──────────────────────────────────────────────
  // La alerta más valiosa del panel. Un tenant que vendía y dejó de aparecer está caído, se
  // fue con la competencia, o su caja no está sincronizando — y las tres cosas se atienden hoy,
  // no cuando llegue la queja.
  const cajas = (cajasRes.data ?? []) as {
    id: string; nombre: string; tenant_id: string; activa: boolean; bloqueada: boolean; bloqueo_motivo: string | null;
  }[];
  for (const c of cajas) {
    if (!c.bloqueada || !c.activa || !activos.has(c.tenant_id)) continue;
    alertas.push({
      id: `caja-bloqueada-${c.id}`, severidad: "critica", tipo: "Caja bloqueada",
      tenantId: c.tenant_id, tenant: nombreDe.get(c.tenant_id) ?? "—",
      titulo: `${c.nombre} está bloqueada`,
      detalle: c.bloqueo_motivo ?? "Sin motivo registrado. No puede cobrar hasta desbloquearla.",
      orden: 0,
    });
  }

  for (const t of tenants) {
    if (!activos.has(t.id)) continue;
    const nCajas = cajas.filter((c) => c.tenant_id === t.id && c.activa).length;
    const venta = ultimaVenta.get(t.id) ?? null;
    const dias = diasDesde(venta);
    const desdeAlta = diasDesde(t.fecha_alta);

    if (dias === null) {
      // Nunca ha llegado una sola venta: la implantación no despegó.
      if (nCajas > 0 && desdeAlta !== null && desdeAlta >= 3) {
        alertas.push({
          id: `sin-ventas-${t.id}`, severidad: "alta", tipo: "Nunca ha vendido",
          tenantId: t.id, tenant: t.nombre_comercial,
          titulo: "Sin una sola venta registrada",
          detalle: `Tiene ${plural(nCajas, "caja dada de alta", "cajas dadas de alta")} y el alta fue hace ${plural(desdeAlta, "día", "días")}. La instalación quedó a medias o no está sincronizando.`,
          orden: 1000 - desdeAlta,
        });
      }
      continue;
    }
    if (dias >= 7) {
      alertas.push({
        id: `mudo-${t.id}`, severidad: "critica", tipo: "Sin ventas en la nube",
        tenantId: t.id, tenant: t.nombre_comercial,
        titulo: `Sin ventas desde hace ${plural(dias, "día", "días")}`,
        detalle: "O dejó de operar, o su caja no está subiendo lo que vende. Si es lo segundo, esas ventas solo existen en su computadora y se pierden si falla.",
        orden: 1000 - dias,
      });
    } else if (dias >= 3) {
      alertas.push({
        id: `tibio-${t.id}`, severidad: "alta", tipo: "Sin ventas en la nube",
        tenantId: t.id, tenant: t.nombre_comercial,
        titulo: `Sin ventas desde hace ${plural(dias, "día", "días")}`,
        detalle: "Puede ser cierre por descanso. Si mañana sigue igual, conviene llamar.",
        orden: 1000 - dias,
      });
    }
  }

  // ── Suscripciones: trials por vencer y cobros vencidos ─────────────────────────────────
  const subs = (subsRes.data ?? []) as {
    tenant_id: string; estado: string; fecha_fin: string | null;
    proxima_fecha_cobro: string | null; precio_mensual_mxn: number | null;
  }[];
  for (const s of subs) {
    if (!activos.has(s.tenant_id)) continue;
    const tenant = nombreDe.get(s.tenant_id) ?? "—";
    const esTrial = s.estado === "TRIAL" || s.estado === "PRUEBA";

    const paraFin = diasDesde(s.fecha_fin);
    if (esTrial && paraFin !== null && paraFin >= -10) {
      const faltan = -paraFin;
      alertas.push(
        faltan < 0
          ? {
              id: `trial-vencido-${s.tenant_id}`, severidad: "critica", tipo: "Trial vencido",
              tenantId: s.tenant_id, tenant,
              titulo: `El trial venció hace ${plural(-faltan, "día", "días")}`,
              detalle: "Sigue operando sin plan de pago. Cierra la venta o suspéndelo.",
              orden: faltan,
            }
          : {
              id: `trial-vence-${s.tenant_id}`, severidad: "alta", tipo: "Trial por vencer",
              tenantId: s.tenant_id, tenant,
              titulo: faltan === 0 ? "El trial vence HOY" : `El trial vence en ${plural(faltan, "día", "días")}`,
              detalle: "Es el momento de cerrar la conversión, antes de que se quede sin sistema.",
              orden: faltan,
            },
      );
    }

    // Cobro vencido: dinero ya devengado que nadie fue a cobrar.
    const vencido = diasDesde(s.proxima_fecha_cobro);
    if (!esTrial && vencido !== null && vencido > 0 && (s.estado === "ACTIVA" || s.estado === "ACTIVO")) {
      const monto = Number(s.precio_mensual_mxn ?? 0);
      alertas.push({
        id: `cobro-${s.tenant_id}`, severidad: vencido >= 7 ? "critica" : "alta", tipo: "Cobro vencido",
        tenantId: s.tenant_id, tenant,
        titulo: `Cobro vencido hace ${plural(vencido, "día", "días")}`,
        detalle: monto > 0
          ? `Mensualidad de $${monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })} sin registrar.`
          : "Sin monto registrado en la suscripción.",
        orden: -vencido,
      });
    }
  }

  // ── Folios CFDI ────────────────────────────────────────────────────────────────────────
  // Quedarse sin folios es de las pocas fallas que el cliente sufre de golpe: deja de poder
  // facturar en plena operación. Se avisa ANTES, con su propio umbral si lo configuró.
  const folios = (foliosRes.data ?? []) as {
    tenant_id: string; folios_base_mensuales: number | null; folios_base_consumidos: number | null;
    saldo_paquetes: number | null; umbral_alerta: number | null;
  }[];
  for (const f of folios) {
    if (!activos.has(f.tenant_id)) continue;
    const tenant = nombreDe.get(f.tenant_id) ?? "—";
    const restanBase = Math.max(0, Number(f.folios_base_mensuales ?? 0) - Number(f.folios_base_consumidos ?? 0));
    const disponibles = restanBase + Number(f.saldo_paquetes ?? 0);
    const umbral = Number(f.umbral_alerta ?? 0) || 25;
    if (disponibles <= 0) {
      alertas.push({
        id: `folios-cero-${f.tenant_id}`, severidad: "critica", tipo: "Sin folios CFDI",
        tenantId: f.tenant_id, tenant,
        titulo: "Se quedó sin folios para facturar",
        detalle: "No puede timbrar. Abónale un paquete desde el detalle de la empresa.",
        orden: 0,
      });
    } else if (disponibles <= umbral) {
      alertas.push({
        id: `folios-bajos-${f.tenant_id}`, severidad: "media", tipo: "Folios CFDI bajos",
        tenantId: f.tenant_id, tenant,
        titulo: `Le quedan ${plural(disponibles, "folio", "folios")}`,
        detalle: `Por debajo de su umbral de aviso (${umbral}). Buen momento para ofrecerle un paquete.`,
        orden: disponibles,
      });
    }
  }

  // ── Onboarding estancado ───────────────────────────────────────────────────────────────
  const onb = (onbRes.data ?? []) as {
    tenant_id: string; fase: string | null; fecha_go_live: string | null; updated_at: string | null;
  }[];
  for (const o of onb) {
    if (!activos.has(o.tenant_id) || o.fecha_go_live) continue;
    const quieto = diasDesde(o.updated_at);
    if (quieto !== null && quieto >= 14) {
      alertas.push({
        id: `onboarding-${o.tenant_id}`, severidad: "media", tipo: "Alta estancada",
        tenantId: o.tenant_id, tenant: nombreDe.get(o.tenant_id) ?? "—",
        titulo: `Sin avanzar hace ${plural(quieto, "día", "días")}`,
        detalle: `Se quedó en la fase "${o.fase ?? "sin fase"}" y nunca llegó a producción.`,
        orden: 1000 - quieto,
      });
    }
  }

  const peso: Record<Severidad, number> = { critica: 0, alta: 1, media: 2 };
  alertas.sort((a, b) => peso[a.severidad] - peso[b.severidad] || a.orden - b.orden || a.tenant.localeCompare(b.tenant));

  return NextResponse.json({
    alertas,
    resumen: {
      critica: alertas.filter((a) => a.severidad === "critica").length,
      alta: alertas.filter((a) => a.severidad === "alta").length,
      media: alertas.filter((a) => a.severidad === "media").length,
    },
  });
}
