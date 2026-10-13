// Avisos de Mercado Pago de los pagos en línea de la tienda (Orders API), y la puerta interna del
// barrido de cada minuto. Lo verificado: docs/integraciones/mercado-pago-checkout-pro/04-verificado-orders.md.
//
//   POST /functions/v1/tienda-webhook-mp?data.id=<orden>&type=order
//   { action: "order.processed", type: "order", data: { id, external_reference, status, … } }
//
// Pública y sin JWT (config.toml). Con Orders los avisos NO llevan dirección por cobro: llegan a la
// URL configurada en «Webhooks» de la aplicación «VIM POS Tienda». Es esta, una sola para todos los
// restaurantes. El formato es el de las órdenes de Point (terminal-webhook-mp, verificado con avisos
// reales); que los de órdenes en línea lleguen igual está SIN PROBAR (documento 04).
//
// LA FIRMA ES OBLIGATORIA: `x-signature` con la clave de la aplicación de la tienda
// (MP_TIENDA_WEBHOOK_SECRET) o la de su gemela de prueba (MP_TIENDA_WEBHOOK_SECRET_PRUEBA). Sin
// firma válida, 401, con un rastro mínimo y con tope por hora. Sin ninguna clave configurada, 503.
//
// Y AUN FIRMADO, EL AVISO ES SOLO UNA PISTA. De él salen dos cosas: nuestra referencia
// (`external_reference` = id de tienda_pagos) y el id de la orden. Nada más se cree: la orden se
// consulta con el token de la conexión de la tienda del restaurante dueño de esa referencia, y se
// comprueban referencia, modo y monto (pago-flujo.ts → tienda_pago_aplicar).
// Aplicar el mismo aviso dos veces deja lo mismo, así que no se deduplica.
//
// LA PUERTA INTERNA. La base (tienda_pagos_barrer, cada minuto, pg_net) llama aquí con
// `x-vim-interno` cuando hay devoluciones que hacer o pagos que nadie confirmó. Mismo esquema que
// enviar-push: Vault `vim_interno` = secreto VIM_INTERNO_SECRET. Se contesta 202 y el trabajo
// sigue en segundo plano (pg_net no espera más de 5 s).
//
// SECRETOS: MP_TIENDA_WEBHOOK_SECRET (y MP_TIENDA_WEBHOOK_SECRET_PRUEBA), VIM_INTERNO_SECRET,
// VIM_AVISOS_A, VIM_SMTP_*. No usa ninguno de la terminal.
import { clienteAdmin } from "../_shared/http.ts";
import { consumirCupo, leerCuerpoAcotado } from "../_shared/limite.ts";
import { registrarError } from "../_shared/errores.ts";
import { enSegundoPlano, enviarCorreo } from "../_shared/correo.ts";
import { secretoInternoValido } from "../_shared/delivery/interno.ts";
import { firmaValida } from "../_shared/terminal/mercado-pago.ts";
import { ordenDelAviso } from "../_shared/tienda/aviso-mp.ts";
import { avisoDeConciliacionFallida, avisoDeDevolucionFallida, avisoDeRetoSinCerrar, barrer, confirmarPago, respuestaDeConfirmacion, type Tarea, topesDelAviso } from "../_shared/tienda/pago-flujo.ts";
import { depsDePagos } from "../_shared/tienda/pago-puerto.ts";

const FN = "tienda-webhook-mp";
const admin = clienteAdmin();
const deps = depsDePagos(admin, FN);
// La de prueba es opcional: los avisos de la cuenta de prueba los firma su aplicación gemela, con otra clave.
const SECRETOS = [Deno.env.get("MP_TIENDA_WEBHOOK_SECRET") ?? "", Deno.env.get("MP_TIENDA_WEBHOOK_SECRET_PRUEBA") ?? ""].filter((s) => s !== "");
const texto = (cuerpo: string, status: number): Response => new Response(cuerpo, { status });

/**
 * Correo a VIM: una devolución se rindió, o un pago lleva tres consultas sin poder resolverse (puede
 * haber un cobro sin pedido). Solo ids nuestros y de Mercado Pago; ni el cliente ni la tarjeta.
 */
async function avisar(t: Tarea, de: "DEVOLUCION" | "CONCILIACION" | "RETO"): Promise<void> {
  registrarError(FN, de === "DEVOLUCION" ? "DEVOLUCION_FALLIDA" : de === "RETO" ? "RETO_SIN_CERRAR" : "CONCILIACION_FALLIDA", `pago ${t.id}`);
  const { data } = await admin.from("tienda_pagos")
    .select("monto_mxn, ultimo_error, orden_id_externo, pedido:delivery_pedidos(folio_corto), negocio:tenants(nombre_comercial)")
    .eq("id", t.id).maybeSingle();
  const f = data as { monto_mxn?: number; ultimo_error?: string | null; orden_id_externo?: string | null;
                      pedido?: { folio_corto?: string | null } | null; negocio?: { nombre_comercial?: string | null } | null } | null;
  const d = {
    pagoId: t.id, negocio: f?.negocio?.nombre_comercial ?? "", folio: f?.pedido?.folio_corto ?? "",
    monto: f?.monto_mxn === undefined ? "" : Number(f.monto_mxn).toFixed(2),
    ordenIdExterno: f?.orden_id_externo ?? t.orden_id_externo,
  };
  const r = await enviarCorreo({
    to: Deno.env.get("VIM_AVISOS_A") ?? "hola@vimpos.com.mx",
    ...(de === "DEVOLUCION" ? avisoDeDevolucionFallida({ ...d, error: f?.ultimo_error ?? "" }) : de === "RETO" ? avisoDeRetoSinCerrar(d) : avisoDeConciliacionFallida({ ...d, motivo: f?.ultimo_error })),
  });
  if (!r.enviado) registrarError(FN, "AVISO_NO_SALIO", `pago ${t.id}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return texto("method not allowed", 405);
  const crudo = await leerCuerpoAcotado(req, 64 * 1024);
  if (crudo === null) return texto("payload too large", 413);

  // ── La puerta interna: el barrido ───────────────────────────────────────────────────────────
  const interno = (req.headers.get("x-vim-interno") ?? "").trim();
  if (interno !== "") {
    if (!secretoInternoValido(interno, (Deno.env.get("VIM_INTERNO_SECRET") ?? "").trim())) return texto("unauthorized", 401);
    enSegundoPlano(barrer(deps, avisar).catch((e) => registrarError(FN, "BARRIDO", e)));
    return texto("", 202);
  }

  // ── Un aviso de Mercado Pago: la firma primero ──────────────────────────────────────────────
  if (SECRETOS.length === 0) return texto("webhook no configurado", 503);
  const url = new URL(req.url);
  const dataId = url.searchParams.get("data.id");
  const e = { firma: req.headers.get("x-signature"), requestId: req.headers.get("x-request-id"), dataId };
  let valida = false;
  for (const secreto of SECRETOS) if (await firmaValida({ ...e, secreto })) { valida = true; break; }
  if (!valida) {
    console.warn(`[${FN}] firma inválida (data.id=${dataId?.slice(0, 40) ?? "-"}, ${crudo.length} bytes)`);
    // Rastro mínimo y con tope por hora: nada del cuerpo de un desconocido llega a la base.
    const cupo = await consumirCupo(admin, { clave: "mp-tienda:firma-invalida", ventanaSeg: 3600, max: 60 }, "cerrar");
    if (cupo.permitido) {
      await admin.from("tienda_eventos").insert({
        orden_id_externo: dataId?.slice(0, 64) ?? null, accion: "firma_invalida", error: "firma inválida",
        payload: { bytes: crudo.length, con_firma: Boolean(e.firma), con_request_id: Boolean(e.requestId), query: [...url.searchParams.keys()].slice(0, 8) },
      });
    }
    return texto("invalid signature", 401);
  }

  let cuerpo: unknown;
  try { cuerpo = JSON.parse(crudo); } catch { return texto("bad json", 400); }
  const aviso = ordenDelAviso(cuerpo, dataId);
  // Otro tópico, o sin una orden de la que hablar: no es para nosotros. 200, para que no lo reintente.
  if (!aviso) return texto("", 200);

  try {
    // ¿De qué pago nuestro habla? Por la referencia que trae; si no la trae, por la orden que ya
    // tengamos anotada. Una lectura por llave, ANTES de gastar ningún tope: quien manda referencias
    // inventadas no le quita ni un aviso a los pagos de verdad.
    const busca = admin.from("tienda_pagos").select("id");
    const existe = await (aviso.ref ? busca.eq("id", aviso.ref) : busca.eq("orden_id_externo", aviso.ordenIdExterno)).maybeSingle();
    if (existe.error) throw existe.error;
    const pagoId = (existe.data as { id: string } | null)?.id ?? null;
    // Cada aviso de un pago nuestro cuesta una consulta a Mercado Pago con el token de un restaurante.
    for (const tope of topesDelAviso(pagoId ?? "", pagoId !== null)) {
      const c = await consumirCupo(admin, tope, "cerrar");
      if (!c.permitido) return texto("too many requests", 429);   // Mercado Pago reintenta; y está el barrido
    }
    if (!pagoId) return texto("", 200);   // no es para nosotros: que no lo reintente

    const c = await confirmarPago(deps, pagoId, aviso.ordenIdExterno);
    // Rastro para diagnóstico: sin el cuerpo, que no hace falta (la verdad salió de la consulta).
    await admin.from("tienda_eventos").insert({
      orden_id_externo: aviso.ordenIdExterno, accion: aviso.accion.slice(0, 60), pago_id: pagoId,
      payload: { resultado: c }, error: c.ok ? null : c.motivo,
    });
    return texto("", respuestaDeConfirmacion(c));
  } catch (causa) {
    registrarError(FN, "ERROR_INTERNO", causa);
    return texto("error", 500);   // Mercado Pago reintenta
  }
});
