// Los fixtures son las respuestas REALES de Mercado Pago del 11 oct 2026
// (docs/integraciones/mercado-pago-checkout-pro/04-verificado-orders.md), recortadas como están allá.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { articulosDeOrden, clienteMpTienda, cuentaComoRechazo, cuerpoDeOrden, decidirOrden, type DetalleDePedido, enReto, motivoDeRechazo, nombreDePagador, ordenAtascada, ordenesDeBusqueda, ordenViva, pagadorDePrueba, partesDeCotizacion, respuestaDeCobro, resumenDeFallo, rutaDeBusqueda, sinDatosPersonales, telefonoDePagador, urlDeReto } from "./pago-mp.ts";

const PAGO = "2cd9e6fa-1acf-47dc-8ba4-cba918d73770";
const E = { pagoId: PAGO, cuentaVendedora: "3754297554" };
const TARJETA = { token: "ff8080814c11e237014c1ff593b57b4d", payment_method_id: "master", type: "credit_card" as const };

/** 201 de un cobro aprobado (titular APRO). */
const ORDEN_APROBADA = {
  id: "ORDTST01M4P8JX8C82XV8G7EB2A16YAC", type: "online", processing_mode: "automatic", status: "processed", status_detail: "accredited",
  total_amount: "138.00", total_paid_amount: "138.00", external_reference: PAGO, capture_mode: "automatic_async",
  // Claves reales de una orden (documento 04): el vendedor como texto, la moneda y el país. No trae live_mode.
  user_id: "3754297554", currency: "MXN", country_code: "MEX", integration_data: { application_id: "1234567890" },
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
    type: "online", processing_mode: "automatic", config: { online: { transaction_security: { validation: "on_fraud_risk", liability_shift: "required" } } }, total_amount: "138.00", external_reference: PAGO,
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

test("una orden que no es nuestra no se mira: sin id, otra referencia, o de otra cuenta vendedora", () => {
  assert.equal(decidirOrden(E, null).tipo, "AJENO");
  assert.equal(decidirOrden(E, { ...ORDEN_APROBADA, id: 123 }).tipo, "AJENO");
  assert.equal(decidirOrden(E, { ...ORDEN_APROBADA, id: "ORD con espacio" }).tipo, "AJENO");
  assert.equal(decidirOrden(E, { ...ORDEN_APROBADA, external_reference: "otra" }).tipo, "AJENO");
  assert.equal(decidirOrden(E, { ...ORDEN_APROBADA, external_reference: undefined }).tipo, "AJENO");
  // La cuenta vendedora (VERIFICADO: `user_id`, como texto) tiene que ser la de la conexión que cobra.
  assert.deepEqual(decidirOrden(E, { ...ORDEN_APROBADA, user_id: "999" }), { tipo: "AJENO", motivo: "otra cuenta vendedora", ordenIdExterno: ORDEN_APROBADA.id });
  for (const user_id of [undefined, null, "", "37542975540", " 3754297554", 3754297554.5, {}]) {
    assert.equal(decidirOrden(E, { ...ORDEN_APROBADA, user_id }).tipo, "AJENO", JSON.stringify(user_id));
  }
  // Se compara como texto: si un día llegara como número, es la misma cuenta.
  assert.equal(decidirOrden(E, { ...ORDEN_APROBADA, user_id: 3754297554 }).tipo, "APROBADO");
  // Y vale para cualquier estado: una orden en revisión o fallida de OTRA cuenta tampoco es nuestra.
  assert.equal(decidirOrden(E, { ...ORDEN_EN_REVISION, user_id: "999" }).tipo, "AJENO");
  assert.equal(decidirOrden(E, { ...ORDEN_APROBADA, status: "failed", user_id: "999" }).tipo, "AJENO");
  // La orden no trae `live_mode` (verificado): si viniera, no decide nada.
  assert.equal(decidirOrden(E, { ...ORDEN_APROBADA, live_mode: false }).tipo, "APROBADO");
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
  assert.equal(es({ currency: undefined }).tipo, "INCIDENTE");   // la orden real la trae: sin ella no se da por cobrada
  assert.equal(es({ currency: "MXN" }).tipo, "APROBADO");
  assert.equal(es({ transactions: { payments: [{ id: "PAY1", status: "failed" }] } }).tipo, "INCIDENTE");
  assert.equal(es({ transactions: { payments: [ORDEN_APROBADA.transactions.payments[0], ORDEN_APROBADA.transactions.payments[0]] } }).tipo, "INCIDENTE");
});

test("una orden fallida, cancelada o vencida es un rechazo; una devuelta, devuelta", () => {
  for (const status of ["failed", "canceled", "expired"]) {
    const d = decidirOrden(E, { ...ORDEN_APROBADA, status, status_detail: "failed", total_paid_amount: undefined,
      transactions: { payments: [{ id: "PAY2", status: "failed", status_detail: "insufficient_amount", payment_method: { id: "master", type: "credit_card" } }] } });
    assert.equal(d.tipo, "RECHAZADO", status);
    // Solo `failed` trae un motivo; una orden cancelada o vencida no se cobró y su «motivo» es ese estado.
    assert.equal(d.tipo === "RECHAZADO" && d.detalle, status === "failed" ? "insufficient_amount" : status);
  }
  // VERIFICADO: una orden devuelta queda refunded / refunded y su pago trae refunded_amount.
  const dev = decidirOrden(E, { ...ORDEN_APROBADA, status: "refunded", status_detail: "refunded",
    transactions: { payments: [{ ...ORDEN_APROBADA.transactions.payments[0], refunded_amount: "138.00", paid_amount: "138.00", reference_id: "REF1" }] } });
  assert.equal(dev.tipo, "DEVUELTO");
  assert.equal(dev.tipo === "DEVUELTO" && dev.ordenIdExterno, ORDEN_APROBADA.id);
});

test("orden viva: todo menos fallida, cancelada, vencida o devuelta (lo desconocido cuenta como vivo)", () => {
  for (const status of ["processed", "processing", "action_required", "created", "algo_nuevo", undefined]) assert.equal(ordenViva({ status }), true, String(status));
  for (const status of ["failed", "canceled", "expired", "refunded"]) assert.equal(ordenViva({ status }), false, status);
});

test("la búsqueda por referencia lleva begin_date y end_date en RFC 3339 (verificado), y la lista viene solo en data", () => {
  const ruta = rutaDeBusqueda(PAGO, new Date("2026-10-11T18:00:00Z"), new Date("2026-10-11T19:00:00Z"));
  assert.equal(ruta, `/v1/orders?external_reference=${PAGO}&begin_date=2026-10-11T18%3A00%3A00.000Z&end_date=2026-10-11T19%3A00%3A00.000Z`);
  assert.deepEqual(ordenesDeBusqueda({ data: [ORDEN_APROBADA] }), [ORDEN_APROBADA]);
  assert.deepEqual(ordenesDeBusqueda({ data: [ORDEN_APROBADA], paging: { total: 1 } }), [ORDEN_APROBADA]);
  for (const c of [null, [], { data: "x" }, "texto", { results: [ORDEN_APROBADA] }, { elements: [ORDEN_APROBADA] }, { orders: [ORDEN_APROBADA] }]) assert.deepEqual(ordenesDeBusqueda(c), []);
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

// ── `in_review` (visto en producción el 12 oct 2026) ──────────────────────────────────────────────
// La forma real: la de una orden creada, con `status: "in_review"`; ~5 s después llegó `order.failed`.
const ORDEN_EN_ANTIFRAUDE = { ...ORDEN_APROBADA, id: "ORDTST01M4P8ANTIFRAUDE", status: "in_review", status_detail: "in_review", total_paid_amount: "0.00" };
test("201 in_review: el antifraude la está mirando; pendiente y con su orden, nunca un incidente ni un rechazo", () => {
  assert.deepEqual(respuestaDeCobro(E, { status: 201, cuerpo: ORDEN_EN_ANTIFRAUDE }),
    { tipo: "ORDEN", decision: { tipo: "PENDIENTE", motivo: "in_review", ordenIdExterno: "ORDTST01M4P8ANTIFRAUDE" } });
  // Con cualquier detalle (no se conoce cuál manda): lo que decide es el estado.
  for (const status_detail of ["in_review", "pending_review_manual", undefined]) {
    assert.equal(decidirOrden(E, { ...ORDEN_EN_ANTIFRAUDE, status_detail }).tipo, "PENDIENTE", String(status_detail));
  }
});
test("in_review es una orden viva y no es una orden atascada: ni se da por «sin pago» ni se cancela", () => {
  assert.equal(ordenViva(ORDEN_EN_ANTIFRAUDE), true);
  assert.equal(ordenAtascada({ ...ORDEN_EN_ANTIFRAUDE, created_date: "2026-10-12T18:00:00.000Z" }, new Date("2026-10-12T19:00:00.000Z")), false);
});
test("de ajena no pasa: in_review con otra referencia u otra cuenta sigue siendo AJENO", () => {
  assert.equal(decidirOrden(E, { ...ORDEN_EN_ANTIFRAUDE, external_reference: "otra" }).tipo, "AJENO");
  assert.equal(decidirOrden(E, { ...ORDEN_EN_ANTIFRAUDE, user_id: "1" }).tipo, "AJENO");
});

// ── high_risk ─────────────────────────────────────────────────────────────────────────────────────
test("high_risk es el antifraude de Mercado Pago, no el banco: su propia familia", () => {
  assert.equal(motivoDeRechazo("high_risk"), "RIESGO");
  assert.deepEqual(respuestaDeCobro(E, { status: 402, cuerpo: { errors: [{ code: "failed", details: ["PAY01M4P8KB8MM494BGX78592RQMQ: high_risk"] }] } }),
    { tipo: "RECHAZADO", detalle: "high_risk" });
  // Los demás, como antes.
  assert.equal(motivoDeRechazo("rejected_by_issuer"), "OTRO");
  assert.equal(motivoDeRechazo("insufficient_amount"), "FONDOS");
});

// ── Lo que se le cuenta a Mercado Pago del pedido ─────────────────────────────────────────────────
const suma = (articulos: { unit_price: string; quantity: number }[]): number =>
  articulos.reduce((s, a) => s + Math.round(Number(a.unit_price) * 100) * a.quantity, 0);
const DETALLE: DetalleDePedido = {
  descripcion: "Pedido T1A2B3 en Knock-Out Burger",
  renglones: [{ nombre: "Clásica", cantidad: 2, total_mxn: "278.40" }, { nombre: "Refresco", cantidad: 1, total_mxn: "30.00" }],
  envio: "40.60", propina: "25.50",
  pagador: { nombre: "Ana María Torres López", telefono: "4771234567",
             direccion: { calle: "Av. Madero", numero_exterior: "12", codigo_postal: "37000", ciudad: "León", estado: "Guanajuato" } },
};
test("artículos: los renglones, el envío y la propina; la suma es EXACTAMENTE el total", () => {
  const a = articulosDeOrden({ ...DETALLE, total: "374.50" });
  assert.deepEqual(a, [
    { title: "Clásica", unit_price: "139.20", quantity: 2 },
    { title: "Refresco", unit_price: "30.00", quantity: 1 },
    { title: "Envío", unit_price: "40.60", quantity: 1 },
    { title: "Propina", unit_price: "25.50", quantity: 1 },
  ]);
  assert.equal(suma(a), 37450);
});
test("artículos: un renglón que no se reparte exacto entre su cantidad va como una pieza por su total", () => {
  // 3 hamburguesas con modificadores e IVA redondeado por renglón: 100.00 entre 3 no da centavos enteros.
  const a = articulosDeOrden({ descripcion: "Pedido", renglones: [{ nombre: "Doble con tocino", cantidad: 3, total_mxn: "100.00" }], envio: "0.00", propina: null, total: "100.00" });
  assert.deepEqual(a, [{ title: "3 × Doble con tocino", unit_price: "100.00", quantity: 1 }]);
  assert.equal(suma(a), 10000);
});
test("artículos: sin envío ni propina no hay esos renglones; un renglón de $0 no se manda", () => {
  const a = articulosDeOrden({ descripcion: "Pedido", renglones: [{ nombre: "Clásica", cantidad: 1, total_mxn: "120.00" }, { nombre: "Salsa", cantidad: 2, total_mxn: "0.00" }], envio: null, propina: "0.00", total: "120.00" });
  assert.deepEqual(a, [{ title: "Clásica", unit_price: "120.00", quantity: 1 }]);
});
test("artículos: si la suma no es el total (o algo no se lee), UN solo artículo con la descripción y el total", () => {
  const uno = (total: string) => [{ title: "Pedido T1A2B3 en Knock-Out Burger", unit_price: total, quantity: 1 }];
  // Un reintento con otro carrito: la cotización de ahora no es la del pedido que se cobra.
  assert.deepEqual(articulosDeOrden({ ...DETALLE, total: "374.51" }), uno("374.51"));
  assert.deepEqual(articulosDeOrden({ ...DETALLE, total: "100.00" }), uno("100.00"));
  // No se pudo cotizar: sin renglones.
  assert.deepEqual(articulosDeOrden({ ...DETALLE, renglones: [], envio: null, propina: null, total: "374.50" }), uno("374.50"));
  // Algo que no se lee.
  for (const roto of [{ nombre: "Clásica", cantidad: 2, total_mxn: "278.4" }, { nombre: "Clásica", cantidad: 0, total_mxn: "278.40" }, { nombre: "Clásica", cantidad: 1.5, total_mxn: "278.40" }, { nombre: " ", cantidad: 2, total_mxn: "278.40" }]) {
    assert.deepEqual(articulosDeOrden({ ...DETALLE, renglones: [roto, DETALLE.renglones[1]!], total: "374.50" }), uno("374.50"), JSON.stringify(roto));
  }
  assert.deepEqual(articulosDeOrden({ ...DETALLE, envio: "cuarenta", total: "374.50" }), uno("374.50"));
});
test("artículos: en cualquier combinación, la suma siempre es el total (centavos enteros)", () => {
  // Totales que el flotante da mal y cantidades que no dividen: nunca una lista que no cuadra.
  for (const [r1, n1, r2, n2, envio, propina] of [["19.99", 1, "0.10", 3, "0.20", "0.01"], ["100.00", 3, "33.33", 2, "35.00", "24.00"], ["1392.00", 10, "17.40", 1, null, "139.20"], ["0.01", 1, "0.02", 2, "0.03", null]] as const) {
    const c = (s: string | null) => (s ? Math.round(Number(s) * 100) : 0);
    const total = ((c(r1) + c(r2) + c(envio) + c(propina)) / 100).toFixed(2);
    const a = articulosDeOrden({ descripcion: "Pedido", renglones: [{ nombre: "A", cantidad: n1, total_mxn: r1 }, { nombre: "B", cantidad: n2, total_mxn: r2 }], envio, propina, total });
    assert.equal(suma(a), c(total), JSON.stringify(a));
    assert.ok(a.length > 1, "debía ir desglosado");
    for (const x of a) assert.match(x.unit_price, /^\d+\.\d{2}$/);
  }
});
test("partesDeCotizacion: lee lo de tienda_cotizar; lo ilegible sale vacío (y entonces va un solo artículo)", () => {
  assert.deepEqual(partesDeCotizacion({ items: [{ x: 1 }], renglones: [{ nombre: "Clásica", cantidad: 2, detalle: "Sin cebolla", total_mxn: "278.40" }], subtotal_mxn: "278.40", envio_mxn: "35.00", envio_total_mxn: "40.60", total_mxn: "319.00" }),
    { renglones: [{ nombre: "Clásica", cantidad: 2, total_mxn: "278.40" }], envio: "40.60" });
  for (const mal of [null, undefined, "x", [], { renglones: "no" }]) assert.deepEqual(partesDeCotizacion(mal), { renglones: [], envio: null });
});
test("el nombre: la primera palabra es el nombre y el resto el apellido; una sola palabra, todo en first_name", () => {
  assert.deepEqual(nombreDePagador("Ana Torres"), { first_name: "Ana", last_name: "Torres" });
  assert.deepEqual(nombreDePagador("  Ana   María  Torres López "), { first_name: "Ana", last_name: "María Torres López" });
  assert.deepEqual(nombreDePagador("Ana"), { first_name: "Ana" });
  assert.deepEqual(nombreDePagador("   "), {});
});
test("el teléfono: lada de 2 dígitos solo en CDMX (55, 56), Guadalajara (33) y Monterrey (81); las demás, de 3", () => {
  assert.deepEqual(telefonoDePagador("4771234567"), { area_code: "477", number: "1234567" });
  assert.deepEqual(telefonoDePagador("5512345678"), { area_code: "55", number: "12345678" });
  assert.deepEqual(telefonoDePagador("5612345678"), { area_code: "56", number: "12345678" });
  assert.deepEqual(telefonoDePagador("3312345678"), { area_code: "33", number: "12345678" });
  assert.deepEqual(telefonoDePagador("8112345678"), { area_code: "81", number: "12345678" });
  // 551… no existe como lada de 3: empieza por 55, es CDMX. 818 tampoco: es Monterrey.
  assert.deepEqual(telefonoDePagador("8181234567"), { area_code: "81", number: "81234567" });
  for (const mal of [null, "", "477123456", "47712345678", "477-123-4567", "+524771234567"]) assert.equal(telefonoDePagador(mal), null);
});
test("el cuerpo con el detalle del pedido: descripción, artículos y pagador; el dispositivo NO va en el cuerpo", () => {
  const c = cuerpoDeOrden({ pagoId: PAGO, monto: "374.50", email: "ana@example.com", tarjeta: { ...TARJETA, dispositivo: "armor.1a2b3c4d5e6f" }, detalle: DETALLE });
  assert.deepEqual(c, {
    type: "online", processing_mode: "automatic", config: { online: { transaction_security: { validation: "on_fraud_risk", liability_shift: "required" } } }, total_amount: "374.50", external_reference: PAGO,
    description: "Pedido T1A2B3 en Knock-Out Burger",
    items: [{ title: "Clásica", unit_price: "139.20", quantity: 2 }, { title: "Refresco", unit_price: "30.00", quantity: 1 },
            { title: "Envío", unit_price: "40.60", quantity: 1 }, { title: "Propina", unit_price: "25.50", quantity: 1 }],
    payer: { email: "ana@example.com", first_name: "Ana", last_name: "María Torres López", phone: { area_code: "477", number: "1234567" },
             address: { street_name: "Av. Madero", street_number: "12", zip_code: "37000", city: "León", state: "Guanajuato" } },
    transactions: { payments: [{ amount: "374.50", payment_method: { id: "master", type: "credit_card", token: TARJETA.token, installments: 1 } }] },
  });
  assert.doesNotMatch(JSON.stringify(c), /armor|dispositivo/);
  // Para recoger no hay dirección; sin teléfono legible no hay `phone`.
  const recoger = cuerpoDeOrden({ pagoId: PAGO, monto: "374.50", email: "a@b.mx", tarjeta: TARJETA, detalle: { ...DETALLE, pagador: { nombre: "Ana", telefono: null, direccion: null } } });
  assert.deepEqual(recoger.payer, { email: "a@b.mx", first_name: "Ana" });
  // Los artículos se suman contra el monto QUE SE COBRA (el de la base), no contra otro.
  const otroMonto = cuerpoDeOrden({ pagoId: PAGO, monto: "400.00", email: "a@b.mx", tarjeta: TARJETA, detalle: DETALLE });
  assert.deepEqual(otroMonto.items, [{ title: "Pedido T1A2B3 en Knock-Out Burger", unit_price: "400.00", quantity: 1 }]);
});
test("el cliente HTTP manda la huella en X-Meli-Session-Id, y solo si la hay; la llave de idempotencia no cambia", async () => {
  const vistas: Record<string, string>[] = [];
  const pedir = (async (_url: unknown, init?: RequestInit) => { vistas.push(init?.headers as Record<string, string>); return new Response("{}", { status: 201 }); }) as typeof fetch;
  const mp = clienteMpTienda("TOKEN", pedir);
  await mp.crearOrden({}, "tienda-pago-1", "armor.1a2b3c4d5e6f");
  await mp.crearOrden({}, "tienda-pago-1");
  await mp.crearOrden({}, "tienda-pago-1", null);
  assert.equal(vistas[0]!["X-Meli-Session-Id"], "armor.1a2b3c4d5e6f");
  assert.equal(vistas[0]!["X-Idempotency-Key"], "tienda-pago-1");
  assert.equal("X-Meli-Session-Id" in vistas[1]!, false);
  assert.equal("X-Meli-Session-Id" in vistas[2]!, false);
});
test("sinDatosPersonales: lo que Mercado Pago repita de lo que se le mandó no se escribe; el nombre de la propiedad sí", () => {
  const d = { email: "ana@example.com", tarjeta: { ...TARJETA, dispositivo: "armor.1a2b3c4d5e6f" }, detalle: DETALLE };
  const sucio = "payer.phone.number: '1234567' is not valid | payer.first_name ANA | payer.address.street_name 'Av. Madero' 37000 León | 4771234567 | ana@example.com | armor.1a2b3c4d5e6f | " + TARJETA.token;
  const limpio = sinDatosPersonales(sucio, d);
  for (const dato of ["1234567", "ANA", "Ana", "Madero", "37000", "León", "4771234567", "ana@example.com", "armor", TARJETA.token]) assert.equal(limpio.includes(dato), false, dato);
  for (const propiedad of ["payer.phone.number", "payer.first_name", "payer.address.street_name", "is not valid"]) assert.ok(limpio.includes(propiedad), propiedad);
  // Sin detalle (el cobro de antes) sigue sirviendo.
  assert.equal(sinDatosPersonales("invalid token", { email: "a@b.mx", tarjeta: TARJETA }), "invalid token");
});

// ── La verificación del banco (3D Secure). Respuestas REALES del 12 oct 2026 (documento 04) ───────
const URL_RETO = "https://www.mercadopago.com.mx/auth/card/validation/pages/remedies/5f0c3c6e-1111-4222-8333-444455556666?display_mode=self_hosted&guest_token=9a8b7c6d-aaaa-4bbb-8ccc-ddddeeeeffff";
const conReto = (url: unknown) => ({ ...ORDEN_APROBADA, id: "ORDTST01M4P8RETO", status: "action_required", status_detail: "pending_challenge", total_paid_amount: "0.00",
  transactions: { payments: [{ id: "PAY01M4P8RETO", status: "action_required", status_detail: "pending_challenge",
    payment_method: { id: "master", type: "credit_card", token: TARJETA.token, installments: 1,
                      transaction_security: { id: "5f0c3c6e-1111-4222-8333-444455556666", url, validation: "on_fraud_risk", liability_shift: "required" } } }] } });

test("la orden que espera el reto del banco es PENDIENTE y viva; nunca aprobada ni rechazada", () => {
  const d = decidirOrden(E, conReto(URL_RETO));
  assert.deepEqual(d, { tipo: "PENDIENTE", motivo: "action_required", ordenIdExterno: "ORDTST01M4P8RETO" });
  assert.equal(enReto(conReto(URL_RETO)), true);
  assert.equal(ordenViva(conReto(URL_RETO)), true);
  // No es una orden «atascada» (esas son las `created`): por vieja que sea, esa regla no la cancela.
  assert.equal(ordenAtascada({ ...conReto(URL_RETO), created_date: "2026-10-11T10:00:00.000Z" }, new Date("2026-10-11T18:00:00.000Z")), false);
  for (const o of [ORDEN_APROBADA, ORDEN_EN_REVISION, ORDEN_EN_ANTIFRAUDE, { status: "created" }, null]) assert.equal(enReto(o), false);
});

test("la dirección del reto: solo https y de Mercado Pago; cualquier otra cosa no se abre", () => {
  assert.equal(urlDeReto(conReto(URL_RETO)), URL_RETO);
  for (const mala of [
    "http://www.mercadopago.com.mx/auth/card/validation/pages/remedies/x",          // sin cifrar
    "https://www.mercadopago.com.mx.evil.example/auth/card",                        // otro host que empieza igual
    "https://evil.example/?u=https://www.mercadopago.com.mx/",                      // el host bueno, de adorno
    "https://www.mercadopago.com.mx@evil.example/reto",                             // el host bueno como usuario
    "https://usuario:clave@www.mercadopago.com.mx/reto",                            // con credenciales
    "https://www.mercadopago.com.mx:8443/reto",                                     // otro puerto
    "https://mercadopago.com.mx/reto", "https://www.mercadopago.com/reto",          // parientes que nadie verificó
    "javascript:alert(1)", "data:text/html,<script>1</script>", "//www.mercadopago.com.mx/reto", "", "   ", null, undefined, 7, { href: URL_RETO },
    `https://www.mercadopago.com.mx/${"a".repeat(700)}`,
  ]) assert.equal(urlDeReto(conReto(mala)), null, String(mala).slice(0, 60));
  // La dirección solo se entrega de una orden que SIGUE esperando el reto.
  assert.equal(urlDeReto({ ...conReto(URL_RETO), status: "processed" }), null);
  assert.equal(urlDeReto({ ...conReto(URL_RETO), status: "canceled" }), null);
  assert.equal(urlDeReto({ status: "action_required" }), null);
  assert.equal(urlDeReto(null), null);
});

test("el motivo de un reto: el banco no lo confirmó (VERIFICACION) o nadie lo contestó (SIN_VERIFICAR), y qué cuenta para los topes", () => {
  // VERIFICADO: titular de prueba APRO con 3DS → la orden queda failed y el pago 3ds_challenge_failed.
  const fallida = decidirOrden(E, { ...conReto(undefined), status: "failed", status_detail: "failed",
    transactions: { payments: [{ id: "PAY01M4P8RETO", status: "failed", status_detail: "3ds_challenge_failed",
      payment_method: { id: "master", type: "credit_card", transaction_security: { id: "x", type: "threeds", status: "not_authenticated" } } }] } });
  assert.equal(fallida.tipo === "RECHAZADO" && fallida.detalle, "3ds_challenge_failed");
  assert.equal(motivoDeRechazo("3ds_challenge_failed"), "VERIFICACION");
  assert.equal(motivoDeRechazo("canceled"), "SIN_VERIFICAR");
  assert.equal(motivoDeRechazo("expired"), "SIN_VERIFICAR");
  // Un reto que nadie contestó no es una tarjeta rechazada; el que el banco no confirmó cuenta solo para la IP.
  assert.deepEqual(cuentaComoRechazo("SIN_VERIFICAR"), { cuenta: false, soloIp: false });
  assert.deepEqual(cuentaComoRechazo("VERIFICACION"), { cuenta: true, soloIp: true });
  for (const m of ["FONDOS", "DATOS", "LLAMAR_BANCO", "TARJETA_DESHABILITADA", "RIESGO", "OTRO"] as const) assert.deepEqual(cuentaComoRechazo(m), { cuenta: true, soloIp: false }, m);
});

test("aprobada tras el reto (VERIFICADO: authenticated y ya sin dirección): se aprueba como cualquier otra", () => {
  const d = decidirOrden(E, { ...ORDEN_APROBADA, transactions: { payments: [{ ...ORDEN_APROBADA.transactions.payments[0],
    payment_method: { id: "master", type: "credit_card", transaction_security: { id: "x", type: "threeds", status: "authenticated", validation: "on_fraud_risk", liability_shift: "required" } } }] } });
  assert.equal(d.tipo, "APROBADO");
});

// ── Modo de prueba y freno (0178) ───────────────────────────────────────────────────────────────
test("el pagador de prueba solo vale si es un usuario de prueba de Mercado Pago (…@testuser.com)", () => {
  assert.equal(pagadorDePrueba("test_user_3753760462@testuser.com"), "test_user_3753760462@testuser.com");
  assert.equal(pagadorDePrueba("  Test_User_3753760462@TestUser.com \n"), "test_user_3753760462@testuser.com");
  // El correo de una persona, o cualquier otra cosa, es como si no estuviera: nunca se manda en lugar del del cliente.
  for (const v of [undefined, null, "", "   ", "fermin@gmail.com", "test_user@testuser.com.mx", "@testuser.com", "a b@testuser.com", "test_user_1@testuser.com,otro@x.com", "testuser.com"]) {
    assert.equal(pagadorDePrueba(v), null, String(v));
  }
});

test("el motivo que frena desde la base (0178) es el mismo que aquí es RIESGO", () => {
  // El disparador de la 0178 mira el motivo tal como lo guarda tienda_pago_aplicar; si un día cambia
  // el nombre aquí o allá, el freno del rechazo tardío dejaría de ponerse sin que nada lo diga.
  const sql = readFileSync(new URL("../../../migrations/0178_tienda_modo_de_prueba_y_freno.sql", import.meta.url), "utf8");
  const motivo = /NEW\.detalle = '([a-z_0-9]+)'/.exec(sql)?.[1];
  assert.equal(motivo, "high_risk");
  assert.equal(motivoDeRechazo(motivo), "RIESGO");
  // Y es el único motivo de esa familia: no hay otro por el que debiera frenar.
  for (const m of ["insufficient_amount", "bad_filled_card_data", "required_call_for_authorize", "card_disabled", "3ds_challenge_failed", "canceled", "expired", "rejected_by_issuer"]) {
    assert.notEqual(motivoDeRechazo(m), "RIESGO", m);
  }
});

// ── Envío por distancia (0179): el envío que va a Mercado Pago es el que calculó la base ─────────
test("artículos: con la cotización por distancia, el envío del tramo entra y la suma cuadra con el total", () => {
  const q = { renglones: [{ nombre: "Sencilla", cantidad: 2, detalle: null, total_mxn: "240.00" }], subtotal_mxn: "240.00",
              envio_mxn: "35.00", envio_total_mxn: "40.60", total_mxn: "280.60", cobro: "DISTANCIA", distancia_km: "3.2", zona_id: "z" };
  const partes = partesDeCotizacion(q);
  assert.equal(partes.envio, "40.60");
  const a = articulosDeOrden({ descripcion: "Pedido T1", ...partes, propina: "24.00", total: "304.60" });
  assert.deepEqual(a.map((x) => x.title), ["Sencilla", "Envío", "Propina"]);
  assert.equal(a.find((x) => x.title === "Envío")?.unit_price, "40.60");
});
