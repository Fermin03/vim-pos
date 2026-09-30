import test from "node:test";
import assert from "node:assert/strict";
import { aCentavos, accesoAlTicket, calcularTokenAutofactura, igualesSeguro, normalizarToken } from "./acceso-ticket.ts";

const hex = (h: string) => new Uint8Array(h.match(/../g)!.map((b) => parseInt(b, 16)));

test("HMAC-SHA256: mismo resultado que autofactura_token() en SQL (vector fijo)", async () => {
  // Calculado en Postgres con _vim_hmac_sha256 (0135), que a su vez pasa la RFC 4231 en pgTAP 0020.
  const t = await calcularTokenAutofactura(hex("0b".repeat(32)), "11111111-2222-3333-4444-555555555555");
  assert.equal(t, "oHXZ0mOEW2qggLEN");
  assert.match(t, /^[A-Za-z0-9_-]{16}$/);
});

test("HMAC-SHA256: RFC 4231 caso 2 (el algoritmo es el estándar)", async () => {
  const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode("Jefe"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", llave, new TextEncoder().encode("what do ya want for nothing?")));
  assert.equal(Buffer.from(firma).toString("hex"), "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
});

// Tokens de ejemplo de baja entropía a propósito: son datos de prueba, y un valor con cara de
// secreto hace saltar a los escáneres (GitGuardian) sin proteger nada.
test("token: solo 16 caracteres base64url", () => {
  assert.equal(normalizarToken(" AAAAAAAAAAAAAAAA "), "AAAAAAAAAAAAAAAA");
  assert.equal(normalizarToken("AAAAAAAAAAAAAAA"), null);
  assert.equal(normalizarToken("AAAAAAAAAAAAAAA+"), null);
  assert.equal(normalizarToken(undefined), null);
  assert.equal(normalizarToken(12), null);
});

test("total a centavos, sin float en la comparación", () => {
  assert.equal(aCentavos("$1,234.50"), 123450);
  assert.equal(aCentavos("1234.5"), 123450);
  assert.equal(aCentavos("120"), 12000);
  assert.equal(aCentavos(0.1 + 0.2), 30);
  assert.equal(aCentavos("12.345"), null);
  assert.equal(aCentavos("-5"), null);
  assert.equal(aCentavos("abc"), null);
  assert.equal(aCentavos(""), null);
  assert.equal(aCentavos(null), null);
});

test("acceso: token correcto basta; incorrecto o ausente exige el total exacto", () => {
  const base = { tokenEsperado: "AAAAAAAAAAAAAAAA", totalTicketMxn: 186.5 };
  assert.equal(accesoAlTicket({ ...base, tokenRecibido: "AAAAAAAAAAAAAAAA", totalRecibidoCentavos: null }), true);
  assert.equal(accesoAlTicket({ ...base, tokenRecibido: "AAAAAAAAAAAAAAAB", totalRecibidoCentavos: null }), false);
  assert.equal(accesoAlTicket({ ...base, tokenRecibido: null, totalRecibidoCentavos: null }), false);
  assert.equal(accesoAlTicket({ ...base, tokenRecibido: null, totalRecibidoCentavos: 18650 }), true);
  assert.equal(accesoAlTicket({ ...base, tokenRecibido: null, totalRecibidoCentavos: 18600 }), false);
  // QR de una caja sin secreto (token nulo en la base) + total correcto: pasa.
  assert.equal(accesoAlTicket({ tokenEsperado: null, totalTicketMxn: "99.90", tokenRecibido: "AAAAAAAAAAAAAAAA", totalRecibidoCentavos: 9990 }), true);
  // Sin secreto en la base, un token cualquiera NO vale por sí solo.
  assert.equal(accesoAlTicket({ tokenEsperado: null, totalTicketMxn: 99.9, tokenRecibido: "AAAAAAAAAAAAAAAA", totalRecibidoCentavos: null }), false);
});

test("comparación segura", () => {
  assert.equal(igualesSeguro("abc", "abc"), true);
  assert.equal(igualesSeguro("abc", "abd"), false);
  assert.equal(igualesSeguro("abc", "abcd"), false);
});
