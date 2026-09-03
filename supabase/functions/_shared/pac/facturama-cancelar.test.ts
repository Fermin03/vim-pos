// cancelar(): ruta documentada de Multiemisor y estado decidido por `Status`, no por el HTTP.
// El 3 sep 2026 la ruta anterior respondió 200 vacío en producción sin cancelar nada.
import test from "node:test";
import assert from "node:assert/strict";
import { FacturamaPac, interpretarCancelacion } from "./facturama.ts";

test("interpretarCancelacion: los Status del PAC → nuestro estado", () => {
  assert.equal(interpretarCancelacion('{"Status":"canceled","Message":"Cancelado sin Aceptacion","AcuseXmlBase64":"PEFjdXNlLz4="}').estado, "cancelado");
  assert.equal(interpretarCancelacion('{"Status":"acepted"}').estado, "cancelado");
  assert.equal(interpretarCancelacion('{"Status":"expired"}').estado, "cancelado");
  assert.equal(interpretarCancelacion('{"Status":"pending"}').estado, "pendiente");
  assert.equal(interpretarCancelacion('{"Status":"rejected"}').estado, "rechazado");
  assert.equal(interpretarCancelacion("").estado, "desconocido");
  assert.equal(interpretarCancelacion("no es json").estado, "desconocido");
  const r = interpretarCancelacion('{"Status":"canceled","AcuseXmlBase64":"  ","Message":"x"}');
  assert.equal(r.acuseBase64, null);
  assert.equal(r.mensaje, "x");
});

test("cancelar: usa /api-lite/cfdis/{id}?motive= y devuelve el Status", async () => {
  const pac = new FacturamaPac("u", "p", "https://api.facturama.mx");
  const original = globalThis.fetch;
  let urlLlamada = "", metodo = "";
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    urlLlamada = String(url); metodo = String(init?.method);
    return Promise.resolve(new Response('{"Status":"canceled","Message":"Cancelado sin Aceptacion","AcuseXmlBase64":"PEFjdXNlLz4="}', { status: 200 }));
  }) as typeof fetch;
  try {
    const r = await pac.cancelar("abc-123", "02");
    assert.equal(urlLlamada, "https://api.facturama.mx/api-lite/cfdis/abc-123?motive=02");
    assert.equal(metodo, "DELETE");
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.estado, "cancelado");
      assert.equal(r.acuseBase64, "PEFjdXNlLz4=");
      assert.equal(r.statusPac, "canceled");
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("cancelar: motivo 01 sin sustituto no llega a la red; con sustituto va en uuidReplacement", async () => {
  const pac = new FacturamaPac("u", "p", "https://api.facturama.mx");
  const sin = await pac.cancelar("abc", "01");
  assert.equal(sin.ok, false);
  const original = globalThis.fetch;
  let urlLlamada = "";
  globalThis.fetch = ((url: string | URL) => { urlLlamada = String(url); return Promise.resolve(new Response('{"Status":"pending"}', { status: 200 })); }) as typeof fetch;
  try {
    const con = await pac.cancelar("abc", "01", "UUID-SUST");
    assert.ok(con.ok && con.estado === "pendiente");
    assert.match(urlLlamada, /motive=01&uuidReplacement=UUID-SUST$/);
  } finally {
    globalThis.fetch = original;
  }
});

test("cancelar: 200 con cuerpo vacío → desconocido (nunca cancelado)", async () => {
  const pac = new FacturamaPac("u", "p", "https://api.facturama.mx");
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("", { status: 200 }))) as typeof fetch;
  try {
    const r = await pac.cancelar("abc", "02");
    assert.ok(r.ok && r.estado === "desconocido");
  } finally {
    globalThis.fetch = original;
  }
});
