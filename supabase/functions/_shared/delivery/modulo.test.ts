import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCIONES_TIENDA, accionExigeModulo, moduloDeliveryActivo } from "./modulo.ts";

test("las cuatro acciones de tienda exigen el módulo", () => {
  for (const a of ACCIONES_TIENDA) assert.equal(accionExigeModulo(a), true, a);
  assert.equal(ACCIONES_TIENDA.length, 4);
});

test("las acciones de pedido NO exigen el módulo: hay que poder despachar lo ya vendido", () => {
  for (const a of ["aceptar", "rechazar", "listo", "reclamar", "cancelar", "ticket"]) {
    assert.equal(accionExigeModulo(a), false, a);
  }
});

test("una acción ausente o desconocida no exige módulo: la valida quien la despacha", () => {
  assert.equal(accionExigeModulo(undefined), false);
  assert.equal(accionExigeModulo(""), false);
  assert.equal(accionExigeModulo("tienda_"), false);
});

test("el módulo está activo solo con efectivos.delivery_apps === true", () => {
  assert.equal(moduloDeliveryActivo({ efectivos: { delivery_apps: true } }), true);
  assert.equal(moduloDeliveryActivo({ efectivos: { delivery_apps: false } }), false);
});

test("fail-closed: sin respuesta del RPC, sin módulo", () => {
  // Si `modulos_efectivos` falla o no devuelve fila, supabase-js deja `data` en null. Bloquear es
  // lo correcto: dejar pasar por un error de lectura es justo el trabajo que la entrega quita.
  assert.equal(moduloDeliveryActivo(null), false);
  assert.equal(moduloDeliveryActivo(undefined), false);
  assert.equal(moduloDeliveryActivo({}), false);
  assert.equal(moduloDeliveryActivo({ efectivos: {} }), false);
  assert.equal(moduloDeliveryActivo({ permitidos: { delivery_apps: true } }), false);
});

test("permitido no basta: el dueño también tuvo que encenderlo", () => {
  // La asimetría de ADR 0014: el admin se guía por `permitidos`; el POS y la caja, por `efectivos`.
  const soloPermitido = { permitidos: { delivery_apps: true }, efectivos: { delivery_apps: false } };
  assert.equal(moduloDeliveryActivo(soloPermitido), false);
});
