// Edge Function: signup-tenant (F12) — onboarding self-service.
// A diferencia de provisionar-tenant (F10, herramienta interna de VIM con X-Platform-Key),
// esta función es pública: cualquier visitante con la anon key puede crear su cuenta y
// su tenant en estado TRIAL/INVITADO. El owner queda con el password que él mismo eligió.
//
// CONTROLES:
//   - Validaciones de input (longitud, formato).
//   - Slug del tenant único (la BD lo enforza con índice).
//   - Email único en auth.users (createUser falla si ya existe).
//   - Rollback del owner si la creación del tenant falla.
//
// DIFERIDO (cuando haya tráfico real):
//   - hCaptcha/Turnstile para bloquear bots.
//   - Email de verificación obligatorio antes de poder operar.
//   - Rate-limit por IP para impedir abuso (hoy depende del WAF/CDN delante).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const VERTICALES = ["FOODTRUCK", "QUICK_SERVICE", "FULL_SERVICE", "CAFE_BAR", "DARK_KITCHEN", "ENTERPRISE"];
const PLAN_DE_VERTICAL: Record<string, string> = {
  FOODTRUCK: "FT", QUICK_SERVICE: "QS", FULL_SERVICE: "FS",
  CAFE_BAR: "CB", DARK_KITCHEN: "DK", ENTERPRISE: "ENT",
};

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  let b: Record<string, string | undefined>;
  try { b = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }

  const codigo = (b.codigo ?? "").trim().toLowerCase();
  const nombre_comercial = (b.nombre_comercial ?? "").trim();
  const nombre_owner = (b.nombre_owner ?? "").trim();
  const email_owner = (b.email_owner ?? "").trim().toLowerCase();
  const telefono_owner = (b.telefono_owner ?? "").trim() || null;
  const vertical = (b.vertical ?? "").trim();
  const password = b.password ?? "";

  if (!codigo || !nombre_comercial || !nombre_owner || !email_owner || !vertical || !password) {
    return json({ error: "FALTAN_CAMPOS" }, 400);
  }
  if (!SLUG_RE.test(codigo)) return json({ error: "CODIGO_INVALIDO", detalle: "minúsculas, números y guiones (3-50)" }, 400);
  if (nombre_comercial.length > 150) return json({ error: "NOMBRE_LARGO" }, 400);
  if (!EMAIL_RE.test(email_owner)) return json({ error: "EMAIL_INVALIDO" }, 400);
  if (password.length < 8) return json({ error: "PASSWORD_DEBIL", detalle: "mínimo 8 caracteres" }, 400);
  if (!VERTICALES.includes(vertical)) return json({ error: "VERTICAL_INVALIDA" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // 1) Crear la cuenta del dueño con SU password (no autogenerada).
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: email_owner,
    password,
    email_confirm: true, // diferido el email real de verificación; ver header del archivo
    user_metadata: { nombre: nombre_owner, onboarding_self_service: true },
  });
  if (cErr || !created?.user) {
    const msg = cErr?.message ?? "";
    if (/already.*registered|exists|duplicate/i.test(msg)) {
      return json({ error: "EMAIL_YA_REGISTRADO" }, 409);
    }
    return json({ error: "ALTA_OWNER_FALLO", detalle: msg }, 400);
  }
  const ownerId = created.user.id;

  // 2) Provisionar el tenant (SECURITY DEFINER → ignora RLS).
  const plan = PLAN_DE_VERTICAL[vertical];
  const { data: tenantId, error: pErr } = await admin.rpc("crear_tenant_con_owner", {
    p_owner_user_id: ownerId,
    p_codigo: codigo,
    p_nombre_comercial: nombre_comercial,
    p_nombre_owner: nombre_owner,
    p_telefono_owner: telefono_owner,
    p_vertical: vertical,
    p_plan_codigo: plan,
    p_estado: "TRIAL",
    p_notas_internas: "Self-service (signup-tenant)",
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(ownerId).catch(() => {});
    // El error más probable cuando el slug está duplicado:
    if (/duplicate|unique|already/i.test(pErr.message)) {
      return json({ error: "CODIGO_YA_USADO" }, 409);
    }
    return json({ error: "PROVISION_FALLO", detalle: pErr.message }, 400);
  }

  return json({
    ok: true,
    tenant_id: tenantId,
    owner_id: ownerId,
    email: email_owner,
    siguiente_paso: "login",
  });
});
