// Avisos de Mercado Pago de los pagos que los clientes hacen con la liga de Checkout Pro que les
// manda el agente de WhatsApp (cuenta de Mercado Pago de VIM, no la de un restaurante).
//
//   POST /functions/v1/cobro-vim-webhook?data.id=<pago>&type=payment   (x-signature, x-request-id)
//   { "type": "payment", "action": "payment.updated", "data": { "id": "<pago>" } }
//        → el aviso es solo una pista: el pago se relee en Mercado Pago (consultarPago) y, si está
//          approved en MXN con nuestra referencia, se aplica (wa_aplicar_pago: registra, renueva y
//          reactiva si estaba suspendido por falta de pago) y se confirma al cliente por WhatsApp.
//          Todo en línea antes del 200: si la base o Mercado Pago fallan, 500 y Mercado Pago reintenta
//          (un pago ya aplicado vuelve como DUPLICADO y no se contesta dos veces).
//        → cualquier otro tipo (merchant_order, etc.): 200 sin hacer nada.
//
// Pública y sin JWT (config.toml). La firma es obligatoria: x-signature con la clave de la
// aplicación de VIM (firmaValida, la misma de Point). Sin clave o sin token, 503; firma mala, 401.
//
// SECRETOS: MP_VIM_WEBHOOK_SECRET, MP_VIM_ACCESS_TOKEN; para contestar por WhatsApp los WA_* de
// whatsapp-webhook (WA_TOKEN o WA_KAPSO_API_KEY, WA_PHONE_NUMBER_ID, WA_GRAPH_VERSION).
import { clienteAdmin } from "../_shared/http.ts";
import { leerCuerpoAcotado } from "../_shared/limite.ts";
import { registrarError } from "../_shared/errores.ts";
import { firmaValida } from "../_shared/terminal/mercado-pago.ts";
import { consultarPago } from "../_shared/agente/cobro/mp-vim.ts";
import { atenderPago, type DepsPago } from "../_shared/agente/cobro/pago.ts";
import { enviar } from "../_shared/whatsapp/enviar.ts";

const FN = "cobro-vim-webhook";
const admin = clienteAdmin();
const texto = (cuerpo: string, status: number): Response => new Response(cuerpo, { status });

// deno-lint-ignore no-explicit-any
const ok = (r: { data: any; error: { message: string } | null }): any => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

const deps = (token: string): DepsPago => ({
  consultar: (pagoId) => consultarPago(pagoId, token), // si falla, atenderPago lanza y se registra abajo
  rpc: async (fn, args) => ok(await admin.rpc(fn, args)),
  async enviar(cuerpo) {
    const r = await enviar(cuerpo);
    if (!r.ok) registrarError(FN, "WA_ENVIO", `HTTP ${r.status}: ${r.error}`);
    return r;
  },
  async registrarSalida(conversacionId, wamid, t) {
    ok(await admin.rpc("wa_registrar_salida", { p_conversacion_id: conversacionId, p_wamid: wamid, p_autor: "AGENTE", p_texto: t }));
  },
  ahora: () => new Date(),
});

Deno.serve(async (req) => {
  if (req.method !== "POST") return texto("método no permitido", 405);
  const secreto = Deno.env.get("MP_VIM_WEBHOOK_SECRET") ?? "";
  const token = Deno.env.get("MP_VIM_ACCESS_TOKEN") ?? "";
  if (!secreto || !token) return texto("no configurado", 503);
  const cuerpo = await leerCuerpoAcotado(req, 64 * 1024);
  if (cuerpo === null) return texto("cuerpo demasiado grande", 413);

  let json: { type?: unknown; data?: { id?: unknown } } = {};
  try { json = JSON.parse(cuerpo) ?? {}; } catch { /* el tipo y el id también vienen en la URL */ }
  const q = new URL(req.url).searchParams;
  const tipo = q.get("type") ?? q.get("topic") ?? String(json.type ?? "");
  if (tipo !== "payment") return texto("ignorado", 200);

  const idCuerpo = json.data?.id;
  const dataId = q.get("data.id") ?? (idCuerpo == null ? null : String(idCuerpo));
  if (!dataId || !await firmaValida({ firma: req.headers.get("x-signature"), requestId: req.headers.get("x-request-id"), dataId, secreto })) {
    console.warn(`[${FN}] firma inválida (data.id=${dataId?.slice(0, 32) ?? "-"})`);
    return texto("firma inválida", 401);
  }

  try {
    return texto(await atenderPago(dataId, deps(token)), 200);
  } catch (err) {
    registrarError(FN, "PAGO", err);
    return texto("error", 500); // Mercado Pago reintenta
  }
});
