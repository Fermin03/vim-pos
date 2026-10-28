import { test } from "node:test";
import assert from "node:assert/strict";
import { enHorario, textoDeAvisos } from "./avisos.ts";

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
