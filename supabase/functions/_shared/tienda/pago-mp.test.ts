// Los fixtures son las respuestas REALES de Mercado Pago del 11 oct 2026
// (docs/integraciones/mercado-pago-checkout-pro/04-verificado-orders.md), recortadas como están allá.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clienteMpTienda, cuerpoDeOrden, decidirOrden, motivoDeRechazo, ordenesDeBusqueda, ordenViva, respuestaDeCobro, resumenDeFallo, rutaDeBusqueda } from "./pago-mp.ts";

const PAGO = "2cd9e6fa-1acf-47dc-8ba4-cba918d73770";
const E = { pagoId: PAGO, dePrueba: false };
const TARJETA = { token: "ff8080814c11e237014c1ff593b57b4d", payment_method_id: "master", type: "credit_card" as const };

/** 201 de un cobro aprobado (titular APRO). */
const ORDEN_APROBADA = {
  id: "ORDTST01M4P8JX8C82XV8G7EB2A16YAC", status: "processed", status_detail: "accredited",
  total_amount: "138.00", total_paid_amount: "138.00", external_reference: PAGO, capture_mode: "automatic_async",
  transactions: { payments: [{ id: "PAY01M4P8JX8TKPS5B2ECXP875P89", status: "processed", status_detail: "accredited",
    payment_method: { id: "master", type: "credit_card" } }] },
};
/** 402 de un cobro rechazado (titular FUND): sin objeto de orden. */
const RECHAZO_402 = { errors: [{ code: "failed", message: "The following transactions failed",
  details: ["PAY01M4P8KB8MM494BGX78592RQMQ: insufficient_amount"] }] };
/** 201 de un cobro en revisión (titular CONT). */
const ORDEN_EN_REVISION = { ...ORDEN_APROBADA, id: "ORDTST01M4P8REVISION", status: "processing", status_detail: "in_process", total_paid_amount: "0.00" };

test("el cuerpo de la orden es el verificado: online, automático, montos como texto y la tarjeta por su token", () => {
  assert.deepEqual(cuerpoDeOrden({ pagoId: PAGO, monto: "138", email: "ana@example.com", tarjeta: TARJETA }), {
    type: "online", processing_mode: "automatic", total_amount: "138.00", external_reference: PAGO,
    payer: { email: "ana@example.com" },
    transactions: { payments: [{ amount: "138.00", payment_method: { id: "master", type: "credit_card", token: TARJETA.token, installments: 1 } }] },
  });
  assert.equal((cuerpoDeOrden({ pagoId: PAGO, monto: "10.5", email: "a@b.mx", tarjeta: { ...TARJETA, type: "debit_card" } }).transactions as { payments: { payment_method: { type: string } }[] }).payments[0]!.payment_method.type, "debit_card");
  for (const monto of ["0", "-1", "abc", "1.234", ""]) assert.throws(() => cuerpoDeOrden({ pagoId: PAGO, monto, email: "a@b.mx", tarjeta: TARJETA }), /monto/);
  // Nada de Payments API ni de comisiones: el dinero cae completo en la cuenta del restaurante.
  const texto = JSON.stringify(cuerpoDeOrden({ pagoId: PAGO, monto: "138.00", email: "a@b.mx", tarjeta: TARJETA }));
  assert.doesNotMatch(texto, /transaction_amount|binary_mode|notification_url|application_fee|marketplace/);
});

test("201 processed/accredited con nuestra referencia: aprobado, con la orden, el pago y lo que se COBRÓ", () => {
  const r = respuestaDeCobro(E, { status: 201, cuerpo: ORDEN_APROBADA });
  assert.deepEqual(r, { tipo: "ORDEN", decision: {
    tipo: "APROBADO", ordenIdExterno: "ORDTST01M4P8JX8C82XV8G7EB2A16YAC", pagoIdExterno: "PAY01M4P8JX8TKPS5B2ECXP875P89",
    monto: "138.00", tipoTarjeta: "credit_card", marca: "master", detalle: "accredited" } });
  // El monto es total_paid_amount, no lo que se pidió: que sea el esperado lo decide la base.
  assert.equal((decidirOrden(E, { ...ORDEN_APROBADA, total_paid_amount: "1.00" }) as { monto: string }).monto, "1.00");
});

test("402 con errors[].code failed: rechazo seguro, y el motivo sale de details", () => {
  assert.deepEqual(respuestaDeCobro(E, { status: 402, cuerpo: RECHAZO_402 }), { tipo: "RECHAZADO", detalle: "insufficient_amount" });
  const con = (motivo: string) => respuestaDeCobro(E, { status: 402, cuerpo: { errors: [{ code: "failed", details: [`PAY01X: ${motivo}`] }] } });
  // La tabla del documento 04: titular de prueba → motivo → familia.
  for (const [motivo, familia] of [["insufficient_amount", "FONDOS"], ["bad_filled_card_data", "DATOS"], ["required_call_for_authorize", "LLAMAR_BANCO"],
                                   ["card_disabled", "TARJETA_DESHABILITADA"], ["rejected_by_issuer", "OTRO"]] as const) {
    const r = con(motivo);
    assert.equal(r.tipo, "RECHAZADO");
    assert.equal(motivoDeRechazo(r.tipo === "RECHAZADO" ? r.detalle : null), familia, motivo);
  }
  // Sin details, o con algo que no es un motivo: sigue siendo rechazo, familia OTRO. Nunca un texto libre.
  assert.deepEqual(respuestaDeCobro(E, { status: 402, cuerpo: { errors: [{ code: "failed" }] } }), { tipo: "RECHAZADO", detalle: null });
  assert.deepEqual(con("<script>alert(1)</script>"), { tipo: "RECHAZADO", detalle: null });
  for (const d of [null, undefined, "", "toString", "constructor", "motivo_nuevo"]) assert.equal(motivoDeRechazo(d), "OTRO");
});

test("un 402 que no dice failed, y todo lo que no es una respuesta clara: no se sabe, nunca rechazo", () => {
  assert.deepEqual(respuestaDeCobro(E, { status: 402, cuerpo: { errors: [{ code: "otra_cosa" }] } }), { tipo: "NO_SE_SABE" });
  assert.deepEqual(respuestaDeCobro(E, { status: 402, cuerpo: null }), { tipo: "NO_SE_SABE" });
  for (const status of [0, 403, 404, 408, 409, 423, 429, 500, 502, 503, 504]) {
    assert.deepEqual(respuestaDeCobro(E, { status, cuerpo: RECHAZO_402 }), { tipo: "NO_SE_SABE" }, String(status));
  }
});

test("401 no es un rechazo de la tarjeta; 400 y 422 son de validación (no se creó nada)", () => {
  assert.deepEqual(respuestaDeCobro(E, { status: 401, cuerpo: { message: "Unauthorized use of live credentials", code: 7 } }), { tipo: "SIN_PERMISO" });
  assert.deepEqual(respuestaDeCobro(E, { status: 400, cuerpo: { errors: [{ code: "invalid_token" }] } }), { tipo: "NO_ACEPTADO" });
  assert.deepEqual(respuestaDeCobro(E, { status: 422, cuerpo: null }), { tipo: "NO_ACEPTADO" });
});

test("201 processing: en revisión, pendiente y con su orden (no se puede cancelar)", () => {
  assert.deepEqual(respuestaDeCobro(E, { status: 201, cuerpo: ORDEN_EN_REVISION }),
    { tipo: "ORDEN", decision: { tipo: "PENDIENTE", motivo: "processing", ordenIdExterno: "ORDTST01M4P8REVISION" } });
  for (const status of ["created", "action_required"]) assert.equal(decidirOrden(E, { ...ORDEN_APROBADA, status }).tipo, "PENDIENTE");
});

test("una orden que no es nuestra no se mira: sin id, otra referencia, o el modo que no casa con la conexión", () => {
  assert.equal(decidirOrden(E, null).tipo, "AJENO");
  assert.equal(decidirOrden(E, { ...ORDEN_APROBADA, id: 123 }).tipo, "AJENO");
  assert.equal(decidirOrden(E, { ...ORDEN_APROBADA, id: "ORD con espacio" }).tipo, "AJENO");
  assert.equal(decidirOrden(E, { ...ORDEN_APROBADA, external_reference: "otra" }).tipo, "AJENO");
  assert.equal(decidirOrden(E, { ...ORDEN_APROBADA, external_reference: undefined }).tipo, "AJENO");
  // live_mode, si viene, tiene que ser el de la conexión, en los dos sentidos.
  assert.deepEqual(decidirOrden(E, { ...ORDEN_APROBADA, live_mode: false }), { tipo: "AJENO", motivo: "orden de prueba en una cuenta real", ordenIdExterno: ORDEN_APROBADA.id });
  assert.equal(decidirOrden({ ...E, dePrueba: true }, { ...ORDEN_APROBADA, live_mode: true }).tipo, "AJENO");
  assert.equal(decidirOrden(E, { ...ORDEN_APROBADA, live_mode: true }).tipo, "APROBADO");
  assert.equal(decidirOrden({ ...E, dePrueba: true }, { ...ORDEN_APROBADA, live_mode: false }).tipo, "APROBADO");
  // Sin probar que la orden lo traiga: si no viene, no se inventa.
  assert.equal(decidirOrden(E, ORDEN_APROBADA).tipo, "APROBADO");
});

test("nunca «aprobado» por un estado que no se conoce, sin acreditar, sin monto, con otra moneda o con el pago sin procesar", () => {
  const es = (cambios: Record<string, unknown>) => decidirOrden(E, { ...ORDEN_APROBADA, ...cambios });
  assert.deepEqual(es({ status: "algo_nuevo" }), { tipo: "INCIDENTE", motivo: "estado desconocido: algo_nuevo", ordenIdExterno: ORDEN_APROBADA.id });
  assert.equal(es({ status: undefined }).tipo, "INCIDENTE");
  assert.equal(es({ status_detail: "partially_refunded" }).tipo, "INCIDENTE");
  assert.equal(es({ total_paid_amount: undefined }).tipo, "INCIDENTE");
  assert.equal(es({ total_paid_amount: "0.00" }).tipo, "INCIDENTE");
  assert.equal(es({ currency: "USD" }).tipo, "INCIDENTE");
  assert.equal(es({ currency: "MXN" }).tipo, "APROBADO");
  assert.equal(es({ transactions: { payments: [{ id: "PAY1", status: "failed" }] } }).tipo, "INCIDENTE");
  assert.equal(es({ transactions: { payments: [ORDEN_APROBADA.transactions.payments[0], ORDEN_APROBADA.transactions.payments[0]] } }).tipo, "INCIDENTE");
});

test("una orden fallida, cancelada o vencida es un rechazo; una devuelta, devuelta", () => {
  for (const status of ["failed", "canceled", "expired"]) {
    const d = decidirOrden(E, { ...ORDEN_APROBADA, status, status_detail: "failed", total_paid_amount: undefined,
      transactions: { payments: [{ id: "PAY2", status: "failed", status_detail: "insufficient_amount", payment_method: { id: "master", type: "credit_card" } }] } });
    assert.equal(d.tipo, "RECHAZADO", status);
    assert.equal(d.tipo === "RECHAZADO" && d.detalle, "insufficient_amount");
  }
  const dev = decidirOrden(E, { ...ORDEN_APROBADA, status: "refunded", status_detail: "refunded" });
  assert.equal(dev.tipo, "DEVUELTO");
  assert.equal(dev.tipo === "DEVUELTO" && dev.ordenIdExterno, ORDEN_APROBADA.id);
});

test("orden viva: todo menos fallida, cancelada, vencida o devuelta (lo desconocido cuenta como vivo)", () => {
  for (const status of ["processed", "processing", "action_required", "created", "algo_nuevo", undefined]) assert.equal(ordenViva({ status }), true, String(status));
  for (const status of ["failed", "canceled", "expired", "refunded"]) assert.equal(ordenViva({ status }), false, status);
});

test("la búsqueda por referencia lleva begin_date y end_date en ISO 8601 UTC (formato sin probar contra Mercado Pago)", () => {
  const ruta = rutaDeBusqueda(PAGO, new Date("2026-10-11T18:00:00Z"), new Date("2026-10-11T19:00:00Z"));
  assert.equal(ruta, `/v1/orders?external_reference=${PAGO}&begin_date=2026-10-11T18%3A00%3A00.000Z&end_date=2026-10-11T19%3A00%3A00.000Z`);
  assert.deepEqual(ordenesDeBusqueda({ data: [ORDEN_APROBADA] }), [ORDEN_APROBADA]);
  assert.deepEqual(ordenesDeBusqueda({ results: [ORDEN_APROBADA] }), [ORDEN_APROBADA]);
  for (const c of [null, [], { data: "x" }, "texto"]) assert.deepEqual(ordenesDeBusqueda(c), []);
});

test("el cliente llama a Orders API con el token del restaurante y la llave de idempotencia; un fallo de red es status 0", async () => {
  const vistas: { url: string; metodo: string; cabeceras: Record<string, string>; cuerpo: string | undefined }[] = [];
  const pedir = ((url: string, init: RequestInit) => {
    vistas.push({ url, metodo: String(init.method), cabeceras: init.headers as Record<string, string>, cuerpo: init.body as string | undefined });
    return Promise.resolve(new Response(JSON.stringify(ORDEN_APROBADA), { status: 201 }));
  }) as typeof fetch;
  const mp = clienteMpTienda("TOKEN-DEL-RESTAURANTE", pedir);
  assert.deepEqual(await mp.crearOrden({ type: "online" }, "tienda-pago-1"), { status: 201, cuerpo: ORDEN_APROBADA });
  await mp.leerOrden("ORD/1");
  await mp.devolver("ORD1", "llave-nueva");
  await mp.buscarOrdenes(PAGO, new Date(0), new Date(1000));
  assert.deepEqual(vistas.map((v) => `${v.metodo} ${v.url.replace("https://api.mercadopago.com", "").split("?")[0]}`),
    ["POST /v1/orders", "GET /v1/orders/ORD%2F1", "POST /v1/orders/ORD1/refund", "GET /v1/orders"]);
  assert.ok(vistas.every((v) => v.cabeceras.Authorization === "Bearer TOKEN-DEL-RESTAURANTE"));
  assert.equal(vistas[0]!.cabeceras["X-Idempotency-Key"], "tienda-pago-1");
  assert.equal(vistas[2]!.cabeceras["X-Idempotency-Key"], "llave-nueva");
  assert.equal(vistas[2]!.cuerpo, undefined);   // devolución total: sin cuerpo
  assert.ok(vistas.every((v) => !v.url.includes("/v1/payments")));
  const roto = clienteMpTienda("T", (() => Promise.reject(new Error("sin red"))) as typeof fetch);
  assert.deepEqual(await roto.crearOrden({}, "k"), { status: 0, cuerpo: null });
});

test("del fallo se deja el estado y el código, nunca el cuerpo", () => {
  assert.equal(resumenDeFallo({ status: 402, cuerpo: RECHAZO_402 }), "HTTP 402 failed");
  assert.equal(resumenDeFallo({ status: 409, cuerpo: { errors: [{ code: "cannot_cancel_order", message: "must be in 'action_required' or 'created'" }] } }), "HTTP 409 cannot_cancel_order");
  assert.equal(resumenDeFallo({ status: 0, cuerpo: null }), "HTTP 0");
  assert.doesNotMatch(resumenDeFallo({ status: 402, cuerpo: RECHAZO_402 }), /PAY01|insufficient/);
});
