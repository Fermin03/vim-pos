// SEC CN-004 (Cyber Neo) — CORS por-request con allowlist.
// Configuración de prod:
//   supabase secrets set VIM_CORS_ORIGINS="https://pos.vimpos.mx,https://admin.vimpos.mx"
// Solo esos orígenes reciben su propio Origin reflejado; el resto recibe el primero (no su
// Origin) → el navegador bloquea la lectura.
//
// Fail-closed: si VIM_CORS_ORIGINS NO está configurada, en DEV (Supabase local) seguimos con
// "*" por conveniencia, pero en PRODUCCIÓN (Supabase cloud) NO hacemos fail-open — un olvido de
// la env ya no deja el CORS abierto.

const BASE: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

/** Heurística: el runtime local de Supabase usa URLs internas (localhost/kong/127.0.0.1). */
function esEntornoLocal(): boolean {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  return /localhost|127\.0\.0\.1|::1|kong|host\.docker\.internal/i.test(url);
}

export function corsHeaders(req: Request): Record<string, string> {
  const configured = (Deno.env.get("VIM_CORS_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (configured.length === 0) {
    // Dev local → "*" (sin cambio). Prod sin allowlist → fail-closed: "null" no concede a ningún
    // origen real, así el navegador bloquea la lectura cross-origin.
    return { ...BASE, "Access-Control-Allow-Origin": esEntornoLocal() ? "*" : "null" };
  }

  const origin = req.headers.get("origin") ?? "";
  const allow = configured.includes(origin) ? origin : configured[0]!;
  return { ...BASE, "Access-Control-Allow-Origin": allow };
}
