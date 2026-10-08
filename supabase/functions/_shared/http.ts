// Lo que 24 funciones repetían una por una: los dos clientes de Supabase y, por petición, el CORS,
// el `json()`, el preflight y el "solo POST". `delivery-webhook-uber` no lo usa: lo llama Uber, no
// un navegador, y contesta texto plano.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

const SIN_SESION = { auth: { persistSession: false } };

/** Cliente service_role: corre server-side, nunca se expone al cliente. */
export const clienteAdmin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, SIN_SESION);

/** Cliente con el JWT del llamante: respeta RLS y `auth.uid()` resuelve a quien llama. */
export const clienteDe = (token: string) =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    ...SIN_SESION,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

export type Json = (body: unknown, status?: number) => Response;

/** `Deno.serve` para una función que solo atiende POST desde las apps de VIM. */
export function servir(manejar: (req: Request, json: Json) => Response | Promise<Response>): void {
  Deno.serve((req) => {
    const cors = corsHeaders(req);
    const json: Json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    return manejar(req, json);
  });
}
