// Edge Function: timbrar-cfdi (F8) — timbra un CFDI borrador contra el PAC.
// Flujo: el admin crea el borrador (RPC cfdi_crear_borrador desde el cliente) y luego llama
// aquí con { cfdi_id }. La función:
//   1) valida el JWT del llamante (debe ser DUEÑO/ADMIN del tenant),
//   2) carga el borrador (RLS del llamante),
//   3) llama al PAC (mock en dev / Facturapi @sin-verificar en prod),
//   4) marca TIMBRADO o ERROR con el JWT del llamante (auth.uid() = admin, respeta RLS).
//
// Local: supabase functions serve timbrar-cfdi --env-file supabase/functions/.env
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { timbrarConFailover } from "../_shared/pac/index.ts";
import { armarConceptos, ConceptosIncoherentes, type LineaTicket } from "../_shared/pac/conceptos.ts";

const ROLES_FACTURA = ["DUENO", "ADMIN"];

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);

  // Cliente con el JWT del llamante: respeta RLS y auth.uid() resuelve al admin.
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: u, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_INVALIDA" }, 401);

  let body: { cfdi_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  const cfdiId = body.cfdi_id;
  if (!cfdiId) return json({ error: "FALTA_CFDI_ID" }, 400);

  // Cargar el borrador (RLS del llamante restringe al tenant).
  const { data: cfdi, error: cErr } = await sb
    .from("tickets_cfdi")
    .select(
      "id, tenant_id, ticket_id, tipo_comprobante, estado_sat, emisor_rfc, emisor_razon_social, emisor_regimen_fiscal, emisor_lugar_expedicion, receptor_rfc, receptor_razon_social, receptor_uso_cfdi, receptor_codigo_postal, receptor_regimen_fiscal, receptor_email, metodo_pago_sat, forma_pago_sat, subtotal_mxn, descuento_mxn, iva_mxn, total_mxn, " +
        // El folio del ticket es OBLIGATORIO para Facturama y es lo que amarra el CFDI con la
        // venta. El logo en PNG alimenta el PDF: el SVG lo rechaza el PAC.
        // `tickets!tickets_cfdi_ticket_id_fkey`: desde 0082 existe `cfdi_global_tickets`, que
        // referencia a las dos tablas, así que PostgREST ve dos caminos y falla con PGRST201 si
        // no se le dice por cuál ir.
        "ticket:tickets!tickets_cfdi_ticket_id_fkey(folio_completo), tenant:tenants(logo_png_url)",
    )
    .eq("id", cfdiId)
    .maybeSingle();
  if (cErr) return json({ error: "RLS_ERROR", detalle: cErr.message }, 500);
  if (!cfdi) return json({ error: "CFDI_NO_EXISTE" }, 404);

  // SEC CN-026 — el rol se comprueba EN EL TENANT DEL CFDI, no en cualquiera del llamante.
  // Antes bastaba con ser DUEÑO/ADMIN en algún tenant: quien fuera dueño de A y cajero de B podía
  // timbrar facturas de B (el RLS le deja leer el borrador porque tiene acceso a B, y el chequeo
  // de rol se satisfacía con su rol en A). Se comprueba primero el CFDI y luego el rol en SU tenant.
  const { data: acc } = await sb
    .from("usuarios_acceso")
    .select("rol:roles(codigo)")
    .eq("usuario_id", u.user.id)
    .eq("tenant_id", (cfdi as { tenant_id: string }).tenant_id)
    .eq("activo", true);
  const roles = ((acc ?? []) as { rol: { codigo: string } | null }[])
    .map((a) => a.rol?.codigo)
    .filter(Boolean) as string[];
  if (!roles.some((r) => ROLES_FACTURA.includes(r))) {
    return json({ error: "SIN_PERMISO", detalle: "Solo DUEÑO/ADMIN pueden facturar" }, 403);
  }
  if (cfdi.estado_sat === "TIMBRADO") return json({ error: "YA_TIMBRADO" }, 409);
  if (cfdi.estado_sat !== "BORRADOR" && cfdi.estado_sat !== "ERROR_TIMBRADO") {
    return json({ error: "ESTADO_NO_TIMBRABLE", estado: cfdi.estado_sat }, 409);
  }

  const c = cfdi as Record<string, unknown>;
  const num = (v: unknown) => Number(v ?? 0);

  // Llamar al PAC con redundancia (Fase 4): principal → respaldo solo ante fallo de transporte.
  // El folio del ticket. Si por lo que sea no viniera, se cae a los últimos 8 del id del CFDI:
  // Facturama exige el campo, y quedarse sin timbrar por un folio ausente sería peor que timbrar
  // con uno derivado. Queda rastreable de todos modos por `pac_referencia`.
  const folioDelTicket = String(
    (c.ticket as { folio_completo?: string } | null)?.folio_completo ?? String(c.id).slice(-8),
  );
  const logoDelNegocio = (c.tenant as { logo_png_url?: string } | null)?.logo_png_url ?? null;

  // ---------------------------------------------------------------------------------------------
  // Los renglones del ticket, que son los conceptos del CFDI (fase 2).
  //
  // Se leen aquí y no en el adaptador porque el desglose fiscal es el mismo para cualquier PAC, y
  // porque el adaptador no debe saber de RLS ni de la forma de nuestras tablas.
  //
  // `cancelado = false`: un renglón cancelado antes del cobro no se pagó, así que no se factura.
  // ---------------------------------------------------------------------------------------------
  const ticketId = (cfdi as { ticket_id?: string }).ticket_id;
  if (!ticketId) return json({ error: "CFDI_SIN_TICKET" }, 409);

  const { data: filas, error: iErr } = await sb
    .from("ticket_items")
    .select(
      "producto_nombre_snapshot, cantidad, clave_sat_snapshot, unidad_sat_snapshot, " +
        "tasa_iva_snapshot, iva_incluido_en_precio_snapshot, subtotal_bruto_mxn, " +
        "monto_modificadores_mxn, descuento_item_mxn, promocion_item_mxn, iva_item_mxn, total_item_mxn",
    )
    .eq("ticket_id", ticketId)
    .eq("cancelado", false)
    .order("orden_visualizacion", { ascending: true });
  if (iErr) return json({ error: "ITEMS_ERROR", detalle: iErr.message }, 500);

  const lineas: LineaTicket[] = ((filas ?? []) as Record<string, unknown>[]).map((f) => ({
    descripcion: String(f.producto_nombre_snapshot),
    cantidad: num(f.cantidad),
    claveSat: (f.clave_sat_snapshot as string) ?? null,
    unidadSat: (f.unidad_sat_snapshot as string) ?? null,
    tasaIva: num(f.tasa_iva_snapshot),
    ivaIncluidoEnPrecio: Boolean(f.iva_incluido_en_precio_snapshot),
    subtotalBrutoMxn: num(f.subtotal_bruto_mxn),
    montoModificadoresMxn: num(f.monto_modificadores_mxn),
    descuentoItemMxn: num(f.descuento_item_mxn),
    promocionItemMxn: num(f.promocion_item_mxn),
    ivaItemMxn: num(f.iva_item_mxn),
    totalItemMxn: num(f.total_item_mxn),
  }));

  // ---------------------------------------------------------------------------------------------
  // Compuerta de folios.
  //
  // Se COMPRUEBA antes de timbrar y se CONSUME después. El orden no es casual: la inmensa mayoría
  // de los fallos son rechazos de validación —un CP que no cuadra con el RFC, un nombre que no es
  // el del padrón— y esos son frecuentísimos en el portal de autofactura. Cobrar un folio por cada
  // intento fallido de un comensal que se equivocó de código postal sería indefendible.
  //
  // El precio de este orden es una carrera estrecha: dos timbrados simultáneos con un solo folio
  // pasan los dos la comprobación. El segundo consumo falla contra el CHECK de la columna y queda
  // registrado; se prefiere eso a cobrar de más.
  // ---------------------------------------------------------------------------------------------
  const { data: saldoRaw } = await sb
    .from("tenant_folios_saldo")
    .select("folios_base_mensuales, folios_base_consumidos, saldo_paquetes")
    .eq("tenant_id", (cfdi as { tenant_id: string }).tenant_id)
    .maybeSingle();
  const saldo = saldoRaw as { folios_base_mensuales: number; folios_base_consumidos: number; saldo_paquetes: number } | null;
  const foliosDisponibles = saldo
    ? Math.max(saldo.folios_base_mensuales - saldo.folios_base_consumidos, 0) + saldo.saldo_paquetes
    : 0;
  if (foliosDisponibles <= 0) {
    return json({
      ok: false,
      error: "SIN_FOLIOS",
      mensaje: "No quedan folios para timbrar. Contacta a VIM para acreditar un paquete.",
    }, 402);
  }

  let armado;
  try {
    armado = armarConceptos(lineas, num(c.total_mxn));
  } catch (e) {
    // Datos incoherentes: no se reintenta ni se timbra "de todos modos". Se registra el error en
    // el CFDI para que quede rastro y alguien lo revise, porque el ticket ya se cobró.
    if (e instanceof ConceptosIncoherentes) {
      await sb.rpc("cfdi_marcar_error", {
        p_cfdi_id: cfdiId,
        p_codigo_error: "CONCEPTOS_INCOHERENTES",
        p_mensaje_error: e.message,
        p_request_payload: { renglones: lineas.length, total_ticket: num(c.total_mxn) },
        p_response_payload: {},
      });
      return json({ ok: false, estado: "ERROR_TIMBRADO", error: "CONCEPTOS_INCOHERENTES", mensaje: e.message }, 422);
    }
    throw e;
  }

  const res = await timbrarConFailover({
    cfdiId: String(c.id),
    tipoComprobante: String(c.tipo_comprobante),
    emisor: {
      rfc: String(c.emisor_rfc),
      razonSocial: String(c.emisor_razon_social),
      regimenFiscal: String(c.emisor_regimen_fiscal),
      lugarExpedicion: String(c.emisor_lugar_expedicion),
    },
    receptor: {
      rfc: String(c.receptor_rfc ?? ""),
      razonSocial: String(c.receptor_razon_social ?? ""),
      usoCfdi: String(c.receptor_uso_cfdi ?? ""),
      codigoPostal: String(c.receptor_codigo_postal ?? ""),
      regimenFiscal: String(c.receptor_regimen_fiscal ?? ""),
      email: (c.receptor_email as string) ?? null,
    },
    metodoPagoSat: String(c.metodo_pago_sat),
    formaPagoSat: String(c.forma_pago_sat),
    folio: folioDelTicket,
    logoUrl: logoDelNegocio,
    conceptos: armado.conceptos,
    // Los totales salen del desglose, no de `tickets_cfdi`. El encabezado del ticket suma el
    // descuento de renglón DOS veces (ya venía restado del subtotal) y no baja el IVA cuando el
    // descuento es del ticket completo: con esos números el CFDI no cumple
    // `Total = Subtotal − Descuento + Impuestos` y el PAC lo rechaza.
    subtotal: armado.subtotal,
    descuento: armado.descuento,
    iva: armado.iva,
    total: armado.total,
  });

  if (!res.ok) {
    await sb.rpc("cfdi_marcar_error", {
      p_cfdi_id: cfdiId,
      p_codigo_error: res.codigoError,
      p_mensaje_error: res.mensajeError,
      p_request_payload: { pac: res.pacUsado, failover: res.failover },
      p_response_payload: res.responsePayload,
    });
    return json({ ok: false, estado: "ERROR_TIMBRADO", error: res.codigoError, mensaje: res.mensajeError }, 502);
  }

  // Guardar XML en Storage sería el siguiente paso (bucket privado cfdi/); por ahora se
  // registran las rutas lógicas y el XML viaja en el response_payload para auditoría.
  const xmlPath = `cfdi/${cfdiId}.xml`;
  const pdfPath = `cfdi/${cfdiId}.pdf`;

  const { error: tErr } = await sb.rpc("cfdi_marcar_timbrado", {
    p_cfdi_id: cfdiId,
    p_uuid_fiscal: res.uuidFiscal,
    p_serie: res.serie,
    p_folio_fiscal: res.folioFiscal,
    p_fecha_timbrado: res.fechaTimbrado,
    p_fecha_emision: res.fechaEmision,
    p_xml_storage_path: xmlPath,
    p_pdf_storage_path: pdfPath,
    p_pac_referencia: res.pacReferencia,
    p_pac_costo_centavos: res.costoCentavos,
    p_request_payload: { pac: res.pacUsado, failover: res.failover },
    p_response_payload: res.responsePayload,
  });
  if (tErr) return json({ error: "MARCAR_TIMBRADO_ERROR", detalle: tErr.message }, 500);

  // El CFDI ya existe ante el SAT. Si el descuento falla, NO se deshace el timbrado ni se devuelve
  // error: el comprobante es real y tiene que quedar registrado. Se avisa en la respuesta para que
  // el descuadre se vea en vez de perderse.
  let folioConsumido = true;
  const { data: consumo, error: cErr2 } = await sb.rpc("consumir_folio_cfdi", {
    p_tenant_id: (cfdi as { tenant_id: string }).tenant_id,
    p_cfdi_id: cfdiId,
    p_es_global: false,
  });
  if (cErr2 || (consumo as { ok?: boolean } | null)?.ok === false) {
    folioConsumido = false;
    console.error(
      `[folios] CFDI ${cfdiId} timbrado pero el folio NO se descontó: ${cErr2?.message ?? JSON.stringify(consumo)}`,
    );
  }

  return json({
    folio_consumido: folioConsumido,
    ok: true,
    estado: "TIMBRADO",
    uuid_fiscal: res.uuidFiscal,
    serie: res.serie,
    folio_fiscal: res.folioFiscal,
    pac: res.pacUsado,
    failover: res.failover,
  });
});
