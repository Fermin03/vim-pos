// Edge Function: demo-iniciar — la demo autoguiada de la caja (ADR 0044).
//
// Pública (verify_jwt = false): la llama la app de la caja con la anon key cuando el visitante
// toca «Iniciar demo». Clona Crazy Burgers en un tenant nuevo (RPC demo_clonar, 0261), entra como
// el usuario-dispositivo de esa caja y devuelve la sesión.
//
// EN PRODUCCIÓN NO EXISTE: sin VIM_DEMO=1 responde 404 a todos, antes de tocar la base.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { clienteAdmin, servir } from "../_shared/http.ts";
import { consumirCupos, ipDeLaPeticion } from "../_shared/limite.ts";

const HORA = 60 * 60;
const MAX_POR_IP = 5;
const MAX_GLOBAL = 60;
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** 24 caracteres sin ambigüedades; el sesgo del módulo es irrelevante para una clave de un solo uso. */
function claveAleatoria(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

servir(async (req, json) => {
  if (Deno.env.get("VIM_DEMO") !== "1") return json({ error: "NOT_FOUND" }, 404);

  const admin = clienteAdmin();
  const ip = ipDeLaPeticion(req);
  const cupo = await consumirCupos(admin, [
    { clave: `demo-iniciar:ip:${ip}`, ventanaSeg: HORA, max: MAX_POR_IP },
    { clave: "demo-iniciar:global", ventanaSeg: HORA, max: MAX_GLOBAL },
  ], "cerrar");
  if (!cupo.permitido) return json({ error: "CUPO" }, 429);

  const clave = claveAleatoria();
  const { data, error } = await admin.rpc("demo_clonar", { p_caja_id: crypto.randomUUID(), p_clave: clave, p_ip: ip });
  if (error) {
    if (error.message.includes("DEMO_LLENA")) return json({ error: "DEMO_LLENA" }, 503);
    console.error("[demo-iniciar] demo_clonar falló:", error.message);
    return json({ error: "DEMO_ERROR" }, 500);
  }
  const correo = (data as { correo: string }[] | null)?.[0]?.correo;
  if (!correo) {
    console.error("[demo-iniciar] demo_clonar no devolvió correo");
    return json({ error: "DEMO_ERROR" }, 500);
  }

  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
  const { data: s, error: errSesion } = await anon.auth.signInWithPassword({ email: correo, password: clave });
  if (errSesion || !s.session) {
    console.error("[demo-iniciar] signInWithPassword falló:", errSesion?.message);
    return json({ error: "DEMO_ERROR" }, 500);
  }
  return json({ access_token: s.session.access_token, refresh_token: s.session.refresh_token });
});
