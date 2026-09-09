// Pruebas del ritmo del espejo: qué tanto espera la caja entre sondeos.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cadenciaAceptada, esperaEspejo, MIN_MS, MAX_MS, CADENCIA_POR_DEFECTO, TOPE_BACKOFF_MS,
} from "./delivery-espejo-ritmo.mjs";

// Sin desvío: 0.5 cae justo en medio del rango del jitter.
const centro = () => 0.5;

test("sin fallos ni pendientes, la caja obedece la cadencia del servidor", () => {
  assert.equal(esperaEspejo({ cadencia: 30_000, aleatorio: centro }), 30_000);
});

test("cada fallo seguido duplica la espera", () => {
  assert.equal(esperaEspejo({ cadencia: 30_000, fallos: 1, aleatorio: centro }), 60_000);
  assert.equal(esperaEspejo({ cadencia: 30_000, fallos: 2, aleatorio: centro }), 120_000);
});

test("el backoff topa a los 5 minutos: una nube caída no deja la caja ciega media hora", () => {
  assert.equal(esperaEspejo({ cadencia: 30_000, fallos: 99, aleatorio: centro }), TOPE_BACKOFF_MS);
});

test("con trabajo pendiente la caja no espera más de 10 s aunque el servidor pida reposo", () => {
  assert.equal(esperaEspejo({ cadencia: 300_000, pendiente: true, aleatorio: centro }), 10_000);
});

test("con trabajo pendiente respeta una cadencia aún más rápida del servidor", () => {
  assert.equal(esperaEspejo({ cadencia: 5_000, pendiente: true, aleatorio: centro }), 5_000);
});

test("el jitter separa a la flota: ±10% alrededor de la cadencia", () => {
  assert.equal(esperaEspejo({ cadencia: 30_000, aleatorio: () => 0 }), 27_000);
  assert.equal(esperaEspejo({ cadencia: 30_000, aleatorio: () => 1 }), 33_000);
});

test("el jitter también se aplica al backoff, para que los reintentos no coincidan", () => {
  assert.equal(esperaEspejo({ cadencia: 30_000, fallos: 1, aleatorio: () => 0 }), 54_000);
});

test("una cadencia sana del servidor se acepta tal cual", () => {
  assert.equal(cadenciaAceptada(30_000), 30_000);
});

test("una cadencia fuera de rango se acota en vez de obedecerse", () => {
  assert.equal(cadenciaAceptada(1), MIN_MS);
  assert.equal(cadenciaAceptada(99_999_999), MAX_MS);
});

test("una cadencia que no es número cae al valor por defecto: un servidor viejo no rompe el espejo", () => {
  for (const basura of [undefined, null, "pronto", NaN, Infinity, -5, {}]) {
    assert.equal(cadenciaAceptada(basura), CADENCIA_POR_DEFECTO, `con ${String(basura)}`);
  }
});
