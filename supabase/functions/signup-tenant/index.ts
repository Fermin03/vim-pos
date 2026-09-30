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
//   - Límite de altas en la base (consumir_cupo, 0136): por IP y un tope global por hora.
//
// LÍMITE (auditoría integral 30/09/2026, C2-3). Antes no había ninguno: cada petición creaba una
// cuenta de Auth ya confirmada y un tenant TRIAL, sin verificar el correo. Un guion creaba miles.
// Ahora, antes de tocar Auth:
//   · por IP: MAX_POR_IP altas por hora (la IP de confianza, ver _shared/limite.ts);
//   · global: MAX_GLOBAL por hora, que no depende de ninguna cabecera y es el que de verdad acota
//     el daño si alguien rota IPs. Muy por encima del ritmo real de altas de VIM.
// Se consume ANTES de validar el cuerpo a propósito: un intento inválido también cuesta, así no se
// puede sondear gratis qué correos o códigos existen.
//
// FAIL-CLOSED si la base no responde: esta función crea cuentas en Auth, que es otro servicio y
// puede seguir vivo aunque la RPC falle. Abrir en ese caso sería dejar las altas sin límite justo
// cuando no se ve nada. El visitante recibe 503 "intenta en un momento".
//
// VERIFICACIÓN DE CORREO: sigue diferida, y es decisión de producto, no olvido. La pantalla de
// registro (apps/admin/app/registro/page.tsx) entra con la contraseña recién creada y lleva al dueño
// directo a /bienvenida; con `email_confirm: false` GoTrue rechazaría ese login ("Email not
// confirmed") y el onboarding se rompería a la mitad. Propuesta en el informe de la auditoría.
//
// DIFERIDO (cuando haya tráfico real):
//   - hCaptcha/Turnstile para bloquear bots.
//   - Email de verificación obligatorio antes de poder operar (ver arriba).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { consumirCupos, ipDeLaPeticion } from "../_shared/limite.ts";

const MAX_POR_IP = 10;      // intentos por IP y hora: holgado para quien se equivoca de correo o código
const MAX_GLOBAL = 60;      // altas (o intentos) de todo el mundo por hora
const HORA = 60 * 60;

const VERTICALES = ["FOODTRUCK", "QUICK_SERVICE", "FULL_SERVICE", "CAFE_BAR", "DARK_KITCHEN", "ENTERPRISE"];
// Los planes por giro (QS, FT, FS…) se desactivaron con los tres escalones de precios (ago 2026)
// y el registro seguía pidiéndolos: fallaba con «Plan QS no existe o inactivo». Los escalones no
// dependen del giro —Esencial ya trae cocina y mesas—; una cadena empieza en Cadena. El plan se
// cambia después desde /platform.
const PLAN_DE_VERTICAL: Record<string, string> = {
  FOODTRUCK: "ESENCIAL", QUICK_SERVICE: "ESENCIAL", FULL_SERVICE: "ESENCIAL",
  CAFE_BAR: "ESENCIAL", DARK_KITCHEN: "ESENCIAL", ENTERPRISE: "CADENA",
};

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // ── Límite (antes de todo lo demás; ver el encabezado) ──────────────────────
  const ip = ipDeLaPeticion(req);
  const cupo = await consumirCupos(admin, [
    { clave: `signup:ip:${ip}`, ventanaSeg: HORA, max: MAX_POR_IP },
    { clave: "signup:global", ventanaSeg: HORA, max: MAX_GLOBAL },
  ], "cerrar");
  if (!cupo.permitido) {
    if (cupo.motivo === "BD_NO_RESPONDE") return json({ error: "NO_DISPONIBLE", detalle: "Intenta de nuevo en un momento." }, 503);
    console.warn(`[signup-tenant] límite alcanzado desde ${ip}`);
    return json({ error: "DEMASIADOS_INTENTOS", detalle: "Demasiados registros seguidos. Intenta más tarde." }, 429);
  }

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
    // C2-9: el mensaje de GoTrue va al log, no al visitante.
    console.error("[signup-tenant] createUser:", msg);
    return json({ error: "ALTA_OWNER_FALLO" }, 400);
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
    console.error("[signup-tenant] crear_tenant_con_owner:", pErr.message);
    return json({ error: "PROVISION_FALLO" }, 400);
  }

  return json({
    ok: true,
    tenant_id: tenantId,
    owner_id: ownerId,
    email: email_owner,
    siguiente_paso: "login",
  });
});
