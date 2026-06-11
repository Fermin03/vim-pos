// Edge Function: enviar-push — Fase 2: notificaciones de eventos críticos (Web Push).
// Cualquier usuario AUTENTICADO del tenant puede disparar (el POS detecta conflictos de
// sync, el cierre detecta diferencias); la notificación llega a TODAS las suscripciones
// del tenant (los dispositivos que activaron notificaciones en el admin).
// Payload: { titulo, cuerpo, url? }

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { corsHeaders } from "../_shared/cors.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:no-reply@vimpos.com.mx",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  // 1) JWT del que dispara → su tenant
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: userResp, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);

  const { data: acceso } = await admin
    .from("usuarios_acceso").select("tenant_id").eq("usuario_id", userResp.user.id).eq("activo", true).limit(1).maybeSingle();
  if (!acceso) return json({ error: "SIN_TENANT" }, 403);
  const tenantId = (acceso as { tenant_id: string }).tenant_id;

  // 2) Payload
  let body: { titulo?: string; cuerpo?: string; url?: string };
  try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
  const titulo = body.titulo?.trim()?.slice(0, 120);
  const cuerpo = body.cuerpo?.trim()?.slice(0, 300);
  if (!titulo || !cuerpo) return json({ error: "FALTA_TITULO_O_CUERPO" }, 400);

  // 3) Suscripciones del tenant → enviar; limpiar las muertas (410/404)
  const { data: subs, error: subErr } = await admin
    .from("push_suscripciones").select("id, endpoint, p256dh, auth").eq("tenant_id", tenantId);
  if (subErr) return json({ error: "DB_ERROR", detalle: subErr.message }, 500);

  const payload = JSON.stringify({ titulo, cuerpo, url: body.url ?? "/" });
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
