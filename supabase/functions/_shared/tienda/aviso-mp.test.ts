import { test } from "node:test";
import assert from "node:assert/strict";
import { ordenDelAviso } from "./aviso-mp.ts";
import { firmaValida } from "../terminal/mercado-pago.ts";
import { hmacSha256Hex } from "../delivery/firma.ts";

const PAGO = "2cd9e6fa-1acf-47dc-8ba4-cba918d73770";
const ORDEN = "ORDTST01M4P8JX8C82XV8G7EB2A16YAC";
const AVISO = { action: "order.processed", type: "order", data: { external_reference: PAGO, status: "processed", status_detail: "accredited", total_paid_amount: "138.00" } };

test("de un aviso de orden salen la orden (de la query) y nuestra referencia; nada más", () => {
  assert.deepEqual(ordenDelAviso(AVISO, ORDEN), { accion: "order.processed", ordenIdExterno: ORDEN, ref: PAGO });
  // El id dentro de `data` gana si viene; la referencia se compara en minúsculas.
  assert.deepEqual(ordenDelAviso({ ...AVISO, data: { ...AVISO.data, id: "ORDOTRA", external_reference: PAGO.toUpperCase() } }, ORDEN),
    { accion: "order.processed", ordenIdExterno: "ORDOTRA", ref: PAGO });
  // Sin referencia, o con una que no es nuestra: sigue siendo una pista de qué orden mirar.
  assert.deepEqual(ordenDelAviso({ action: "order.refunded", data: {} }, ORDEN), { accion: "order.refunded", ordenIdExterno: ORDEN, ref: null });
  assert.equal(ordenDelAviso({ action: "order.processed", data: { external_reference: "no-es-uuid" } }, ORDEN)?.ref, null);
});

test("lo que no es un aviso de orden, o no dice de cuál, no es para nosotros", () => {
  for (const cuerpo of [null, [], "x", {}, { action: "payment.created", data: AVISO.data }, { type: "order", data: AVISO.data }, { action: 7 }]) {
    assert.equal(ordenDelAviso(cuerpo, ORDEN), null, JSON.stringify(cuerpo));
  }
  assert.equal(ordenDelAviso(AVISO, null), null);
  assert.equal(ordenDelAviso(AVISO, "con espacio"), null);
  assert.equal(ordenDelAviso(AVISO, "x".repeat(65)), null);
});

test("la firma del aviso es la de Mercado Pago, con la clave de la aplicación de la TIENDA; sin firma o con otra clave no vale", async () => {
  const secreto = "clave-de-la-aplicacion-de-la-tienda", ts = "1760200000", requestId = "req-1";
  const v1 = await hmacSha256Hex(secreto, `id:${ORDEN.toLowerCase()};request-id:${requestId};ts:${ts};`);
  const e = { firma: `ts=${ts},v1=${v1}`, requestId, dataId: ORDEN };
  assert.equal(await firmaValida({ ...e, secreto }), true);
  assert.equal(await firmaValida({ ...e, secreto: "la-clave-de-la-terminal" }), false);
  assert.equal(await firmaValida({ ...e, firma: null, secreto }), false);
  assert.equal(await firmaValida({ ...e, dataId: "ORDOTRA", secreto }), false);
  assert.equal(await firmaValida({ ...e, secreto: "" }), false);
});
