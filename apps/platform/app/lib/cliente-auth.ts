"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * El cliente de Supabase Auth del navegador (A8). Solo se usa para la sesión del operador:
 * contraseña, segundo factor y el token que va en cada petición al servidor del panel. Los datos
 * los sigue leyendo el servidor con service_role.
 *
 * La sesión vive en sessionStorage, como vivía la clave: muere al cerrar la pestaña. Un panel que
 * puede entrar como cualquier dueño no debe quedar abierto en una computadora prestada.
 *
 * La URL y la llave pública se piden a /api/config (ver ahí por qué no son NEXT_PUBLIC_*).
 */
let cliente: Promise<SupabaseClient> | null = null;

export function clienteAuth(): Promise<SupabaseClient> {
  cliente ??= fetch("/api/config", { cache: "no-store" })
    .then(async (r) => {
      const c = (await r.json()) as { url?: string; anon?: string };
      if (!r.ok || !c.url || !c.anon) throw new Error("El panel no tiene la configuración de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY).");
      return createClient(c.url, c.anon, {
        auth: {
          storage: window.sessionStorage,
          storageKey: "vim.platform.sesion",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });
    })
    .catch((e) => {
      cliente = null; // que el siguiente intento vuelva a pedirla
      throw e;
    });
  return cliente;
}

/** Los mensajes de Auth, en palabras del operador. */
export function mensajeAuth(e: { message?: string; code?: string } | null | undefined): string {
  const code = e?.code ?? "";
  const msg = e?.message ?? "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) return "Correo o contraseña incorrectos.";
  if (code === "mfa_verification_failed" || /invalid totp code/i.test(msg)) return "Ese código no es. Revisa tu app autenticadora y escribe el que se ve ahora.";
  if (code === "mfa_totp_enroll_not_enabled" || code === "mfa_totp_verify_not_enabled") {
    return "El segundo factor está apagado en Supabase (Authentication → Multi-Factor → TOTP). Mientras se enciende, se entra con la clave compartida.";
  }
  if (code === "otp_expired" || (/expired|invalid/i.test(msg) && /token|otp|link/i.test(msg))) return "El enlace ya venció o ya se usó. Pide uno nuevo a otro operador.";
  if (code === "weak_password") return "Esa contraseña es muy débil. Usa una más larga.";
  if (code === "same_password") return "Elige una contraseña distinta a la anterior.";
  if (code === "over_request_rate_limit" || /rate limit/i.test(msg)) return "Demasiados intentos. Espera un par de minutos.";
  return msg || "No se pudo completar. Intenta de nuevo.";
}
