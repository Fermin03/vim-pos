// Webhook público de Uber Eats (ADR 0011). Sin JWT: la autenticidad la da X-Uber-Signature
// (HMAC-SHA256 del cuerpo con el client secret). Responde 200 rápido; el trabajo pesado va después
// con EdgeRuntime.waitUntil para no pasarnos del tiempo de Uber y evitar reintentos duplicados.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { hmacSha256Hex, igualesEnTiempoConstante } from "../_shared/delivery/firma.ts";
import { crearClienteUber } from "../_shared/delivery/uber.ts";
import { procesarNotificacionUber, type DbMinima } from "../_shared/delivery/procesar-uber.ts";
import { consumirCupo, leerCuerpoAcotado } from "../_shared/limite.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const ENTORNO = (Deno.env.get("UBER_ENTORNO") ?? "sandbox") === "produccion" ? "produccion" : "sandbox";
const CLIENT_ID = Deno.env.get("UBER_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("UBER_CLIENT_SECRET") ?? "";
// El dashboard nuevo de Uber ("Basic HMAC") pide una Signing Key propia para firmar los webhooks;
// la guía vieja firmaba con el client secret. Se aceptan ambas (y una llave secundaria para rotar).
const LLAVES_FIRMA = [
  Deno.env.get("UBER_WEBHOOK_SIGNING_KEY") ?? "",
  Deno.env.get("UBER_WEBHOOK_SIGNING_KEY_2") ?? "",
  CLIENT_SECRET,
].filter((k) => k !== "");
const MAX_BODY = 256 * 1024;
// Cuántas peticiones con firma inválida se asientan por hora (C2-4). Más allá solo va al log.
const MAX_REGISTROS_FIRMA_INVALIDA = 60;

const uber = crearClienteUber({
  entorno: ENTORNO, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET,
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

type EventoUber = { event_id?: string; event_type?: string; meta?: { user_id?: string; resource_id?: string } };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (LLAVES_FIRMA.length === 0) return new Response("webhook no configurado", { status: 503 });

  // Auditoría integral 30/09/2026 (C2-4). Antes: `await req.text()` y el tamaño se miraba DESPUÉS
  // (el cuerpo ya estaba entero en memoria), y cada petición con firma inválida se guardaba en
  // delivery_eventos CON su cuerpo (hasta 256 KB) — cualquiera, sin credenciales, podía llenar la
  // tabla. Ahora el tamaño se corta al leer (content-length primero, y contando mientras llega), y
  // lo que no trae firma válida ni se parsea ni se guarda: a lo sumo una fila mínima, sin cuerpo,
  // con tope por hora.
  const cuerpoTexto = await leerCuerpoAcotado(req, MAX_BODY);
  if (cuerpoTexto === null) return new Response("payload too large", { status: 413 });

  const firmaRecibida = (req.headers.get("x-uber-signature") ?? "").trim().toLowerCase();
  let firmaValida = false;
  if (firmaRecibida !== "") {
    for (const llave of LLAVES_FIRMA) {
      if (igualesEnTiempoConstante(firmaRecibida, await hmacSha256Hex(llave, cuerpoTexto))) { firmaValida = true; break; }
    }
  }

  if (!firmaValida) {
    // Sin event_id (no bloquear el índice de idempotencia con un evento falso), sin payload y sin
    // tipo leído del cuerpo: nada de lo que mandó un desconocido llega a la base. El registro sirve
    // para notar una llave de firma mal configurada, y para eso bastan unas cuantas filas por hora.
    const registrar = await consumirCupo(admin,
      { clave: "uber:firma-invalida", ventanaSeg: 60 * 60, max: MAX_REGISTROS_FIRMA_INVALIDA }, "cerrar");
    if (registrar.permitido) {
      await admin.from("delivery_eventos").insert({
        app: "APP_UBEREATS", direccion: "ENTRADA", tipo: "firma_invalida", payload: null,
        firma_valida: false, error: `firma inválida (${cuerpoTexto.length} bytes)`,
      });
    } else {
      console.warn(`[delivery-webhook-uber] firma inválida (${cuerpoTexto.length} bytes); tope de registro alcanzado.`);
    }
    return new Response("invalid signature", { status: 401 });
  }

  let cuerpo: unknown;
  try { cuerpo = JSON.parse(cuerpoTexto); } catch { return new Response("bad json", { status: 400 }); }
  const ev = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as EventoUber;
  const filaEvento = {
    app: "APP_UBEREATS", direccion: "ENTRADA", tipo: ev.event_type ?? "desconocido",
    id_externo: ev.meta?.resource_id ?? null, payload: cuerpo,
  };

  // Idempotencia por event_id: el índice único devuelve 23505 y contestamos 200 sin reprocesar.
  const { error: errEv } = await admin.from("delivery_eventos").insert({
    ...filaEvento, evento_id_externo: ev.event_id ?? null, firma_valida: true,
  });
  if (errEv && String((errEv as { code?: string }).code) === "23505") return new Response("", { status: 200 });

  const trabajo = (async () => {
    const sellar = async (cambios: Record<string, unknown>) => {
      if (ev.event_id) await admin.from("delivery_eventos").update(cambios).eq("app", "APP_UBEREATS").eq("evento_id_externo", ev.event_id);
    };
    try {
      switch (ev.event_type) {
        case "orders.notification":
        case "orders.scheduled.notification": {
          const r = await procesarNotificacionUber({ db: admin as unknown as DbMinima, uber, ahora: () => new Date() }, cuerpo);
          const detalle: Record<string, unknown> = { procesado: true, respuesta: r, error: r.accion === "ERROR" ? (r.detalle ?? null) : null };
          if (r.pedido_id) {
            // Enrutar el evento a su tenant para que el admin lo vea bajo RLS.
            const { data: p } = await admin.from("delivery_pedidos").select("tenant_id, conexion_id").eq("id", r.pedido_id).maybeSingle();
            if (p) { detalle.tenant_id = (p as { tenant_id: string }).tenant_id; detalle.conexion_id = (p as { conexion_id: string }).conexion_id; }
          }
          await sellar(detalle);
          break;
        }
        case "orders.failure":
        case "orders.cancel": {
          const orderId = ev.meta?.resource_id ?? "";
          const { data: p } = await admin.from("delivery_pedidos").select("id, tenant_id, estado")
            .eq("app", "APP_UBEREATS").eq("id_externo", orderId).maybeSingle();
          if (p) {
            const fila = p as { id: string; tenant_id: string; estado: string };
            if (!["CANCELADO", "RECHAZADO", "ENTREGADO"].includes(fila.estado)) {
              await admin.rpc("delivery_pedido_transicion", { p_pedido_id: fila.id, p_estado: "CANCELADO", p_detalle: `Cancelado por Uber (${ev.event_type})` });
            }
            await sellar({ procesado: true, tenant_id: fila.tenant_id });
          } else {
            await sellar({ procesado: true, error: "pedido desconocido" });
          }
          break;
        }
        default:
          await sellar({ procesado: true, respuesta: { ignorado: true } });
      }
    } catch (e) {
      await sellar({ error: e instanceof Error ? e.message : String(e) });
    }
  })();

  // @ts-ignore EdgeRuntime existe en el Edge Runtime de Supabase; en local puede no estar.
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(trabajo); else await trabajo;

  return new Response("", { status: 200 });
});
