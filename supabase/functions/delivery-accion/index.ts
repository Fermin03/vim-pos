// Acciones del cajero sobre un pedido de app (ADR 0011). El POS nunca habla con Uber: manda la
// acción aquí con su JWT de empleado; se valida que el pedido sea de SU tenant y se llama a la app.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { crearClienteUber, motivoRechazoUber, segundosAReadyTime, type MotivoRechazo } from "../_shared/delivery/uber.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const ENTORNO = (Deno.env.get("UBER_ENTORNO") ?? "sandbox") === "produccion" ? "produccion" : "sandbox";
const uber = crearClienteUber({
  entorno: ENTORNO,
  clientId: Deno.env.get("UBER_CLIENT_ID") ?? "",
  clientSecret: Deno.env.get("UBER_CLIENT_SECRET") ?? "",
  tokenCache: {
    leer: async () => {
      const { data } = await admin.from("delivery_credenciales_app").select("access_token, vence_at")
        .eq("app", "APP_UBEREATS").eq("entorno", ENTORNO).maybeSingle();
      const f = data as { access_token: string; vence_at: string } | null;
      return f && new Date(f.vence_at) > new Date() ? f.access_token : null;
    },
    guardar: async (token, venceAt) => {
      await admin.from("delivery_credenciales_app").upsert({
        app: "APP_UBEREATS", entorno: ENTORNO, access_token: token,
        vence_at: venceAt.toISOString(), updated_at: new Date().toISOString(),
      });
    },
  },
});

type Cuerpo = { pedido_id?: string; accion?: string; motivo?: string; detalle?: string; tiempo_prep_min?: number };
type Pedido = { id: string; tenant_id: string; app: string; id_externo: string; estado: string; folio_corto: string | null; conexion_id: string };
const MOTIVOS: MotivoRechazo[] = ["AGOTADO", "CERRADO", "SATURADO", "POS_OFFLINE", "OTRO"];
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  // 1) JWT del cajero → su tenant (mismo patrón que enviar-push).
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: userResp, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);
  const { data: acceso } = await admin.from("usuarios_acceso").select("tenant_id")
    .eq("usuario_id", userResp.user.id).eq("activo", true).limit(1).maybeSingle();
  if (!acceso) return json({ error: "SIN_TENANT" }, 403);
  const tenantId = (acceso as { tenant_id: string }).tenant_id;

  // 2) Cuerpo y pedido (del tenant del cajero, nunca de otro).
  let body: Cuerpo;
  try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
  if (!body.pedido_id || !body.accion) return json({ error: "FALTAN_CAMPOS" }, 400);

  const { data: pData } = await admin.from("delivery_pedidos")
    .select("id, tenant_id, app, id_externo, estado, folio_corto, conexion_id").eq("id", body.pedido_id).maybeSingle();
  const pedido = pData as Pedido | null;
  if (!pedido || pedido.tenant_id !== tenantId) return json({ error: "PEDIDO_NO_EXISTE" }, 404);
  if (pedido.app !== "APP_UBEREATS") return json({ error: "APP_NO_SOPORTADA" }, 400);

  const registrarSalida = async (tipo: string, ok: boolean, detalle: unknown) => {
    await admin.from("delivery_eventos").insert({
      tenant_id: tenantId, conexion_id: pedido.conexion_id, app: pedido.app, direccion: "SALIDA", tipo,
      id_externo: pedido.id_externo, procesado: ok, respuesta: ok ? detalle : null,
      error: ok ? null : String(detalle), http_status: ok ? 200 : null,
    });
  };

  try {
    switch (body.accion) {
      case "aceptar": {
        if (!["RECIBIDO", "ERROR"].includes(pedido.estado)) return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
        const { data: cx } = await admin.from("delivery_conexiones").select("tiempo_prep_min").eq("id", pedido.conexion_id).maybeSingle();
        const minutos = Number(body.tiempo_prep_min) || Number((cx as { tiempo_prep_min?: number } | null)?.tiempo_prep_min) || 15;
        const { data: ticketId, error: errRpc } = await admin.rpc("crear_ticket_desde_app", { p_pedido_id: pedido.id });
        if (errRpc) {
          const m = errRpc.message ?? String(errRpc);
          const codigo = m.includes("SIN_TURNO_ABIERTO") ? "SIN_TURNO_ABIERTO" : m.includes("ITEM_SIN_MAPEAR") ? "ITEM_SIN_MAPEAR" : "RPC_ERROR";
          return json({ error: codigo, detalle: m }, 409);
        }
        try {
          await uber.aceptar(pedido.id_externo, segundosAReadyTime(new Date(), minutos), pedido.folio_corto ?? pedido.id);
          await registrarSalida("accept", true, { minutos });
        } catch (e) {
          await registrarSalida("accept", false, msg(e));
          if (!msg(e).startsWith("YA_PROCESADA")) return json({ error: "UBER_ERROR", detalle: msg(e) }, 502);
        }
        return json({ ok: true, ticket_id: ticketId });
      }
      case "rechazar": {
        if (!["RECIBIDO", "ERROR"].includes(pedido.estado)) return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
        const motivo = MOTIVOS.includes(body.motivo as MotivoRechazo) ? (body.motivo as MotivoRechazo) : "OTRO";
        try {
          await uber.rechazar(pedido.id_externo, motivoRechazoUber(motivo, body.detalle));
          await registrarSalida("deny", true, { motivo });
        } catch (e) {
          await registrarSalida("deny", false, msg(e));
          if (!msg(e).startsWith("YA_PROCESADA")) return json({ error: "UBER_ERROR", detalle: msg(e) }, 502);
        }
        await admin.rpc("delivery_pedido_transicion", {
          p_pedido_id: pedido.id, p_estado: "RECHAZADO", p_detalle: `${motivo}${body.detalle ? ": " + body.detalle : ""}`,
        });
        return json({ ok: true });
      }
      case "listo": {
        if (!["ACEPTADO", "EN_PREPARACION"].includes(pedido.estado)) return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
        try {
          await uber.marcarLista(pedido.id_externo);
          await registrarSalida("ready", true, {});
        } catch (e) {
          await registrarSalida("ready", false, msg(e));
          return json({ error: "UBER_ERROR", detalle: msg(e) }, 502);
        }
        await admin.rpc("delivery_pedido_transicion", { p_pedido_id: pedido.id, p_estado: "LISTO", p_detalle: null });
        return json({ ok: true });
      }
      default:
        return json({ error: "ACCION_INVALIDA" }, 400);
    }
  } catch (e) {
    return json({ error: "INTERNO", detalle: msg(e) }, 500);
  }
});
