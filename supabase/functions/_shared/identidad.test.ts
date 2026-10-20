import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { bearerDe, claimsDe, esColaboradorWeb, tenantDeClaims, tenantDelToken } from "./identidad.ts";

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

test("la sesión web del colaborador (role colaborador_web, 0228) no tiene negocio para las funciones", () => {
  const colaborador = { sub: "u", role: "colaborador_web", tenant_id: T, tipo_identidad: "EMPLEADO", session_id: "s" };
  assert.equal(esColaboradorWeb(colaborador), true);
  assert.equal(tenantDeClaims(colaborador), null);
  assert.equal(tenantDelToken(jwt(colaborador)), null);
  // La caja (pin-login), el dispositivo y el panel siguen igual.
  assert.equal(tenantDelToken(jwt({ sub: "u", role: "authenticated", tenant_id: T, tipo_identidad: "EMPLEADO" })), T);
  assert.equal(tenantDelToken(jwt({ sub: "d", role: "authenticated", tenant_id: T, tipo_identidad: "DISPOSITIVO", session_id: "s" })), T);
  assert.equal(esColaboradorWeb({ role: "authenticated" }), false);
});

test("servir rechaza al colaborador web antes de cualquier manejador", () => {
  const http = readFileSync(new URL("./http.ts", import.meta.url), "utf8");
  const gate = http.indexOf("esColaboradorWeb(claimsDe(bearerDe(req)))");
  assert.ok(gate > 0 && gate < http.indexOf("return manejar(req, json)"), "servir debe revisar el rol antes de llamar al manejador");
});

test("toda función que lee el token del llamante pasa por servir (terminal-cobro, delivery-accion, lealtad-canje y las demás)", () => {
  const raiz = new URL("../", import.meta.url);
  const sinServir: string[] = [];
  const conToken: string[] = [];
  for (const d of readdirSync(raiz)) {
    const f = new URL(`./${d}/index.ts`, raiz);
    if (d.startsWith("_") || !existsSync(f)) continue;
    const src = readFileSync(f, "utf8");
    if (!/getUser|claimsDe|tenantDelToken|bearerDe/.test(src)) continue;
    conToken.push(d);
    if (!/\bservir\(/.test(src)) sinServir.push(d);
  }
  for (const nombrada of ["terminal-cobro", "delivery-accion", "lealtad-canje"]) assert.ok(conToken.includes(nombrada), nombrada);
  assert.deepEqual(sinServir, []);
});
