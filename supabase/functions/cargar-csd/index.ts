// Edge Function: cargar-csd (fase 3) — carga el sello digital de un negocio en nuestra cuenta del
// PAC, o lo retira.
//
// POR QUÉ ESTO NO SE HACE DESDE EL NAVEGADOR
//
// Facturama Multiemisor se autentica con UNA credencial de cuenta que vale para todos nuestros
// clientes. Si el navegador hablara directo con el PAC, esa credencial estaría en el navegador de
// cada cliente — y con ella se pueden emitir facturas a nombre de cualquier otro negocio nuestro.
// Por eso la credencial vive solo aquí.
//
// QUÉ SE GUARDA Y QUÉ NO
//
// El `.key` y su contraseña atraviesan esta función y se descartan: no se escriben en la base, no
// se registran en logs y no viajan en ninguna respuesta. De la carga solo queda el número de
// certificado y su vigencia, que son públicos y sirven para avisar antes de que venza.
//
// LA PRUEBA DE PROPIEDAD DEL RFC (auditoría 30/09/2026, C1-1 y C1-2)
//
// Cargar con éxito el .cer + .key + contraseña de un RFC es la única forma de demostrar que ese RFC
// es de quien lo pide: el RFC que el admin escribe en su configuración no prueba nada. Por eso, al
// cargar, esta función escribe `tenant_cfdi_emisor.rfc_verificado` (con service_role: la 0135 se
// lo quitó a los usuarios) y es ese RFC —no el escrito— el que usan para timbrar `timbrar-cfdi`,
// `timbrar-global` y `autofacturar`. Y al BORRAR solo se toca el sello de `rfc_verificado`: antes se
// borraba en la cuenta compartida el sello del RFC escrito, que podía ser el de otro cliente.
//
// Local: supabase functions serve cargar-csd --env-file supabase/functions/.env
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { obtenerFacturama } from "../_shared/pac/index.ts";
import { CertificadoIlegible, esDelRfc, estaVigente, leerCertificado } from "../_shared/pac/certificado.ts";
import { igualesEnTiempoConstante } from "../_shared/delivery/firma.ts";

// Camino interno: la base de datos (o quien tenga el secreto compartido) puede pedir SOLO la
// verificación de la cuenta del PAC —credencial y Multiemisor— sin gastar folios ni tocar sellos.
// Mismo esquema que enviar-push: cabecera `x-vim-interno` = secret VIM_INTERNO_SECRET.
const INTERNO = Deno.env.get("VIM_INTERNO_SECRET") ?? "";

const ROLES_CSD = ["DUENO", "ADMIN"];

/** Un CSD del SAT ronda los 2 KB; la llave, algo menos. El tope corta cargas absurdas temprano. */
const MAX_BASE64 = 32 * 1024;

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const internoRecibido = (req.headers.get("x-vim-interno") ?? "").trim();
  if (internoRecibido !== "") {
    if (INTERNO === "" || !igualesEnTiempoConstante(internoRecibido, INTERNO)) return json({ error: "INTERNO_INVALIDO" }, 401);
    let interno: { accion?: string };
    try { interno = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
    if (interno.accion !== "verificar") return json({ error: "ACCION_NO_PERMITIDA" }, 403);
    const pacInterno = obtenerFacturama();
    if (!pacInterno) return json({ ok: false, error: "PAC_NO_CONFIGURADO" }, 503);
    return json({ ok: true, ...(await pacInterno.verificarCuenta()) });
  }

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: u, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_INVALIDA" }, 401);

  let body: { tenant_id?: string; accion?: string; cer_base64?: string; key_base64?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }

  const tenantId = body.tenant_id;
  if (!tenantId) return json({ error: "FALTA_TENANT_ID" }, 400);

  // El rol se comprueba EN EL TENANT del que se pide operar, no en cualquiera del llamante — la
  // misma lección que dejó SEC CN-026 en `timbrar-cfdi`: ser dueño de un negocio no autoriza a
  // tocar el sello fiscal de otro.
  const { data: acc } = await sb
    .from("usuarios_acceso")
    .select("rol:roles(codigo)")
    .eq("usuario_id", u.user.id)
    .eq("tenant_id", tenantId)
    .eq("activo", true);
  const roles = ((acc ?? []) as unknown as { rol: { codigo: string } | null }[])
    .map((a) => a.rol?.codigo)
    .filter(Boolean) as string[];
  if (!roles.some((r) => ROLES_CSD.includes(r))) {
    return json({ error: "SIN_PERMISO", detalle: "Solo DUEÑO/ADMIN pueden administrar el sello" }, 403);
  }

  // ── Verificación de la cuenta del PAC (dueño/admin, sin folio, sin sello) ───────────────────
  if (body.accion === "verificar") {
    const pacV = obtenerFacturama();
    if (!pacV) return json({ ok: false, error: "PAC_NO_CONFIGURADO" }, 503);
    return json({ ok: true, ...(await pacV.verificarCuenta()) });
  }

  const { data: emisor, error: eErr } = await sb
    .from("tenant_cfdi_emisor")
    .select("tenant_id, rfc, rfc_verificado")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (eErr) return json({ error: "RLS_ERROR", detalle: eErr.message }, 500);
  if (!emisor) {
    return json(
      { error: "SIN_EMISOR", detalle: "Captura primero los datos fiscales del negocio" },
      409,
    );
  }
  const rfc = String((emisor as { rfc: string }).rfc).trim().toUpperCase();
  const rfcVerificado = String((emisor as { rfc_verificado: string | null }).rfc_verificado ?? "").trim().toUpperCase();

  const pac = obtenerFacturama();
  if (!pac) return json({ error: "PAC_NO_CONFIGURADO", detalle: "Falta la credencial del PAC" }, 503);

  // Escrituras de `rfc_verificado` y `csd_*`: solo service_role (0135). Se usa después de
  // comprobar arriba, con el JWT del llamante, que es DUEÑO/ADMIN de ESTE tenant.
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // ── Baja del sello (offboarding) ────────────────────────────────────────────────────────────
  // Solo el sello que ESTE tenant demostró suyo. El RFC escrito en la configuración no cuenta: con
  // él se podía borrar de la cuenta compartida el sello de otro cliente de VIM.
  if (body.accion === "borrar") {
    if (!rfcVerificado) {
      return json({ error: "SIN_SELLO_VERIFICADO", detalle: "Este negocio no tiene un sello cargado que borrar." }, 409);
    }
    const ok = await pac.borrarSello(rfcVerificado);
    if (!ok) return json({ error: "PAC_NO_BORRO", detalle: "El PAC no confirmó la baja del sello" }, 502);
    const { error } = await admin
      .from("tenant_cfdi_emisor")
      .update({
        csd_subido_at: null,
        csd_numero_certificado: null,
        csd_vigencia_hasta: null,
        rfc_verificado: null,
        rfc_verificado_at: null,
        // INACTIVO y no SUSPENDIDO: es el vocabulario que usa el panel. Escribir un valor que el
        // formulario no conoce dejaría su selector en blanco y rompería el siguiente guardado.
        estado: "INACTIVO",
      })
      .eq("tenant_id", tenantId);
    if (error) return json({ error: "NO_SE_ACTUALIZO", detalle: error.message }, 500);
    return json({ ok: true, accion: "borrado" });
  }

  // ── Carga del sello ─────────────────────────────────────────────────────────────────────────
  // Requiere el add-on CFDI (C1-5): cargar un sello es el primer paso para timbrar. La baja y la
  // verificación de cuenta no lo exigen: retirar el sello de quien dejó de pagar debe poder hacerse.
  // Con service_role: `tenant_addon_activo` no es ejecutable por usuarios desde la 0132 (era un
  // oráculo). El tenant ya se validó arriba contra el rol del llamante.
  const { data: addonActivo } = await admin.rpc("tenant_addon_activo", { p_tenant_id: tenantId, p_codigo: "CFDI" });
  if (addonActivo !== true) {
    return json({ error: "SIN_ADDON_CFDI", detalle: "La facturación no está contratada para este negocio. Contacta a VIM." }, 403);
  }

  const cer = (body.cer_base64 ?? "").trim();
  const key = (body.key_base64 ?? "").trim();
  const password = body.password ?? "";
  if (!cer || !key || !password) return json({ error: "FALTAN_ARCHIVOS" }, 400);
  if (cer.length > MAX_BASE64 || key.length > MAX_BASE64) return json({ error: "ARCHIVO_DEMASIADO_GRANDE" }, 413);

  // Se valida el .cer ANTES de mandarlo. Las tres comprobaciones de abajo son las que el usuario
  // puede corregir por sí mismo; dejar que falle el PAC daría un mensaje mucho peor.
  let datos;
  try {
    datos = leerCertificado(cer);
  } catch (e) {
    if (e instanceof CertificadoIlegible) {
      return json({ error: "CER_ILEGIBLE", mensaje: e.message }, 400);
    }
    throw e;
  }

  if (!esDelRfc(datos, rfc)) {
    return json({
      error: "CER_DE_OTRO_RFC",
      mensaje: `El certificado no es del RFC ${rfc}. Revisa que sea el archivo del negocio correcto.`,
    }, 400);
  }
  if (!estaVigente(datos)) {
    return json({
      error: "CER_VENCIDO",
      mensaje: `El certificado venció el ${datos.vigenciaHasta}. Tramita uno nuevo en el SAT.`,
    }, 400);
  }

  const subida = await pac.cargarSello(rfc, cer, key, password);
  if (!subida.ok) {
    // El error del PAC se devuelve literal salvo el más frecuente: la contraseña de la llave.
    // Facturama responde «Error al cargar la llave · La contraseña no corresponde a la llave»,
    // que es entendible pero no dice lo único que le hace falta a quien se atora — que NO es la
    // contraseña de su e.firma, que es la confusión habitual.
    const esPassword = /contrase|password|cargar la llave/i.test(subida.mensaje);
    return json({
      error: esPassword ? "PASSWORD_INCORRECTA" : "PAC_RECHAZO",
      mensaje: esPassword
        ? "La contraseña no corresponde a la llave. Es la que capturaste al generar el CSD en el SAT, no la de tu e.firma."
        : subida.mensaje,
    }, 400);
  }

  // El PAC aceptó .cer + .key + contraseña del RFC `rfc` (y el .cer es de ese RFC, validado
  // arriba): a partir de aquí ese RFC es de este tenant. Es la ÚNICA escritura de rfc_verificado.
  const { error: upErr } = await admin
    .from("tenant_cfdi_emisor")
    .update({
      rfc_verificado: rfc,
      rfc_verificado_at: new Date().toISOString(),
      csd_subido_at: new Date().toISOString(),
      csd_numero_certificado: datos.numeroCertificado,
      csd_vigencia_hasta: datos.vigenciaHasta,
      facturama_issuer_ref: rfc, // en Multiemisor el emisor SE IDENTIFICA por su RFC
      // `estado` NO se toca: pasar a producción es una decisión del negocio, no una consecuencia
      // de haber cargado el sello. Marcarlo ACTIVO aquí pondría a facturar de verdad a quien solo
      // estaba probando.
    })
    .eq("tenant_id", tenantId);
  if (upErr) {
    // El sello YA está cargado en el PAC; lo que falló es nuestro registro. Reintentar es seguro
    // —el segundo intento entra por el camino de renovación (PUT) y deja el mismo sello— así que
    // se pide reintentar en vez de dejar al usuario creyendo que no se cargó.
    return json({
      error: "SELLO_CARGADO_SIN_REGISTRAR",
      mensaje: "El sello se cargó en el PAC pero no se pudo guardar su estado. Vuelve a intentarlo.",
      detalle: upErr.message,
    }, 500);
  }

  return json({
    ok: true,
    reemplazado: subida.reemplazado,
    numero_certificado: datos.numeroCertificado,
    vigencia_desde: datos.vigenciaDesde,
    vigencia_hasta: datos.vigenciaHasta,
  });
});
