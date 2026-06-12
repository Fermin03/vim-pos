// Edge Function: crear-empleado  (F4.3 — admin crea/invita empleados)
// Crea auth.users + usuarios_perfil (con PIN hasheado) + usuarios_acceso, todo
// en el tenant del admin que llama. service_role solo vive aquí, server-side.
//
// Validación: requiere JWT de un usuario con rol DUENO/ADMIN del tenant destino.
// Payload: { nombre, email, pin, rol_codigo, sucursal_id? }

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Cliente service_role: corre server-side, nunca se expone al cliente.
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const ROLES_ADMINISTRADORES = ["DUENO", "ADMIN"];
const ROLES_ASIGNABLES = ["ADMIN", "SUPERVISOR", "CAJERO", "PERSONAL", "PERSONALIZADO"]; // DUENO solo vía crear_tenant_con_owner

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  // 1) Validar JWT del admin que llama
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);

  const { data: userResp, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);
  const callerId = userResp.user.id;

  // 2) Body
  let body: { nombre?: string; email?: string; pin?: string; rol_codigo?: string; sucursal_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  const { nombre, email, pin, rol_codigo } = body;
  const sucursal_id = body.sucursal_id ?? null;

  if (!nombre?.trim()) return json({ error: "FALTA_NOMBRE" }, 400);
  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "EMAIL_INVALIDO" }, 400);
  if (!pin || !/^\d{4,6}$/.test(pin)) return json({ error: "PIN_INVALIDO" }, 400);
  if (!rol_codigo || !ROLES_ASIGNABLES.includes(rol_codigo)) return json({ error: "ROL_INVALIDO" }, 400);

  // 3) Verificar que el caller es DUENO/ADMIN y obtener su tenant_id
  const { data: accesoCaller, error: accErr } = await admin
    .from("usuarios_acceso")
    .select("tenant_id, rol:roles(codigo)")
    .eq("usuario_id", callerId)
    .eq("activo", true);
  if (accErr) return json({ error: "DB_ERROR", detalle: accErr.message }, 500);

  type Acc = { tenant_id: string; rol: { codigo: string } | null };
  const accesos = (accesoCaller ?? []) as unknown as Acc[];
  const admAcceso = accesos.find((a) => a.rol?.codigo && ROLES_ADMINISTRADORES.includes(a.rol.codigo));
  if (!admAcceso) return json({ error: "SIN_PERMISO" }, 403);
  const tenant_id = admAcceso.tenant_id;

  // 4) Si se pidió sucursal_id, debe pertenecer al mismo tenant
  if (sucursal_id) {
    const { data: suc } = await admin.from("sucursales").select("tenant_id").eq("id", sucursal_id).maybeSingle();
    if (!suc || (suc as { tenant_id: string }).tenant_id !== tenant_id)
      return json({ error: "SUCURSAL_FORANEA" }, 400);
  }

  // 5) Crear auth.users con email confirmado (sin envío real en dev)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: email.trim(),
    password: crypto.randomUUID() + "Aa1!", // password fuerte aleatorio; el empleado opera por PIN, no email/pass
    email_confirm: true,
    user_metadata: { nombre },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? "ERROR_CREAR_AUTH";
    return json({ error: /already/i.test(msg) ? "EMAIL_DUPLICADO" : "ERROR_CREAR_AUTH", detalle: msg }, 400);
  }
  const uid = created.user.id;

  // 6) Crear usuarios_perfil con PIN hasheado (pgcrypto)
  const { error: perfErr } = await admin.rpc("crear_perfil_con_pin", {
    p_usuario_id: uid,
    p_nombre: nombre.trim(),
    p_pin: pin,
  });
  if (perfErr) {
    // rollback del auth.users
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    return json({ error: "DB_ERROR", detalle: perfErr.message }, 500);
  }

  // 7) Crear usuarios_acceso con el rol pedido
  const { data: rol, error: rolErr } = await admin
    .from("roles")
    .select("id")
    .eq("codigo", rol_codigo)
    .eq("es_sistema", true)
    .maybeSingle();
  if (rolErr || !rol) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    return json({ error: "ROL_NO_ENCONTRADO" }, 500);
  }

  const { error: accInsErr } = await admin.from("usuarios_acceso").insert({
    usuario_id: uid,
    tenant_id,
    sucursal_id,
    rol_id: (rol as { id: string }).id,
    created_by: callerId,
  });
  if (accInsErr) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    return json({ error: "DB_ERROR", detalle: accInsErr.message }, 500);
  }

  return json({ ok: true, usuario_id: uid });
});
