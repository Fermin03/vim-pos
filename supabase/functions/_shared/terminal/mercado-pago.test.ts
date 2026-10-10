import { test } from "node:test";
import assert from "node:assert/strict";
import { aceptaCambio, cambiosDeCobro, clienteMp, datosDeOrden, estadoDeOrden, firmaValida, montoTexto } from "./mercado-pago.ts";
import { hmacSha256Hex } from "../delivery/firma.ts";

// Respuesta real de GET /v1/orders/{id} en la cuenta de prueba (9 oct 2026).
const ORDEN_PAGADA = {
  id: "ORDTST01M4HN4WJ2Q0VCVQSGNV5TEE24", type: "point", external_reference: "2cd9e6fa-1acf-47dc-8ba4-cba918d73770",
  total_paid_amount: "12.50", status: "processed", status_detail: "accredited",
  transactions: { payments: [{ id: "PAY01M4HN4WJQ6JQ5N2QEQRWQ9H1V", amount: "12.50", paid_amount: "12.50",
    reference_id: "1234567890", status: "processed", payment_method: { id: "visa", type: "credit_card", installments: 1 } }] },
};

test("una order pagada se lee completa", () => {
  assert.deepEqual(datosDeOrden(ORDEN_PAGADA), {
    estado: "APROBADO", detalle: "accredited", cobro_id: "2cd9e6fa-1acf-47dc-8ba4-cba918d73770",
    orden_id_externo: "ORDTST01M4HN4WJ2Q0VCVQSGNV5TEE24", pago_id_externo: "PAY01M4HN4WJQ6JQ5N2QEQRWQ9H1V",
    tipo_tarjeta: "credit_card", marca: "visa", mensualidades: 1, referencia: "1234567890",
    pagado_mxn: "12.50", reembolsado_mxn: null,
  });
});

test("el `data` de un aviso no trae id y manda la referencia como reference.id", () => {
  const d = datosDeOrden({ external_reference: "abc", status: "processed", status_detail: "accredited", total_paid_amount: "20.00",
    transactions: { payments: [{ id: "PAY1", reference: { id: "777" }, payment_method: { id: "debvisa", type: "debit_card", installments: 1 } }] } }, "ORD9");
  assert.equal(d.orden_id_externo, "ORD9");
  assert.equal(d.referencia, "777");
  assert.equal(d.tipo_tarjeta, "debit_card");
});

test("un estado desconocido nunca cuenta como aprobado", () => {
  assert.equal(estadoDeOrden("created"), "EN_TERMINAL");
  assert.equal(estadoDeOrden("action_required"), "REVISAR");
  assert.equal(estadoDeOrden("algo_nuevo"), "REVISAR");
  assert.equal(estadoDeOrden(undefined), "REVISAR");
});

test("el monto es texto con dos decimales o no es", () => {
  assert.equal(montoTexto("348"), "348.00");
  assert.equal(montoTexto("10.5"), "10.50");
  assert.equal(montoTexto(12.5), "12.50");
  for (const malo of ["0", "-5", "1.234", "1e3", "", "abc", null, undefined, "12,50"]) assert.equal(montoTexto(malo), null);
});

test("la firma del aviso se valida contra el manifiesto y falla con cualquier cambio", async () => {
  const secreto = "s3creto";
  const v1 = await hmacSha256Hex(secreto, "id:ordtst01;request-id:req-1;ts:1700000000;");
  const base = { firma: `ts=1700000000,v1=${v1}`, requestId: "req-1", dataId: "ORDTST01", secreto };
  assert.equal(await firmaValida(base), true);
  assert.equal(await firmaValida({ ...base, dataId: "ORDTST02" }), false);
  assert.equal(await firmaValida({ ...base, secreto: "otro" }), false);
  assert.equal(await firmaValida({ ...base, firma: null }), false);
  assert.equal(await firmaValida({ ...base, secreto: "" }), false);
});

test("crear la order manda el id del cobro como referencia y como llave de idempotencia", async () => {
  let visto: { url: string; init: RequestInit } | null = null;
  const falso = ((url: string, init: RequestInit) => {
    visto = { url, init };
    return Promise.resolve(new Response(JSON.stringify({ errors: [{ code: "already_queued_order_for_terminal" }] }), { status: 409 }));
  }) as unknown as typeof fetch;
  const r = await clienteMp("tok", falso).crearOrden(
    { cobroId: "c-1", monto: "348.00", terminalId: "T__1", descripcion: "A-12", esperaSeg: 180, imprime: false });
  const cuerpo = JSON.parse(String(visto!.init.body));
  assert.equal(visto!.url, "https://api.mercadopago.com/v1/orders");
  assert.equal((visto!.init.headers as Record<string, string>)["X-Idempotency-Key"], "c-1");
  assert.equal(cuerpo.external_reference, "c-1");
  assert.equal(cuerpo.transactions.payments[0].amount, "348.00");
  assert.equal(cuerpo.expiration_time, "PT180S");
  assert.equal(cuerpo.config.point.print_on_terminal, "no_ticket");
  assert.deepEqual([r.status, r.codigo], [409, "already_queued_order_for_terminal"]);
});

test("un cobro pagado no se despaga con un aviso viejo", () => {
  assert.equal(aceptaCambio("EN_TERMINAL", "APROBADO"), true);
  assert.equal(aceptaCambio("CANCELADO", "APROBADO"), true); // se canceló tarde: el cliente ya había pagado
  assert.equal(aceptaCambio("APROBADO", "CANCELADO"), false);
  assert.equal(aceptaCambio("APROBADO", "VENCIDO"), false);
  assert.equal(aceptaCambio("APROBADO", "DEVUELTO"), true);
  assert.equal(aceptaCambio("DEVUELTO", "APROBADO"), false);
});

test("los cambios del cobro no pisan con null lo que ya se sabía", () => {
  const c = cambiosDeCobro(datosDeOrden({ status: "canceled", status_detail: "canceled_by_api" }));
  assert.deepEqual(c, { estado: "CANCELADO", detalle: "canceled_by_api" });
});
