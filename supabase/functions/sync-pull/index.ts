// Edge Function: sync-pull  (Fase 1 · POS de escritorio local-first)
// Devuelve la "rebanada" de referencia del tenant (catálogo, config, org, empleados+PIN) para
// que el device local haga upsert idempotente. La arma la RPC sync_pull_snapshot (SECURITY
// DEFINER, service_role). Solo la puede llamar una cuenta de DISPOSITIVO (espeja pin-login).
//
// Llamada: POST /functions/v1/sync-pull   (Authorization: Bearer <JWT del dispositivo>)
// Respuesta: { snapshot: { <tabla>: [filas…], __watermark } }
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

  // Autenticación del DISPOSITIVO llamante (espeja pin-login). La anon key no tiene usuario.
  const auth = await verificarDispositivo(req.headers.get("authorization"));
  if (!auth.ok) return json({ error: auth.error, ...(auth.detalle ? { detalle: auth.detalle } : {}) }, auth.status);
  const tenant = auth.tenantId;
  if (!await cajaEnRegla(auth.cajaId, tenant)) return json({ error: "CAJA_NO_EXISTE" }, 403);

  // La RPC (service_role) arma el snapshot del tenant (incluye pin_hash y auth.users).
  const { data, error } = await admin.rpc("sync_pull_snapshot", { p_tenant: tenant });
  if (error) return json({ error: "RPC_ERROR", detalle: error.message }, 500);

  return json({ snapshot: data });
});
