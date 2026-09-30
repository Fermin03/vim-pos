import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, soloAscii } from "./correo.ts";

test("esc neutraliza el HTML que escribe un desconocido", () => {
  assert.equal(esc(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("soloAscii deja el asunto sin acentos ni símbolos (denomailer rompe los codificados)", () => {
  assert.equal(soloAscii("Registro: Café León · → Ñandú"), "Registro: Cafe Leon   Nandu");
  assert.equal(soloAscii("x".repeat(300)).length, 160);
});
