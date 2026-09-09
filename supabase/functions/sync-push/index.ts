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
import { crearVerificadorDispositivo } from "../_shared/auth-dispositivo.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// La firma del token se verifica aquí mismo en vez de preguntarle a GoTrue en cada llamada: esta
// función corre en bucle en cada caja. OJO: las Edge Functions no permiten secretos con prefijo
// SUPABASE_ (reservado), por eso el JWT secret se inyecta como VIM_JWT_SECRET.
const JWT_SECRET = Deno.env.get("VIM_JWT_SECRET");
if (!JWT_SECRET) throw new Error("Falta VIM_JWT_SECRET en el entorno de la función.");
const verificarDispositivo = crearVerificadorDispositivo(JWT_SECRET);

/**
 * La caja tiene que existir, ser de este tenant y estar activa.
 *
 * Esto ANTES NO SE COMPROBABA: con getUser bastaba que el usuario del dispositivo siguiera vivo
 * en auth, así que una caja desactivada seguía subiendo ventas y bajando el catálogo, y la única
 * forma de pararla era borrarle el usuario a mano. Ahora `activa = false` corta en el acto — que
 * además es lo correcto para el límite del plan: desactivar una caja libera su lugar (0103), y
 * sin este candado se podían operar dos con un plan de una.
 */
async function cajaEnRegla(cajaId: string, tenantId: string): Promise<boolean> {
  const { data } = await admin.from("cajas").select("id")
    .eq("id", cajaId).eq("tenant_id", tenantId).eq("activa", true).is("deleted_at", null)
    .maybeSingle();
  return Boolean(data);
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const auth = await verificarDispositivo(req.headers.get("authorization"));
  if (!auth.ok) return json({ error: auth.error, ...(auth.detalle ? { detalle: auth.detalle } : {}) }, auth.status);
  const tenant = auth.tenantId;
  if (!await cajaEnRegla(auth.cajaId, tenant)) return json({ error: "CAJA_NO_EXISTE" }, 403);

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

  // Espejo de apps (spec 2026-09-03): los tickets creados en la caja para pedidos de apps suben
  // aquí; se enlazan al pedido por folio_externo_app. Best-effort: no puede tirar el push.
  let enlazados = 0;
  try {
    const { data: n } = await admin.rpc("delivery_enlazar_tickets", { p_tenant: tenant });
    enlazados = Number(n ?? 0);
  } catch { /* la siguiente subida lo reintenta */ }

  return json({ resultado: data, enlazados });
});
