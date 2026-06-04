"use client";
import { employeeClient } from "../supabase";
import type { DatosTicketImpresion, LineaImpresion, PagoImpresion } from "./tipos";

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_CREDITO: "Tarjeta de crédito",
  TARJETA_DEBITO: "Tarjeta de débito",
  TRANSFERENCIA: "Transferencia",
  APP_RAPPI: "Rappi", APP_UBEREATS: "Uber Eats", APP_DIDI: "DiDi", APP_IFOOD: "iFood", APP_OTRO: "App externa",
};
const MODO_LABEL: Record<string, string> = {
  COMER_AQUI: "Comer aquí", PARA_LLEVAR: "Para llevar", DRIVE_THRU: "Drive-thru",
};

type Ctx = { token: string; cajeroNombre: string; cajaNombre: string };

/** Lee el ticket persistido y arma los datos planos para impresión (bajo RLS del empleado). */
export async function leerTicketParaImpresion(ticketId: string, ctx: Ctx): Promise<DatosTicketImpresion> {
  const sb = employeeClient(ctx.token);

  const { data: t, error: e1 } = await sb
    .from("tickets")
    .select("folio_completo, modo_servicio, subtotal_mxn, descuentos_manuales_mxn, iva_mxn, total_mxn, propina_mxn, fecha_pago, created_at, sucursal_id, tenant_id")
    .eq("id", ticketId)
    .single();
  if (e1 || !t) throw new Error(e1?.message ?? "Ticket no encontrado");
  const tk = t as Record<string, string | number | null>;

  const { data: items, error: e2 } = await sb
    .from("ticket_items")
    .select("id, producto_nombre_snapshot, cantidad, total_item_mxn, ticket_item_modificadores(opcion_nombre_snapshot)")
    .eq("ticket_id", ticketId)
    .eq("cancelado", false)
    .order("created_at", { ascending: true });
  if (e2) throw new Error(e2.message);
  const lineas: LineaImpresion[] = (items ?? []).map((it) => {
    const r = it as { producto_nombre_snapshot: string; cantidad: number; total_item_mxn: string | number; ticket_item_modificadores: { opcion_nombre_snapshot: string }[] | null };
    return {
      cantidad: Number(r.cantidad),
      nombre: r.producto_nombre_snapshot,
      totalMxn: Number(r.total_item_mxn),
      modificadores: (r.ticket_item_modificadores ?? []).map((m) => m.opcion_nombre_snapshot),
    };
  });

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

  const { data: ten } = await sb
    .from("tenants")
    .select("codigo, nombre_comercial, razon_social, rfc")
    .eq("id", tk.tenant_id as string)
    .single();
  const tn = (ten ?? {}) as Record<string, string | null>;

  return {
    negocio: { nombre: tn.nombre_comercial ?? "Negocio", razonSocial: tn.razon_social ?? null, rfc: tn.rfc ?? null },
    sucursal: { nombre: (s.nombre as string) ?? ctx.cajaNombre, direccion, telefono: s.telefono ?? null },
    meta: {
      folio: (tk.folio_completo as string) ?? "—",
      fechaIso: (tk.fecha_pago as string) ?? (tk.created_at as string) ?? new Date().toISOString(),
      cajero: ctx.cajeroNombre,
      caja: ctx.cajaNombre,
      modoServicio: MODO_LABEL[tk.modo_servicio as string] ?? (tk.modo_servicio as string) ?? "",
    },
    lineas,
    totales: {
      subtotal: Number(tk.subtotal_mxn), descuentos: Number(tk.descuentos_manuales_mxn),
      iva: Number(tk.iva_mxn), total: Number(tk.total_mxn), propina: Number(tk.propina_mxn),
    },
    pagos: pagosImp,
    qrUrl: `https://factura.vimpos.mx/${tn.codigo ?? "negocio"}?folio=${tk.folio_completo ?? ""}`,
    ancho: 80,
  };
}
