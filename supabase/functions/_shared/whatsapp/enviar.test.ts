import { test } from "node:test";
import assert from "node:assert/strict";
import { cuerpoPlantilla, cuerpoTexto, enviar } from "./enviar.ts";

test("cuerpoTexto", () => {
  assert.deepEqual(cuerpoTexto("521477", "Hola"), {
    messaging_product: "whatsapp", to: "521477", type: "text", text: { body: "Hola", preview_url: true },
  });
});

test("cuerpoPlantilla", () => {
  assert.deepEqual(cuerpoPlantilla("521477", "aviso_x", ["Ana", "3"]), {
    messaging_product: "whatsapp", to: "521477", type: "template",
    template: {
      name: "aviso_x", language: { code: "es_MX" },
      components: [{ type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "3" }] }],
    },
  });
});

const resp = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status });

test("enviar ok devuelve el wamid y llama a Graph con token", async () => {
  const vars: Record<string, string> = { WA_GRAPH_VERSION: "v21.0", WA_PHONE_NUMBER_ID: "PN1", WA_TOKEN: "tok" };
  (globalThis as { Deno?: unknown }).Deno = { env: { get: (k: string) => vars[k] } };
  let url = "", init: RequestInit = {};
  const f = (async (u: string, i: RequestInit) => { url = u; init = i; return resp(200, { messages: [{ id: "wamid.Y" }] }); }) as unknown as typeof fetch;
  const r = await enviar(cuerpoTexto("521477", "Hola"), f);
  assert.deepEqual(r, { ok: true, wamid: "wamid.Y", error: null, status: 200 });
  assert.equal(url, "https://graph.facebook.com/v21.0/PN1/messages");
  assert.equal(init.method, "POST");
  assert.equal((init.headers as Record<string, string>).Authorization, "Bearer tok");
});

test("enviar con 400 devuelve el mensaje de Meta", async () => {
  const f = (async () => resp(400, { error: { message: "Número inválido" } })) as unknown as typeof fetch;
  assert.deepEqual(await enviar({}, f), { ok: false, wamid: null, error: "Número inválido", status: 400 });
});

test("enviar con fetch que lanza no lanza", async () => {
  const f = (async () => { throw new Error("red caída"); }) as unknown as typeof fetch;
  const r = await enviar({}, f);
  assert.equal(r.ok, false);
  assert.equal(r.error, "red caída");
  assert.equal(r.status, null);
});
