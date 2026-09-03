// Espejo de pedidos de apps para la caja de escritorio (spec 2026-09-03). Solo dispositivos:
// sella el latido de la caja (cajas.espejo_apps_at) y devuelve las conexiones y los pedidos de SU
// sucursal, sin credenciales ni payload crudo. El agente del escritorio la llama cada 10 s.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const ESTADOS_ACTIVOS = ["RECIBIDO", "ACEPTADO", "EN_PREPARACION", "LISTO", "ERROR"];
const COLS_CONEXION = "id, tenant_id, sucursal_id, marca_virtual_id, app, estado, tienda_id_externo, tienda_nombre_app, auto_aceptar, tiempo_prep_min, config, ultimo_evento_at, ultimo_error, conectada_at, desconectada_at, created_at, updated_at";
const COLS_PEDIDO = "id, tenant_id, sucursal_id, conexion_id, app, id_externo, folio_corto, estado, estado_app, tipo_entrega, programado_para, vence_aceptacion, cliente_nombre, cliente_telefono, cliente_telefono_pin, direccion_texto, nota_cliente, items, items_sin_mapear, subtotal_mxn, descuento_app_mxn, descuento_tienda_mxn, envio_mxn, propina_mxn, total_cliente_mxn, total_restaurante_mxn, efectivo_a_cobrar_mxn, ticket_id, repartidor_nombre, repartidor_telefono, repartidor_estado, recibido_at, aceptado_at, listo_at, entregado_at, cancelado_at, motivo_cancelacion, cancelado_por, ultimo_error, created_at, gestion, gestion_caja_id";

/** El id de caja viene en el correo del dispositivo: caja-<uuid>@dispositivos.<dominio>. */
export function cajaDesdeCorreo(email: string | undefined): string | null {
  const m = /^caja-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i.exec(email ?? "");
  return m ? m[1].toLowerCase() : null;
}

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
  const { data: userResp, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);
  const claims = claimsDe(token);
  if (claims.tipo_identidad !== "DISPOSITIVO") return json({ error: "SOLO_DISPOSITIVO" }, 403);
  const tenantId = typeof claims.tenant_id === "string" ? claims.tenant_id : null;
  const cajaId = cajaDesdeCorreo(userResp.user.email);
  if (!tenantId || !cajaId) return json({ error: "DISPOSITIVO_SIN_CAJA" }, 403);

  const { data: cajaData } = await admin.from("cajas").select("id, sucursal_id, activa").eq("id", cajaId).eq("tenant_id", tenantId).maybeSingle();
  const caja = cajaData as { id: string; sucursal_id: string; activa: boolean } | null;
  if (!caja || !caja.activa) return json({ error: "CAJA_NO_EXISTE" }, 403);

  // Latido: con esto el webhook sabe que hay una caja instalada viva en la sucursal.
  await admin.from("cajas").update({ espejo_apps_at: new Date().toISOString() }).eq("id", caja.id);

  const hace24h = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [cx, pd] = await Promise.all([
    admin.from("delivery_conexiones").select(COLS_CONEXION).eq("tenant_id", tenantId).eq("sucursal_id", caja.sucursal_id),
    admin.from("delivery_pedidos").select(COLS_PEDIDO).eq("tenant_id", tenantId).eq("sucursal_id", caja.sucursal_id)
      .or(`estado.in.(${ESTADOS_ACTIVOS.join(",")}),recibido_at.gte.${hace24h}`)
      .order("recibido_at", { ascending: false }).limit(200),
  ]);
  if (cx.error) return json({ error: "DB_ERROR", detalle: cx.error.message }, 500);
  if (pd.error) return json({ error: "DB_ERROR", detalle: pd.error.message }, 500);

  return json({ ahora: new Date().toISOString(), caja_id: caja.id, sucursal_id: caja.sucursal_id, conexiones: cx.data ?? [], pedidos: pd.data ?? [] });
});
