// Avisos de Mercado Pago de los pagos en línea de la tienda (Checkout Pro), y la puerta interna del
// barrido de cada minuto. Diseño: docs/integraciones/mercado-pago-checkout-pro/02-diseno.md.
//
//   POST /functions/v1/tienda-webhook-mp?ref=<id de tienda_pagos>&data.id=<pago>&type=payment
//
// Pública y sin JWT (config.toml). Es la `notification_url` de cada preferencia, con nuestra
// referencia en la query; Mercado Pago le añade el id del pago.
//
// EL AVISO ES SOLO UNA PISTA. Nada de lo que trae se cree: se consulta el pago con el token del
// restaurante dueño de esa referencia y se comprueban referencia, cuenta vendedora, moneda y monto
// (pago-flujo.ts → tienda_pago_aplicar). Por eso aquí la firma no decide si el pago vale:
//   · si viene `x-signature` y NO es válida → 401, con un rastro mínimo y con tope por hora, igual
//     que el aviso de la terminal;
//   · si no viene, se sigue: la documentación no confirma que los avisos a una `notification_url`
//     vayan firmados, y la verdad sale de la consulta autenticada.
// La referencia NO es un secreto: Mercado Pago se la devuelve al comprador en la URL de regreso
// (`external_reference`). Quien la tenga puede mandar avisos falsos de SU pago, y lo único que
// consigue es que se consulte ese pago: 40 veces por hora como mucho (el tope de la referencia va
// antes que el global, así que no lo gasta), y cada consulta dice lo mismo que diría sin él.
// Una referencia que no existe se comprueba con una lectura por llave ANTES de gastar ningún tope
// de los avisos de verdad, y tiene su bolsa aparte (topesDelAviso).
// Aplicar el mismo aviso dos veces deja lo mismo, así que no se deduplica.
//
// LA PUERTA INTERNA. La base (tienda_pagos_barrer, cada minuto, pg_net) llama aquí con
// `x-vim-interno` cuando hay devoluciones que hacer o pagos que nadie confirmó. Mismo esquema que
// enviar-push: Vault `vim_interno` = secreto VIM_INTERNO_SECRET. Se contesta 202 y el trabajo
// sigue en segundo plano (pg_net no espera más de 5 s).
//
// SECRETOS: MP_WEBHOOK_SECRET (y MP_WEBHOOK_SECRET_PRUEBA), VIM_INTERNO_SECRET, VIM_AVISOS_A, VIM_SMTP_*.
import { clienteAdmin } from "../_shared/http.ts";
import { consumirCupo, leerCuerpoAcotado } from "../_shared/limite.ts";
import { registrarError } from "../_shared/errores.ts";
import { enSegundoPlano, enviarCorreo } from "../_shared/correo.ts";
import { secretoInternoValido } from "../_shared/delivery/interno.ts";
import { firmaValida } from "../_shared/terminal/mercado-pago.ts";
import { pagoDelAviso } from "../_shared/tienda/pago-mp.ts";
import { avisoDeConciliacionFallida, avisoDeDevolucionFallida, barrer, confirmarPago, respuestaDeConfirmacion, topesDelAviso, type Tarea } from "../_shared/tienda/pago-flujo.ts";
import { depsDePagos } from "../_shared/tienda/pago-puerto.ts";

const FN = "tienda-webhook-mp";
const admin = clienteAdmin();
const deps = depsDePagos(admin, FN);
// La de prueba es opcional (como en terminal-webhook-mp): los avisos de la cuenta de prueba los firma su aplicación gemela.
const SECRETOS = [Deno.env.get("MP_WEBHOOK_SECRET") ?? "", Deno.env.get("MP_WEBHOOK_SECRET_PRUEBA") ?? ""].filter((s) => s !== "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const texto = (cuerpo: string, status: number): Response => new Response(cuerpo, { status });

/**
 * Correo a VIM: una devolución falló tres veces, o no se ha podido preguntar tres veces por un pago
 * que nadie confirmó (puede haber un cobro sin pedido). Solo ids nuestros; ni el cliente ni la tarjeta.
 */
async function avisar(t: Tarea, de: "DEVOLUCION" | "CONCILIACION"): Promise<void> {
  registrarError(FN, de === "DEVOLUCION" ? "DEVOLUCION_FALLIDA" : "CONCILIACION_FALLIDA", `pago ${t.id}`);
  const { data } = await admin.from("tienda_pagos")
    .select("monto_mxn, ultimo_error, pedido:delivery_pedidos(folio_corto), negocio:tenants(nombre_comercial)")
    .eq("id", t.id).maybeSingle();
  const f = data as { monto_mxn?: number; ultimo_error?: string | null; pedido?: { folio_corto?: string | null } | null; negocio?: { nombre_comercial?: string | null } | null } | null;
  const d = {
    pagoId: t.id, negocio: f?.negocio?.nombre_comercial ?? "", folio: f?.pedido?.folio_corto ?? "",
    monto: f?.monto_mxn === undefined ? "" : Number(f.monto_mxn).toFixed(2),
  };
  const r = await enviarCorreo({
    to: Deno.env.get("VIM_AVISOS_A") ?? "hola@vimpos.com.mx",
    ...(de === "DEVOLUCION" ? avisoDeDevolucionFallida({ ...d, error: f?.ultimo_error ?? "" }) : avisoDeConciliacionFallida(d)),
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

  // ── Un aviso de Mercado Pago ────────────────────────────────────────────────────────────────
  const url = new URL(req.url);
  const firma = req.headers.get("x-signature");
  if (firma !== null) {
    const e = { firma, requestId: req.headers.get("x-request-id"), dataId: url.searchParams.get("data.id") };
    let valida = false;
    for (const secreto of SECRETOS) if (await firmaValida({ ...e, secreto })) { valida = true; break; }
    if (!valida) {
      console.warn(`[${FN}] firma inválida (data.id=${e.dataId?.slice(0, 40) ?? "-"}, ${crudo.length} bytes)`);
      // Rastro mínimo y con tope por hora: nada del cuerpo de un desconocido llega a la base.
      const cupo = await consumirCupo(admin, { clave: "mp-tienda:firma-invalida", ventanaSeg: 3600, max: 60 }, "cerrar");
      if (cupo.permitido) {
        await admin.from("terminal_eventos").insert({
          orden_id_externo: e.dataId?.slice(0, 64) ?? null, accion: "tienda:firma_invalida", error: "firma inválida",
          payload: { bytes: crudo.length, con_request_id: Boolean(e.requestId), sin_secreto: SECRETOS.length === 0, query: [...url.searchParams.keys()].slice(0, 8) },
        });
      }
      return texto("invalid signature", 401);
    }
  }

  let cuerpo: unknown = null;
  try { cuerpo = crudo ? JSON.parse(crudo) : null; } catch { /* el formato viejo llega sin cuerpo útil: basta la query */ }
  const ref = url.searchParams.get("ref") ?? "";
  const pagoIdExterno = pagoDelAviso(url.searchParams, cuerpo);
  // Sin nuestra referencia o sin un pago del que hablar (otro tópico): no es para nosotros. 200, para que no lo reintente.
  if (!UUID.test(ref) || !pagoIdExterno) return texto("", 200);

  // ¿La referencia es nuestra? Una lectura por llave, ANTES de gastar ningún tope: quien manda
  // referencias inventadas no le quita ni un aviso a los pagos de verdad.
  const existe = await admin.from("tienda_pagos").select("id").eq("id", ref.toLowerCase()).maybeSingle();
  if (existe.error) { registrarError(FN, "ERROR_INTERNO", existe.error); return texto("error", 500); }
  const esNuestra = existe.data !== null;
  // Cada aviso de una referencia nuestra cuesta una consulta a Mercado Pago con el token de un restaurante.
  for (const tope of topesDelAviso(ref, esNuestra)) {
    const c = await consumirCupo(admin, tope, "cerrar");
    if (!c.permitido) return texto("too many requests", 429);   // Mercado Pago reintenta; y está el respaldo
  }
  if (!esNuestra) return texto("", 200);   // no es para nosotros: que no lo reintente

  try {
    const c = await confirmarPago(deps, ref.toLowerCase(), pagoIdExterno);
    const r = respuestaDeConfirmacion(c);
    if (c.ok || c.motivo !== "PAGO_DESCONOCIDO") {
      // Rastro para diagnóstico, solo de referencias nuestras: sin el cuerpo, que no hace falta.
      await admin.from("terminal_eventos").insert({
        orden_id_externo: pagoIdExterno, accion: "tienda:payment", payload: { ref: ref.toLowerCase(), resultado: c },
        procesado_at: c.ok ? new Date().toISOString() : null, error: c.ok ? null : c.motivo,
      });
    }
    return texto("", r);
  } catch (e) {
    registrarError(FN, "ERROR_INTERNO", e);
    return texto("error", 500);   // Mercado Pago reintenta
  }
});
