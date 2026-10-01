// Edge Function: correo-bienvenida (0146) — manda al dueño el correo de primeros pasos, UNA vez.
//
// La llama el admin cuando la cuenta del dueño queda confirmada:
//   · /cuenta-confirmada   — abrió el enlace del registro público.
//   · /establecer-acceso   — fijó su contraseña tras la invitación de VIM.
// Sin cuerpo: todo sale del token. POST {} → { ok, enviado, motivo? }.
//
// CONTROLES
//   · Con sesión: el gateway verifica el JWT (verify_jwt por defecto, NO va en config.toml) y aquí
//     se vuelve a validar con getUser. El tenant sale del claim del token ya verificado
//     (_shared/identidad.ts) y quien llama tiene que ser DUEÑO o ADMIN de ESE negocio.
//   · Límite en la base (consumir_cupo, 0136): por usuario y global. Si la base no responde se
//     rechaza ("cerrar"): sin base tampoco se podría reclamar la marca.
//   · Una vez por negocio: `reclamar_bienvenida` (0146) decide en la base, de forma atómica, y
//     también quién ya no es "recién llegado" (más de 30 días, interno, suspendido).
//   · El correo va SIEMPRE al dueño del negocio (`tenants.usuario_dueno_id`), con su correo ya
//     confirmado; nunca a una dirección que venga en la petición.
//
// NUNCA LE FALLA AL DUEÑO. El admin no espera la respuesta ni enseña su error; el envío va en
// segundo plano (waitUntil) y lo que pase queda en el log de la función.
//
// SECRETOS: ADMIN_APP_URL (los enlaces del correo), VIM_SMTP_* (el buzón de Hostinger; el `from`
// es el buzón autenticado, ver _shared/correo.ts). Sin VIM_SMTP_* no sale nada y la marca se libera.
//
// La plantilla y el flujo viven en _shared/bienvenida.ts (probados con `node --test`).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { consumirCupos } from "../_shared/limite.ts";
import { enSegundoPlano, enviarCorreo } from "../_shared/correo.ts";
import { bearerDe, tenantDelToken } from "../_shared/identidad.ts";
import { procesarBienvenida, type DepsBienvenida, type ReclamoBienvenida } from "../_shared/bienvenida.ts";

const ROLES_ADMINISTRADORES = ["DUENO", "ADMIN"];
const MAX_POR_USUARIO = 6;   // por hora: confirmar, recargar, el doble clic… con margen
const MAX_GLOBAL = 120;      // por hora, de todo el mundo
const HORA = 60 * 60;

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const token = bearerDe(req);

  const deps: DepsBienvenida = {
    async quienLlama() {
      if (!token) return null;
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data?.user) return null;
      const tenantId = tenantDelToken(token);
      if (!tenantId) return { usuarioId: data.user.id, tenantId: null, esAdministrador: false };
      const { data: accesos, error: e2 } = await admin
        .from("usuarios_acceso")
        .select("rol:roles(codigo)")
        .eq("usuario_id", data.user.id)
        .eq("tenant_id", tenantId)
        .eq("activo", true);
      if (e2) throw new Error(e2.message);
      const esAdministrador = ((accesos ?? []) as unknown as { rol: { codigo: string } | null }[])
        .some((a) => a.rol?.codigo && ROLES_ADMINISTRADORES.includes(a.rol.codigo));
      return { usuarioId: data.user.id, tenantId, esAdministrador };
    },
    async hayCupo(usuarioId) {
      const r = await consumirCupos(admin, [
        { clave: `bienvenida:usuario:${usuarioId}`, ventanaSeg: HORA, max: MAX_POR_USUARIO },
        { clave: "bienvenida:global", ventanaSeg: HORA, max: MAX_GLOBAL },
      ], "cerrar");
      return r.permitido;
    },
    async leerNegocio(tenantId) {
      const { data, error } = await admin.from("tenants").select("nombre_comercial, usuario_dueno_id").eq("id", tenantId).maybeSingle();
      if (error) throw new Error(error.message);
      const t = data as { nombre_comercial: string; usuario_dueno_id: string | null } | null;
      return t ? { nombre: t.nombre_comercial, duenoId: t.usuario_dueno_id } : null;
    },
    async leerDueno(duenoId) {
      const { data, error } = await admin.auth.admin.getUserById(duenoId);
      if (error || !data?.user) return null;
      const u = data.user;
      const nombre = (u.user_metadata as Record<string, unknown> | null)?.nombre;
      return { email: u.email ?? null, nombre: typeof nombre === "string" ? nombre : null, confirmado: Boolean(u.email_confirmed_at) };
    },
    async leerSoporte() {
      const { data } = await admin.from("plataforma_soporte").select("whatsapp, horario").eq("id", true).maybeSingle();
      return data;
    },
    async reclamar(tenantId) {
      const { data, error } = await admin.rpc("reclamar_bienvenida", { p_tenant_id: tenantId });
      if (error) throw new Error(error.message);
      return data as ReclamoBienvenida;
    },
    async liberar(tenantId) {
      const { error } = await admin.rpc("liberar_bienvenida", { p_tenant_id: tenantId });
      if (error) throw new Error(error.message);
    },
    enviar: enviarCorreo,
    adminUrl: Deno.env.get("ADMIN_APP_URL") ?? "http://localhost:3001",
    enSegundoPlano,
    log: (nivel, msg) => console[nivel](`[correo-bienvenida] ${msg}`),
  };

  const r = await procesarBienvenida(deps);
  return json(r.body, r.status);
});
