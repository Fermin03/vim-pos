import { test } from "node:test";
import assert from "node:assert/strict";
import { bearerDe, claimsDe, tenantDeClaims, tenantDelToken } from "./identidad.ts";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims: unknown) => `${b64url({ alg: "HS256" })}.${b64url(claims)}.firma`;
const T = "99999999-0000-0000-0000-0000000000aa";

test("el tenant sale del claim tenant_id del token (C2-6)", () => {
  assert.equal(tenantDelToken(jwt({ sub: "u", tenant_id: T, tipo_identidad: "ADMIN_WEB" })), T);
  assert.equal(tenantDelToken(jwt({ sub: "u", tenant_id: T.toUpperCase() })), T);
});

test("sin tenant_id, o con uno que no es uuid, no hay tenant", () => {
  assert.equal(tenantDelToken(jwt({ sub: "u" })), null);
  assert.equal(tenantDelToken(jwt({ tenant_id: "' or 1=1 --" })), null);
  assert.equal(tenantDeClaims({ tenant_id: 42 }), null);
  assert.equal(tenantDelToken("no-es-un-jwt"), null);
});

test("claimsDe tolera base64url sin relleno y payloads que no son objeto", () => {
  // Longitudes que obligan a rellenar con 1 y 2 '='.
  for (const extra of ["a", "ab", "abc"]) {
    assert.equal(claimsDe(jwt({ tenant_id: T, x: extra })).tenant_id, T);
  }
  assert.deepEqual(claimsDe(`h.${Buffer.from("[1,2]").toString("base64url")}.f`), {});
});

test("bearerDe", () => {
  assert.equal(bearerDe(new Request("http://x", { headers: { Authorization: "Bearer abc" } })), "abc");
  assert.equal(bearerDe(new Request("http://x")), "");
});
