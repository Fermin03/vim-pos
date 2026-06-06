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
import { obtenerPac } from "../_shared/pac/index.ts";

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

  // Verificar rol DUEÑO/ADMIN del tenant del CFDI (vía usuarios_acceso + roles).
  const { data: acc } = await sb
    .from("usuarios_acceso")
    .select("rol:roles(codigo)")
    .eq("usuario_id", u.user.id)
    .eq("activo", true);
  const roles = ((acc ?? []) as { rol: { codigo: string } | null }[])
    .map((a) => a.rol?.codigo)
    .filter(Boolean) as string[];
  if (!roles.some((r) => ROLES_FACTURA.includes(r))) {
    return json({ error: "SIN_PERMISO", detalle: "Solo DUEÑO/ADMIN pueden facturar" }, 403);
  }

  // Cargar el borrador (RLS del llamante restringe al tenant).
  const { data: cfdi, error: cErr } = await sb
    .from("tickets_cfdi")
    .select(
      "id, tipo_comprobante, estado_sat, emisor_rfc, emisor_razon_social, emisor_regimen_fiscal, emisor_lugar_expedicion, receptor_rfc, receptor_razon_social, receptor_uso_cfdi, receptor_codigo_postal, receptor_regimen_fiscal, receptor_email, metodo_pago_sat, forma_pago_sat, subtotal_mxn, descuento_mxn, iva_mxn, total_mxn",
    )
    .eq("id", cfdiId)
    .maybeSingle();
  if (cErr) return json({ error: "RLS_ERROR", detalle: cErr.message }, 500);
  if (!cfdi) return json({ error: "CFDI_NO_EXISTE" }, 404);
  if (cfdi.estado_sat === "TIMBRADO") return json({ error: "YA_TIMBRADO" }, 409);
  if (cfdi.estado_sat !== "BORRADOR" && cfdi.estado_sat !== "ERROR_TIMBRADO") {
    return json({ error: "ESTADO_NO_TIMBRABLE", estado: cfdi.estado_sat }, 409);
  }

  const c = cfdi as Record<string, unknown>;
  const num = (v: unknown) => Number(v ?? 0);

  // Llamar al PAC (mock o Facturapi).
  const pac = obtenerPac();
  const res = await pac.timbrar({
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
    subtotal: num(c.subtotal_mxn),
    descuento: num(c.descuento_mxn),
    iva: num(c.iva_mxn),
    total: num(c.total_mxn),
  });

  if (!res.ok) {
    await sb.rpc("cfdi_marcar_error", {
      p_cfdi_id: cfdiId,
      p_codigo_error: res.codigoError,
      p_mensaje_error: res.mensajeError,
      p_request_payload: { pac: pac.nombre },
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
    p_request_payload: { pac: pac.nombre },
    p_response_payload: res.responsePayload,
  });
  if (tErr) return json({ error: "MARCAR_TIMBRADO_ERROR", detalle: tErr.message }, 500);

  return json({
    ok: true,
    estado: "TIMBRADO",
    uuid_fiscal: res.uuidFiscal,
    serie: res.serie,
    folio_fiscal: res.folioFiscal,
    pac: pac.nombre,
  });
});
