import { test } from "node:test";
import assert from "node:assert/strict";
import { hostnamesPermitidos, TURNSTILE_VERIFICAR, verificarTurnstile } from "./turnstile.ts";

/** fetch falso que anota lo que se le mandó y contesta lo que se le diga. */
function fetchFalso(respuesta: unknown, ok = true) {
  const llamadas: { url: string; body: URLSearchParams }[] = [];
  const f = async (url: string, init: { body: URLSearchParams }) => {
    llamadas.push({ url, body: init.body });
    return { ok, json: async () => respuesta };
  };
  return { f, llamadas };
}

const BUENA = { success: true, hostname: "admin.vimpos.com.mx", action: "registro" };

test("sin secreto se RECHAZA (fail-closed) y no se llama a Cloudflare", async () => {
  const { f, llamadas } = fetchFalso(BUENA);
  assert.deepEqual(await verificarTurnstile({ secreto: "", token: "x", accion: "registro", fetchFn: f }), { ok: false, motivo: "NO_CONFIGURADO" });
  assert.deepEqual(await verificarTurnstile({ secreto: undefined, token: "x", accion: "registro", fetchFn: f }), { ok: false, motivo: "NO_CONFIGURADO" });
  assert.equal(llamadas.length, 0);
});

test("sin secreto y con CAPTCHA_OPCIONAL (local) se omite", async () => {
  const { f, llamadas } = fetchFalso(BUENA);
  assert.deepEqual(await verificarTurnstile({ secreto: "", opcional: true, token: undefined, accion: "registro", fetchFn: f }), { ok: true, omitido: true });
  assert.equal(llamadas.length, 0);
});

test("con secreto, sin token se rechaza sin preguntar", async () => {
  const { f, llamadas } = fetchFalso(BUENA);
  for (const token of ["", 123, "x".repeat(2049)]) {
    assert.deepEqual(await verificarTurnstile({ secreto: "s", token, accion: "registro", fetchFn: f }), { ok: false, motivo: "SIN_TOKEN" });
  }
  assert.equal(llamadas.length, 0);
});

test("con secreto, un token que Cloudflare rechaza no pasa", async () => {
  const { f, llamadas } = fetchFalso({ success: false, "error-codes": ["invalid-input-response"] });
  const r = await verificarTurnstile({ secreto: "s3cr3t", token: "malo", accion: "registro", ip: "203.0.113.9", fetchFn: f });
  assert.deepEqual(r, { ok: false, motivo: "RECHAZADO", codigos: ["invalid-input-response"] });
  assert.equal(llamadas[0]!.url, TURNSTILE_VERIFICAR);
  assert.equal(llamadas[0]!.body.get("secret"), "s3cr3t");
  assert.equal(llamadas[0]!.body.get("response"), "malo");
  assert.equal(llamadas[0]!.body.get("remoteip"), "203.0.113.9");
});

test("un token bueno, del dominio y la acción correctos, pasa; la IP 'desconocida' no se manda", async () => {
  const { f, llamadas } = fetchFalso(BUENA);
  assert.deepEqual(await verificarTurnstile({ secreto: "s", token: "bueno", accion: "registro", ip: "desconocida", fetchFn: f }), { ok: true, omitido: false });
  assert.equal(llamadas[0]!.body.has("remoteip"), false);
});

test("un token emitido para OTRO dominio no pasa", async () => {
  const { f } = fetchFalso({ ...BUENA, hostname: "sitio-ajeno.com" });
  assert.deepEqual(await verificarTurnstile({ secreto: "s", token: "t", accion: "registro", fetchFn: f }), { ok: false, motivo: "HOSTNAME" });
  const { f: sinHost } = fetchFalso({ success: true, action: "registro" });
  assert.deepEqual(await verificarTurnstile({ secreto: "s", token: "t", accion: "registro", fetchFn: sinHost }), { ok: false, motivo: "HOSTNAME" });
  // localhost solo si TURNSTILE_HOSTNAMES lo incluye.
  const { f: local } = fetchFalso({ ...BUENA, hostname: "localhost" });
  assert.deepEqual(await verificarTurnstile({ secreto: "s", token: "t", accion: "registro", fetchFn: local }), { ok: false, motivo: "HOSTNAME" });
  assert.deepEqual(
    await verificarTurnstile({ secreto: "s", token: "t", accion: "registro", hostnames: hostnamesPermitidos("admin.vimpos.com.mx, LOCALHOST"), fetchFn: local }),
    { ok: true, omitido: false },
  );
});

test("un token de la acción equivocada no pasa (el del reenvío no da de alta)", async () => {
  const { f } = fetchFalso({ ...BUENA, action: "reenvio" });
  assert.deepEqual(await verificarTurnstile({ secreto: "s", token: "t", accion: "registro", fetchFn: f }), { ok: false, motivo: "ACCION" });
  const { f: sinAccion } = fetchFalso({ success: true, hostname: "admin.vimpos.com.mx" });
  assert.deepEqual(await verificarTurnstile({ secreto: "s", token: "t", accion: "reenvio", fetchFn: sinAccion }), { ok: false, motivo: "ACCION" });
});

test("si Cloudflare no responde, con secreto se cierra", async () => {
  const caido = async () => { throw new Error("red"); };
  assert.deepEqual(await verificarTurnstile({ secreto: "s", token: "t", accion: "registro", fetchFn: caido }), { ok: false, motivo: "SIN_RESPUESTA" });
  const { f } = fetchFalso({}, false);
  assert.deepEqual(await verificarTurnstile({ secreto: "s", token: "t", accion: "registro", fetchFn: f }), { ok: false, motivo: "SIN_RESPUESTA" });
});

test("hostnamesPermitidos: lista separada por comas; vacío = producción", () => {
  assert.deepEqual(hostnamesPermitidos(""), ["admin.vimpos.com.mx"]);
  assert.deepEqual(hostnamesPermitidos(undefined), ["admin.vimpos.com.mx"]);
  assert.deepEqual(hostnamesPermitidos(" a.mx ,b.mx,"), ["a.mx", "b.mx"]);
});
