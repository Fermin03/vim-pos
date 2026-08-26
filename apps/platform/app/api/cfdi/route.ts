import { NextResponse } from "next/server";
import { autorizar } from "../../lib/server";

/**
 * Cartera de facturación: los clientes con el add-on CFDI contratado, con su saldo de folios.
 *
 * POR QUÉ ES UNA PANTALLA APARTE Y NO EL DETALLE DE CADA EMPRESA
 *
 * El detalle de un tenant ya deja mover folios, pero solo de uno a la vez. La pregunta que se hace
 * a diario es la contraria y es transversal: «¿a quién se le están acabando los folios?». Con el
 * detalle por empresa hay que entrar a cada una para saberlo, y eso significa que en la práctica
 * nadie lo mira — el cliente se entera antes que VIM, y se entera porque no pudo facturarle a su
 * comensal.
 *
 * Aquí se ve la cartera entera de un vistazo y ordenada por urgencia.
 *
 * LAS ESCRITURAS NO ESTÁN AQUÍ
 *
 * Acreditar folios y dar de baja el add-on siguen pasando por `PATCH /api/tenants/[id]`, que ya
 * mueve saldo y ledger en una transacción y deja auditoría. Duplicar esa lógica en un segundo
 * endpoint es como se acaban desincronizando dos caminos que deberían ser uno.
 */

const CODIGO_ADDON = "CFDI";

type FilaAddon = {
  tenant_id: string;
  fecha_inicio: string;
  precio_mensual_mxn: number | string | null;
};

type FilaTenant = { id: string; codigo: string; nombre_comercial: string; estado: string };

type FilaSaldo = {
  tenant_id: string;
  saldo_paquetes: number | null;
  folios_base_mensuales: number | null;
  folios_base_consumidos: number | null;
  periodo_actual: string | null;
  umbral_alerta: number | null;
};

type FilaMovimiento = {
  tenant_id: string;
  tipo: string;
  cantidad: number | null;
  created_at: string;
};

const n = (v: unknown): number => Number(v ?? 0);

export async function GET(req: Request) {
  const auth = autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  const { data: addonRaw, error: eAddon } = await sb
    .from("addons")
    .select("id, codigo, nombre, precio_mensual_mxn")
    .eq("codigo", CODIGO_ADDON)
    .maybeSingle();
  if (eAddon) return NextResponse.json({ error: eAddon.message }, { status: 500 });
  const addon = addonRaw as unknown as { id: string; nombre: string; precio_mensual_mxn: number } | null;
  if (!addon) return NextResponse.json({ error: "ADDON_CFDI_NO_EXISTE" }, { status: 500 });

  // Solo los VIGENTES. Una baja no borra la fila —le pone `fecha_fin`— para conservar la historia,
  // así que sin este filtro un cliente que canceló el año pasado seguiría apareciendo como activo.
  const { data: contratadosRaw, error: eContratados } = await sb
    .from("tenant_addons")
    .select("tenant_id, fecha_inicio, precio_mensual_mxn")
    .eq("addon_id", addon.id)
    .eq("activo", true)
    .order("fecha_inicio", { ascending: true });
  if (eContratados) return NextResponse.json({ error: eContratados.message }, { status: 500 });
  const contratados = (contratadosRaw ?? []) as unknown as FilaAddon[];

  const { data: paquetes } = await sb
    .from("folios_paquetes")
    .select("id, codigo, nombre, cantidad_folios, precio_mxn")
    .eq("activo", true)
    .order("orden_visualizacion");

  if (contratados.length === 0) {
    return NextResponse.json({ addon, clientes: [], paquetes: paquetes ?? [], totales: vacio() });
  }

  const ids = contratados.map((c) => c.tenant_id);

  const [{ data: tenantsRaw }, { data: saldosRaw }, { data: movsRaw }] = await Promise.all([
    sb.from("tenants").select("id, codigo, nombre_comercial, estado").in("id", ids),
    sb
      .from("tenant_folios_saldo")
      .select("tenant_id, saldo_paquetes, folios_base_mensuales, folios_base_consumidos, periodo_actual, umbral_alerta")
      .in("tenant_id", ids),
    // Última recarga: la más reciente que SUMÓ folios. Se piden los movimientos de recarga de
    // todos estos tenants ordenados de nuevo a viejo y se toma el primero de cada uno; el `limit`
    // es holgado para la cartera actual y evita traerse el ledger entero.
    sb
      .from("folios_movimientos")
      .select("tenant_id, tipo, cantidad, created_at")
      .in("tenant_id", ids)
      .in("tipo", ["COMPRA_PAQUETE", "AJUSTE_MANUAL"])
      .gt("cantidad", 0)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const tenants = new Map((((tenantsRaw ?? []) as unknown as FilaTenant[])).map((t) => [t.id, t]));
  const saldos = new Map((((saldosRaw ?? []) as unknown as FilaSaldo[])).map((s) => [s.tenant_id, s]));

  const ultimaRecarga = new Map<string, { fecha: string; tipo: string; cantidad: number }>();
  for (const m of ((movsRaw ?? []) as unknown as FilaMovimiento[])) {
    // Vienen ordenados de nuevo a viejo, así que el primero que se ve de cada tenant es el último.
    if (!ultimaRecarga.has(m.tenant_id)) {
      ultimaRecarga.set(m.tenant_id, { fecha: m.created_at, tipo: m.tipo, cantidad: n(m.cantidad) });
    }
  }

  const clientes = contratados.map((c) => {
    const t = tenants.get(c.tenant_id);
    const s = saldos.get(c.tenant_id);
    const paquetesRestantes = Math.max(n(s?.saldo_paquetes), 0);
    // La base mensual no se acumula y la global se timbra aunque no queden: el consumido puede
    // pasarse de la base, y un negativo restaría de los paquetes, que sí están pagados.
    const baseRestante = Math.max(n(s?.folios_base_mensuales) - n(s?.folios_base_consumidos), 0);
    const umbral = s?.umbral_alerta != null ? n(s.umbral_alerta) : 25;
    const disponibles = paquetesRestantes + baseRestante;
    return {
      tenantId: c.tenant_id,
      codigo: t?.codigo ?? "—",
      nombre: t?.nombre_comercial ?? "(empresa no encontrada)",
      estadoTenant: t?.estado ?? "—",
      fechaInicio: c.fecha_inicio,
      precioMensual: n(c.precio_mensual_mxn ?? addon.precio_mensual_mxn),
      paquetes: paquetesRestantes,
      baseMensual: n(s?.folios_base_mensuales),
      baseConsumidos: n(s?.folios_base_consumidos),
      baseRestante,
      disponibles,
      periodo: s?.periodo_actual ?? null,
      umbral,
      // `sinSaldo` primero: quien no puede facturar es más urgente que quien va justo.
      nivel: disponibles <= 0 ? "agotado" : disponibles <= umbral ? "pocos" : "ok",
      ultimaRecarga: ultimaRecarga.get(c.tenant_id) ?? null,
      // Un cliente que paga el add-on pero cuyo saldo nunca se creó no puede timbrar y no hay
      // nada en pantalla que lo delate. Se marca explícito en vez de enseñar un cero ambiguo.
      sinFilaDeSaldo: s == null,
    };
  });

  const orden = { agotado: 0, pocos: 1, ok: 2 } as const;
  clientes.sort(
    (a, b) =>
      orden[a.nivel as keyof typeof orden] - orden[b.nivel as keyof typeof orden] ||
      a.disponibles - b.disponibles ||
      a.nombre.localeCompare(b.nombre, "es"),
  );

  return NextResponse.json({
    addon,
    clientes,
    paquetes: paquetes ?? [],
    totales: {
      clientes: clientes.length,
      agotados: clientes.filter((c) => c.nivel === "agotado").length,
      pocos: clientes.filter((c) => c.nivel === "pocos").length,
      foliosDisponibles: clientes.reduce((s, c) => s + c.disponibles, 0),
      mrr: clientes.reduce((s, c) => s + c.precioMensual, 0),
    },
  });
}

function vacio() {
  return { clientes: 0, agotados: 0, pocos: 0, foliosDisponibles: 0, mrr: 0 };
}
