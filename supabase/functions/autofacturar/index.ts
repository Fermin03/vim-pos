// Edge Function: autofacturar (fase 7) — el portal público donde el comensal factura su ticket.
//
// Es la única superficie del producto que atiende a gente SIN sesión: quien escanea el QR del
// ticket no es usuario de nada. Eso cambia las reglas respecto al resto del código.
//
// POR QUÉ TODO PASA POR AQUÍ, INCLUIDA LA BÚSQUEDA
//
// La búsqueda podría hacerse desde el navegador con una función `SECURITY DEFINER` y saldría más
// corta. Se hace aquí para que la MISMA puerta limite el ritmo de las dos operaciones: sin eso,
// alguien puede recorrer folios a ciegas y averiguar cuánto vendió un negocio, ticket por ticket.
// El folio va impreso en un papel que el cliente ya tiene; adivinarlo desde fuera no debería salir
// gratis.
//
// USA service_role A PROPÓSITO Y ES LA EXCEPCIÓN, NO LA REGLA
//
// Un visitante anónimo no trae `tenant_id` en ningún JWT, así que el RLS no tiene con qué acotarlo
// y no hay sesión que suplantar. El acotamiento lo hace este código: cada consulta filtra por el
// tenant que resolvió el código del negocio de la URL, y ninguna acepta un identificador que venga
// del cliente. Si alguna vez hace falta tocar otra tabla desde aquí, ese filtro es obligatorio.
//
// Local: supabase functions serve autofacturar --env-file supabase/functions/.env
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { timbrarConFailover, obtenerFacturama, PAC_NO_CONFIGURADO } from "../_shared/pac/index.ts";
import { armarConceptos, ConceptosIncoherentes, type LineaTicket } from "../_shared/pac/conceptos.ts";

/**
 * Ritmo máximo por IP. Generoso para una persona —quien factura su comida lo intenta tres o cuatro
 * veces mientras encuentra su código postal— y estrecho para un script que recorre folios.
 */
const MAX_POR_VENTANA = 20;
const VENTANA_MS = 10 * 60 * 1000;
const intentos = new Map<string, { n: number; desde: number }>();

function ritmoExcedido(ip: string): boolean {
  const e = intentos.get(ip);
  if (!e || Date.now() - e.desde > VENTANA_MS) {
    intentos.set(ip, { n: 1, desde: Date.now() });
    return false;
  }
  e.n += 1;
  return e.n > MAX_POR_VENTANA;
}

/** Regímenes del receptor y los usos de CFDI que el SAT admite en cada uno. */
const USOS_POR_REGIMEN: Record<string, string[]> = {
  "601": ["G01", "G03", "I01", "I08", "P01"],   // General de ley personas morales
  "603": ["G01", "G03", "I01", "I08", "P01"],   // Personas morales sin fines de lucro
  "605": ["D01", "D02", "D03", "D04", "D07", "D10", "P01"], // Sueldos y salarios
  "606": ["G01", "G03", "I01", "I08", "D01", "D04", "P01"], // Arrendamiento
  "612": ["G01", "G03", "I01", "I08", "D01", "D02", "D04", "D07", "D10", "P01"], // Actividad empresarial
  "614": ["G01", "G03", "D01", "D04", "P01"],   // Ingresos por intereses
  "616": ["G01", "G03", "P01"],                 // Sin obligaciones fiscales
  "621": ["G01", "G03", "I01", "P01"],          // Incorporación fiscal
  "626": ["G01", "G03", "I01", "I08", "P01"],   // RESICO
};

const RFC_VALIDO = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconocida";
  if (ritmoExcedido(ip)) {
    return json({ error: "DEMASIADOS_INTENTOS", mensaje: "Demasiados intentos. Espera unos minutos." }, 429);
  }

  let body: {
    accion?: string; negocio?: string; folio?: string;
    receptor?: { rfc?: string; razonSocial?: string; regimenFiscal?: string; codigoPostal?: string; usoCfdi?: string; email?: string };
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }

  const codigoNegocio = String(body.negocio ?? "").trim().toLowerCase();
  const folio = String(body.folio ?? "").trim().toUpperCase();
  if (!codigoNegocio || !folio) return json({ error: "FALTAN_DATOS" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // ── El negocio ──────────────────────────────────────────────────────────────────────────────
  const { data: tenantRaw } = await sb
    .from("tenants")
    .select("id, nombre_comercial, razon_social, rfc, regimen_fiscal, codigo_postal_fiscal, logo_png_url")
    .eq("codigo", codigoNegocio)
    .is("deleted_at", null)
    .maybeSingle();
  const tenant = tenantRaw as {
    id: string; nombre_comercial: string; razon_social: string | null; rfc: string | null;
    regimen_fiscal: string | null; codigo_postal_fiscal: string | null; logo_png_url: string | null;
  } | null;
  if (!tenant) return json({ estado: "NEGOCIO_NO_EXISTE", mensaje: "No encontramos ese negocio." }, 404);

  // El add-on decide si este negocio ofrece autofactura. Sin él, el portal no expone nada suyo.
  const { data: addonActivo } = await sb.rpc("tenant_addon_activo", { p_tenant_id: tenant.id, p_codigo: "CFDI" });
  if (addonActivo !== true) {
    return json({
      estado: "SIN_FACTURACION",
      mensaje: `${tenant.nombre_comercial} todavía no tiene la facturación en línea activada. Pídela en el mostrador.`,
    }, 409);
  }

  // ── El ticket ───────────────────────────────────────────────────────────────────────────────
  const { data: ticketRaw } = await sb
    .from("tickets")
    .select("id, folio_completo, dia_contable, total_mxn, estado_fiscal")
    .eq("tenant_id", tenant.id)          // SIEMPRE acotado al negocio de la URL
    .eq("folio_completo", folio)
    .maybeSingle();
  const ticket = ticketRaw as {
    id: string; folio_completo: string; dia_contable: string; total_mxn: number; estado_fiscal: string;
  } | null;

  if (!ticket) {
    return json({
      estado: "NO_EXISTE",
      mensaje: "No encontramos ese folio. Revísalo en tu ticket: va completo, con letras y guion.",
      negocio: tenant.nombre_comercial,
    }, 404);
  }

  const { data: puede } = await sb.rpc("ticket_autofacturable", { p_ticket_id: ticket.id });

  // ── Buscar ──────────────────────────────────────────────────────────────────────────────────
  if (body.accion !== "timbrar") {
    if (puede !== true) {
      return json({
        estado: "NO_DISPONIBLE",
        // Sin detallar el porqué: para quien factura, "ya no se puede" y "ya está facturado" llevan
        // al mismo sitio —al mostrador— y precisar cuál es le diría a un curioso si el folio existe.
        mensaje: "Este ticket ya no se puede facturar en línea. Acude al negocio y te ayudan.",
        negocio: tenant.nombre_comercial,
      }, 409);
    }
    return json({
      estado: "OK",
      negocio: tenant.nombre_comercial,
      logo: tenant.logo_png_url,
      ticket: { folio: ticket.folio_completo, fecha: ticket.dia_contable, total: Number(ticket.total_mxn) },
      usosPorRegimen: USOS_POR_REGIMEN,
    });
  }

  // ── Timbrar ─────────────────────────────────────────────────────────────────────────────────
  if (puede !== true) {
    return json({ estado: "NO_DISPONIBLE", mensaje: "Este ticket ya no se puede facturar en línea." }, 409);
  }

  const r = body.receptor ?? {};
  const rfc = String(r.rfc ?? "").trim().toUpperCase();
  const razonSocial = String(r.razonSocial ?? "").trim();
  const regimenFiscal = String(r.regimenFiscal ?? "").trim();
  const codigoPostal = String(r.codigoPostal ?? "").trim();
  const usoCfdi = String(r.usoCfdi ?? "").trim();
  const email = String(r.email ?? "").trim();

  if (!RFC_VALIDO.test(rfc)) return json({ estado: "DATOS", campo: "rfc", mensaje: "El RFC no tiene un formato válido." }, 400);
  if (razonSocial.length < 3) return json({ estado: "DATOS", campo: "razonSocial", mensaje: "Falta el nombre o razón social." }, 400);
  if (!/^\d{5}$/.test(codigoPostal)) return json({ estado: "DATOS", campo: "codigoPostal", mensaje: "El código postal son 5 dígitos." }, 400);
  const usosValidos = USOS_POR_REGIMEN[regimenFiscal];
  if (!usosValidos) return json({ estado: "DATOS", campo: "regimenFiscal", mensaje: "Elige tu régimen fiscal." }, 400);
  if (!usosValidos.includes(usoCfdi)) {
    // El PAC rechaza esta combinación, y su mensaje no dice qué hacer. Se ataja antes.
    return json({ estado: "DATOS", campo: "usoCfdi", mensaje: "Ese uso de CFDI no aplica a tu régimen fiscal." }, 400);
  }

  if (!tenant.rfc || !tenant.razon_social || !tenant.regimen_fiscal || !tenant.codigo_postal_fiscal) {
    return json({ estado: "ERROR", mensaje: "El negocio no tiene completos sus datos fiscales." }, 409);
  }

  // Folios: si no quedan, no se timbra. Se dice en lenguaje del comensal, que no tiene por qué
  // saber qué es un folio fiscal ni de quién es la culpa.
  const { data: saldoRaw } = await sb
    .from("tenant_folios_saldo")
    .select("folios_base_mensuales, folios_base_consumidos, saldo_paquetes")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  const s = saldoRaw as { folios_base_mensuales: number; folios_base_consumidos: number; saldo_paquetes: number } | null;
  const disponibles = s ? Math.max(s.folios_base_mensuales - s.folios_base_consumidos, 0) + s.saldo_paquetes : 0;
  if (disponibles <= 0) {
    return json({ estado: "ERROR", mensaje: "El negocio no puede emitir facturas en este momento. Avísale en el mostrador." }, 409);
  }

  // ── Los renglones ───────────────────────────────────────────────────────────────────────────
  const { data: itemsRaw, error: iErr } = await sb
    .from("ticket_items")
    .select(
      "producto_nombre_snapshot, cantidad, clave_sat_snapshot, unidad_sat_snapshot, tasa_iva_snapshot, " +
        "iva_incluido_en_precio_snapshot, subtotal_bruto_mxn, monto_modificadores_mxn, " +
        "descuento_item_mxn, promocion_item_mxn, iva_item_mxn, total_item_mxn",
    )
    .eq("ticket_id", ticket.id)
    .eq("cancelado", false)
    .order("orden_visualizacion");
  if (iErr) return json({ estado: "ERROR", mensaje: "No se pudo leer el ticket." }, 500);

  const lineas: LineaTicket[] = ((itemsRaw ?? []) as Record<string, unknown>[]).map((f) => ({
    descripcion: String(f.producto_nombre_snapshot),
    cantidad: Number(f.cantidad ?? 0),
    claveSat: (f.clave_sat_snapshot as string) ?? null,
    unidadSat: (f.unidad_sat_snapshot as string) ?? null,
    tasaIva: Number(f.tasa_iva_snapshot ?? 0),
    ivaIncluidoEnPrecio: Boolean(f.iva_incluido_en_precio_snapshot),
    subtotalBrutoMxn: Number(f.subtotal_bruto_mxn ?? 0),
    montoModificadoresMxn: Number(f.monto_modificadores_mxn ?? 0),
    descuentoItemMxn: Number(f.descuento_item_mxn ?? 0),
    promocionItemMxn: Number(f.promocion_item_mxn ?? 0),
    ivaItemMxn: Number(f.iva_item_mxn ?? 0),
    totalItemMxn: Number(f.total_item_mxn ?? 0),
  }));

  let armado;
  try {
    armado = armarConceptos(lineas, Number(ticket.total_mxn));
  } catch (e) {
    if (e instanceof ConceptosIncoherentes) {
      console.error(`[autofactura] ticket ${ticket.id} incoherente: ${e.message}`);
      return json({ estado: "ERROR", mensaje: "No pudimos preparar la factura de este ticket. Avísale al negocio." }, 422);
    }
    throw e;
  }

  const { data: draftRaw, error: dErr } = await sb
    .from("tickets_cfdi")
    .insert({
      tenant_id: tenant.id,
      ticket_id: ticket.id,
      tipo_comprobante: "INGRESO",
      receptor_rfc: rfc,
      receptor_razon_social: razonSocial,
      receptor_uso_cfdi: usoCfdi,
      receptor_codigo_postal: codigoPostal,
      receptor_regimen_fiscal: regimenFiscal,
      receptor_email: email || null,
      emisor_rfc: tenant.rfc,
      emisor_razon_social: tenant.razon_social,
      emisor_regimen_fiscal: tenant.regimen_fiscal,
      emisor_lugar_expedicion: tenant.codigo_postal_fiscal,
      subtotal_mxn: armado.subtotal,
      descuento_mxn: armado.descuento,
      iva_mxn: armado.iva,
      total_mxn: armado.total,
      metodo_pago_sat: "PUE",
      forma_pago_sat: "01",
      estado_sat: "BORRADOR",
      pac_proveedor: "FACTURAMA",
    })
    .select("id")
    .single();
  if (dErr) {
    // El índice único de "un CFDI vigente por ticket" es la última defensa contra dos personas
    // facturando el mismo ticket a la vez. Si salta, alguien se adelantó.
    const chocó = /duplicate key|unique/i.test(dErr.message);
    return json({
      estado: chocó ? "NO_DISPONIBLE" : "ERROR",
      mensaje: chocó ? "Este ticket acaba de ser facturado." : "No se pudo iniciar la factura.",
    }, 409);
  }
  const cfdiId = String((draftRaw as { id: string }).id);

  const res = await timbrarConFailover({
    cfdiId,
    tipoComprobante: "INGRESO",
    emisor: {
      rfc: tenant.rfc,
      razonSocial: tenant.razon_social,
      regimenFiscal: tenant.regimen_fiscal,
      lugarExpedicion: tenant.codigo_postal_fiscal,
    },
    receptor: { rfc, razonSocial, usoCfdi, codigoPostal, regimenFiscal, email: email || null },
    metodoPagoSat: "PUE",
    formaPagoSat: "01",
    folio: ticket.folio_completo,
    logoUrl: tenant.logo_png_url,
    conceptos: armado.conceptos,
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
      p_request_payload: { origen: "portal" },
      p_response_payload: res.responsePayload,
    });
    /* Esto NO es un rechazo del SAT: es que a nosotros nos falta el PAC. Mandarlo por el camino
       de siempre le diría al comensal que revise su Constancia por un fallo que no es suyo, y lo
       tendría reintentando sin que nada pueda cambiar. Se separa a propósito. */
    if (res.codigoError === PAC_NO_CONFIGURADO) {
      console.error(`[autofactura] ${cfdiId}: sin PAC configurado, no se timbró`);
      return json({
        estado: "NO_DISPONIBLE",
        campo: null,
        mensaje: "La facturación de este restaurante todavía no está activa. Guarda tu ticket y pídesela directamente en el negocio.",
      }, 503);
    }
    return json({ estado: "RECHAZO", campo: campoDelRechazo(res.mensajeError), mensaje: traducir(res.mensajeError) }, 400);
  }

  await sb.rpc("cfdi_marcar_timbrado", {
    p_cfdi_id: cfdiId,
    p_uuid_fiscal: res.uuidFiscal,
    p_serie: res.serie,
    p_folio_fiscal: res.folioFiscal,
    p_fecha_timbrado: res.fechaTimbrado,
    p_fecha_emision: res.fechaEmision,
    p_xml_storage_path: `cfdi/${cfdiId}.xml`,
    p_pdf_storage_path: `cfdi/${cfdiId}.pdf`,
    p_pac_referencia: res.pacReferencia,
    p_pac_costo_centavos: res.costoCentavos,
    p_request_payload: { origen: "portal" },
    p_response_payload: res.responsePayload,
  });
  await sb.rpc("consumir_folio_cfdi", { p_tenant_id: tenant.id, p_cfdi_id: cfdiId, p_es_global: false });

  // Los archivos se descargan AHORA. En Multiemisor el PAC no guarda nada: si no se bajan en este
  // momento, se pierden y el cliente se queda sin comprobante que enseñar.
  const pac = obtenerFacturama();
  const [xml, pdf] = pac
    ? await Promise.all([pac.descargar(res.pacReferencia, "xml"), pac.descargar(res.pacReferencia, "pdf")])
    : [null, null];

  // El correo lo manda Facturama con los adjuntos. Si falla, NO se rompe nada: la factura está
  // timbrada y el comensal la tiene ahí para descargar. Se avisa en la respuesta y se deja rastro
  // en el log, que es lo único que hace falta para investigarlo después.
  let correoEnviado = false;
  if (email && pac) {
    const envio = await pac.enviarPorCorreo(res.pacReferencia, email);
    correoEnviado = envio.ok;
    if (!envio.ok) console.error(`[autofactura] CFDI ${cfdiId} timbrado pero sin enviar a ${email}: ${envio.mensaje}`);
  }

  return json({
    estado: "TIMBRADO",
    uuid: res.uuidFiscal,
    negocio: tenant.nombre_comercial,
    total: armado.total,
    correoEnviado,
    correo: correoEnviado ? email : null,
    xml,   // base64
    pdf,   // base64
  });
});

/** Qué campo del formulario resaltar cuando el PAC rechaza. */
function campoDelRechazo(mensaje: string): string | null {
  if (/DomicilioFiscalReceptor|c[oó]digo postal/i.test(mensaje)) return "codigoPostal";
  if (/Nombre del receptor/i.test(mensaje)) return "razonSocial";
  if (/UsoCFDI/i.test(mensaje)) return "usoCfdi";
  if (/Rfc/i.test(mensaje)) return "rfc";
  return null;
}

/**
 * Traduce el rechazo del PAC a algo accionable.
 *
 * No es cosmético: el error del código postal es el más frecuente de cualquier portal de
 * autofactura, porque mucha gente pone el CP de su casa y no el de su constancia. Mostrar el
 * mensaje del SAT tal cual —«debe encontrarse en la lista de RFC inscritos no cancelados»— hace
 * que abandonen; decirles dónde buscarlo los rescata.
 */
function traducir(mensaje: string): string {
  if (/DomicilioFiscalReceptor/i.test(mensaje)) {
    return "El código postal no coincide con el que el SAT tiene registrado para tu RFC. Búscalo en tu Constancia de Situación Fiscal.";
  }
  if (/Nombre del receptor/i.test(mensaje)) {
    return "El nombre no coincide con el registrado en el SAT. Escríbelo igual que en tu Constancia, en mayúsculas y sin S.A. de C.V.";
  }
  if (/UsoCFDI/i.test(mensaje)) return "Ese uso de CFDI no aplica a tu régimen fiscal. Elige otro.";
  return "El SAT rechazó los datos. Revísalos en tu Constancia de Situación Fiscal e inténtalo de nuevo.";
}
