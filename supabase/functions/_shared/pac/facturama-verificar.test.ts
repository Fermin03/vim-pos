// verificarCuenta(): distingue credencial mala, Multiemisor sin activar y cuenta lista, sin
// gastar folios. Se simula `fetch` para no depender de la red ni de una cuenta real.
import test from "node:test";
import assert from "node:assert/strict";
import { FacturamaPac } from "./facturama.ts";

type Respuesta = { status: number; body?: string };
function conFetch(rutas: Record<string, Respuesta>, fn: () => Promise<void>) {
  const original = globalThis.fetch;
  const llamadas: string[] = [];
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    llamadas.push(u);
    assert.match(String((init?.headers as Record<string, string> | undefined)?.Authorization), /^Basic /);
    const r = Object.entries(rutas).find(([k]) => u.includes(k))?.[1] ?? { status: 404, body: "" };
    return Promise.resolve(new Response(r.body ?? "", { status: r.status }));
  }) as typeof fetch;
  return fn().finally(() => { globalThis.fetch = original; }).then(() => llamadas);
}

test("credencial rechazada: no sigue a Multiemisor", async () => {
  const pac = new FacturamaPac("u", "p", "https://api.facturama.mx");
  const llamadas = await conFetch({ "/catalogs/PaymentForms": { status: 401 } }, async () => {
    const e = await pac.verificarCuenta();
    assert.equal(e.entorno, "produccion");
    assert.equal(e.credencial, "rechazada");
    assert.equal(e.multiemisor, "no_probado");
  });
  assert.equal(llamadas.length, 1);
});

test("credencial buena pero Multiemisor sin activar", async () => {
  const pac = new FacturamaPac("u", "p", "https://api.facturama.mx");
  await conFetch(
    { "/catalogs/PaymentForms": { status: 200, body: "[]" }, "/cfdi?type=issuedLite": { status: 403, body: "Not enabled" } },
    async () => {
      const e = await pac.verificarCuenta();
      assert.equal(e.credencial, "ok");
      assert.equal(e.multiemisor, "no_activo");
      assert.match(e.detalle, /403/);
    },
  );
});

test("cuenta lista en sandbox", async () => {
  const pac = new FacturamaPac("u", "p", "https://apisandbox.facturama.mx");
  await conFetch(
    { "/catalogs/PaymentForms": { status: 200, body: "[]" }, "/cfdi?type=issuedLite": { status: 200, body: "[]" } },
    async () => {
      const e = await pac.verificarCuenta();
      assert.equal(e.entorno, "sandbox");
      assert.equal(e.credencial, "ok");
      assert.equal(e.multiemisor, "ok");
    },
  );
});

test("la respuesta nunca lleva la contraseña", async () => {
  const pac = new FacturamaPac("usuario", "clave-secreta", "https://api.facturama.mx");
  await conFetch({ "/catalogs/PaymentForms": { status: 500, body: "boom" } }, async () => {
    const e = await pac.verificarCuenta();
    assert.equal(e.credencial, "error");
    assert.doesNotMatch(JSON.stringify(e), /clave-secreta/);
  });
});
