import { NextResponse } from "next/server";
import { autorizar } from "../../lib/server";
import { fechaLegible, hoyMx } from "@vim/fecha";
import { AVISO_PRUEBA_DIAS, diasEntre, estadoPrueba, precioVigente, promocionVigente, type PrecioSuscripcion } from "@vim/db/cobro";
import { alertaDeSello } from "../../lib/alerta-sello";
import { alertaProspectos } from "../../lib/prospectos";

/**
 * Bandeja de "requiere tu atención": lo que hay que hacer HOY, no lo que pasó.
 *
 * Las métricas globales dicen cómo va el negocio, pero no señalan a nadie. Un cliente cuya caja
 * lleva tres días sin conectarse, un trial que vence mañana o un tenant que se quedó sin folios
 * son cosas que solo se descubren si alguien las busca — y en un SaaS de un solo operador nadie
 * las busca hasta que el cliente llama enojado. Esto las trae al frente, ordenadas por urgencia.
 *
 * Se distinguen DOS problemas que parecen el mismo:
 *
 *   · Caja muda  — hace días que no sincroniza. Urge aunque el negocio esté cerrado: significa
 *                  que sus ventas viven solo en esa computadora y el respaldo dejó de existir.
 *   · Sin ventas — sincroniza al día, pero no vende. Es información de negocio, no una falla.
 *
 * Antes se confundían porque solo se miraba la fecha del último ticket. Desde la migración 0070
 * `sync_push_snapshot` deja rastro en `sync_eventos`, así que se sabe cuándo reportó la caja
 * aunque no haya vendido nada. Para quien todavía no tiene ni un evento —cajas sin actualizar—
 * se cae al criterio viejo, que no da falsos positivos aunque sea menos preciso.
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
  /** A dónde lleva "Abrir" cuando la alerta no es de un cliente (prospectos, 0145). */
  href?: string;
};

const DIA = 24 * 3600 * 1000;

/** Días antes del fin de una promoción en que el panel empieza a avisar (0141). */
const DIAS_AVISO_PROMOCION = 15;

/**
 * Una caja con latido (0.4.60+), para la franja "Ahora": ¿está viva en este momento?
 *
 * No es una alerta. De noche las cajas se apagan porque el local cerró, y una alerta por cada caja
 * sin latido sonaría todas las noches hasta que nadie la mirara. Es el estado del parque, con el
 * dato que importa a las 11 de la noche: hace cuánto habló cada una (revisión de diseño, sep 2026).
 */
export type CajaAhora = {
  id: string; nombre: string; tenantId: string; tenant: string;
  /** Minutos desde su último latido; null = nunca latió (versión anterior a 0.4.60). */
  minutos: number | null;
  version: string | null;
};

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
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  const { data: tenantsRaw } = await sb
    .from("tenants")
    .select("id, codigo, nombre_comercial, estado, fecha_alta, prueba_hasta")
    .is("deleted_at", null)
    .limit(1000);
  const tenants = (tenantsRaw ?? []) as {
    id: string; codigo: string; nombre_comercial: string; estado: string; fecha_alta: string | null; prueba_hasta: string | null;
  }[];
  const nombreDe = new Map(tenants.map((t) => [t.id, t.nombre_comercial]));
  const activos = new Set(tenants.filter((t) => t.estado !== "CANCELADO" && t.estado !== "BAJA").map((t) => t.id));

  const [cajasRes, subsRes, foliosRes, onbRes, ventasRes, syncRes, sellosRes, prospectosRes] = await Promise.all([
    sb.from("cajas").select("id, nombre, tenant_id, activa, bloqueada, bloqueo_motivo, ultimo_latido, version_app").is("deleted_at", null).limit(2000),
    sb.from("suscripciones").select("tenant_id, estado, fecha_fin, proxima_fecha_cobro, precio_mensual_mxn, precio_promocional_mxn, promocion_hasta, promocion_nombre").limit(1000),
    sb.from("tenant_folios_saldo").select("tenant_id, folios_base_mensuales, folios_base_consumidos, saldo_paquetes, umbral_alerta").limit(1000),
    sb.from("tenant_onboarding_estado").select("tenant_id, fase, fecha_go_live, updated_at").limit(1000),
    // Una sola pasada por los tickets recientes: basta la fecha más nueva por tenant.
    sb.from("tickets").select("tenant_id, created_at").is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(5000),
    sb.from("sync_eventos").select("tenant_id, fecha_recepcion, operaciones_error")
      .order("fecha_recepcion", { ascending: false }).limit(2000),
    sb.from("tenant_cfdi_emisor").select("tenant_id, csd_numero_certificado, csd_vigencia_hasta").limit(1000),
    // Solo los que nadie ha tocado (0145): son los únicos que pueden ser una alerta.
    sb.from("prospectos").select("negocio, estado, creado_en").eq("estado", "NUEVO").order("creado_en", { ascending: true }).limit(500),
  ]);

  const ultimaVenta = new Map<string, string>();
  for (const t of (ventasRes.data ?? []) as { tenant_id: string; created_at: string }[]) {
    if (!ultimaVenta.has(t.tenant_id)) ultimaVenta.set(t.tenant_id, t.created_at);
  }

  const ultimoSync = new Map<string, string>();
  for (const e of (syncRes.data ?? []) as { tenant_id: string; fecha_recepcion: string }[]) {
    if (!ultimoSync.has(e.tenant_id)) ultimoSync.set(e.tenant_id, e.fecha_recepcion);
  }

  const alertas: Alerta[] = [];

  // ── Clientes que dejaron de mandar ventas ──────────────────────────────────────────────
  // La alerta más valiosa del panel. Un tenant que vendía y dejó de aparecer está caído, se
  // fue con la competencia, o su caja no está sincronizando — y las tres cosas se atienden hoy,
  // no cuando llegue la queja.
  const cajas = (cajasRes.data ?? []) as {
    id: string; nombre: string; tenant_id: string; activa: boolean; bloqueada: boolean; bloqueo_motivo: string | null;
    ultimo_latido: string | null; version_app: string | null;
  }[];
  const minutosDesde = (iso: string | null) => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 60_000));
  };
  const ahora: CajaAhora[] = cajas
    .filter((c) => c.activa && !c.bloqueada && activos.has(c.tenant_id))
    .map((c) => ({
      id: c.id, nombre: c.nombre, tenantId: c.tenant_id, tenant: nombreDe.get(c.tenant_id) ?? "—",
      minutos: minutosDesde(c.ultimo_latido), version: c.version_app,
    }))
    // Las que llevan más tiempo calladas primero; las que nunca latieron, al final (no dicen nada).
    .sort((a, b) => (a.minutos === null ? 1 : b.minutos === null ? -1 : b.minutos - a.minutos));
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
    const diasSync = diasDesde(ultimoSync.get(t.id) ?? null);
    // Una caja que late (0.4.60+) está viva aunque no sincronice: el push solo corre cuando hay algo
    // que subir, así que un día sin ventas se veía como "Sin sincronizar" en rojo sobre una caja
    // encendida. Con latido reciente, la falta de sync no es una falla.
    const latioHoy = cajas.some((c) => c.tenant_id === t.id && c.activa && (minutosDesde(c.ultimo_latido) ?? Infinity) < 24 * 60);

    // Caja muda: reportaba y dejó de hacerlo. Es un fallo técnico, no comercial.
    if (diasSync !== null && diasSync >= 1 && !latioHoy) {
      alertas.push({
        id: `muda-${t.id}`, severidad: diasSync >= 3 ? "critica" : "alta", tipo: "Caja sin sincronizar",
        tenantId: t.id, tenant: t.nombre_comercial,
        titulo: `Sin sincronizar desde hace ${plural(diasSync, "día", "días")}`,
        detalle: "Sus ventas se están quedando solo en la computadora del negocio: si falla ese equipo, se pierden. Revisa que la caja esté encendida y con internet.",
        orden: 1000 - diasSync,
      });
      continue; // no duplicar con "sin ventas": la causa raíz es esta
    }

    // Sin ventas teniendo la sincronización al día → el negocio no vendió. Informativo.
    if (dias >= 7) {
      alertas.push({
        id: `mudo-${t.id}`, severidad: diasSync === null ? "critica" : "alta", tipo: "Sin ventas",
        tenantId: t.id, tenant: t.nombre_comercial,
        titulo: `Sin ventas desde hace ${plural(dias, "día", "días")}`,
        detalle: diasSync === null
          ? "Y no hay registro de sincronización, así que no se puede saber si dejó de vender o dejó de reportar. Su caja probablemente aún no se actualiza."
          : "La caja sí está reportando, así que el negocio simplemente no ha vendido. Vale una llamada.",
        orden: 1000 - dias,
      });
    } else if (dias >= 3) {
      alertas.push({
        id: `tibio-${t.id}`, severidad: "media", tipo: "Sin ventas",
        tenantId: t.id, tenant: t.nombre_comercial,
        titulo: `Sin ventas desde hace ${plural(dias, "día", "días")}`,
        detalle: "La caja reporta al día. Puede ser cierre por descanso.",
        orden: 1000 - dias,
      });
    }
  }

  // ── Prueba gratis (0141) ────────────────────────────────────────────────────────────────
  // Antes esto buscaba `suscripciones.estado = 'TRIAL'`, un valor que el enum no tiene: la alerta
  // nunca salió. La prueba vive en el TENANT (`estado = 'TRIAL'` + `prueba_hasta`, que la base pone
  // sola al alta). No bloquea nada: suspender sigue siendo decisión de VIM con días de gracia.
  const hoy = hoyMx();
  const subs = (subsRes.data ?? []) as ({
    tenant_id: string; estado: string; fecha_fin: string | null; proxima_fecha_cobro: string | null;
  } & PrecioSuscripcion)[];
  // "Con cobro" = una suscripción ACTIVA o en PAUSA: pausar el cobro es una decisión tomada, no un olvido.
  const conCobro = new Set(subs.filter((s) => s.estado === "ACTIVA" || s.estado === "PAUSADA").map((s) => s.tenant_id));
  for (const t of tenants) {
    // Los internos (Knock-Out, demos de VIM) no pagan: nunca son "prueba vencida".
    if (!activos.has(t.id) || conCobro.has(t.id) || t.estado === "INTERNO") continue;
    const p = estadoPrueba(t.estado, t.prueba_hasta, hoy);
    if (p.tipo === "VENCIDA") {
      alertas.push({
        id: `prueba-vencida-${t.id}`, severidad: "alta", tipo: "Prueba vencida sin cobro",
        tenantId: t.id, tenant: t.nombre_comercial,
        titulo: `La prueba terminó hace ${plural(p.dias, "día", "días")}`,
        detalle: `Terminó el ${fechaLegible(p.hasta)} y sigue sin cobro activo. Activa el cobro, extiende la prueba o suspéndelo con gracia.`,
        orden: -p.dias,
      });
    } else if (p.tipo === "EN_PRUEBA" && p.dias <= AVISO_PRUEBA_DIAS) {
      alertas.push({
        id: `prueba-vence-${t.id}`, severidad: "media", tipo: "Prueba por vencer",
        tenantId: t.id, tenant: t.nombre_comercial,
        titulo: p.dias === 0 ? "Hoy es el último día de su prueba" : `Su prueba termina en ${plural(p.dias, "día", "días")}`,
        detalle: `Termina el ${fechaLegible(p.hasta)}. Buen momento para cerrar la venta y activar el cobro.`,
        orden: p.dias,
      });
    }
  }

  // ── Suscripciones: promociones por terminar y cobros vencidos ───────────────────────────
  for (const s of subs) {
    if (!activos.has(s.tenant_id) || s.estado !== "ACTIVA") continue;
    const tenant = nombreDe.get(s.tenant_id) ?? "—";

    // Promoción por terminar (0141): el cliente va a ver subir su mensualidad. Mejor que se entere
    // por VIM, con tiempo, que por el comprobante.
    const promo = promocionVigente(s, hoy);
    if (promo) {
      const faltan = diasEntre(hoy, promo.hasta);
      if (faltan <= DIAS_AVISO_PROMOCION) {
        const mxn = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
        alertas.push({
          id: `promo-${s.tenant_id}`, severidad: "media", tipo: "Promoción por terminar",
          tenantId: s.tenant_id, tenant,
          titulo: faltan === 0 ? `Hoy termina ${promo.nombre ?? "su promoción"}` : `${promo.nombre ?? "Su promoción"} termina en ${plural(faltan, "día", "días")}`,
          detalle: `Paga ${mxn(promo.precio)} hasta el ${fechaLegible(promo.hasta)}; después, ${mxn(promo.lista)}. Avísale antes de su siguiente cobro.`,
          orden: faltan,
        });
      }
    }

    // Cobro vencido: dinero ya devengado que nadie fue a cobrar. El monto es el que tocaba en ESA
    // fecha de cobro (con promoción si seguía vigente), no el de lista.
    if (!s.proxima_fecha_cobro) continue;
    const vencido = diasEntre(s.proxima_fecha_cobro.slice(0, 10), hoy);
    if (vencido > 0) {
      const monto = precioVigente(s, s.proxima_fecha_cobro.slice(0, 10));
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

  // ── Sello digital (CSD) por vencer ─────────────────────────────────────────────────────
  // El dueño ya lo ve en su panel 30 días antes; aquí sale para que VIM le llame si no lo atiende.
  // Un sello vencido es un cliente que no puede facturar y que casi siempre se entera por su
  // propio cliente, en la caja.
  for (const e of (sellosRes.data ?? []) as { tenant_id: string; csd_numero_certificado: string | null; csd_vigencia_hasta: string | null }[]) {
    if (!activos.has(e.tenant_id) || !e.csd_numero_certificado) continue;
    const a = alertaDeSello(e.csd_vigencia_hasta, hoy);
    if (!a) continue;
    alertas.push({ id: `sello-${e.tenant_id}`, tenantId: e.tenant_id, tenant: nombreDe.get(e.tenant_id) ?? "—", ...a });
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

  // ── Prospectos de demo sin contactar (0145) ────────────────────────────────────────────
  // El sitio promete contestar el mismo día hábil. Uno que sigue NUEVO pasadas 24 horas es una
  // venta enfriándose; van todos en UNA alerta para no enterrar la bandeja el día que entran diez.
  const prospectosNuevos = (prospectosRes.data ?? []) as { negocio: string; estado: string; creado_en: string }[];
  const deProspectos = alertaProspectos(prospectosNuevos);
  if (deProspectos) alertas.push(deProspectos);

  const peso: Record<Severidad, number> = { critica: 0, alta: 1, media: 2 };
  alertas.sort((a, b) => peso[a.severidad] - peso[b.severidad] || a.orden - b.orden || a.tenant.localeCompare(b.tenant));

  return NextResponse.json({
    alertas,
    ahora,
    // Para el contador de la barra lateral: cuántos esperan respuesta, lleven lo que lleven.
    prospectosNuevos: prospectosNuevos.length,
    resumen: {
      critica: alertas.filter((a) => a.severidad === "critica").length,
      alta: alertas.filter((a) => a.severidad === "alta").length,
      media: alertas.filter((a) => a.severidad === "media").length,
    },
  });
}
