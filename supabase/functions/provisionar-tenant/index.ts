// Edge Function: provisionar-tenant (F10) — alta de un nuevo cliente (tenant) por VIM.
// Crea la cuenta del dueño (auth.users) + el tenant con todo su andamiaje (crear_tenant_con_owner
// de 0012: perfil, acceso DUEÑO, saldo de folios, onboarding, auditoría). service_role server-side.
//
// AUTORIZACIÓN: herramienta interna de VIM. Como aún no existe un modelo de "super-admin" en el
// esquema, se protege con un secreto compartido (header X-Platform-Key === PLATFORM_PROVISION_KEY).
// Fail-closed: si el secreto no está configurado en el entorno, rechaza. Cuando exista el modelo
// super-admin, sustituir por validación de JWT + rol de plataforma.
//
// Local: supabase functions serve provisionar-tenant --env-file supabase/functions/.env
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const VERTICALES = ["FOODTRUCK", "QUICK_SERVICE", "FULL_SERVICE", "CAFE_BAR", "DARK_KITCHEN", "ENTERPRISE"];

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  // Gate por secreto compartido (fail-closed).
  const expected = Deno.env.get("PLATFORM_PROVISION_KEY");
  if (!expected) return json({ error: "PROVISION_DESHABILITADO" }, 503);
  if (req.headers.get("x-platform-key") !== expected) return json({ error: "NO_AUTORIZADO" }, 401);

  let b: Record<string, string | undefined>;
  try {
    b = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  const {
    codigo,
    nombre_comercial,
    nombre_owner,
    email_owner,
    telefono_owner,
    vertical,
    plan_codigo,
    notas,
  } = b;

  if (!codigo || !nombre_comercial || !nombre_owner || !email_owner || !vertical || !plan_codigo) {
    return json({ error: "FALTAN_CAMPOS" }, 400);
  }
  if (!/^[a-z0-9-]+$/.test(codigo)) return json({ error: "CODIGO_INVALIDO", detalle: "minúsculas, números y guiones" }, 400);
  if (!VERTICALES.includes(vertical)) return json({ error: "VERTICAL_INVALIDA" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // 1) Invitar al dueño por correo: crea la cuenta y envía un email con un link para que
  //    el dueño fije SU contraseña (página /establecer-acceso del admin). No viaja ninguna
  //    contraseña por correo. Requiere SMTP configurado en el proyecto para enviar de verdad.
  const adminUrl = Deno.env.get("ADMIN_APP_URL") ?? "http://localhost:3001";
  const { data: invited, error: cErr } = await admin.auth.admin.inviteUserByEmail(email_owner, {
    data: { nombre: nombre_owner },
    redirectTo: `${adminUrl}/establecer-acceso`,
  });
  if (cErr || !invited?.user) {
    return json({ error: "ALTA_OWNER_FALLO", detalle: cErr?.message ?? "no se pudo invitar al usuario" }, 400);
  }
  const ownerId = invited.user.id;

  // 2) Provisionar el tenant + andamiaje (RPC SECURITY DEFINER).
  const { data: tenantId, error: pErr } = await admin.rpc("crear_tenant_con_owner", {
    p_owner_user_id: ownerId,
    p_codigo: codigo,
    p_nombre_comercial: nombre_comercial,
    p_nombre_owner: nombre_owner,
    p_telefono_owner: telefono_owner ?? null,
    p_vertical: vertical,
    p_plan_codigo: plan_codigo,
    p_estado: "TRIAL",
    p_notas_internas: notas ?? null,
  });
  if (pErr) {
    // Rollback parcial: si el tenant falló, borrar el owner recién creado para no dejar huérfanos.
    await admin.auth.admin.deleteUser(ownerId).catch(() => {});
    return json({ error: "PROVISION_FALLO", detalle: pErr.message }, 400);
  }

  return json({
    ok: true,
    tenant_id: tenantId,
    owner_id: ownerId,
    owner_email: email_owner,
    invitacion_enviada: true,
  });
});
