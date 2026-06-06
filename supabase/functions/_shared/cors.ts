// SEC CN-004 (Cyber Neo) — CORS por-request con allowlist.
// Si VIM_CORS_ORIGINS NO está configurada (dev/piloto), el comportamiento es idéntico
// al anterior ("*") para no romper nada. En producción se configura con:
//   supabase secrets set VIM_CORS_ORIGINS="https://pos.vimpos.mx,https://admin.vimpos.mx"
// y entonces solo esos orígenes reciben su propio Origin reflejado; el resto recibe
// el primer origen configurado (no su propio Origin) → el navegador bloquea la lectura.

const BASE: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

export function corsHeaders(req: Request): Record<string, string> {
  const configured = (Deno.env.get("VIM_CORS_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Sin allowlist → comportamiento histórico (wildcard). Cero cambio de runtime en dev.
  if (configured.length === 0) return { ...BASE, "Access-Control-Allow-Origin": "*" };

  const origin = req.headers.get("origin") ?? "";
  const allow = configured.includes(origin) ? origin : configured[0]!;
  return { ...BASE, "Access-Control-Allow-Origin": allow };
}
