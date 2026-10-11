import { test } from "node:test";
import assert from "node:assert/strict";
import { clienteMpTienda, cuerpoDeCobro, decidirPago, pagoVivo, MOTIVOS_DE_RECHAZO, motivoDeRechazo, pagoDelAviso, pagosDeBusqueda, respuestaDeCobro, resumenDeFallo } from "./pago-mp.ts";

const PAGO = "2cd9e6fa-1acf-47dc-8ba4-cba918d73770";
const TARJETA = { token: "ff8080814c11e237014c1ff593b57b4d", payment_method_id: "master", issuer_id: "160", dispositivo: "armor.abc123" };
const DATOS = {
  pagoId: PAGO, monto: "264.00", folio: "T1A2B3", negocio: "Knock-Out Burger",
  aviso: `https://x.supabase.co/functions/v1/tienda-webhook-mp?ref=${PAGO}`, email: "ana@example.com", tarjeta: TARJETA,
};

test("cobro: el monto de la base, el token de la tarjeta, nuestra referencia y a dónde avisar", () => {
  const c = cuerpoDeCobro(DATOS);
  assert.equal(c.transaction_amount, 264);
  assert.equal(c.token, TARJETA.token);
  assert.equal(c.payment_method_id, "master");
  assert.equal(c.issuer_id, "160");
  assert.equal(c.external_reference, PAGO);
  assert.equal(c.notification_url, DATOS.aviso);
  assert.deepEqual(c.payer, { email: "ana@example.com" });
});

test("cobro: un solo pago, aprobado o rechazado al instante, sin 3DS y sin comisión de VIM", () => {
  const c = cuerpoDeCobro(DATOS);
  assert.equal(c.installments, 1);
  assert.equal(c.binary_mode, true);
  assert.equal(c.capture, true);
  for (const no of ["application_fee", "three_d_secure_mode", "statement_descriptor", "marketplace_fee"]) assert.ok(!(no in c), no);
});

test("cobro: sin banco emisor no va `issuer_id`; el Device ID no va en el cuerpo (es cabecera)", () => {
  const c = cuerpoDeCobro({ ...DATOS, tarjeta: { ...TARJETA, issuer_id: null } });
  assert.ok(!("issuer_id" in c));
  assert.ok(!JSON.stringify(c).includes("armor.abc123"));
});

test("cobro: los centavos llegan exactos", () => {
  for (const [texto, numero] of [["0.10", 0.1], ["19.99", 19.99], ["1234.05", 1234.05], ["100.00", 100]] as const) {
    assert.equal(cuerpoDeCobro({ ...DATOS, monto: texto }).transaction_amount, numero);
  }
});

test("cobro: un monto que no es un importe, o un aviso que no es https, no se manda", () => {
  for (const monto of ["", "abc", "-5.00", "0"]) assert.throws(() => cuerpoDeCobro({ ...DATOS, monto }), /monto/, monto);
  assert.throws(() => cuerpoDeCobro({ ...DATOS, aviso: "http://x.test/aviso" }), /https/);
});

test("rechazo: cada status_detail cae en su familia; lo que no se conoce es OTRO, nunca un motivo inventado", () => {
  const casos: [string | null, string][] = [
    ["cc_rejected_insufficient_amount", "FONDOS"], ["cc_amount_rate_limit_exceeded", "FONDOS"],
    ["cc_rejected_bad_filled_security_code", "CODIGO"], ["cc_rejected_bad_filled_date", "FECHA"],
    ["cc_rejected_bad_filled_card_number", "NUMERO"], ["cc_rejected_call_for_authorize", "LLAMAR_BANCO"],
    ["cc_rejected_card_disabled", "TARJETA_DESHABILITADA"], ["cc_rejected_3ds_mandatory", "VERIFICACION"],
    ["cc_rejected_high_risk", "OTRO"], ["cc_rejected_other_reason", "OTRO"], ["cc_rejected_blacklist", "OTRO"],
    ["cc_rejected_max_attempts", "OTRO"], ["cc_rejected_duplicated_payment", "OTRO"], ["rejected_by_bank", "OTRO"],
    ["algo_nuevo", "OTRO"], ["", "OTRO"], [null, "OTRO"], ["constructor", "OTRO"], ["__proto__", "OTRO"],
  ];
  for (const [detalle, familia] of casos) assert.equal(motivoDeRechazo(detalle), familia, String(detalle));
  assert.ok(casos.every(([, f]) => (MOTIVOS_DE_RECHAZO as readonly string[]).includes(f)));
});

test("respuesta del cobro: solo un 4xx de validación es un no seguro; sin respuesta o 5xx NUNCA es rechazo", () => {
  for (const s of [200, 201]) assert.equal(respuestaDeCobro(s), "CREADO");
  assert.equal(respuestaDeCobro(401), "SIN_PERMISO");
  for (const s of [400, 402, 403, 404, 422]) assert.equal(respuestaDeCobro(s), "NO_ACEPTADO", String(s));
  for (const s of [0, 409, 423, 429, 500, 502, 503, 504, 302, 204]) assert.equal(respuestaDeCobro(s), "NO_SE_SABE", String(s));
});

// Con la forma del ejemplo de GET /v1/payments/{id} de la referencia (01-resumen-api.md §5).
const ESPERADO = { pagoId: PAGO, cuentaVendedora: "202809963", dePrueba: false };
const APROBADO = {
  id: 18552260055, status: "approved", status_detail: "accredited", currency_id: "MXN", live_mode: true,
  collector_id: 202809963, external_reference: PAGO, transaction_amount: 264, payment_type_id: "credit_card", payment_method_id: "master",
};

test("pago: aprobado, acreditado, nuestro y en pesos es APROBADO, con lo que cobró Mercado Pago", () => {
  assert.deepEqual(decidirPago(ESPERADO, APROBADO), {
    tipo: "APROBADO", pagoIdExterno: "18552260055", monto: "264.00", tipoTarjeta: "credit_card", marca: "master", detalle: "accredited",
  });
});

test("pago: el monto llega como número o como texto y sale siempre con dos decimales", () => {
  for (const [crudo, esperado] of [["24.50", "24.50"], [24.5, "24.50"], ["264", "264.00"], [0.1, "0.10"]] as const) {
    const d = decidirPago(ESPERADO, { ...APROBADO, transaction_amount: crudo });
    assert.equal(d.tipo, "APROBADO");
    if (d.tipo === "APROBADO") assert.equal(d.monto, esperado);
  }
});

test("pago: con otra referencia, de otra cuenta o sin id no es nuestro, diga lo que diga su estado", () => {
  for (const cambio of [
    { external_reference: "otra-referencia" }, { external_reference: undefined }, { external_reference: PAGO.toUpperCase() },
    { collector_id: 999 }, { collector_id: undefined }, { collector_id: "202809963 " + "x" },
    { id: undefined }, { id: "abc" }, { id: 1.5 },
  ]) {
    assert.equal(decidirPago(ESPERADO, { ...APROBADO, ...cambio }).tipo, "AJENO", JSON.stringify(cambio));
  }
  for (const basura of [null, undefined, "approved", [], 42]) assert.equal(decidirPago(ESPERADO, basura).tipo, "AJENO");
});

test("pago: la cuenta vendedora también se lee de `collector.id`", () => {
  const { collector_id: _c, ...sin } = APROBADO;
  assert.equal(decidirPago(ESPERADO, { ...sin, collector: { id: 202809963 } }).tipo, "APROBADO");
  assert.equal(decidirPago(ESPERADO, { ...sin, collector: { id: 1 } }).tipo, "AJENO");
});

test("pago: uno de prueba no cuenta en una cuenta real; en la de prueba, sí", () => {
  assert.equal(decidirPago(ESPERADO, { ...APROBADO, live_mode: false }).tipo, "AJENO");
  assert.equal(decidirPago(ESPERADO, { ...APROBADO, live_mode: undefined }).tipo, "AJENO");
  assert.equal(decidirPago({ ...ESPERADO, dePrueba: true }, { ...APROBADO, live_mode: false }).tipo, "APROBADO");
});

test("pago: rechazado o cancelado es RECHAZADO con su motivo; devuelto es DEVUELTO", () => {
  const r = decidirPago(ESPERADO, { ...APROBADO, status: "rejected", status_detail: "cc_rejected_insufficient_amount" });
  assert.deepEqual([r.tipo, r.tipo === "RECHAZADO" && r.detalle], ["RECHAZADO", "cc_rejected_insufficient_amount"]);
  assert.equal(decidirPago(ESPERADO, { ...APROBADO, status: "cancelled", status_detail: "expired" }).tipo, "RECHAZADO");
  assert.equal(decidirPago(ESPERADO, { ...APROBADO, status: "refunded", status_detail: "refunded" }).tipo, "DEVUELTO");
});

test("pago: lo que todavía no tiene resultado es PENDIENTE", () => {
  for (const status of ["pending", "in_process", "authorized"]) assert.equal(decidirPago(ESPERADO, { ...APROBADO, status }).tipo, "PENDIENTE");
});

test("pago: nunca es APROBADO un estado que no conocemos, uno sin acreditar, en otra moneda o sin monto", () => {
  for (const cambio of [
    { status: "charged_back" }, { status: "in_mediation" }, { status: "APPROVED" }, { status: "aprobado" }, { status: undefined },
    { status_detail: "partially_refunded" }, { status_detail: undefined }, { currency_id: "USD" }, { currency_id: undefined },
    { transaction_amount: undefined }, { transaction_amount: "mucho" }, { transaction_amount: 0 }, { transaction_amount: -264 },
  ]) {
    assert.equal(decidirPago(ESPERADO, { ...APROBADO, ...cambio }).tipo, "INCIDENTE", JSON.stringify(cambio));
  }
});

test("búsqueda: los pagos van en `results`; otra forma, ninguno", () => {
  assert.deepEqual(pagosDeBusqueda({ paging: { total: 1 }, results: [APROBADO] }), [APROBADO]);
  for (const mal of [null, {}, { results: "x" }, [APROBADO]]) assert.deepEqual(pagosDeBusqueda(mal), []);
});

test("aviso: el id del pago sale de la query o del cuerpo, y solo si el aviso es de un pago", () => {
  const q = (s: string) => new URLSearchParams(s);
  assert.equal(pagoDelAviso(q("ref=x&data.id=123456&type=payment"), null), "123456");
  assert.equal(pagoDelAviso(q("ref=x"), { type: "payment", action: "payment.updated", data: { id: "999999999" } }), "999999999");
  assert.equal(pagoDelAviso(q("ref=x"), { type: "payment", data: { id: 12345 } }), "12345");
  assert.equal(pagoDelAviso(q("ref=x&topic=payment&id=777"), null), "777");   // formato viejo
  // Otros tópicos, o un id que no es un número, no son un pago.
  assert.equal(pagoDelAviso(q("ref=x&topic=merchant_order&id=777"), null), null);
  assert.equal(pagoDelAviso(q("ref=x&data.id=123&type=order"), null), null);
  assert.equal(pagoDelAviso(q("ref=x&data.id=1%20OR%201&type=payment"), null), null);
  assert.equal(pagoDelAviso(q("ref=x&id=777"), null), null);
  assert.equal(pagoDelAviso(q("ref=x"), "basura"), null);
});

test("cliente: cada llamada va a su ruta con el token del restaurante; cobro y devolución llevan llave", async () => {
  const vistas: { url: string; method: string; auth: string; llave: string | null; sesion: string | null; body: unknown }[] = [];
  const pedir = (async (url: string | URL | Request, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    vistas.push({ url: String(url), method: String(init?.method), auth: h.get("authorization") ?? "", llave: h.get("x-idempotency-key"), sesion: h.get("x-meli-session-id"), body: init?.body ?? null });
    return new Response(JSON.stringify({ id: 1 }), { status: 201 });
  }) as typeof fetch;
  const mp = clienteMpTienda("TOKEN-DEL-RESTAURANTE", pedir);
  assert.deepEqual(await mp.cobrar({ a: 1 }, `tienda-pago-${PAGO}`, "armor.abc123"), { status: 201, cuerpo: { id: 1 } });
  await mp.leerPago("18552260055");
  await mp.buscarPagos(PAGO);
  await mp.devolver("18552260055", `devolucion-${PAGO}`);
  assert.deepEqual(vistas.map((v) => `${v.method} ${v.url.replace("https://api.mercadopago.com", "")}`), [
    "POST /v1/payments",
    "GET /v1/payments/18552260055",
    `GET /v1/payments/search?external_reference=${PAGO}&sort=date_created&criteria=desc&limit=20`,
    "POST /v1/payments/18552260055/refunds",
  ]);
  assert.ok(vistas.every((v) => v.auth === "Bearer TOKEN-DEL-RESTAURANTE"));
  assert.equal(vistas[0]!.body, '{"a":1}');
  assert.equal(vistas[0]!.llave, `tienda-pago-${PAGO}`);
  assert.equal(vistas[0]!.sesion, "armor.abc123");
  assert.equal(vistas[1]!.sesion, null);
  assert.equal(vistas[3]!.body, null);                       // sin cuerpo = devolución total
  assert.equal(vistas[3]!.llave, `devolucion-${PAGO}`);
});

test("cliente: un fallo de red es status 0, no una excepción; un cuerpo que no es JSON, null", async () => {
  const cae = (() => Promise.reject(new Error("ECONNRESET"))) as unknown as typeof fetch;
  assert.deepEqual(await clienteMpTienda("t", cae).leerPago("1"), { status: 0, cuerpo: null });
  const html = (() => Promise.resolve(new Response("<html>502</html>", { status: 502 }))) as unknown as typeof fetch;
  assert.deepEqual(await clienteMpTienda("t", html).leerPago("1"), { status: 502, cuerpo: null });
});

test("fallo: al log va el estado y el código, nunca el cuerpo", () => {
  assert.equal(resumenDeFallo({ status: 401, cuerpo: { message: "invalid access token APP_USR-secreto", error: "invalid_access_token", status: 401 } }), "HTTP 401 invalid_access_token");
  assert.equal(resumenDeFallo({ status: 400, cuerpo: { message: "x", cause: [{ code: "2063", description: "…" }] } }), "HTTP 400 2063");
  assert.equal(resumenDeFallo({ status: 0, cuerpo: null }), "HTTP 0");
});

test("pago: su modo tiene que ser el de la conexión que cobró, en los dos sentidos", () => {
  const dePrueba = { ...ESPERADO, dePrueba: true };
  assert.equal(decidirPago(ESPERADO, { ...APROBADO, live_mode: true }).tipo, "APROBADO");
  assert.equal(decidirPago(ESPERADO, { ...APROBADO, live_mode: false }).tipo, "AJENO");
  assert.equal(decidirPago(dePrueba, { ...APROBADO, live_mode: false }).tipo, "APROBADO");
  // Un pago REAL en una conexión de prueba tampoco se cree.
  assert.deepEqual(decidirPago(dePrueba, { ...APROBADO, live_mode: true }), { tipo: "AJENO", motivo: "pago real en una conexión de prueba" });
  for (const raro of [undefined, null, "true", 1]) assert.equal(decidirPago(ESPERADO, { ...APROBADO, live_mode: raro }).tipo, "AJENO", String(raro));
});

test("pago vivo: todo lo que no esté rechazado, cancelado o devuelto (también un estado que no se conoce)", () => {
  for (const status of ["approved", "authorized", "pending", "in_process", "in_mediation", "charged_back", "algo_nuevo", undefined]) assert.equal(pagoVivo({ status }), true, String(status));
  for (const status of ["rejected", "cancelled", "refunded"]) assert.equal(pagoVivo({ status }), false, status);
});
