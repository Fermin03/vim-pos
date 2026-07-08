// Edge Function: sync-push  (Fase 1 · POS de escritorio local-first)
// Recibe la "rebanada operativa" que la caja generó offline (turnos, tickets, items, pagos…) y
// la replica VERBATIM en la nube vía la RPC sync_push_snapshot (modo réplica → conserva folios/
// totales/PAGADO exactos; no re-genera folios). Solo la puede llamar una cuenta de DISPOSITIVO.
//
// Llamada: POST /functions/v1/sync-push  (Authorization: Bearer <JWT del dispositivo>)
//   body: { snapshot: { <tabla>: [filas…] } }
// Respuesta: { resultado: { <tabla>: n } }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

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

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_INVALIDA" }, 401);

  const claims = leerClaims(token);
  const tenant = claims.tenant_id as string | undefined;
  if (claims.tipo_identidad !== "DISPOSITIVO" || !tenant) {
    return json({ error: "NO_ES_DISPOSITIVO" }, 403);
  }

  let body: { snapshot?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  if (!body.snapshot) return json({ error: "FALTA_SNAPSHOT" }, 400);

  // La RPC (service_role) aplica el snapshot en modo réplica, forzando tenant_id = tenant.
  const { data, error } = await admin.rpc("sync_push_snapshot", { p_tenant: tenant, p_snapshot: body.snapshot });
  if (error) return json({ error: "RPC_ERROR", detalle: error.message }, 500);

  return json({ resultado: data });
});
