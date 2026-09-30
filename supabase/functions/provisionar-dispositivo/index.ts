// Edge Function: provisionar-dispositivo — el DUEÑO/ADMIN genera (o regenera) las credenciales
// del dispositivo de una caja. Crea la cuenta sintética caja-{caja_id}@dispositivos.vimpos.com.mx
// + usuarios_perfil + usuarios_acceso (rol DISPOSITIVO). Devuelve email + password UNA vez.
// service_role server-side. Requiere JWT de un DUEÑO/ADMIN del tenant dueño de la caja.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { cajaIdDeEmail, correoDispositivo } from "../_shared/dispositivo.ts";

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
  const email = correoDispositivo(cajaId);
  const password = generarPassword();

  // Regenerar: la cuenta de esta caja ya existe, quizá con el dominio viejo (`vimpos.mx`, que no
  // es de VIM; ver `_shared/dispositivo.ts`). Se busca por el id de caja, no por el correo, y se
  // le pone la contraseña nueva y el correo bueno de una vez: la caja se vuelve a vincular con
  // estas credenciales de todos modos. Buscar solo por el correo nuevo crearía una segunda cuenta
  // para la misma caja.
  let uid: string;
  const { data: lista, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) return json({ error: "ERROR_LISTAR_AUTH", detalle: listErr.message }, 500);
  const existente = lista?.users.find((u) => cajaIdDeEmail(u.email) === cajaId.toLowerCase());
  if (existente) {
    uid = existente.id;
    const { error: updErr } = await admin.auth.admin.updateUserById(uid, { email, email_confirm: true, password });
    if (updErr) return json({ error: "ERROR_ACTUALIZAR", detalle: updErr.message }, 500);
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { nombre: cajaNombre, tipo: "DISPOSITIVO" },
    });
    if (!created?.user) return json({ error: "ERROR_CREAR_AUTH", detalle: createErr?.message ?? "?" }, 400);
    uid = created.user.id;
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
