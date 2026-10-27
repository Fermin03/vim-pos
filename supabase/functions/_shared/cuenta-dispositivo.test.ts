import { test } from "node:test";
import assert from "node:assert/strict";
import { generarCodigo, normalizarCodigo } from "./cuenta-dispositivo.ts";

test("el código tiene 6 caracteres sin los que se confunden al dictarlo", () => {
  for (let i = 0; i < 500; i++) {
    const c = generarCodigo();
    assert.match(c, /^[A-HJKMNP-Z2-9]{6}$/);
    assert.equal(normalizarCodigo(c), c);
  }
});

test("se acepta el código como lo teclea una persona", () => {
  assert.equal(normalizarCodigo("k7m-4qx"), "K7M4QX");
  assert.equal(normalizarCodigo(" K7M 4QX "), "K7M4QX");
});

test("lo que no puede ser un código no llega a la base", () => {
  for (const malo of ["", "K7M4Q", "K7M4QXZ", "K7M4Q0", "K7M4Q1", null, undefined, 123456, "K7M'4Q"]) {
    assert.equal(normalizarCodigo(malo), null, String(malo));
  }
});
