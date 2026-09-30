// Edge Function: signup-tenant (F12) — registro público de negocios. ADR 0022 (0142).
// A diferencia de provisionar-tenant (herramienta interna de VIM), esta función es pública:
// cualquiera con la anon key crea su cuenta y su negocio en prueba (TRIAL, 30 días).
//
// Dos acciones, un solo punto de entrada público:
//   POST { ...datos, acepta_terminos: true, captcha }         → alta
//   POST { accion: "reenviar", email, captcha }               → reenviar el correo de confirmación
//
// CONTROLES
//   · Captcha Cloudflare Turnstile (_shared/turnstile.ts). Sin TURNSTILE_SECRET_KEY no se verifica
//     y se avisa en el log (local, y hasta que Fermín cree las llaves); con él, token malo = 400.
//   · Límites en la base (consumir_cupo, 0136), antes de validar: un intento inválido también
//     cuesta. FAIL-CLOSED si la base no responde: crear cuentas sin límite justo cuando no se ve
//     nada sería lo peor (503 "intenta en un momento").
//       alta:     MAX_POR_IP por IP y hora + MAX_GLOBAL por hora.
//       reenvío:  por IP, por correo (hash) y global. GoTrue además limita sus propios correos.
//   · Términos aceptados OBLIGATORIOS: sin `acepta_terminos: true` no se toca Auth, y la base
//     (alta_autoservicio) tampoco da de alta sin la versión.
//   · Contacto obligatorio: nombre, WhatsApp (10 dígitos), correo y ciudad.
//   · CORREO VERIFICADO: la cuenta se crea SIN confirmar y GoTrue manda el enlace (el mismo SMTP
//     de Hostinger que las invitaciones). Hasta abrirlo, iniciar sesión da "Email not confirmed".
//     El negocio SÍ se crea ya en TRIAL, para que la prueba cuente desde el registro.
//   · Aviso a VIM de cada alta por correo (VIM_AVISOS_A), sin esperarlo ni dejar que falle el alta.
//
// SECRETOS: ADMIN_APP_URL (a dónde regresa el enlace del correo), PLATFORM_APP_URL (enlace a la
// ficha en el aviso, por defecto https://platform.vimpos.com.mx), TURNSTILE_SECRET_KEY, VIM_SMTP_*,
// VIM_AVISOS_A. La configuración de Auth que esto necesita está en docs/operacion/registro-publico.md.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { consumirCupos, ipDeLaPeticion, type Cupo } from "../_shared/limite.ts";
import { verificarTurnstile } from "../_shared/turnstile.ts";
import { enSegundoPlano, enviarCorreo } from "../_shared/correo.ts";
import { correoAvisoAlta, procesarAlta, procesarReenvio, type DepsAlta } from "../_shared/alta.ts";

const MAX_POR_IP = 10;       // altas (o intentos) por IP y hora: holgado para quien se equivoca
const MAX_GLOBAL = 60;       // altas (o intentos) de todo el mundo por hora
const REENVIO_POR_IP = 5;
const REENVIO_POR_CORREO = 3;
const REENVIO_GLOBAL = 100;
const HORA = 60 * 60;

/** El correo no va en claro a la tabla de cupos: basta con que sea el mismo cada vez. */
async function huella(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.trim().toLowerCase()));
  return Array.from(new Uint8Array(h).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  let b: Record<string, unknown>;
  try {
    const x = await req.json();
    b = x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  const reenvio = b.accion === "reenviar";

  // ── Límite (antes de validar; ver el encabezado) ────────────────────────────────────────────
  const ip = ipDeLaPeticion(req);
  const cupos: Cupo[] = reenvio
    ? [
        { clave: `signup-reenvio:ip:${ip}`, ventanaSeg: HORA, max: REENVIO_POR_IP },
        ...(typeof b.email === "string" && b.email.trim()
          ? [{ clave: `signup-reenvio:correo:${await huella(b.email)}`, ventanaSeg: HORA, max: REENVIO_POR_CORREO }]
          : []),
        { clave: "signup-reenvio:global", ventanaSeg: HORA, max: REENVIO_GLOBAL },
      ]
    : [
        { clave: `signup:ip:${ip}`, ventanaSeg: HORA, max: MAX_POR_IP },
        { clave: "signup:global", ventanaSeg: HORA, max: MAX_GLOBAL },
      ];
  const cupo = await consumirCupos(admin, cupos, "cerrar");
  if (!cupo.permitido) {
    if (cupo.motivo === "BD_NO_RESPONDE") return json({ error: "NO_DISPONIBLE", detalle: "Intenta de nuevo en un momento." }, 503);
    console.warn(`[signup-tenant] límite alcanzado (${reenvio ? "reenvío" : "alta"}) desde ${ip}`);
    return json({ error: "DEMASIADOS_INTENTOS", detalle: "Demasiados intentos seguidos. Intenta más tarde." }, 429);
  }

  const secreto = Deno.env.get("TURNSTILE_SECRET_KEY");
  const adminUrl = (Deno.env.get("ADMIN_APP_URL") ?? "http://localhost:3001").replace(/\/+$/, "");
  const platformUrl = Deno.env.get("PLATFORM_APP_URL") ?? "https://platform.vimpos.com.mx";
  const log: NonNullable<DepsAlta["log"]> = (nivel, msg) => console[nivel](`[signup-tenant] ${msg}`);

  const deps: DepsAlta = {
    async verificarCaptcha(token) {
      const r = await verificarTurnstile({ secreto, token, ip });
      if (r.ok && r.omitido) console.warn("[signup-tenant] TURNSTILE_SECRET_KEY no configurada: captcha NO verificado.");
      if (!r.ok) console.warn(`[signup-tenant] captcha rechazado desde ${ip}: ${r.motivo} ${r.codigos?.join(",") ?? ""}`);
      return { ok: r.ok };
    },
    async crearUsuario({ email, password, nombre }) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,   // entra hasta abrir el enlace del correo
        user_metadata: { nombre, onboarding_self_service: true },
      });
      if (error || !data?.user) return { error: error?.message ?? "sin usuario" };
      return { id: data.user.id };
    },
    async borrarUsuario(id) {
      await admin.auth.admin.deleteUser(id);
    },
    async altaNegocio(d) {
      const { data, error } = await admin.rpc("alta_autoservicio", {
        p_owner_user_id: d.owner_id,
        p_codigo: d.codigo,
        p_nombre_comercial: d.nombre_comercial,
        p_nombre_owner: d.nombre_owner,
        p_telefono_owner: d.telefono_owner,
        p_vertical: d.vertical,
        p_plan_codigo: d.plan,
        p_ciudad: d.ciudad,
        p_terminos_version: d.terminos_version,
      });
      if (error || typeof data !== "string") return { error: error?.message ?? "sin tenant" };
      return { tenantId: data };
    },
    async enviarConfirmacion(email) {
      // GoTrue manda su plantilla "Confirm signup" por el SMTP del proyecto. El enlace regresa a
      // /cuenta-confirmada del admin, que toma la sesión y lleva a la primera vez.
      const { error } = await admin.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${adminUrl}/cuenta-confirmada` } });
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    avisarVim(d) {
      const { subject, html } = correoAvisoAlta(d, platformUrl);
      enSegundoPlano(
        enviarCorreo({ to: Deno.env.get("VIM_AVISOS_A") ?? "hola@vimpos.com.mx", subject, html })
          .then((r) => r.enviado ? log("info", `alta ${d.tenantId}: aviso a VIM enviado.`) : log("warn", `alta ${d.tenantId}: aviso a VIM NO enviado (${r.motivo}).`))
          .catch((e) => log("error", `alta ${d.tenantId}: el aviso reventó — ${e?.message ?? e}`)),
      );
    },
    log,
  };

  const r = reenvio ? await procesarReenvio(b, deps) : await procesarAlta(b, deps);
  return json(r.body, r.status);
});
