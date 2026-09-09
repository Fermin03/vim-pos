"use client";
import { employeeClient } from "../supabase";
import type { DatosEntrega, DatosTicketImpresion, LineaImpresion, PagoImpresion } from "./tipos";

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_CREDITO: "Tarjeta de crédito",
  TARJETA_DEBITO: "Tarjeta de débito",
  TRANSFERENCIA: "Transferencia",
  APP_RAPPI: "Rappi", APP_UBEREATS: "Uber Eats", APP_DIDI: "DiDi", APP_IFOOD: "iFood", APP_OTRO: "App externa",
};
const MODO_LABEL: Record<string, string> = {
  COMER_AQUI: "Comedor", PARA_LLEVAR: "Para llevar", DRIVE_THRU: "Pick-up", DELIVERY_PROPIO: "Domicilio",
};

type Ctx = { token: string; cajeroNombre: string; cajaNombre: string };

/**
 * Suma a cada PADRE el total de sus HIJOS —que van a precio 0 y solo cargan lo que el cliente
 * pagó de más en extras (migración 0111: `agregar_combo_a_ticket`)— para que el ticket muestre el
 * precio completo del combo en un solo renglón ("1x Combo $190").
 *
 * Función PURA con pruebas propias (`__tests__/ticket-datos.test.ts`): antes vivía inline aquí,
 * sin archivo de pruebas, y el fixture del builder ya traía el total calculado — una regresión en
 * el plegado (perder el `?? 0`, sumar dos veces, cruzar el `parentId`) habría pasado las 158
 * pruebas sin que nadie se enterara. Es dinero que ve el cliente.
 *
 * No muta `lineas` ni los objetos que contiene: el llamador arma este arreglo fresco en cada
 * lectura, pero una función que muta su entrada es una trampa para quien la reuse más adelante.
 */
export function foldearHijosEnPadre(lineas: LineaImpresion[]): LineaImpresion[] {
  const hijosTotal = new Map<string, number>();
  for (const l of lineas) {
    if (l.comboRol === "HIJO" && l.parentId) {
      hijosTotal.set(l.parentId, (hijosTotal.get(l.parentId) ?? 0) + l.totalMxn);
    }
  }
  return lineas.map((l) => {
    if (l.comboRol !== "PADRE") return l;
    const extra = hijosTotal.get(l.id) ?? 0;
    if (extra === 0) return l; // sin hijos con costo: nada que sumar, ni copia que hacer
    return { ...l, totalMxn: Math.round((l.totalMxn + extra) * 100) / 100 };
  });
}

/** Lee el ticket persistido y arma los datos planos para impresión (bajo RLS del empleado). */
export async function leerTicketParaImpresion(ticketId: string, ctx: Ctx): Promise<DatosTicketImpresion> {
  const sb = employeeClient(ctx.token);

  const { data: t, error: e1 } = await sb
    .from("tickets")
    .select("folio_completo, modo_servicio, cliente_id, direccion_entrega_id, nombre_cliente, subtotal_mxn, descuentos_manuales_mxn, iva_mxn, total_mxn, propina_mxn, fecha_pago, created_at, sucursal_id, tenant_id")
    .eq("id", ticketId)
    .single();
  if (e1 || !t) throw new Error(e1?.message ?? "Ticket no encontrado");
  const tk = t as Record<string, string | number | null>;

  const { data: items, error: e2 } = await sb
    .from("ticket_items")
    .select(
      "id, producto_nombre_snapshot, cantidad, total_item_mxn, nota_cocina, " +
        "parent_item_id, combo_rol, combo_grupo_nombre_snapshot, " +
        "ticket_item_modificadores(opcion_nombre_snapshot, precio_extra_snapshot, cantidad), " +
        // El área se resuelve aquí, con el ticket: producto primero, categoría si el producto no
        // tiene. Traerla en la misma consulta evita una segunda vuelta por renglón en hora pico.
        "producto:productos(area_cocina_id, area:areas_cocina(nombre), " +
        "categoria:categorias(area_cocina_id, area:areas_cocina(nombre)))",
    )
    .eq("ticket_id", ticketId)
    .eq("cancelado", false)
    // El padre debe quedar antes que sus hijos: el ticket y la comanda dependen de ese orden
    // (numerar el combo, indentar los hijos debajo) y `orden_visualizacion` es lo que lo garantiza.
    .order("orden_visualizacion", { ascending: true });
  if (e2) throw new Error(e2.message);
  const lineas: LineaImpresion[] = (items ?? []).map((it) => {
    type Area = { nombre: string } | null;
    type Prod = { area_cocina_id: string | null; area: Area; categoria: { area_cocina_id: string | null; area: Area } | null } | null;
    type Mod = { opcion_nombre_snapshot: string; precio_extra_snapshot: string | number | null; cantidad: number | null };
    // `as unknown as`: con el select anidado supabase-js no infiere la forma y devuelve su tipo
    // de error genérico. La forma real es la de abajo.
    const r = it as unknown as {
      id: string; producto_nombre_snapshot: string; cantidad: number; total_item_mxn: string | number; nota_cocina: string | null;
      parent_item_id: string | null; combo_rol: "PADRE" | "HIJO" | null; combo_grupo_nombre_snapshot: string | null;
      ticket_item_modificadores: Mod[] | null; producto: Prod;
    };
    const prod = r.producto;
    // El producto manda sobre la categoría: la categoría es el valor por defecto y el producto la
    // excepción (una limonada preparada en cocina dentro de la categoría Bebidas, por ejemplo).
    const areaId = prod?.area_cocina_id ?? prod?.categoria?.area_cocina_id ?? null;
    const areaNombre = prod?.area_cocina_id ? (prod.area?.nombre ?? null) : (prod?.categoria?.area?.nombre ?? null);
    return {
      id: r.id,
      cantidad: Number(r.cantidad),
      nombre: r.producto_nombre_snapshot,
      totalMxn: Number(r.total_item_mxn),
      modificadores: (r.ticket_item_modificadores ?? []).map((m) => m.opcion_nombre_snapshot),
      notaCocina: r.nota_cocina ?? null,
      areaId,
      areaNombre,
      comboRol: (r.combo_rol as "PADRE" | "HIJO" | null) ?? null,
      parentId: (r.parent_item_id as string) ?? null,
      grupoNombre: (r.combo_grupo_nombre_snapshot as string) ?? null,
      extras: (r.ticket_item_modificadores ?? [])
        .filter((m) => Number(m.precio_extra_snapshot ?? 0) > 0)
        .map((m) => ({ nombre: m.opcion_nombre_snapshot, importeMxn: Number(m.precio_extra_snapshot) * Number(m.cantidad ?? 1) * Number(r.cantidad) })),
    };
  });

  // El importe del PADRE que llega en `total_item_mxn` es el precio del combo tal cual se fijó al
  // agregarlo (migración 0111: `agregar_combo_a_ticket`); los hijos van a precio 0 y solo cargan lo
  // que el cliente pagó de más en extras. Para que el ticket muestre "1x Combo $190" con esos extras
  // adentro, se suman aquí al padre, UNA sola vez — ver `foldearHijosEnPadre` y sus pruebas.
  const lineasConCombo = foldearHijosEnPadre(lineas);

  const { data: pagos, error: e3 } = await sb
    .from("pagos")
    .select("metodo_pago, monto_mxn, monto_recibido_mxn, cambio_mxn")
    .eq("ticket_id", ticketId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (e3) throw new Error(e3.message);
  const pagosImp: PagoImpresion[] = (pagos ?? []).map((p) => {
    const r = p as { metodo_pago: string; monto_mxn: string | number; monto_recibido_mxn: string | number | null; cambio_mxn: string | number };
    return {
      metodo: METODO_LABEL[r.metodo_pago] ?? r.metodo_pago,
      montoMxn: Number(r.monto_mxn),
      recibidoMxn: r.monto_recibido_mxn == null ? null : Number(r.monto_recibido_mxn),
      cambioMxn: Number(r.cambio_mxn),
    };
  });

  const { data: suc } = await sb
    .from("sucursales")
    .select("nombre, direccion_calle, direccion_numero, direccion_colonia, ciudad, estado_geo, codigo_postal, telefono")
    .eq("id", tk.sucursal_id as string)
    .single();
  const s = (suc ?? {}) as Record<string, string | null>;
  const direccion = [
    [s.direccion_calle, s.direccion_numero].filter(Boolean).join(" "),
    s.direccion_colonia,
    [s.ciudad, s.estado_geo].filter(Boolean).join(", "),
    s.codigo_postal ? `CP ${s.codigo_postal}` : null,
  ].filter(Boolean).join(", ") || null;

  // Datos de entrega: solo en domicilio. El repartidor necesita a quién buscar, dónde y con
  // qué referencias; sin esto el ticket no le sirve para entregar. En los demás modos no se
  // imprime —el cliente está enfrente y sus datos no tienen por qué salir en papel.
  const entrega = tk.modo_servicio === "DELIVERY_PROPIO"
    ? await leerEntrega(sb, tk.cliente_id as string | null, tk.direccion_entrega_id as string | null)
    : null;

  // El QR de autofacturación es opcional por tenant. Sin fila de configuración se trata como
  // APAGADO: es el estado de casi todos hoy, y prometer factura sin portal es peor que callar.
  const { data: cfg } = await sb
    .from("configuracion_tenant")
    .select("mostrar_qr_factura_ticket")
    .eq("tenant_id", tk.tenant_id as string)
    .maybeSingle();
  const qrActivo = ((cfg ?? null) as { mostrar_qr_factura_ticket: boolean } | null)?.mostrar_qr_factura_ticket === true;

  const { data: ten } = await sb
    .from("tenants")
    .select("codigo, nombre_comercial, razon_social, rfc, logo_url")
    .eq("id", tk.tenant_id as string)
    .single();
  const tn = (ten ?? {}) as Record<string, string | null>;

  return {
    negocio: { nombre: tn.nombre_comercial ?? "Negocio", razonSocial: tn.razon_social ?? null, rfc: tn.rfc ?? null, logoUrl: tn.logo_url ?? null },
    sucursal: { nombre: (s.nombre as string) ?? ctx.cajaNombre, direccion, telefono: s.telefono ?? null },
    meta: {
      folio: (tk.folio_completo as string) ?? "—",
      fechaIso: (tk.fecha_pago as string) ?? (tk.created_at as string) ?? new Date().toISOString(),
      cajero: ctx.cajeroNombre,
      caja: ctx.cajaNombre,
      modoServicio: MODO_LABEL[tk.modo_servicio as string] ?? (tk.modo_servicio as string) ?? "",
      modo: (tk.modo_servicio as string) ?? "",
      nombreCliente: (tk.nombre_cliente as string) ?? null,
    },
    entrega,
    lineas: lineasConCombo,
    totales: {
      subtotal: Number(tk.subtotal_mxn), descuentos: Number(tk.descuentos_manuales_mxn),
      iva: Number(tk.iva_mxn), total: Number(tk.total_mxn), propina: Number(tk.propina_mxn),
    },
    pagos: pagosImp,
    // Dominio .com.mx: el que VIM tiene registrado. Antes decía `factura.vimpos.mx`, sin el
    // `.com`, que es de alguien más — cada ticket impreso habría mandado a los clientes del
    // restaurante a una dirección ajena en cuanto se encendiera el QR.
    qrUrl: qrActivo ? `https://factura.vimpos.com.mx/${tn.codigo ?? "negocio"}?folio=${tk.folio_completo ?? ""}` : null,
    ancho: 80,
  };
}

/** Cliente + dirección de entrega. Si algo falla, el ticket sale igual: entregar sin
 *  referencias es peor que no imprimirlas, pero no imprimir NADA es peor todavía. */
export async function leerEntrega(
  sb: ReturnType<typeof employeeClient>,
  clienteId: string | null,
  direccionId: string | null,
): Promise<DatosEntrega | null> {
  if (!clienteId && !direccionId) return null;

  let cliente: string | null = null;
  let telefono: string | null = null;
  if (clienteId) {
    const { data } = await sb
      .from("clientes")
      .select("nombre, apellido_paterno, apellido_materno, telefono")
      .eq("id", clienteId)
      .maybeSingle();
    const c = (data ?? {}) as Record<string, string | null>;
    cliente = [c.nombre, c.apellido_paterno, c.apellido_materno].filter(Boolean).join(" ") || null;
    telefono = c.telefono ?? null;
  }

  let direccion: string | null = null;
  let referencias: string | null = null;
  let notasRepartidor: string | null = null;
  if (direccionId) {
    const { data } = await sb
      .from("direcciones_cliente")
      .select("calle, numero_exterior, numero_interior, colonia, ciudad, estado_geo, codigo_postal, referencias, notas_repartidor")
      .eq("id", direccionId)
      .maybeSingle();
    const d = (data ?? {}) as Record<string, string | null>;
    direccion = [
      [d.calle, d.numero_exterior].filter(Boolean).join(" ") + (d.numero_interior ? ` int. ${d.numero_interior}` : ""),
      d.colonia,
      [d.ciudad, d.estado_geo].filter(Boolean).join(", "),
      d.codigo_postal ? `CP ${d.codigo_postal}` : null,
    ].map((x) => (x ?? "").trim()).filter(Boolean).join(", ") || null;
    referencias = d.referencias ?? null;
    notasRepartidor = d.notas_repartidor ?? null;
  }

  if (!cliente && !telefono && !direccion) return null;
  return { cliente, telefono, direccion, referencias, notasRepartidor };
}

/**
 * Estación de preparación de unos renglones concretos.
 *
 * Hace falta para la comanda de CANCELACIÓN: esos renglones ya están marcados como cancelados, así
 * que `leerTicketParaImpresion` —que los filtra— no los devuelve. Y el aviso tiene que llegar a la
 * misma impresora donde salió el original: si una bebida se pidió en la barra y la cancelación se
 * imprime en cocina, la barra la sigue preparando.
 */
export async function leerAreasDeItems(
  token: string,
  itemIds: string[],
): Promise<Map<string, { areaId: string | null; areaNombre: string | null }>> {
  const mapa = new Map<string, { areaId: string | null; areaNombre: string | null }>();
  if (itemIds.length === 0) return mapa;
  const { data, error } = await employeeClient(token)
    .from("ticket_items")
    .select(
      "id, producto:productos(area_cocina_id, area:areas_cocina(nombre), " +
        "categoria:categorias(area_cocina_id, area:areas_cocina(nombre)))",
    )
    .in("id", itemIds);
  if (error) throw new Error(error.message);
  type Area = { nombre: string } | null;
  type Fila = { id: string; producto: { area_cocina_id: string | null; area: Area; categoria: { area_cocina_id: string | null; area: Area } | null } | null };
  for (const f of (data ?? []) as unknown as Fila[]) {
    const prod = f.producto;
    mapa.set(f.id, {
      areaId: prod?.area_cocina_id ?? prod?.categoria?.area_cocina_id ?? null,
      areaNombre: prod?.area_cocina_id ? (prod.area?.nombre ?? null) : (prod?.categoria?.area?.nombre ?? null),
    });
  }
  return mapa;
}
