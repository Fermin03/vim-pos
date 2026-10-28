import { test } from "node:test";
import assert from "node:assert/strict";
import { enHorario, repartirAvisos, textoDeAvisos } from "./avisos.ts";

const PANEL = "https://platform.vimpos.com.mx";

test("un aviso: una línea con el enlace a su conversación", () => {
  const t = textoDeAvisos([{ motivo: "Prospecto caliente", resumen: "Quiere 2 cajas", conversacion_id: "abc-1" }], PANEL);
  assert.equal(t, `• Prospecto caliente: Quiere 2 cajas — ${PANEL}/whatsapp/abc-1`);
});

test("sin conversación (aviso del sistema): enlaza a la lista", () => {
  const t = textoDeAvisos([{ motivo: "Gasto de IA", resumen: "80 % del tope", conversacion_id: null }], PANEL);
  assert.equal(t, `• Gasto de IA: 80 % del tope — ${PANEL}/whatsapp`);
});

test("sin saltos de línea ni espacios repetidos (Meta los rechaza en parámetros de plantilla)", () => {
  const t = textoDeAvisos([
    { motivo: "Duda", resumen: "línea 1\nlínea 2\n\n      línea 3", conversacion_id: "a" },
    { motivo: "Otra", resumen: "x", conversacion_id: "b" },
  ], PANEL);
  assert.doesNotMatch(t, /[\r\n\t]/);
  assert.doesNotMatch(t, / {5}/);
  assert.equal(t.split("•").length - 1, 2);
});

test("30 avisos largos: ≤ 1000 caracteres y termina avisando cuántos faltan", () => {
  const avisos = Array.from({ length: 30 }, (_, i) => ({ motivo: "Duda sin respuesta", resumen: "x".repeat(400), conversacion_id: `id-${i}` }));
  const t = textoDeAvisos(avisos, PANEL);
  assert.ok(t.length <= 1000, `largo ${t.length}`);
  const m = t.match(/… y (\d+) más en (.+)$/);
  assert.ok(m, t.slice(-80));
  assert.equal(m[2], `${PANEL}/whatsapp`);
  assert.equal(t.split("•").length - 1 + Number(m[1]), 30);
});

test("un solo aviso enorme se recorta y cabe", () => {
  const t = textoDeAvisos([{ motivo: "m".repeat(3000), resumen: "r".repeat(3000), conversacion_id: "z" }], PANEL);
  assert.ok(t.length <= 1000);
});

test("enHorario: 9:00 a 18:00 hora de Ciudad de México", () => {
  assert.equal(enHorario(new Date("2026-10-27T14:59:00Z")), false); // 08:59
  assert.equal(enHorario(new Date("2026-10-27T15:00:00Z")), true); //  09:00
  assert.equal(enHorario(new Date("2026-10-27T23:59:00Z")), true); //  17:59
  assert.equal(enHorario(new Date("2026-10-28T00:00:00Z")), false); // 18:00
});

const av = (id: string, resumen = "r") => ({ id, motivo: "m", resumen, conversacion_id: id });

test("plano: corta por puntos de código (no parte emojis) y quita URLs", () => {
  const t = textoDeAvisos([{ motivo: "😀".repeat(100), resumen: "Visita https://malo.example/x o www.malo.mx y malo.com/pago ya", conversacion_id: "a" }], PANEL);
  assert.ok(t.startsWith("• " + "😀".repeat(60) + ":"), t.slice(0, 20));
  assert.doesNotMatch(t.split(" — ")[0], /malo|https|www/);
  assert.match(t, /Visita \[enlace\] o \[enlace\] y \[enlace\] ya/);
  assert.ok(t.endsWith(`${PANEL}/whatsapp/a`)); // el enlace propio al panel sí va
});

test("repartirAvisos: lote ok marca todos con un solo envío", async () => {
  const textos: string[] = [];
  const r = await repartirAvisos([av("1"), av("2")], PANEL, async (t) => { textos.push(t); return { ok: true, status: 200 }; });
  assert.deepEqual(r, { enviados: ["1", "2"], rechazados: [] });
  assert.equal(textos.length, 1);
});

test("repartirAvisos: lote 400 → uno por uno; el que Meta rechaza solo se marca como rechazado", async () => {
  const textos: string[] = [];
  const r = await repartirAvisos([av("1"), av("2", "malo"), av("3")], PANEL, async (t) => {
    textos.push(t);
    return t.includes("malo") ? { ok: false, status: 400 } : { ok: true, status: 200 };
  });
  assert.deepEqual(r, { enviados: ["1", "3"], rechazados: ["2"] });
  assert.equal(textos.length, 4);
});

test("repartirAvisos: 5xx, red, 401 o 429 no marcan nada (siguiente vuelta)", async () => {
  for (const status of [500, null, 401, 429]) {
    let n = 0;
    const r = await repartirAvisos([av("1"), av("2")], PANEL, async () => { n++; return { ok: false, status }; });
    assert.deepEqual(r, { enviados: [], rechazados: [] }, String(status));
    assert.equal(n, 1);
  }
});

test("repartirAvisos: un solo aviso rechazado no se reenvía", async () => {
  let n = 0;
  const r = await repartirAvisos([av("1")], PANEL, async () => { n++; return { ok: false, status: 400 }; });
  assert.deepEqual(r, { enviados: [], rechazados: ["1"] });
  assert.equal(n, 1);
});

test("repartirAvisos: en el reintento, un 5xx deja ese aviso pendiente", async () => {
  let n = 0;
  const r = await repartirAvisos([av("1"), av("2")], PANEL, async () => (++n === 1 ? { ok: false, status: 400 } : n === 2 ? { ok: false, status: 503 } : { ok: true, status: 200 }));
  assert.deepEqual(r, { enviados: ["2"], rechazados: [] });
});
