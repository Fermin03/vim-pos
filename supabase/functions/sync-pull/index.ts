// Edge Function: sync-pull  (Fase 1 · POS de escritorio local-first)
// Devuelve la "rebanada" de referencia del tenant (catálogo, config, org, empleados+PIN) para
// que el device local haga upsert idempotente. La arma la RPC sync_pull_snapshot (SECURITY
// DEFINER, service_role). Solo la puede llamar una cuenta de DISPOSITIVO (espeja pin-login).
//
// Llamada: POST /functions/v1/sync-pull   (Authorization: Bearer <JWT del dispositivo>)
// Respuesta: { snapshot: { <tabla>: [filas…], __watermark } }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { cajaIdDeEmail } from "../_shared/latido.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// POR QUÉ SIGUE AQUÍ getUser. El 9 sep 2026 se intentó verificar la firma del token en local para
// ahorrarse este viaje a GoTrue. No se puede: este proyecto está migrado a CLAVES DE FIRMA
// ASIMÉTRICAS —su JWKS publica una ES256— así que los tokens que emite GoTrue NO van firmados con
// el JWT secret HS256. Que `pin-login` acuñe tokens HS256 y el RLS los acepte no significa que los
// emitidos sean HS256: aceptar no es emitir. Una verificación local solo de HS256 rechazaría todos
// los tokens de dispositivo reales. Si algún día se quiere el ahorro, hay que verificar ES256
// contra el JWKS (cacheando las claves) y dejar HS256 solo para lo de pin-login.

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

/** Lee los claims de un JWT cuya firma YA validó getUser (no re-verifica). */
function claimsDe(token: string): Record<string, unknown> {
  try {
    const p = token.split(".")[1] ?? "";
    return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return {}; }
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

  const claims = claimsDe(token);
  const tenant = typeof claims.tenant_id === "string" ? claims.tenant_id : null;
  const cajaId = cajaIdDeEmail(u.user.email);
  if (claims.tipo_identidad !== "DISPOSITIVO" || !tenant || !cajaId) {
    return json({ error: "NO_ES_DISPOSITIVO" }, 403);
  }
  if (!await cajaEnRegla(cajaId, tenant)) return json({ error: "CAJA_NO_EXISTE" }, 403);

  // La RPC (service_role) arma el snapshot del tenant (incluye pin_hash y auth.users).
  const { data, error } = await admin.rpc("sync_pull_snapshot", { p_tenant: tenant });
  if (error) return json({ error: "RPC_ERROR", detalle: error.message }, 500);

  return json({ snapshot: data });
});
