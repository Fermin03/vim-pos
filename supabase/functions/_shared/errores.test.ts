import { test } from "node:test";
import assert from "node:assert/strict";
import { textoDeError } from "./errores.ts";

// Un error de PostgREST trae en `details` los valores de la fila (un 23505 con el teléfono de la
// clienta, por ejemplo). Al log va solo `message`.
test("textoDeError: solo el mensaje; ni details ni hint", () => {
  const e = { code: "23505", message: "duplicate key value violates unique constraint \"x\"", details: "Key (telefono)=(4771112233) already exists.", hint: "pista" };
  assert.equal(textoDeError(e), e.message);
  assert.equal(textoDeError(new Error("m")), "m");
});
