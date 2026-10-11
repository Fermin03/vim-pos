import { test } from "node:test";
import assert from "node:assert/strict";
import { clienteMpTienda, cuerpoDePreferencia, decidirPago, leerPreferencia, pagoDelAviso, pagosDeBusqueda, resumenDeFallo } from "./pago-mp.ts";

const PAGO = "2cd9e6fa-1acf-47dc-8ba4-cba918d73770";
const DATOS = {
  pagoId: PAGO, monto: "264.00", folio: "T1A2B3", negocio: "Knock-Out Burger",
  regreso: "https://pedidos.vimpos.com.mx/knockout/pedido/abcdefghijklmnopqrstuv",
  aviso: `https://x.supabase.co/functions/v1/tienda-webhook-mp?ref=${PAGO}`,
  ahora: new Date("2026-10-11T18:00:00.000Z"), vence: new Date("2026-10-11T18:15:00.000Z"), email: "ana@example.com",
};

test("preferencia: un renglón por el total, nuestra referencia, regreso y aviso", () => {
  const c = cuerpoDePreferencia(DATOS);
  assert.deepEqual(c.items, [{ id: "T1A2B3", title: "Pedido T1A2B3 en Knock-Out Burger", quantity: 1, currency_id: "MXN", unit_price: 264 }]);
  assert.equal(c.external_reference, PAGO);
  assert.deepEqual(c.back_urls, { success: DATOS.regreso, pending: DATOS.regreso, failure: DATOS.regreso });
  assert.equal(c.auto_return, "approved");
  assert.equal(c.notification_url, DATOS.aviso);
  assert.deepEqual(c.payer, { email: "ana@example.com" });
});

test("preferencia: solo medios que se aprueban al instante, sin meses, y vence a los 15 minutos", () => {
  const c = cuerpoDePreferencia(DATOS);
  assert.deepEqual(c.payment_methods, {
    excluded_payment_types: [{ id: "ticket" }, { id: "atm" }, { id: "bank_transfer" }, { id: "digital_currency" }],
    installments: 1,
  });
  assert.equal(c.binary_mode, true);
  assert.equal(c.expires, true);
  assert.equal(c.expiration_date_from, "2026-10-11T18:00:00.000+00:00");
  assert.equal(c.expiration_date_to, "2026-10-11T18:15:00.000+00:00");
});

test("preferencia: VIM no cobra comisión, y sin correo no va `payer`", () => {
  const c = cuerpoDePreferencia({ ...DATOS, email: null });
  assert.equal("marketplace_fee" in c, false);
  assert.equal("payer" in c, false);
});

test("preferencia: los centavos llegan exactos", () => {
  for (const [texto, numero] of [["0.10", 0.1], ["245.50", 245.5], ["1999.99", 1999.99], ["33.33", 33.33]] as const) {
    const [item] = cuerpoDePreferencia({ ...DATOS, monto: texto }).items as { unit_price: number }[];
    assert.equal(item!.unit_price, numero);
    assert.equal(JSON.stringify(item!.unit_price), String(numero));
  }
});

test("preferencia: un monto que no es un importe, o una URL que no es https, no se manda", () => {
  for (const monto of ["0", "0.00", "-5", "abc", "", "12.345"]) assert.throws(() => cuerpoDePreferencia({ ...DATOS, monto }));
  assert.throws(() => cuerpoDePreferencia({ ...DATOS, regreso: "http://pedidos.vimpos.com.mx/x" }));
  assert.throws(() => cuerpoDePreferencia({ ...DATOS, aviso: "http://localhost:54321/functions/v1/tienda-webhook-mp" }));
});

test("preferencia creada: se guardan su id y un init_point https; otra cosa es null", () => {
  assert.deepEqual(leerPreferencia({ id: "202809963-920c", init_point: "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=202809963-920c", sandbox_init_point: "https://sandbox…" }),
    { id: "202809963-920c", init_point: "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=202809963-920c" });
  for (const mal of [null, {}, { id: "x" }, { init_point: "https://x" }, { id: "x", init_point: "javascript:alert(1)" }, { id: 5, init_point: "https://x" }, "texto"]) {
    assert.equal(leerPreferencia(mal), null);
  }
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

test("cliente: cada llamada va a su ruta con el token del restaurante; la devolución es total y con llave", async () => {
  const vistas: { url: string; method: string; auth: string; llave: string | null; body: unknown }[] = [];
  const pedir = (async (url: string | URL | Request, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    vistas.push({ url: String(url), method: String(init?.method), auth: h.get("authorization") ?? "", llave: h.get("x-idempotency-key"), body: init?.body ?? null });
    return new Response(JSON.stringify({ id: 1 }), { status: 201 });
  }) as typeof fetch;
  const mp = clienteMpTienda("TOKEN-DEL-RESTAURANTE", pedir);
  assert.deepEqual(await mp.crearPreferencia({ a: 1 }), { status: 201, cuerpo: { id: 1 } });
  await mp.leerPago("18552260055");
  await mp.buscarPagos(PAGO);
  await mp.devolver("18552260055", `devolucion-${PAGO}`);
  assert.deepEqual(vistas.map((v) => `${v.method} ${v.url.replace("https://api.mercadopago.com", "")}`), [
    "POST /checkout/preferences",
    "GET /v1/payments/18552260055",
    `GET /v1/payments/search?external_reference=${PAGO}&sort=date_created&criteria=desc&limit=20`,
    "POST /v1/payments/18552260055/refunds",
  ]);
  assert.ok(vistas.every((v) => v.auth === "Bearer TOKEN-DEL-RESTAURANTE"));
  assert.equal(vistas[0]!.body, '{"a":1}');
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
