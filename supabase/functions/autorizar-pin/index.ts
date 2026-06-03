// Edge Function: autorizar-pin (F5.2b) — verifica el PIN de un supervisor y registra
// la autorización. El PIN NUNCA se verifica en el cliente. Espeja resetear-pin.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_INVALIDA" }, 401);
  const solicitanteId = u.user.id;

  let b: Record<string, string | number | null>;
  try {
    b = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  const { pin, accion, permiso_codigo, entidad_tipo, entidad_id, monto, motivo, caja_id, turno_id } = b;
  if (!pin || !accion || !permiso_codigo || !caja_id) return json({ error: "FALTAN_CAMPOS" }, 400);
  if (!/^\d{4,6}$/.test(String(pin))) return json({ error: "PIN_INVALIDO" }, 400);

  const { data, error } = await admin.rpc("verificar_autorizacion_pin", {
    p_pin: String(pin),
    p_accion: accion,
    p_permiso_codigo: permiso_codigo,
    p_entidad_tipo: entidad_tipo ?? null,
    p_entidad_id: entidad_id ?? null,
    p_monto: monto ?? null,
    p_motivo: motivo ?? "",
    p_caja_id: caja_id,
    p_turno_id: turno_id ?? null,
    p_usuario_solicitante_id: solicitanteId,
  });
  if (error) return json({ error: "RPC_ERROR", detalle: error.message }, 500);
  if (!data?.ok) {
    const motivoR = data?.motivo ?? "PIN_INCORRECTO";
    const status = motivoR === "BLOQUEADO" ? 423 : motivoR === "SIN_PERMISO" ? 403 : 401;
    return json({ error: motivoR }, status);
  }
  return json({ ok: true, autorizacion_pin_id: data.autorizacion_pin_id, autorizo_id: data.autorizo_id });
});
