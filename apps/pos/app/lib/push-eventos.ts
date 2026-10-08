"use client";

// Fase 2 · disparo de eventos críticos → edge function enviar-push (notifica a los
// dispositivos del tenant que activaron push en el admin). Fire-and-forget: nunca
// bloquea la operación de caja si falla.

import { encabezadosFuncion, urlFuncion } from "./supabase";

export function notificarEventoCritico(token: string, titulo: string, cuerpo: string, url = "/"): void {
  try {
    void fetch(urlFuncion("enviar-push"), {
      method: "POST",
      headers: encabezadosFuncion(token),
      body: JSON.stringify({ titulo, cuerpo, url }),
    }).catch(() => {});
  } catch { /* sin red: el evento crítico de sync se reintenta solo al re-sincronizar */ }
}
