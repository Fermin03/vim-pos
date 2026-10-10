import { test } from "node:test";
import assert from "node:assert/strict";
import { codigoDeClave, esCodigo, huellaDe, nuevoCodigo } from "./seguimiento.ts";

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

// ── Entrega 7: el código derivado de la llave de un intento de compra ───────────────────────────
const CLAVE = "A".repeat(22);
test("codigoDeClave: vector fijo — base64url de HMAC-SHA256(secreto, «slug:clave») recortado a 22", async () => {
  // Calculado aparte con openssl:
  //   printf 'knockout:AAAAAAAAAAAAAAAAAAAAAA' | openssl dgst -sha256 -hmac 'secreto-de-prueba' -binary | openssl base64
  assert.equal(await codigoDeClave("secreto-de-prueba", "knockout", CLAVE), "JaRFl27jzB0OHRDaskTLud");
});
test("codigoDeClave: es determinista y tiene la forma de un código", async () => {
  const a = await codigoDeClave("s3creto", "knockout", CLAVE);
  assert.equal(a, await codigoDeClave("s3creto", "knockout", CLAVE));
  assert.equal(esCodigo(a), true);
});
test("codigoDeClave: otro slug, otra clave u otro secreto dan otro código", async () => {
  const a = await codigoDeClave("s3creto", "knockout", CLAVE);
  assert.notEqual(a, await codigoDeClave("s3creto", "crazy-burgers", CLAVE));
  assert.notEqual(a, await codigoDeClave("s3creto", "knockout", "B".repeat(22)));
  assert.notEqual(a, await codigoDeClave("otro", "knockout", CLAVE));
});
test("codigoDeClave: sin secreto no hay código (sería adivinable)", async () => {
  await assert.rejects(codigoDeClave("", "knockout", CLAVE));
});
