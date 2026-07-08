// Edge Function: sync-pull  (Fase 1 · POS de escritorio local-first)
// Devuelve la "rebanada" de referencia del tenant (catálogo, config, org, empleados+PIN) para
// que el device local haga upsert idempotente. La arma la RPC sync_pull_snapshot (SECURITY
// DEFINER, service_role). Solo la puede llamar una cuenta de DISPOSITIVO (espeja pin-login).
//
// Llamada: POST /functions/v1/sync-pull   (Authorization: Bearer <JWT del dispositivo>)
// Respuesta: { snapshot: { <tabla>: [filas…], __watermark } }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

/** Lee los claims de un JWT cuya firma YA validó getUser (no re-verifica). */
function leerClaims(token: string): Record<string, unknown> {
  try {
    const p = token.split(".")[1];
    return p ? JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))) : {};
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  // Autenticación del DISPOSITIVO llamante (espeja pin-login). La anon key no tiene usuario.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_INVALIDA" }, 401);

  const claims = leerClaims(token);
  const tenant = claims.tenant_id as string | undefined;
  if (claims.tipo_identidad !== "DISPOSITIVO" || !tenant) {
    return json({ error: "NO_ES_DISPOSITIVO" }, 403);
  }

  // La RPC (service_role) arma el snapshot del tenant (incluye pin_hash y auth.users).
  const { data, error } = await admin.rpc("sync_pull_snapshot", { p_tenant: tenant });
  if (error) return json({ error: "RPC_ERROR", detalle: error.message }, 500);

  return json({ snapshot: data });
});
