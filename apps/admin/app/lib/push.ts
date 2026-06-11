"use client";
import { supabase, leerSesion } from "./supabase";

// Fase 2 · Web Push del admin: suscribir este navegador a eventos críticos del negocio.

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// La llave PUBLICA de VAPID no es secreta (viaja a cada navegador); la privada vive solo en Supabase secrets.
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "BEu-r5QnQDnVkn5G19rkGal7xvgPOtGtH2SThXktmKoCze92VeC-WFm2I5rnXuqoVJ6E7Cqo7BootH1yds2xbMo";

export function pushSoportado(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && VAPID_PUBLIC !== "";
}

function b64uABuffer(b64u: string): ArrayBuffer {
  const pad = "=".repeat((4 - (b64u.length % 4)) % 4);
  const raw = atob((b64u + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer as ArrayBuffer;
}

/** ¿Este navegador ya está suscrito? */
export async function estadoSuscripcion(): Promise<boolean> {
  if (!pushSoportado()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return Boolean(sub);
}

/** Pide permiso, suscribe este navegador y guarda la suscripción (RLS: propia). */
export async function activarNotificaciones(): Promise<void> {
  if (!pushSoportado()) throw new Error("Este navegador no soporta notificaciones push.");
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") throw new Error("Permiso de notificaciones denegado.");

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64uABuffer(VAPID_PUBLIC),
  });

  const s = await leerSesion();
  if (!s?.tenantId || !s.userId) throw new Error("Sesión inválida.");
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error("Suscripción incompleta.");

  const { error } = await supabase.from("push_suscripciones").upsert(
    {
      tenant_id: s.tenantId,
      usuario_id: s.userId,
      endpoint: j.endpoint,
      p256dh: j.keys.p256dh,
      auth: j.keys.auth,
      descripcion: navigator.userAgent.slice(0, 140),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(error.message);
}

/** Desuscribe este navegador y borra la fila. */
export async function desactivarNotificaciones(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_suscripciones").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
}

/** Dispara una notificación de prueba a todo el tenant (vía enviar-push). */
export async function enviarPrueba(): Promise<{ enviadas: number }> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token ?? ANON;
  const res = await fetch(`${URL_SB}/functions/v1/enviar-push`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ titulo: "🔔 Prueba VIM POS", cuerpo: "Las notificaciones de eventos críticos están activas.", url: "/dashboard" }),
  });
  const data = (await res.json().catch(() => ({}))) as { enviadas?: number; error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return { enviadas: data.enviadas ?? 0 };
}
