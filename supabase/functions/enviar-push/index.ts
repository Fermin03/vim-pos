// Edge Function: enviar-push — Fase 2: notificaciones de eventos críticos (Web Push).
// Cualquier usuario AUTENTICADO del tenant puede disparar (el POS detecta conflictos de
// sync, el cierre detecta diferencias); la notificación llega a TODAS las suscripciones
// del tenant (los dispositivos que activaron notificaciones en el admin).
// Payload: { titulo, cuerpo, url? }

import webpush from "npm:web-push@3.6.7";
import { clienteAdmin, servir } from "../_shared/http.ts";
import { registrarError } from "../_shared/errores.ts";
import { bearerDe, tenantDelToken } from "../_shared/identidad.ts";
import { igualesEnTiempoConstante } from "../_shared/delivery/firma.ts";

// Camino interno (0097): la base de datos avisa desde pg_cron/pg_net con el secreto compartido
// `x-vim-interno` (Vault `vim_interno` = secret VIM_INTERNO_SECRET) y dice el tenant en el cuerpo.
const INTERNO = Deno.env.get("VIM_INTERNO_SECRET") ?? "";

const admin = clienteAdmin();

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:no-reply@vimpos.com.mx",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

servir(async (req, json) => {
  // 2) Payload (se lee primero: el camino interno trae el tenant en el cuerpo)
  let body: { titulo?: string; cuerpo?: string; url?: string; tenant_id?: string };
  try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }

  // 1) ¿Quién dispara? Camino interno (base de datos) o JWT de un usuario del tenant.
  let tenantId: string;
  const internoRecibido = (req.headers.get("x-vim-interno") ?? "").trim();
  if (internoRecibido !== "") {
    if (INTERNO === "" || !igualesEnTiempoConstante(internoRecibido, INTERNO)) return json({ error: "INTERNO_INVALIDO" }, 401);
    if (typeof body.tenant_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.tenant_id)) return json({ error: "FALTA_TENANT" }, 400);
    tenantId = body.tenant_id;
  } else {
    const token = bearerDe(req);
    if (!token) return json({ error: "NO_AUTH" }, 401);
    const { data: userResp, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);
    // C2-6: el tenant es el de la SESIÓN (claim del token ya verificado), y el acceso se comprueba
    // en ESE tenant. Antes: el primer acceso activo que devolviera Postgres, fuera del negocio que fuera.
    const tenantToken = tenantDelToken(token);
    if (!tenantToken) return json({ error: "SIN_TENANT" }, 403);
    const { data: acceso } = await admin
      .from("usuarios_acceso").select("tenant_id").eq("usuario_id", userResp.user.id)
      .eq("tenant_id", tenantToken).eq("activo", true).limit(1).maybeSingle();
    if (!acceso) return json({ error: "SIN_TENANT" }, 403);
    tenantId = tenantToken;
  }
  const titulo = body.titulo?.trim()?.slice(0, 120);
  const cuerpo = body.cuerpo?.trim()?.slice(0, 300);
  if (!titulo || !cuerpo) return json({ error: "FALTA_TITULO_O_CUERPO" }, 400);

  // 3) Suscripciones del tenant → enviar; limpiar las muertas (410/404)
  const { data: subs, error: subErr } = await admin
    .from("push_suscripciones").select("id, endpoint, p256dh, auth").eq("tenant_id", tenantId);
  if (subErr) { registrarError("enviar-push", "DB_ERROR", subErr); return json({ error: "DB_ERROR" }, 500); }

  // SEC CN-014 — `titulo` y `cuerpo` se recortaban pero `url` iba tal cual, y esta función la puede
  // disparar cualquier usuario autenticado del tenant (incluido un dispositivo comprometido). Eso
  // permitía mandar a TODAS las pantallas del negocio una notificación de aspecto legítimo
  // ("Diferencia en el cierre de caja") cuyo clic llevaba a un dominio de phishing.
  // Solo se aceptan rutas internas: "/algo" y nunca "//host" (que el navegador trata como absoluta).
  const rutaSegura =
    typeof body.url === "string" && /^\/(?!\/)[\w\-./?=&%#]*$/.test(body.url) ? body.url : "/";
  const payload = JSON.stringify({ titulo, cuerpo, url: rutaSegura });
  let enviadas = 0, muertas = 0;
  for (const s of (subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      enviadas++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await admin.from("push_suscripciones").delete().eq("id", s.id);
        muertas++;
      }
    }
  }

  return json({ ok: true, enviadas, muertas, total: (subs ?? []).length });
});
