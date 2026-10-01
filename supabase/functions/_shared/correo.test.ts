import { test } from "node:test";
import assert from "node:assert/strict";
import { cerrarConPrisa, esc, soloAscii } from "./correo.ts";

test("esc neutraliza el HTML que escribe un desconocido", () => {
  assert.equal(esc(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("soloAscii deja el asunto sin acentos ni símbolos (denomailer rompe los codificados)", () => {
  assert.equal(soloAscii("Registro: Café León · → Ñandú"), "Registro: Cafe Leon   Nandu");
  assert.equal(soloAscii("x".repeat(300)).length, 160);
});

// close() de denomailer 1.6.0 es `void | Promise<void>`: sin pool devuelve undefined. El cierre no
// puede reventar por eso (antes `close().catch` lanzaba en el `finally` y tapaba el resultado del
// envío: el aviso de altas de 0142 se logueaba como "reventó" y no se sabía si había salido).
test("cerrarConPrisa aguanta un close() que devuelve undefined", async () => {
  await cerrarConPrisa({ close: () => undefined });
});

test("cerrarConPrisa aguanta un close() que lanza o que rechaza", async () => {
  await cerrarConPrisa({ close: () => { throw new Error("sync"); } });
  await cerrarConPrisa({ close: () => Promise.reject(new Error("async")) });
});

test("cerrarConPrisa no se queda colgado si close() nunca termina", async () => {
  const t0 = Date.now();
  await cerrarConPrisa({ close: () => new Promise<void>(() => {}) }, 50);
  assert.ok(Date.now() - t0 < 1000);
});
