// El enlace de un correo (invitación, recuperación, «Dar acceso a su celular») que aterriza en
// /establecer-acceso trae su sesión en el hash. Esa sesión manda: si el navegador ya tenía otra
// (el dueño con el panel abierto), se reemplaza ANTES de enseñar el correo o de guardar una
// contraseña. Si la del enlace no se puede abrir, el enlace es inválido: nunca se cae a la que había.
// La detección automática de supabase-js se apaga en esta ruta (lib/supabase.ts) porque, si falla,
// conserva la sesión anterior sin avisar.

export const RUTA_ENLACE = "/establecer-acceso";

export type Enlace =
  | { tipo: "sesion"; access_token: string; refresh_token: string }
  | { tipo: "error"; mensaje: string };

/** Lo que trae la URL del enlace; null si no viene de un enlace. */
export function leerEnlace(href: string): Enlace | null {
  const url = new URL(href);
  const p = new URLSearchParams(url.hash.replace(/^#/, ""));
  for (const [k, v] of url.searchParams) if (!p.has(k)) p.set(k, v);
  const error = p.get("error_description") ?? p.get("error");
  if (error) return { tipo: "error", mensaje: error };
  const access_token = p.get("access_token");
  const refresh_token = p.get("refresh_token");
  if (access_token && refresh_token) return { tipo: "sesion", access_token, refresh_token };
  // ponytail: el admin usa el flujo implícito (hash). Un `code` de PKCE no se puede canjear en otro
  // dispositivo (el verificador vive donde se pidió), así que se trata como enlace inválido.
  if (p.has("code") || p.has("token_hash")) return { tipo: "error", mensaje: "enlace no soportado" };
  return null;
}

type AuthEnlace = {
  setSession(t: { access_token: string; refresh_token: string }): Promise<{
    data: { session: { user: { email?: string } } | null };
    error: unknown;
  }>;
};

/** Abre la sesión del enlace reemplazando la que hubiera. Devuelve su correo, o null si no se pudo. */
export async function abrirSesionDelEnlace(auth: AuthEnlace, enlace: Enlace): Promise<string | null> {
  if (enlace.tipo === "error") return null;
  const { data, error } = await auth.setSession({ access_token: enlace.access_token, refresh_token: enlace.refresh_token });
  if (error || !data.session) return null;
  return data.session.user.email ?? "";
}
