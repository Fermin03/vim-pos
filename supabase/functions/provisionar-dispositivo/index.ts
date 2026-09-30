// Edge Function: provisionar-dispositivo — el DUEÑO/ADMIN genera (o regenera) las credenciales
// del dispositivo de una caja. Crea la cuenta sintética caja-{caja_id}@dispositivos.vimpos.com.mx
// + usuarios_perfil + usuarios_acceso (rol DISPOSITIVO). Devuelve email + password UNA vez.
// service_role server-side. Requiere JWT de un DUEÑO/ADMIN del tenant dueño de la caja.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { registrarError } from "../_shared/errores.ts";
import { cajaIdDeEmail, correoDispositivo } from "../_shared/dispositivo.ts";
import { tenantDelToken } from "../_shared/identidad.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const ROLES_ADMINISTRADORES = ["DUENO", "ADMIN"];

/** La cuenta de la caja entre las cuentas DISPOSITIVO del tenant (activas o no). "error" si falla. */
async function cuentaDeCajaPorAcceso(tenantId: string, rolId: string, cajaId: string): Promise<string | null | "error"> {
  const { data, error } = await admin.from("usuarios_acceso").select("usuario_id")
    .eq("tenant_id", tenantId).eq("rol_id", rolId);
  if (error) { registrarError("provisionar-dispositivo", "ERROR_LISTAR_AUTH", error); return "error"; }
  const ids = [...new Set(((data ?? []) as { usuario_id: string }[]).map((a) => a.usuario_id))];
  for (const id of ids) {
    const { data: u } = await admin.auth.admin.getUserById(id);
    if (u?.user && cajaIdDeEmail(u.user.email) === cajaId.toLowerCase()) return id;
  }
  return null;
}

/** Último recurso: recorre Auth completo, por páginas, buscando la cuenta de la caja. */
async function cuentaDeCajaPaginando(cajaId: string): Promise<string | null | "error"> {
  const POR_PAGINA = 1000;
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: POR_PAGINA });
    if (error) { registrarError("provisionar-dispositivo", "ERROR_LISTAR_AUTH", error); return "error"; }
    const hallado = data.users.find((u) => cajaIdDeEmail(u.email) === cajaId.toLowerCase());
    if (hallado) return hallado.id;
    if (data.users.length < POR_PAGINA) return null;
  }
  return null;
}

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

  // 3) Caller es DUEÑO/ADMIN del tenant DE SU SESIÓN.
  // C2-6: el tenant sale del claim del token ya verificado y el rol se busca en ESE tenant. Antes
  // se tomaba el primer acceso de administrador que apareciera (`.find`), de cualquier negocio.
  const tenantId = tenantDelToken(token);
  if (!tenantId) return json({ error: "SIN_PERMISO" }, 403);
  const { data: accesoCaller, error: accErr } = await admin
    .from("usuarios_acceso").select("tenant_id, rol:roles(codigo)")
    .eq("usuario_id", callerId).eq("tenant_id", tenantId).eq("activo", true);
  if (accErr) { registrarError("provisionar-dispositivo", "DB_ERROR", accErr); return json({ error: "DB_ERROR" }, 500); }
  type Acc = { tenant_id: string; rol: { codigo: string } | null };
  const adm = ((accesoCaller ?? []) as unknown as Acc[]).find((a) => a.rol?.codigo && ROLES_ADMINISTRADORES.includes(a.rol.codigo));
  if (!adm) return json({ error: "SIN_PERMISO" }, 403);

  // 4) La caja debe ser del tenant del caller
  const { data: caja } = await admin
    .from("cajas").select("sucursal_id, nombre, tenant_id").eq("id", cajaId).maybeSingle();
  if (!caja || (caja as { tenant_id: string }).tenant_id !== tenantId) return json({ error: "CAJA_FORANEA" }, 403);
  const sucursalId = (caja as { sucursal_id: string }).sucursal_id;
  const cajaNombre = (caja as { nombre: string }).nombre ?? "Caja";

  const { data: rol } = await admin.from("roles").select("id").eq("codigo", "DISPOSITIVO").eq("es_sistema", true).maybeSingle();
  if (!rol) return json({ error: "ROL_DISPOSITIVO_NO_ENCONTRADO" }, 500);
  const rolId = (rol as { id: string }).id;

  // 5) Cuenta de dispositivo: email sintético derivado del caja_id
  const email = correoDispositivo(cajaId);
  const password = generarPassword();

  // Regenerar: la cuenta de esta caja ya existe, quizá con el dominio viejo (`vimpos.mx`, que no
  // es de VIM; ver `_shared/dispositivo.ts`). Se busca por el id de caja, no por el correo, y se
  // le pone la contraseña nueva y el correo bueno de una vez: la caja se vuelve a vincular con
  // estas credenciales de todos modos. Buscar solo por el correo nuevo crearía una segunda cuenta
  // para la misma caja.
  //
  // C2-8: antes se buscaba en `listUsers({ page: 1, perPage: 1000 })` — la PRIMERA página de TODO
  // Auth. Con más de mil usuarios en el proyecto, la cuenta de la caja podía no estar ahí y se
  // creaba una segunda (o fallaba el alta por correo duplicado). Ahora se busca entre las cuentas
  // DISPOSITIVO de este tenant (una por caja: pocas), y solo si el alta choca con una cuenta que no
  // tiene acceso (un alta anterior a medias) se recorre Auth paginando.
  let uid: string | null = null;
  let existente = await cuentaDeCajaPorAcceso(tenantId, rolId, cajaId);
  if (existente === "error") return json({ error: "ERROR_LISTAR_AUTH" }, 500);
  if (!existente) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { nombre: cajaNombre, tipo: "DISPOSITIVO" },
    });
    if (created?.user) {
      uid = created.user.id;
    } else if (/already|exists|registered|duplicate/i.test(createErr?.message ?? "")) {
      existente = await cuentaDeCajaPaginando(cajaId);
      if (!existente || existente === "error") {
        registrarError("provisionar-dispositivo", "ERROR_CREAR_AUTH", createErr);
        return json({ error: "ERROR_CREAR_AUTH" }, 400);
      }
    } else {
      registrarError("provisionar-dispositivo", "ERROR_CREAR_AUTH", createErr ?? "sin usuario");
      return json({ error: "ERROR_CREAR_AUTH" }, 400);
    }
  }
  if (existente) {
    uid = existente;
    const { error: updErr } = await admin.auth.admin.updateUserById(uid, { email, email_confirm: true, password });
    if (updErr) { registrarError("provisionar-dispositivo", "ERROR_ACTUALIZAR", updErr); return json({ error: "ERROR_ACTUALIZAR" }, 500); }
  }
  if (!uid) return json({ error: "ERROR_CREAR_AUTH" }, 400);

  // 6) Perfil del dispositivo (sin PIN) — upsert idempotente
  const { error: perfErr } = await admin.from("usuarios_perfil")
    .upsert({ id: uid, nombre: cajaNombre, estado: "ACTIVO" }, { onConflict: "id" });
  if (perfErr) { registrarError("provisionar-dispositivo", "DB_ERROR", perfErr); return json({ error: "DB_ERROR" }, 500); }

  // 7) Acceso con rol DISPOSITIVO (si no existe ya)
  const { data: yaTiene } = await admin.from("usuarios_acceso").select("id").eq("usuario_id", uid).limit(1).maybeSingle();
  if (!yaTiene) {
    const { error: accInsErr } = await admin.from("usuarios_acceso").insert({
      usuario_id: uid, tenant_id: tenantId, sucursal_id: sucursalId, rol_id: rolId, created_by: callerId,
    });
    if (accInsErr) { registrarError("provisionar-dispositivo", "DB_ERROR", accInsErr); return json({ error: "DB_ERROR" }, 500); }
  }

  return json({ ok: true, identificador: email, clave: password, caja_nombre: cajaNombre });
});
