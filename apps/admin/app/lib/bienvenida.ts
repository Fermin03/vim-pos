"use client";
import { supabase } from "./supabase";

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Pide el correo de bienvenida para el dueño (Edge Function `correo-bienvenida`, 0146).
 *
 * Se llama cuando la cuenta queda confirmada: al abrir el enlace del registro público
 * (/cuenta-confirmada) y al fijar la contraseña tras la invitación de VIM (/establecer-acceso).
 * Llamarla de más no hace daño: el servidor manda UN correo por negocio y contesta "ya enviada"
 * a todo lo demás, y a un negocio que ya no es nuevo no le manda nada.
 *
 * NUNCA lanza y no hay nada que enseñar si falla: el dueño está entrando a su panel y un correo
 * que no salió no es su problema. El fallo queda en el log de la función.
 */
export async function pedirBienvenida(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch(`${URL_SB}/functions/v1/correo-bienvenida`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
      // Sobrevive al cambio de pantalla: quien llama navega justo después.
      keepalive: true,
    });
  } catch {
    /* a propósito: ver arriba */
  }
}
