import { test } from "node:test";
import assert from "node:assert/strict";
import { esCodigo, huellaDe, nuevoCodigo } from "./seguimiento.ts";

test("el código tiene 22 caracteres base64url y no se repite", () => {
  const a = nuevoCodigo(), b = nuevoCodigo();
  assert.match(a, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(a, b);
  assert.equal(esCodigo(a), true);
});
test("esCodigo rechaza lo que no tiene la forma", () => {
  for (const x of ["", "corto", "a".repeat(23), "con espacio aaaaaaaaaaaa", null, 5]) assert.equal(esCodigo(x), false);
});
test("la huella es el SHA-256 en hex minúsculas", async () => {
  assert.equal(await huellaDe("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.match(await huellaDe(nuevoCodigo()), /^[0-9a-f]{64}$/);
});
