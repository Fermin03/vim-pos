// Edge Function: timbrar-global (fase 6) — cierra un periodo y emite la factura global.
//
// La global ampara todas las ventas del periodo en las que nadie pidió comprobante. Es obligación
// del negocio ante el SAT y debe emitirse dentro de las 24 horas siguientes al cierre del periodo.
//
// EL RIESGO QUE GOBIERNA ESTE CÓDIGO
//
// En cuanto la global se timbra, sus tickets dejan de ser autofacturables. Si se timbrara dos
// veces, o si un comensal alcanzara a facturar un ticket que la global ya ampara, la misma venta
// quedaría declarada dos veces y eso es un problema fiscal del cliente, no un bug cosmético.
//
// Por eso lo primero que ocurre es TOMAR el periodo (`cfdi_tomar_periodo_global`), que lo deja en
// EN_PROCESO con un UPDATE condicional. Todo lo demás —que puede tardar medio minuto— sucede con
// esa puerta ya cerrada.
//
// Corre con el JWT de quien la pide, no con service_role: el RLS sigue teniendo la última palabra
// sobre qué tenant se toca.
//
// Local: supabase functions serve timbrar-global --env-file supabase/functions/.env
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { timbrarConFailover, obtenerFacturama } from "../_shared/pac/index.ts";
import { archivarCfdi, subidorSupabase } from "../_shared/pac/archivo.ts";
import { armarConceptosGlobal, ConceptosIncoherentes, type LineaTicket, type TicketDelPeriodo } from "../_shared/pac/conceptos.ts";

const ROLES_FACTURA = ["DUENO", "ADMIN"];

/** Receptor de toda factura global. No es una elección: lo fija el SAT. */
const RECEPTOR_PUBLICO = {
  rfc: "XAXX010101000",
  razonSocial: "PUBLICO EN GENERAL",
  usoCfdi: "S01",
  regimenFiscal: "616",
};

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: u, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_INVALIDA" }, 401);

  let body: { tenant_id?: string; desde?: string; hasta?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  const tenantId = body.tenant_id;
  if (!tenantId) return json({ error: "FALTA_TENANT_ID" }, 400);

  const { data: acc } = await sb
    .from("usuarios_acceso")
    .select("rol:roles(codigo)")
    .eq("usuario_id", u.user.id)
    .eq("tenant_id", tenantId)
    .eq("activo", true);
  const roles = ((acc ?? []) as { rol: { codigo: string } | null }[]).map((a) => a.rol?.codigo).filter(Boolean) as string[];
  if (!roles.some((r) => ROLES_FACTURA.includes(r))) {
    return json({ error: "SIN_PERMISO", detalle: "Solo DUEÑO/ADMIN pueden emitir la factura global" }, 403);
  }

  // ── Datos del emisor ────────────────────────────────────────────────────────────────────────
  const { data: emisorRaw } = await sb
    .from("tenant_cfdi_emisor")
    .select("rfc, periodicidad_global, csd_numero_certificado")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const emisor = emisorRaw as { rfc: string; periodicidad_global: string; csd_numero_certificado: string | null } | null;
  if (!emisor) return json({ error: "SIN_EMISOR", detalle: "Captura los datos fiscales del negocio" }, 409);
  if (!emisor.csd_numero_certificado) {
    return json({ error: "SIN_SELLO", detalle: "Carga el sello digital antes de facturar" }, 409);
  }

  const { data: tenantRaw } = await sb
    .from("tenants")
    .select("razon_social, regimen_fiscal, codigo_postal_fiscal, logo_png_url")
    .eq("id", tenantId)
    .maybeSingle();
  const tenant = tenantRaw as {
    razon_social: string | null; regimen_fiscal: string | null;
    codigo_postal_fiscal: string | null; logo_png_url: string | null;
  } | null;
  if (!tenant?.razon_social || !tenant.regimen_fiscal || !tenant.codigo_postal_fiscal) {
    return json({ error: "DATOS_FISCALES_INCOMPLETOS", detalle: "Falta razón social, régimen o código postal" }, 409);
  }

  const periodicidad = emisor.periodicidad_global || "04";

  // ── Qué periodo se cierra ───────────────────────────────────────────────────────────────────
  // Si no lo dicen, el ANTERIOR al vigente: el actual sigue acumulando ventas, y cerrarlo a media
  // jornada dejaría fuera lo que falta del día y sin poder facturar a quien comió esta mañana.
  let desde = body.desde;
  let hasta = body.hasta;
  if (!desde || !hasta) {
    const { data: p, error: pErr } = await sb.rpc("periodo_global_de", {
      p_periodicidad: periodicidad,
      p_fecha: hoyMx(),
    });
    if (pErr || !p?.[0]) return json({ error: "PERIODO_NO_CALCULADO", detalle: pErr?.message }, 500);
    const vigente = p[0] as { desde: string; hasta: string };
    const anterior = await sb.rpc("periodo_global_de", {
      p_periodicidad: periodicidad,
      p_fecha: diaAntes(vigente.desde),
    });
    const prev = (anterior.data as { desde: string; hasta: string }[] | null)?.[0];
    if (!prev) return json({ error: "PERIODO_NO_CALCULADO" }, 500);
    desde = prev.desde;
    hasta = prev.hasta;
  }

  // ── El candado ──────────────────────────────────────────────────────────────────────────────
  const { data: periodoId, error: tomarErr } = await sb.rpc("cfdi_tomar_periodo_global", {
    p_tenant_id: tenantId,
    p_periodicidad: periodicidad,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (tomarErr) return json({ error: "NO_SE_PUDO_TOMAR", detalle: tomarErr.message }, 500);
  if (!periodoId) {
    return json({
      error: "PERIODO_NO_DISPONIBLE",
      mensaje: `El periodo ${desde} a ${hasta} ya se timbró o se está timbrando ahora mismo.`,
    }, 409);
  }

  /** Devuelve el periodo a un estado en el que se pueda reintentar. */
  const soltarPeriodo = async (estado: "ABIERTO" | "ERROR") => {
    await sb.from("cfdi_periodos_globales").update({ estado }).eq("id", periodoId);
  };

  try {
    // ── Las ventas del periodo ────────────────────────────────────────────────────────────────
    const { data: ticketsRaw, error: tErr } = await sb.rpc("tickets_de_periodo_global", {
      p_tenant_id: tenantId, p_desde: desde, p_hasta: hasta,
    });
    if (tErr) throw new Error(`No se pudieron leer las ventas: ${tErr.message}`);
    const filas = (ticketsRaw ?? []) as { ticket_id: string; folio: string; total_mxn: number }[];

    if (filas.length === 0) {
      // Sin ventas que amparar no hay nada que declarar. Se reabre el periodo: si mañana entra una
      // venta rezagada por sincronización, el periodo sigue disponible para cerrarse.
      await soltarPeriodo("ABIERTO");
      return json({ ok: true, sinVentas: true, mensaje: "No hay ventas sin facturar en ese periodo." });
    }

    // Los renglones de todos los tickets, de una sola vez: una consulta por ticket sería miles de
    // idas a la base para un periodo mensual.
    const ids = filas.map((f) => f.ticket_id);
    const { data: itemsRaw, error: iErr } = await sb
      .from("ticket_items")
      .select(
        "ticket_id, producto_nombre_snapshot, cantidad, clave_sat_snapshot, unidad_sat_snapshot, " +
          "tasa_iva_snapshot, iva_incluido_en_precio_snapshot, subtotal_bruto_mxn, " +
          "monto_modificadores_mxn, descuento_item_mxn, promocion_item_mxn, iva_item_mxn, total_item_mxn",
      )
      .in("ticket_id", ids)
      .eq("cancelado", false);
    if (iErr) throw new Error(`No se pudieron leer los renglones: ${iErr.message}`);

    const porTicket = new Map<string, LineaTicket[]>();
    for (const f of (itemsRaw ?? []) as Record<string, unknown>[]) {
      const id = String(f.ticket_id);
      const lista = porTicket.get(id) ?? [];
      lista.push({
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
      });
      porTicket.set(id, lista);
    }

    const delPeriodo: TicketDelPeriodo[] = filas
      .filter((f) => (porTicket.get(f.ticket_id) ?? []).length > 0)
      .map((f) => ({
        folio: f.folio ?? f.ticket_id.slice(-8),
        totalMxn: Number(f.total_mxn),
        lineas: porTicket.get(f.ticket_id)!,
      }));

    const armado = armarConceptosGlobal(delPeriodo);

    // ── El borrador ───────────────────────────────────────────────────────────────────────────
    const folioGlobal = `G-${String(desde).replace(/-/g, "")}`;
    const { data: draftRaw, error: dErr } = await sb
      .from("tickets_cfdi")
      .insert({
        tenant_id: tenantId,
        ticket_id: null,
        es_global: true,
        tipo_comprobante: "INGRESO",
        receptor_rfc: RECEPTOR_PUBLICO.rfc,
        receptor_razon_social: RECEPTOR_PUBLICO.razonSocial,
        receptor_uso_cfdi: RECEPTOR_PUBLICO.usoCfdi,
        receptor_codigo_postal: tenant.codigo_postal_fiscal,
        receptor_regimen_fiscal: RECEPTOR_PUBLICO.regimenFiscal,
        emisor_rfc: emisor.rfc,
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
    if (dErr) throw new Error(`No se pudo crear el borrador: ${dErr.message}`);
    const cfdiId = String((draftRaw as { id: string }).id);

    // ── Timbrado ──────────────────────────────────────────────────────────────────────────────
    const res = await timbrarConFailover({
      cfdiId,
      tipoComprobante: "INGRESO",
      emisor: {
        rfc: emisor.rfc,
        razonSocial: tenant.razon_social,
        regimenFiscal: tenant.regimen_fiscal,
        lugarExpedicion: tenant.codigo_postal_fiscal,
      },
      receptor: {
        rfc: RECEPTOR_PUBLICO.rfc,
        razonSocial: RECEPTOR_PUBLICO.razonSocial,
        usoCfdi: RECEPTOR_PUBLICO.usoCfdi,
        codigoPostal: tenant.codigo_postal_fiscal,
        regimenFiscal: RECEPTOR_PUBLICO.regimenFiscal,
        email: null,
      },
      metodoPagoSat: "PUE",
      formaPagoSat: "01",
      folio: folioGlobal,
      logoUrl: tenant.logo_png_url,
      conceptos: armado.conceptos,
      global: { periodicidad, mes: mesSat(periodicidad, desde), anio: Number(String(desde).slice(0, 4)) },
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
        p_request_payload: { pac: res.pacUsado, periodo: { desde, hasta }, tickets: delPeriodo.length },
        p_response_payload: res.responsePayload,
      });
      await soltarPeriodo("ERROR");
      return json({ ok: false, error: res.codigoError, mensaje: res.mensajeError }, 502);
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
      p_request_payload: { pac: res.pacUsado, periodo: { desde, hasta }, tickets: delPeriodo.length },
      p_response_payload: res.responsePayload,
    });

    // Archivo del XML y el PDF en el bucket privado `cfdi` (ver timbrar-cfdi). Best-effort.
    {
      const pacF = obtenerFacturama();
      if (pacF && res.pacReferencia) {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
        const [xml, pdf] = await Promise.all([pacF.descargar(res.pacReferencia, "xml"), pacF.descargar(res.pacReferencia, "pdf")]);
        const archivo = await archivarCfdi(cfdiId, { xml, pdf }, subidorSupabase(admin));
        if (archivo.errores.length) console.error(`[global] ${cfdiId} archivo incompleto: ${archivo.errores.join("; ")}`);
      }
    }

    // El vínculo ticket ↔ global. Va DESPUÉS del timbrado: si se escribiera antes y el timbrado
    // fallara, los tickets quedarían marcados como amparados por un comprobante que no existe, y
    // nadie podría facturarlos nunca.
    const { error: vErr } = await sb
      .from("cfdi_global_tickets")
      .insert(filas.map((f) => ({ cfdi_id: cfdiId, ticket_id: f.ticket_id, tenant_id: tenantId })));
    if (vErr) {
      // El CFDI existe ante el SAT. Se avisa fuerte pero no se revierte nada: deshacerlo sería
      // peor. Sin estas filas, esos tickets seguirían pareciendo autofacturables.
      console.error(`[global] CFDI ${cfdiId} timbrado pero sin vincular sus tickets: ${vErr.message}`);
    }

    await sb
      .from("cfdi_periodos_globales")
      .update({
        estado: "TIMBRADA",
        cfdi_id: cfdiId,
        n_tickets: filas.length,
        total_mxn: armado.total,
        cerrado_at: new Date().toISOString(),
      })
      .eq("id", periodoId);

    // La global se timbra aunque no queden folios: es una obligación ante el SAT y no puede
    // quedarse sin emitir por saldo. `consumir_folio_cfdi` lo contempla con `p_es_global`.
    await sb.rpc("consumir_folio_cfdi", { p_tenant_id: tenantId, p_cfdi_id: cfdiId, p_es_global: true });

    return json({
      ok: true,
      cfdi_id: cfdiId,
      uuid_fiscal: res.uuidFiscal,
      periodo: { desde, hasta },
      tickets: filas.length,
      total: armado.total,
      vinculados: !vErr,
    });
  } catch (e) {
    await soltarPeriodo("ERROR");
    const mensaje = e instanceof Error ? e.message : String(e);
    const codigo = e instanceof ConceptosIncoherentes ? "CONCEPTOS_INCOHERENTES" : "ERROR_GLOBAL";
    return json({ ok: false, error: codigo, mensaje }, 500);
  }
});

/** Hoy en hora de México: el servidor corre en UTC y de noche cambiaría de día antes de tiempo. */
function hoyMx(): string {
  return new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
}

function diaAntes(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * El código de mes del nodo global. Verificado contra el PAC: con periodicidad 05 (bimestral) van
 * los bimestres 13–18 y con cualquier otra los meses 01–12. Cruzarlos se rechaza.
 */
function mesSat(periodicidad: string, desde: string): string {
  const mes = Number(String(desde).slice(5, 7));
  if (periodicidad === "05") return String(12 + Math.floor((mes - 1) / 2) + 1).padStart(2, "0");
  return String(mes).padStart(2, "0");
}
