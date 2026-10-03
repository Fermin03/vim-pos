import test from "node:test";
import assert from "node:assert/strict";
import { conTope } from "./tope.mjs";

test("conTope: lo que termina a tiempo devuelve su valor y no avisa", async () => {
  let avisos = 0;
  const r = await conTope(Promise.resolve(7), 500, () => { avisos++; });
  assert.deepEqual(r, { vencio: false, valor: 7 });
  assert.equal(avisos, 0);
});

test("conTope: lo que no termina nunca deja seguir, y avisa una vez", async () => {
  let avisos = 0;
  const t = Date.now();
  const r = await conTope(new Promise(() => {}), 60, () => { avisos++; });
  assert.deepEqual(r, { vencio: true });
  assert.equal(avisos, 1);
  assert.ok(Date.now() - t < 1000);
});

test("conTope: un rechazo antes del tope sube tal cual; un aviso que revienta no tumba nada", async () => {
  await assert.rejects(conTope(Promise.reject(new Error("pool roto")), 500), /pool roto/);
  const r = await conTope(new Promise(() => {}), 20, () => { throw new Error("log caído"); });
  assert.equal(r.vencio, true);
});
