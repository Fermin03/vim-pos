import test from "node:test";
import assert from "node:assert/strict";
import { normalizarFechaPac, ZONA_PAC } from "./fechas.ts";

test("hora local sin zona (lo que manda Facturama) → se le pone la de México", () => {
  assert.equal(normalizarFechaPac("2026-09-03T16:34:41"), "2026-09-03T16:34:41" + ZONA_PAC);
  assert.equal(new Date(normalizarFechaPac("2026-09-03T16:34:41")).toISOString(), "2026-09-03T22:34:41.000Z");
});

test("con zona se respeta tal cual", () => {
  assert.equal(normalizarFechaPac("2026-09-03T22:34:41Z"), "2026-09-03T22:34:41Z");
  assert.equal(normalizarFechaPac("2026-09-03T16:34:41-06:00"), "2026-09-03T16:34:41-06:00");
  assert.equal(normalizarFechaPac("2026-09-03T16:34:41.123+0000"), "2026-09-03T16:34:41.123+0000");
});

test("vacío → ahora", () => {
  assert.equal(normalizarFechaPac(undefined, () => "AHORA"), "AHORA");
  assert.equal(normalizarFechaPac("  ", () => "AHORA"), "AHORA");
});

test("forma desconocida no se inventa", () => {
  assert.equal(normalizarFechaPac("03/09/2026 16:34"), "03/09/2026 16:34");
});
