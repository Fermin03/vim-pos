"use client";

// Fase 2 · disparo de eventos críticos → edge function enviar-push (notifica a los
// dispositivos del tenant que activaron push en el admin). Fire-and-forget: nunca
// bloquea la operación de caja si falla.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function notificarEventoCritico(token: string, titulo: string, cuerpo: string, url = "/"): void {
  try {
    void fetch(`${URL}/functions/v1/enviar-push`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ titulo, cuerpo, url }),
    }).catch(() => {});
  } catch { /* sin red: el evento crítico de sync se reintenta solo al re-sincronizar */ }
}
