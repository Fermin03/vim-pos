// Edge Function: cancelar-cfdi (fase 8) — solicita al SAT la cancelación de un comprobante.
//
// LO QUE HAY QUE ENTENDER ANTES DE TOCAR ESTO
//
// Cancelar no es borrar. Desde 2022 el SAT exige un motivo y, según el caso, la aceptación del
// receptor: la solicitud puede quedar EN PROCESO durante días hasta que el otro contesta o vence
// el plazo. Por eso un 200 del PAC **no** significa "cancelado", y este código no lo trata como
// tal salvo que el acuse lo confirme.
//
// Y NO SE PUEDE VERIFICAR EN SANDBOX
//
// Comprobado: allí el DELETE responde 200, el acuse vuelve vacío y el comprobante sigue `active`.
// Todo lo de aquí está escrito contra la documentación y contra el comportamiento observado del
// resto de la API, pero la cancelación de verdad hay que probarla en producción con un comprobante
// real antes de dársela a un cliente.
//
// Local: supabase functions serve cancelar-cfdi --env-file supabase/functions/.env
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { obtenerFacturama } from "../_shared/pac/index.ts";
import { archivarCfdi, subidorSupabase } from "../_shared/pac/archivo.ts";

const ROLES_CANCELA = ["DUENO", "ADMIN"];

type Motivo = "01" | "02" | "03" | "04";
const MOTIVOS: Motivo[] = ["01", "02", "03", "04"];

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

  let body: { cfdi_id?: string; motivo?: string; uuid_sustituto?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  const cfdiId = body.cfdi_id;
  if (!cfdiId) return json({ error: "FALTA_CFDI_ID" }, 400);

  const motivo = String(body.motivo ?? "") as Motivo;
  if (!MOTIVOS.includes(motivo)) {
    return json({ error: "MOTIVO_INVALIDO", mensaje: "Elige un motivo de cancelación válido." }, 400);
  }

  // El borrador se lee con el JWT del llamante: el RLS ya lo acota a su tenant.
  const { data: cfdiRaw, error: cErr } = await sb
    .from("tickets_cfdi")
    .select("id, tenant_id, estado_sat, uuid_fiscal, pac_referencia, es_global, fecha_timbrado")
    .eq("id", cfdiId)
    .maybeSingle();
  if (cErr) return json({ error: "RLS_ERROR", detalle: cErr.message }, 500);
  if (!cfdiRaw) return json({ error: "CFDI_NO_EXISTE" }, 404);
  const cfdi = cfdiRaw as {
    id: string; tenant_id: string; estado_sat: string; uuid_fiscal: string | null;
    pac_referencia: string | null; es_global: boolean; fecha_timbrado: string | null;
  };

  // El rol se comprueba en EL TENANT DEL CFDI, no en cualquiera del llamante (SEC CN-026).
  const { data: acc } = await sb
    .from("usuarios_acceso")
    .select("rol:roles(codigo)")
    .eq("usuario_id", u.user.id)
    .eq("tenant_id", cfdi.tenant_id)
    .eq("activo", true);
  const roles = ((acc ?? []) as { rol: { codigo: string } | null }[]).map((a) => a.rol?.codigo).filter(Boolean) as string[];
  if (!roles.some((r) => ROLES_CANCELA.includes(r))) {
    return json({ error: "SIN_PERMISO", detalle: "Solo DUEÑO/ADMIN pueden cancelar" }, 403);
  }

  if (cfdi.estado_sat !== "TIMBRADO") {
    return json({
      error: "NO_CANCELABLE",
      mensaje: cfdi.estado_sat === "CANCELADO"
        ? "Este comprobante ya está cancelado."
        : `Un comprobante en estado ${cfdi.estado_sat} no se puede cancelar.`,
    }, 409);
  }
  if (!cfdi.pac_referencia) {
    return json({ error: "SIN_REFERENCIA", mensaje: "Falta la referencia del PAC para este comprobante." }, 409);
  }

  const pac = obtenerFacturama();
  if (!pac) return json({ error: "PAC_NO_CONFIGURADO" }, 503);

  const res = await pac.cancelar(cfdi.pac_referencia, motivo, body.uuid_sustituto);
  if (!res.ok) {
    await sb.rpc("cfdi_registrar_cancelacion", {
      p_cfdi_id: cfdiId,
      p_estado: "CANCELACION_RECHAZADA",
      p_motivo: motivo,
      p_pac_mensaje: res.mensaje,
      p_response_payload: { codigo: res.codigo },
    });
    return json({ ok: false, error: res.codigo, mensaje: res.mensaje }, 400);
  }

  // El acuse decide el estado final. Un 200 del PAC solo dice que la SOLICITUD entró; mientras no
  // haya acuse, esto queda EN PROCESO — que es la verdad y no una suposición optimista.
  const acuse = await pac.descargarAcuse(cfdi.pac_referencia);
  const confirmada = acuse !== null && contieneCancelacion(acuse);

  const rutaAcuse = acuse ? `cfdi/${cfdiId}-acuse.xml` : null;
  if (acuse) {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const archivo = await archivarCfdi(cfdiId, { acuse }, subidorSupabase(admin));
    if (archivo.errores.length) console.error(`[cancelar] ${cfdiId} acuse sin archivar: ${archivo.errores.join("; ")}`);
  }
  const { error: rErr } = await sb.rpc("cfdi_registrar_cancelacion", {
    p_cfdi_id: cfdiId,
    p_estado: confirmada ? "CANCELADO" : "EN_PROCESO_CANCELACION",
    p_motivo: motivo,
    p_acuse_storage_path: rutaAcuse,
    p_pac_mensaje: confirmada ? "Cancelación confirmada por el SAT" : "Solicitud enviada, en espera del acuse",
    p_response_payload: { respuesta: res.cuerpo.slice(0, 2000) },
  });
  if (rErr) return json({ error: "NO_SE_REGISTRO", detalle: rErr.message }, 500);

  return json({
    ok: true,
    estado: confirmada ? "CANCELADO" : "EN_PROCESO_CANCELACION",
    acuse,   // base64 del XML, cuando lo hay
    mensaje: confirmada
      ? "El comprobante quedó cancelado."
      : "Se envió la solicitud. Si tu cliente debe aceptarla, la cancelación queda en proceso hasta que responda.",
  });
});

/**
 * ¿El XML que devolvió el PAC es un acuse de cancelación, o el propio comprobante?
 *
 * Hace falta preguntarlo porque la misma ruta devuelve una cosa u otra: en el sandbox, donde la
 * cancelación no surte efecto, contesta con el CFDI original. Darlo por acuse marcaría como
 * CANCELADO algo que sigue vivo ante el SAT, que es el error más caro posible aquí.
 */
function contieneCancelacion(acuseBase64: string): boolean {
  let texto: string;
  try {
    texto = atob(acuseBase64);
  } catch {
    return false;
  }
  return /Acuse|Cancelacion|Cancelación|EstatusUUID|CodigoEstatus/i.test(texto)
    && !/cfdi:Comprobante/i.test(texto);
}
