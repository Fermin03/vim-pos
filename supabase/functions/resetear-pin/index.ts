// Edge Function: resetear-pin  (F4.3 — admin resetea PIN de empleado)
// Requiere JWT de un admin (DUENO/ADMIN) del mismo tenant que el empleado.
// Payload: { usuario_id, pin_nuevo }

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const ROLES_ADMINISTRADORES = ["DUENO", "ADMIN"];

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);

  const { data: userResp, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);
  const callerId = userResp.user.id;

  let body: { usuario_id?: string; pin_nuevo?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  const { usuario_id, pin_nuevo } = body;
  if (!usuario_id || !pin_nuevo) return json({ error: "FALTAN_CAMPOS" }, 400);
  if (!/^\d{4,6}$/.test(pin_nuevo)) return json({ error: "PIN_INVALIDO" }, 400);

  // Verificar que caller es admin de un tenant donde el target tiene acceso
  const { data: accesoCaller } = await admin
    .from("usuarios_acceso")
    .select("tenant_id, rol:roles(codigo, jerarquia)")
    .eq("usuario_id", callerId)
    .eq("activo", true);
  type Acc = { tenant_id: string; rol: { codigo: string; jerarquia: number } | null };
  const accesosCaller = (accesoCaller ?? []) as unknown as Acc[];
  const tenantsAdmin = accesosCaller
    .filter((a) => a.rol?.codigo && ROLES_ADMINISTRADORES.includes(a.rol.codigo))
    .map((a) => a.tenant_id);
  if (tenantsAdmin.length === 0) return json({ error: "SIN_PERMISO" }, 403);

  const { data: accesoTarget } = await admin
    .from("usuarios_acceso")
    .select("tenant_id, rol:roles(jerarquia)")
    .eq("usuario_id", usuario_id)
    .eq("activo", true);
  type AccT = { tenant_id: string; rol: { jerarquia: number } | null };
  const accesosTarget = (accesoTarget ?? []) as unknown as AccT[];
  if (!accesosTarget.some((a) => tenantsAdmin.includes(a.tenant_id)))
    return json({ error: "EMPLEADO_FUERA_DE_TENANT" }, 403);

  // SEC CN-016 — jerarquía. Sin esto un ADMIN (4) reseteaba el PIN del DUEÑO (5), se ponía el suyo
  // y operaba como dueño. Se exige jerarquía ESTRICTAMENTE mayor: ni siquiera un DUEÑO resetea a
  // otro DUEÑO. Si un dueño pierde su PIN, va por soporte (service_role), no por aquí.
  // La RPC resetear_pin_empleado repite el chequeo (migración 0064): defensa en profundidad.
  const jerarquiaCaller = Math.max(0, ...accesosCaller.map((a) => a.rol?.jerarquia ?? 0));
  const jerarquiaTarget = Math.max(0, ...accesosTarget.map((a) => a.rol?.jerarquia ?? 0));
  if (jerarquiaCaller <= jerarquiaTarget) {
    return json({
      error: "JERARQUIA_INSUFICIENTE",
      detalle: "No puedes resetear el PIN de alguien con tu mismo nivel o superior.",
    }, 403);
  }

  const { error: rpcErr } = await admin.rpc("resetear_pin_empleado", {
    p_usuario_id: usuario_id,
    p_pin_nuevo: pin_nuevo,
  });
  if (rpcErr) return json({ error: "DB_ERROR", detalle: rpcErr.message }, 500);

  return json({ ok: true });
});
