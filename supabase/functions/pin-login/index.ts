// Edge Function: pin-login  (doc 1F §5)
// Verifica el PIN (RPC verificar_pin_login, migración 0006) y acuña un JWT de
// EMPLEADO firmado HS256 con el JWT secret del proyecto. El RLS lo acepta porque
// va firmado con el mismo secreto que usa GoTrue, con aud='authenticated'.
//
// Local:  supabase functions serve pin-login --env-file supabase/functions/.env
// Llamada (la hace la sesión de dispositivo; en pruebas, con la anon key):
//   POST /functions/v1/pin-login  { usuario_id, pin, caja_id }

import { createClient } from "jsr:@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";

// OJO: las Edge Functions NO permiten secretos con prefijo SUPABASE_ (reservado).
// Por eso el JWT secret del proyecto se inyecta como VIM_JWT_SECRET.
const JWT_SECRET = Deno.env.get("VIM_JWT_SECRET");
if (!JWT_SECRET) throw new Error("Falta VIM_JWT_SECRET en el entorno de la función.");

// Clave HS256 derivada del JWT secret del proyecto.
const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(JWT_SECRET),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);

// Cliente service_role: corre server-side, nunca se expone al cliente.
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// El caja_id va codificado en el email sintético del dispositivo
// (`caja-{caja_id}@dispositivos.vimpos.mx`, 1F §1.1). El dispositivo ES una caja.
const EMAIL_DISPOSITIVO = /^caja-([0-9a-f-]{36})@dispositivos\.vimpos\.mx$/i;

/** Lee los claims de un JWT cuya firma YA validó getUser (no re-verifica). */
function leerClaims(token: string): Record<string, unknown> {
  try {
    const p = token.split(".")[1];
    return p ? JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))) : {};
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  // 0) Autenticación del DISPOSITIVO llamante (CN-005). Espeja autorizar-pin/crear-empleado/
  // resetear-pin. La anon key es un JWT del proyecto pero SIN usuario asociado, así que
  // getUser la rechaza: sin esto, cualquiera con la anon key (pública) podía disparar
  // intentos de PIN y solo el lockout del RPC frenaba la fuerza bruta.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_INVALIDA" }, 401);

  // El llamante debe ser una cuenta de DISPOSITIVO (caja): su JWT porta
  // tipo_identidad='DISPOSITIVO' (hook 0006) y su email codifica el caja_id.
  const claims = leerClaims(token);
  const cajaDelDispositivo = EMAIL_DISPOSITIVO.exec(u.user.email ?? "")?.[1] ?? null;
  if (claims.tipo_identidad !== "DISPOSITIVO" || !cajaDelDispositivo) {
    return json({ error: "NO_ES_DISPOSITIVO" }, 403);
  }

  let body: { usuario_id?: string; pin?: string; caja_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  const { usuario_id, pin, caja_id } = body;
  if (!usuario_id || !pin || !caja_id) return json({ error: "FALTAN_CAMPOS" }, 400);

  // El dispositivo solo puede autenticar PINs contra SU PROPIA caja.
  if (cajaDelDispositivo !== caja_id) return json({ error: "CAJA_NO_COINCIDE" }, 403);

  // 1) Verificación de PIN + anti-fuerza-bruta + validación de acceso (RPC SQL, 0006)
  const { data, error } = await admin.rpc("verificar_pin_login", {
    p_usuario_id: usuario_id,
    p_pin: pin,
    p_caja_id: caja_id,
  });

  if (error) return json({ error: "RPC_ERROR", detalle: error.message }, 500);
  if (!data?.ok) {
    const motivo = data?.motivo ?? "PIN_INCORRECTO";
    const status = motivo === "USUARIO_BLOQUEADO" ? 423
      : motivo === "SIN_ACCESO_SUCURSAL" ? 403 : 401;
    return json({ error: motivo, intentos_restantes: data?.intentos_restantes,
                  bloqueado_hasta: data?.bloqueado_hasta }, status);
  }

  // 2) Acuñar el JWT de empleado (mismos claims que el hook, doc 1F §3/§5.3)
  const ttl = Number(data.ttl_segundos ?? 12 * 3600);
  const now = Math.floor(Date.now() / 1000);
  const access_token = await create(
    { alg: "HS256", typ: "JWT" },
    {
      sub: usuario_id,
      aud: "authenticated",
      role: "authenticated",
      tenant_id: data.tenant_id,
      tipo_identidad: "EMPLEADO",
      iat: now,
      exp: getNumericDate(ttl),
    },
    key,
  );

  return json({
    access_token,
    expires_at: now + ttl,
    usuario: { id: usuario_id, nombre: data.nombre, tipo_identidad: "EMPLEADO" },
  });
});
