import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMA_EN_LINEA_POR_OMISION, formaPagoDeAutofactura, formaPagoEnLinea } from "./forma-pago.ts";

test("pago en línea: crédito es 04 y débito es 28", () => {
  assert.equal(formaPagoEnLinea("credit_card"), "04");
  assert.equal(formaPagoEnLinea("debit_card"), "28");
});

test("pago en línea con saldo de Mercado Pago, prepago o sin dato: la clave por omisión, nunca efectivo", () => {
  for (const tipo of ["account_money", "prepaid_card", "", null, undefined, "algo_nuevo"]) {
    assert.equal(formaPagoEnLinea(tipo), FORMA_EN_LINEA_POR_OMISION, String(tipo));
    assert.notEqual(formaPagoEnLinea(tipo), "01");
    assert.notEqual(formaPagoEnLinea(tipo), "99", "99 no vale con PUE");
  }
});

test("autofactura: un ticket que no se pagó en línea sigue saliendo como siempre", () => {
  assert.equal(formaPagoDeAutofactura(false, null), "01");
  assert.equal(formaPagoDeAutofactura(false, "credit_card"), "01");
  assert.equal(formaPagoDeAutofactura(true, "credit_card"), "04");
  assert.equal(formaPagoDeAutofactura(true, "debit_card"), "28");
  assert.equal(formaPagoDeAutofactura(true, null), FORMA_EN_LINEA_POR_OMISION);
});
