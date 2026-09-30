import test from "node:test";
import assert from "node:assert/strict";
import { resolverEmisorVerificado } from "./emisor.ts";

test("sin RFC verificado no se timbra, diga lo que diga la configuración", () => {
  const r = resolverEmisorVerificado(null, ["AAA010101AAA"]);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.error, "SIN_SELLO_VERIFICADO");
  assert.equal(resolverEmisorVerificado("  ", []).ok, false);
});

test("el RFC con que se timbra es el verificado, normalizado", () => {
  assert.deepEqual(resolverEmisorVerificado(" aaa010101aaa ", ["AAA010101AAA", "aaa010101aaa", null, ""]), {
    ok: true,
    rfc: "AAA010101AAA",
  });
});

test("un RFC declarado distinto del verificado se rechaza (suplantación o dato desfasado)", () => {
  const r = resolverEmisorVerificado("AAA010101AAA", ["AAA010101AAA", "VIC010101VIC"]);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.error, "EMISOR_NO_COINCIDE");
  assert.match(!r.ok ? r.mensaje : "", /VIC010101VIC/);
});
