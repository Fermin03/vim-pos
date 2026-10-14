import { test } from "node:test";
import assert from "node:assert/strict";
import { cifrarCodigo, descifrarCodigo } from "./enlace.ts";
import { huellaDe, nuevoCodigo } from "./seguimiento.ts";

const SECRETO = "secreto-de-prueba-de-la-tienda";

test("lo cifrado vuelve a ser el código, y cabe en la columna", async () => {
  const codigo = nuevoCodigo(), huella = await huellaDe(codigo);
  const cifrado = await cifrarCodigo(SECRETO, codigo, huella);
  assert.match(cifrado, /^[A-Za-z0-9_-]{40,200}$/);   // el CHECK de tienda_enlaces.cifrado
  assert.equal(await descifrarCodigo(SECRETO, cifrado, huella), codigo);
});
test("el cifrado no contiene el código y cambia cada vez", async () => {
  const codigo = nuevoCodigo(), huella = await huellaDe(codigo);
  const a = await cifrarCodigo(SECRETO, codigo, huella), b = await cifrarCodigo(SECRETO, codigo, huella);
  assert.notEqual(a, b);
  assert.ok(!a.includes(codigo));
});
test("con otro secreto no abre", async () => {
  const codigo = nuevoCodigo(), huella = await huellaDe(codigo);
  assert.equal(await descifrarCodigo("otro-secreto", await cifrarCodigo(SECRETO, codigo, huella), huella), null);
});
test("el cifrado de un pedido no abre en otro", async () => {
  const uno = nuevoCodigo(), otro = nuevoCodigo();
  const cifrado = await cifrarCodigo(SECRETO, uno, await huellaDe(uno));
  assert.equal(await descifrarCodigo(SECRETO, cifrado, await huellaDe(otro)), null);
});
test("un cifrado tocado, vacío o basura da null y no lanza", async () => {
  const codigo = nuevoCodigo(), huella = await huellaDe(codigo);
  const cifrado = await cifrarCodigo(SECRETO, codigo, huella);
  const tocado = cifrado.slice(0, -2) + (cifrado.endsWith("AA") ? "BB" : "AA");
  for (const x of [tocado, "", null, undefined, "%%%", "abc"]) assert.equal(await descifrarCodigo(SECRETO, x, huella), null);
  assert.equal(await descifrarCodigo(SECRETO, cifrado, null), null);
  assert.equal(await descifrarCodigo("", cifrado, huella), null);
});
test("algo que no es un código no sale aunque esté bien cifrado", async () => {
  const huella = await huellaDe("no-es-un-codigo");
  assert.equal(await descifrarCodigo(SECRETO, await cifrarCodigo(SECRETO, "no-es-un-codigo", huella), huella), null);
});
test("sin secreto no se cifra", async () => {
  await assert.rejects(cifrarCodigo("", nuevoCodigo(), "x"));
});
