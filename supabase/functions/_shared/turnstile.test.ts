import { test } from "node:test";
import assert from "node:assert/strict";
import { TURNSTILE_VERIFICAR, verificarTurnstile } from "./turnstile.ts";

/** fetch falso que anota lo que se le mandó y contesta lo que se le diga. */
function fetchFalso(respuesta: unknown, ok = true) {
  const llamadas: { url: string; body: URLSearchParams }[] = [];
  const f = async (url: string, init: { body: URLSearchParams }) => {
    llamadas.push({ url, body: init.body });
    return { ok, json: async () => respuesta };
  };
  return { f, llamadas };
}

test("sin secreto configurado NO verifica (y no llama a Cloudflare)", async () => {
  const { f, llamadas } = fetchFalso({ success: false });
  assert.deepEqual(await verificarTurnstile({ secreto: "", token: undefined, fetchFn: f }), { ok: true, omitido: true });
  assert.deepEqual(await verificarTurnstile({ secreto: undefined, token: "x", fetchFn: f }), { ok: true, omitido: true });
  assert.equal(llamadas.length, 0);
});

test("con secreto, sin token se rechaza sin preguntar", async () => {
  const { f, llamadas } = fetchFalso({ success: true });
  assert.deepEqual(await verificarTurnstile({ secreto: "s", token: "", fetchFn: f }), { ok: false, motivo: "SIN_TOKEN" });
  assert.deepEqual(await verificarTurnstile({ secreto: "s", token: 123, fetchFn: f }), { ok: false, motivo: "SIN_TOKEN" });
  assert.deepEqual(await verificarTurnstile({ secreto: "s", token: "x".repeat(2049), fetchFn: f }), { ok: false, motivo: "SIN_TOKEN" });
  assert.equal(llamadas.length, 0);
});

test("con secreto, un token que Cloudflare rechaza no pasa", async () => {
  const { f, llamadas } = fetchFalso({ success: false, "error-codes": ["invalid-input-response"] });
  const r = await verificarTurnstile({ secreto: "s3cr3t", token: "malo", ip: "203.0.113.9", fetchFn: f });
  assert.deepEqual(r, { ok: false, motivo: "RECHAZADO", codigos: ["invalid-input-response"] });
  assert.equal(llamadas[0]!.url, TURNSTILE_VERIFICAR);
  assert.equal(llamadas[0]!.body.get("secret"), "s3cr3t");
  assert.equal(llamadas[0]!.body.get("response"), "malo");
  assert.equal(llamadas[0]!.body.get("remoteip"), "203.0.113.9");
});

test("con secreto, un token bueno pasa; la IP 'desconocida' no se manda", async () => {
  const { f, llamadas } = fetchFalso({ success: true });
  assert.deepEqual(await verificarTurnstile({ secreto: "s", token: "bueno", ip: "desconocida", fetchFn: f }), { ok: true, omitido: false });
  assert.equal(llamadas[0]!.body.has("remoteip"), false);
});

test("si Cloudflare no responde, con secreto se cierra", async () => {
  const caido = async () => { throw new Error("red"); };
  assert.deepEqual(await verificarTurnstile({ secreto: "s", token: "t", fetchFn: caido }), { ok: false, motivo: "SIN_RESPUESTA" });
  const { f } = fetchFalso({}, false);
  assert.deepEqual(await verificarTurnstile({ secreto: "s", token: "t", fetchFn: f }), { ok: false, motivo: "SIN_RESPUESTA" });
});
