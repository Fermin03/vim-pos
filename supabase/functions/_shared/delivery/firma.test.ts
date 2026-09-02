import test from "node:test";
import assert from "node:assert/strict";
import { hmacSha256Hex, igualesEnTiempoConstante } from "./firma.ts";

test("HMAC-SHA256 hex en minúsculas, igual que el ejemplo de Uber (hmac.new(secret, body, sha256).hexdigest())", async () => {
  // Vector conocido: HMAC_SHA256("key", "The quick brown fox jumps over the lazy dog")
  const h = await hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog");
  assert.equal(h, "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
});

test("comparación en tiempo constante: iguales → true, distinta longitud o contenido → false", () => {
  assert.equal(igualesEnTiempoConstante("abc", "abc"), true);
  assert.equal(igualesEnTiempoConstante("abc", "abd"), false);
  assert.equal(igualesEnTiempoConstante("abc", "ab"), false);
});
