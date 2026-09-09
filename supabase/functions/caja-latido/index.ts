// Edge Function: caja-latido  (ADR 0014, entrega 2)
// La caja llama cada ~10 minutos, haya o no ventas: sella que está viva, reporta su versión y
// recibe las DIRECTIVAS que debe obedecer (acceso con gracia, módulos efectivos, límites).
//
// Llamada: POST /functions/v1/caja-latido  (Authorization: Bearer <JWT del dispositivo>)
//   body: { version?, so?, avisos_vistos?: uuid[] }   ← avisos_vistos: acuses de lectura (0106)
// Respuesta: { directivas }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { cajaIdDeEmail, validarCuerpo } from "../_shared/latido.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// POR QUÉ SIGUE AQUÍ getUser. El 9 sep 2026 se intentó verificar la firma del token en local para
// ahorrarse este viaje a GoTrue. No se puede: este proyecto está migrado a CLAVES DE FIRMA
// ASIMÉTRICAS —su JWKS publica una ES256— así que los tokens que emite GoTrue NO van firmados con
// el JWT secret HS256. Que `pin-login` acuñe tokens HS256 y el RLS los acepte no significa que los
// emitidos sean HS256: aceptar no es emitir. Una verificación local solo de HS256 rechazaría todos
// los tokens de dispositivo reales. Si algún día se quiere el ahorro, hay que verificar ES256
// contra el JWKS (cacheando las claves) y dejar HS256 solo para lo de pin-login.

/** Primera IP de x-forwarded-for. Solo se guarda para soporte. */
function ipDe(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0]!.trim() : req.headers.get("x-real-ip");
  return ip && /^[0-9a-f.:]+$/i.test(ip) ? ip : null;
}

/** Lee los claims de un JWT cuya firma YA validó getUser (no re-verifica). */
function claimsDe(token: string): Record<string, unknown> {
  try {
    const p = token.split(".")[1] ?? "";
    return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return {}; }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_INVALIDA" }, 401);

  const claims = claimsDe(token);
  if (claims.tipo_identidad !== "DISPOSITIVO") return json({ error: "NO_ES_DISPOSITIVO" }, 403);

  // El caja_id sale del correo del dispositivo, NUNCA del cuerpo: si viniera de fuera, una caja
  // podría sellar el latido de otra y, peor, leer sus directivas.
  const cajaId = cajaIdDeEmail(u.user.email);
  if (!cajaId) return json({ error: "DISPOSITIVO_SIN_CAJA" }, 403);

  const cuerpo = validarCuerpo(await req.json().catch(() => ({})));

  const { data, error } = await admin.rpc("caja_latido", {
    p_caja: cajaId,
    p_version: cuerpo.version,
    p_so: cuerpo.so,
    p_ip: ipDe(req),
    // Acuses de los avisos que el cajero cerró (ADR 0014, entrega 3). Van en el latido y no en
    // una llamada propia para que un aviso leído sin internet no se pierda: la caja los guarda
    // y los reporta cuando puede.
    p_avisos_vistos: cuerpo.avisos_vistos.length > 0 ? cuerpo.avisos_vistos : null,
  });
  if (error) return json({ error: "RPC_ERROR", detalle: error.message }, 500);
  // La caja fue borrada o desactivada mientras seguía encendida: que lo sepa con un código
  // propio, en vez de un 500 que parecería un problema de la nube.
  if (!data) return json({ error: "CAJA_NO_EXISTE" }, 404);

  return json({ directivas: data });
});
