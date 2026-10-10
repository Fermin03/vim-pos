// Avisos de Mercado Pago Point (ADR 0033). Pública y sin JWT: la autenticidad la da `x-signature`.
// Una sola URL para todos los restaurantes; el cobro se encuentra por `external_reference`, que es
// el id de terminal_cobros. Aplicar el mismo aviso dos veces deja lo mismo, así que no se deduplica.
import { clienteAdmin } from "../_shared/http.ts";
import { leerCuerpoAcotado } from "../_shared/limite.ts";
import { registrarError } from "../_shared/errores.ts";
import { aceptaCambio, cambiosDeCobro, datosDeOrden, type EstadoCobro, firmaValida } from "../_shared/terminal/mercado-pago.ts";

const admin = clienteAdmin();
// La de prueba es opcional: hoy el panel da una sola clave para las dos pestañas.
const SECRETOS = [Deno.env.get("MP_WEBHOOK_SECRET") ?? "", Deno.env.get("MP_WEBHOOK_SECRET_PRUEBA") ?? ""].filter((s) => s !== "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (SECRETOS.length === 0) return new Response("webhook no configurado", { status: 503 });
  const texto = await leerCuerpoAcotado(req, 64 * 1024);
  if (texto === null) return new Response("payload too large", { status: 413 });

  const dataId = new URL(req.url).searchParams.get("data.id");
  const e = { firma: req.headers.get("x-signature"), requestId: req.headers.get("x-request-id"), dataId };
  let valida = false;
  for (const secreto of SECRETOS) if (await firmaValida({ ...e, secreto })) { valida = true; break; }
  if (!valida) {
    console.warn(`[terminal-webhook-mp] firma inválida (data.id=${dataId ?? "-"}, ${texto.length} bytes)`);
    return new Response("invalid signature", { status: 401 });
  }

  let cuerpo: Record<string, unknown>;
  try { cuerpo = JSON.parse(texto); } catch { return new Response("bad json", { status: 400 }); }
  const accion = String(cuerpo.action ?? "");
  const d = datosDeOrden(cuerpo.data, dataId ?? undefined);
  const cobroId = d.cobro_id && UUID.test(d.cobro_id) ? d.cobro_id : null;

  let error: string | null = null;
  try {
    if (!accion.startsWith("order.")) error = "acción ignorada";
    else if (!cobroId) error = "sin referencia nuestra";
    else {
      const { data: cobro } = await admin.from("terminal_cobros").select("estado").eq("id", cobroId).maybeSingle();
      if (!cobro) error = "cobro desconocido";
      else if (aceptaCambio((cobro as { estado: EstadoCobro }).estado, d.estado)) {
        const { error: eUp } = await admin.from("terminal_cobros").update(cambiosDeCobro(d)).eq("id", cobroId);
        if (eUp) throw eUp;
      } else error = "llegó tarde: el cobro ya tenía un estado final";
    }
  } catch (causa) {
    registrarError("terminal-webhook-mp", "ERROR_INTERNO", causa);
    return new Response("error", { status: 500 }); // Mercado Pago reintenta
  }

  await admin.from("terminal_eventos").insert({
    orden_id_externo: d.orden_id_externo, accion, cobro_id: cobroId, payload: cuerpo,
    procesado_at: error ? null : new Date().toISOString(), error,
  });
  return new Response("", { status: 200 });
});
