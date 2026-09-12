// Pruebas de la puerta del espejo: si el módulo de apps de delivery está encendido.
import { test } from "node:test";
import assert from "node:assert/strict";
import { debeSondearApps } from "./delivery-espejo-modulo.mjs";

test("el espejo solo arranca con el módulo encendido", () => {
  assert.equal(debeSondearApps({ modulos: { delivery_apps: true } }), true);
  assert.equal(debeSondearApps({ modulos: { delivery_apps: false } }), false);
  assert.equal(debeSondearApps({ modulos: {} }), false);
});

test("sin directivas todavía, NO arranca", () => {
  // Arrancar por defecto contradiría el propósito: la caja de un cliente sin delivery sondearía
  // hasta el primer latido, que puede tardar 10 minutos o no llegar nunca si no hay nube.
  assert.equal(debeSondearApps(null), false);
  assert.equal(debeSondearApps(undefined), false);
});
