// Edge Function: provisionar-dispositivo — el DUEÑO/ADMIN genera (o regenera) las credenciales
// del dispositivo de una caja. Crea la cuenta sintética caja-{caja_id}@dispositivos.vimpos.mx
// + usuarios_perfil + usuarios_acceso (rol DISPOSITIVO). Devuelve email + password UNA vez.
// service_role server-side. Requiere JWT de un DUEÑO/ADMIN del tenant dueño de la caja.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const ROLES_ADMINISTRADORES = ["DUENO", "ADMIN"];

function generarPassword(): string {
  // Sin caracteres ambiguos (0/O/1/l/I) — el dueño lo teclea una vez en la tablet.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return "vim-" + Array.from(arr, (n) => chars[n % chars.length]).join("");
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  // 1) JWT del admin que llama
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: userResp, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);
  const callerId = userResp.user.id;

  // 2) Body
  let body: { caja_id?: string };
  try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
  const cajaId = body.caja_id?.trim();
  if (!cajaId || !/^[0-9a-f-]{36}$/i.test(cajaId)) return json({ error: "CAJA_INVALIDA" }, 400);

  // 3) Caller es DUEÑO/ADMIN → tenant_id
  const { data: accesoCaller, error: accErr } = await admin
    .from("usuarios_acceso").select("tenant_id, rol:roles(codigo)")
    .eq("usuario_id", callerId).eq("activo", true);
  if (accErr) return json({ error: "DB_ERROR", detalle: accErr.message }, 500);
  type Acc = { tenant_id: string; rol: { codigo: string } | null };
  const adm = ((accesoCaller ?? []) as unknown as Acc[]).find((a) => a.rol?.codigo && ROLES_ADMINISTRADORES.includes(a.rol.codigo));
  if (!adm) return json({ error: "SIN_PERMISO" }, 403);
  const tenantId = adm.tenant_id;

  // 4) La caja debe ser del tenant del caller
  const { data: caja } = await admin
    .from("cajas").select("sucursal_id, nombre, tenant_id").eq("id", cajaId).maybeSingle();
  if (!caja || (caja as { tenant_id: string }).tenant_id !== tenantId) return json({ error: "CAJA_FORANEA" }, 403);
  const sucursalId = (caja as { sucursal_id: string }).sucursal_id;
  const cajaNombre = (caja as { nombre: string }).nombre ?? "Caja";

  // 5) Cuenta de dispositivo: email sintético derivado del caja_id
  const email = `caja-${cajaId}@dispositivos.vimpos.mx`;
  const password = generarPassword();

  // Crear; si ya existe, ubicarla y solo actualizar la contraseña (regenerar).
  let uid: string;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nombre: cajaNombre, tipo: "DISPOSITIVO" },
  });
  if (created?.user) {
    uid = created.user.id;
  } else if (createErr && /already|registered|exists/i.test(createErr.message)) {
    // Buscar la cuenta existente por email y regenerar su contraseña.
    const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existente = lista?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existente) return json({ error: "DISPOSITIVO_EXISTENTE_NO_UBICABLE" }, 500);
    uid = existente.id;
    const { error: updErr } = await admin.auth.admin.updateUserById(uid, { password });
    if (updErr) return json({ error: "ERROR_ACTUALIZAR", detalle: updErr.message }, 500);
  } else {
    return json({ error: "ERROR_CREAR_AUTH", detalle: createErr?.message ?? "?" }, 400);
  }

  // 6) Perfil del dispositivo (sin PIN) — upsert idempotente
  const { error: perfErr } = await admin.from("usuarios_perfil")
    .upsert({ id: uid, nombre: cajaNombre, estado: "ACTIVO" }, { onConflict: "id" });
  if (perfErr) return json({ error: "DB_ERROR", detalle: perfErr.message }, 500);

  // 7) Acceso con rol DISPOSITIVO (si no existe ya)
  const { data: rol } = await admin.from("roles").select("id").eq("codigo", "DISPOSITIVO").eq("es_sistema", true).maybeSingle();
  if (!rol) return json({ error: "ROL_DISPOSITIVO_NO_ENCONTRADO" }, 500);
  const { data: yaTiene } = await admin.from("usuarios_acceso").select("id").eq("usuario_id", uid).limit(1).maybeSingle();
  if (!yaTiene) {
    const { error: accInsErr } = await admin.from("usuarios_acceso").insert({
      usuario_id: uid, tenant_id: tenantId, sucursal_id: sucursalId, rol_id: (rol as { id: string }).id, created_by: callerId,
    });
    if (accInsErr) return json({ error: "DB_ERROR", detalle: accInsErr.message }, 500);
  }

  return json({ ok: true, identificador: email, clave: password, caja_nombre: cajaNombre });
});
