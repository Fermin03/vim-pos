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
import { archivarCfdi, bytesABase64, partirRutaLogica, subidorSupabase } from "../_shared/pac/archivo.ts";
import {
  campoDelRechazo,
  REGIMENES_RECEPTOR,
  RFC_VALIDO,
  traducirRechazo,
  USOS_CFDI,
  usosParaRegimen,
  usosPorRegimen,
} from "../_shared/pac/receptor.ts";

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

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    accion?: string; negocio?: string; folio?: string; rfc?: string; email?: string;
    receptor?: { rfc?: string; razonSocial?: string; regimenFiscal?: string; codigoPostal?: string; usoCfdi?: string; email?: string };
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }

  const codigoNegocio = String(body.negocio ?? "").trim().toLowerCase();
  const folio = String(body.folio ?? "").trim().toUpperCase();
  if (!codigoNegocio) return json({ error: "FALTAN_DATOS" }, 400);
  // Sin folio solo se puede preguntar por el negocio (el encabezado del paso 1).
  if (!folio && body.accion !== "negocio") return json({ error: "FALTAN_DATOS" }, 400);

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
      negocio: tenant.nombre_comercial,
      logo: tenant.logo_png_url,
    }, 409);
  }

  // ── El negocio (paso 1) ─────────────────────────────────────────────────────────────────────
  // El portal enseña el nombre y el logo del restaurante desde la primera pantalla: quien llega
  // por el QR tiene que ver que está facturando en su restaurante, no en "VIM POS".
  if (body.accion === "negocio") {
    return json({ estado: "OK", negocio: tenant.nombre_comercial, logo: tenant.logo_png_url });
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
    const entrega = body.accion === "recuperar" || body.accion === "enviar";
    if (puede !== true && !entrega) {
      // Ya facturado: quien la pidió puede volver a bajarla con su RFC. Antes el mensaje mandaba al
      // mostrador aunque el XML y el PDF estuvieran archivados, y quien cerró la pantalla sin
      // descargar se quedaba sin factura. El RFC es la llave: sin él no se entrega nada.
      if (await cfdiVigente(sb, tenant.id, ticket.id)) {
        return json({
          estado: "YA_FACTURADO",
          mensaje: "Este ticket ya tiene factura. Si la pediste tú, escribe tu RFC para descargarla otra vez.",
          negocio: tenant.nombre_comercial,
          logo: tenant.logo_png_url,
          ticket: { folio: ticket.folio_completo, fecha: ticket.dia_contable, total: Number(ticket.total_mxn) },
        }, 409);
      }
      return json({
        estado: "NO_DISPONIBLE",
        // Sin detallar el porqué: "ya no se puede" lleva al mismo sitio —al mostrador— sea cual sea.
        mensaje: "Este ticket ya no se puede facturar en línea. Acude al negocio y te ayudan.",
        negocio: tenant.nombre_comercial,
        logo: tenant.logo_png_url,
      }, 409);
    }
    if (entrega) {
      return await entregarFacturaExistente(sb, json, {
        tenantId: tenant.id,
        negocio: tenant.nombre_comercial,
        ticketId: ticket.id,
        rfc: String(body.rfc ?? "").trim().toUpperCase(),
        email: body.accion === "enviar" ? String(body.email ?? "").trim() : null,
      });
    }
    return json({
      estado: "OK",
      negocio: tenant.nombre_comercial,
      logo: tenant.logo_png_url,
      ticket: { folio: ticket.folio_completo, fecha: ticket.dia_contable, total: Number(ticket.total_mxn) },
      regimenes: REGIMENES_RECEPTOR,
      usos: USOS_CFDI,
      usosPorRegimen: usosPorRegimen(),
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
  const usosValidos = usosParaRegimen(regimenFiscal);
  if (usosValidos.length === 0) return json({ estado: "DATOS", campo: "regimenFiscal", mensaje: "Elige tu régimen fiscal." }, 400);
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
      "id, parent_item_id, combo_rol, cargo_tipo, " +
        "producto_nombre_snapshot, cantidad, clave_sat_snapshot, unidad_sat_snapshot, tasa_iva_snapshot, " +
        "iva_incluido_en_precio_snapshot, subtotal_bruto_mxn, monto_modificadores_mxn, " +
        "descuento_item_mxn, promocion_item_mxn, iva_item_mxn, total_item_mxn",
    )
    .eq("ticket_id", ticket.id)
    .eq("cancelado", false)
    .order("orden_visualizacion");
  if (iErr) return json({ estado: "ERROR", mensaje: "No se pudo leer el ticket." }, 500);

  const lineas: LineaTicket[] = ((itemsRaw ?? []) as Record<string, unknown>[]).map((f) => ({
    id: String(f.id),
    parentId: (f.parent_item_id as string) ?? null,
    comboRol: (f.combo_rol as "PADRE" | "HIJO" | null) ?? null,
    cargoTipo: (f.cargo_tipo as string | null) ?? null,
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
    return json({ estado: "RECHAZO", campo: campoDelRechazo(res.mensajeError), mensaje: traducirRechazo(res.mensajeError) }, 400);
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
  // …y se archivan en el bucket privado `cfdi` (`sb` aquí es service_role). Best-effort.
  {
    const archivo = await archivarCfdi(cfdiId, { xml, pdf }, subidorSupabase(sb));
    if (archivo.errores.length) console.error(`[autofactura] ${cfdiId} archivo incompleto: ${archivo.errores.join("; ")}`);
  }

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
    correo: email || null,
    xml,   // base64
    pdf,   // base64
  });
});

type Json = (body: unknown, status?: number) => Response;
// deno-lint-ignore no-explicit-any
type Cliente = any;

/** ¿El ticket ya tiene un CFDI vigente (timbrado o en proceso de cancelación)? */
async function cfdiVigente(sb: Cliente, tenantId: string, ticketId: string): Promise<boolean> {
  const { data } = await sb
    .from("tickets_cfdi")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("ticket_id", ticketId)
    .eq("tipo_comprobante", "INGRESO")
    .in("estado_sat", ["TIMBRADO", "EN_PROCESO_CANCELACION"])
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

/**
 * Entrega otra vez una factura ya timbrada: la descarga (`email` null) o el reenvío por correo.
 *
 * La llave es el RFC con que se pidió: el folio va impreso en un papel que cualquiera puede ver,
 * el RFC no. Si no coinciden, la respuesta es la misma que si no hubiera factura, para no confirmar
 * a un curioso qué RFC facturó ese ticket. El ritmo por IP de arriba ya acota los intentos.
 */
async function entregarFacturaExistente(
  sb: Cliente,
  json: Json,
  p: { tenantId: string; negocio: string; ticketId: string; rfc: string; email: string | null },
): Promise<Response> {
  if (!RFC_VALIDO.test(p.rfc)) {
    return json({ estado: "DATOS", campo: "rfc", mensaje: "El RFC no tiene un formato válido." }, 400);
  }
  if (p.email !== null && !CORREO_VALIDO.test(p.email)) {
    return json({ estado: "DATOS", campo: "email", mensaje: "Revisa el correo: le falta algo." }, 400);
  }
  const { data } = await sb
    .from("tickets_cfdi")
    .select("id, uuid_fiscal, total_mxn, pac_proveedor, pac_referencia, xml_storage_path, pdf_storage_path")
    .eq("tenant_id", p.tenantId)
    .eq("ticket_id", p.ticketId)
    .eq("tipo_comprobante", "INGRESO")
    .eq("receptor_rfc", p.rfc)
    .in("estado_sat", ["TIMBRADO", "EN_PROCESO_CANCELACION"])
    .limit(1)
    .maybeSingle();
  const c = data as {
    id: string; uuid_fiscal: string | null; total_mxn: number; pac_proveedor: string | null; pac_referencia: string | null;
    xml_storage_path: string | null; pdf_storage_path: string | null;
  } | null;
  if (!c) {
    return json({
      estado: "NO_ENCONTRADA",
      campo: "rfc",
      mensaje: "No encontramos una factura de este ticket con ese RFC. Tiene que ser el mismo con que la pediste.",
    }, 404);
  }

  const pac = obtenerFacturama();

  // Reenvío: lo manda Facturama con los adjuntos, igual que al timbrar.
  if (p.email !== null) {
    if (!pac || c.pac_proveedor !== "FACTURAMA" || !c.pac_referencia) {
      return json({ estado: "ERROR", mensaje: "No pudimos enviar el correo. Descarga la factura en esta pantalla." }, 503);
    }
    const envio = await pac.enviarPorCorreo(c.pac_referencia, p.email);
    if (!envio.ok) {
      console.error(`[autofactura] reenvío de ${c.id} falló: ${envio.mensaje}`);
      return json({ estado: "ERROR", mensaje: "No pudimos enviar el correo. Descarga la factura en esta pantalla." }, 502);
    }
    return json({ estado: "ENVIADA", correo: p.email });
  }

  // Descarga: primero lo archivado en el bucket; si falta, se repone desde el PAC.
  const leer = async (ruta: string | null, formato: "xml" | "pdf"): Promise<string | null> => {
    const guardada = partirRutaLogica(ruta);
    if (guardada) {
      const { data: blob } = await sb.storage.from(guardada.bucket).download(guardada.nombre);
      if (blob) return bytesABase64(new Uint8Array(await blob.arrayBuffer()));
    }
    if (pac && c.pac_proveedor === "FACTURAMA" && c.pac_referencia) return await pac.descargar(c.pac_referencia, formato);
    return null;
  };
  const [xml, pdf] = await Promise.all([leer(c.xml_storage_path, "xml"), leer(c.pdf_storage_path, "pdf")]);
  if (!xml && !pdf) {
    return json({ estado: "ERROR", mensaje: "La factura existe, pero no pudimos recuperar los archivos. Pídela en el negocio." }, 502);
  }
  return json({
    estado: "TIMBRADO",
    uuid: c.uuid_fiscal,
    negocio: p.negocio,
    total: Number(c.total_mxn),
    correoEnviado: false,
    correo: null,
    xml,
    pdf,
  });
}
