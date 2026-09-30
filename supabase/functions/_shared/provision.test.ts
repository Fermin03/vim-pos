import { test } from "node:test";
import assert from "node:assert/strict";
import { cabeceraDeModo, igualSeguro, modoProvision } from "./provision.ts";

test("con PROVISION_INTERNAL_SECRET configurado, la clave compartida ya no sirve (C2-7)", () => {
  const modo = modoProvision({ interno: "s3cr3t", legado: "clave-del-arranque" });
  assert.equal(modo, "interno");
  assert.equal(cabeceraDeModo(modo), "x-vim-provision");
});

test("transición: sin el secreto nuevo, modo legado con X-Platform-Key", () => {
  assert.equal(modoProvision({ interno: "", legado: "k" }), "legado");
  assert.equal(modoProvision({ interno: "   ", legado: "k" }), "legado");
  assert.equal(cabeceraDeModo("legado"), "x-platform-key");
});

test("sin ningún secreto, deshabilitado (fail-closed)", () => {
  assert.equal(modoProvision({}), "deshabilitado");
  assert.equal(cabeceraDeModo("deshabilitado"), null);
});

test("igualSeguro: igual, distinto, espacios al pegar, y nunca contra un secreto vacío", async () => {
  assert.equal(await igualSeguro("abc", "abc"), true);
  assert.equal(await igualSeguro("abc\n", " abc"), true);
  assert.equal(await igualSeguro("abd", "abc"), false);
  assert.equal(await igualSeguro("", ""), false);
});
