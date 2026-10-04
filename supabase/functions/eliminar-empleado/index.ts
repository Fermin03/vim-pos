// Edge Function: eliminar-empleado  (0154, ADR 0028)
// Elimina definitivamente a un empleado YA desactivado: su correo queda libre para registrarse
// después (p. ej. como dueño de su propio negocio) y el historial del negocio se conserva con su
// nombre. La cuenta no se borra, se vacía: ver la cabecera de la migración 0154.
//
// Validación: requiere JWT de un usuario con rol DUENO/ADMIN del tenant de su sesión.
// Payload: { usuario_id }
//
// Todas las reglas (desactivado antes, nunca el dueño, nunca uno mismo) las impone la base dentro
// de la misma transacción que escribe; aquí solo se identifica a quien llama.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { registrarError } from "../_shared/errores.ts";
import { tenantDelToken } from "../_shared/identidad.ts";

// Cliente service_role: corre server-side, nunca se expone al cliente.
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Los rechazos que la base dice con código (`CODIGO: mensaje`) y con qué estado HTTP salen.
const ESTADO_POR_CODIGO: Record<string, number> = {
  SIN_PERMISO: 403,
  USUARIO_NO_EXISTE: 404,
  ES_UNO_MISMO: 409,
  ES_DUENO: 409,
  ES_DISPOSITIVO: 409,
  ES_OPERADOR: 409,
  ACCESO_A_OTRO_NEGOCIO: 409,
  SIGUE_ACTIVO: 409,
};

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

  let body: { usuario_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  const usuario_id = body.usuario_id;
  if (!usuario_id || !UUID.test(usuario_id)) return json({ error: "USUARIO_INVALIDO" }, 400);

  // El negocio sale del token ya verificado, nunca del cuerpo (C2-6).
  const tenant_id = tenantDelToken(token);
  if (!tenant_id) return json({ error: "SIN_PERMISO" }, 403);

  const { data, error } = await admin.rpc("eliminar_usuario", {
    p_usuario_id: usuario_id,
    p_tenant_id: tenant_id,
    p_actor: userResp.user.id,
    p_origen: "NEGOCIO",
  });
  if (error) {
    const m = /^([A-Z_]+):\s*(.+)$/s.exec(error.message.trim());
    const status = m ? ESTADO_POR_CODIGO[m[1]] : undefined;
    if (m && status !== undefined) return json({ error: m[1], detalle: m[2].trim() }, status);
    registrarError("eliminar-empleado", "DB_ERROR", error);
    return json({ error: "DB_ERROR" }, 500);
  }

  return json({ ok: true, nombre: (data as { nombre?: string } | null)?.nombre ?? null });
});
