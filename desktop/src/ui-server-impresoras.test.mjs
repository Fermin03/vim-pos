// La lista de impresoras de Windows y el relay de impresión, vistos desde el servidor de UI.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startUiServer } from "./ui-server.mjs";
import { puertoLibre } from "./puerto-libre.mjs";

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pos-ui");

async function conServidor(opts, fn) {
  const port = await puertoLibre();
  const server = await startUiServer(UI_DIR, port, 54350, "127.0.0.1", opts);
  try { await fn(`http://127.0.0.1:${port}`); } finally { await new Promise((r) => server.close(r)); }
}

test("/__impresoras devuelve la lista que da el main", async () => {
  const lista = [{ nombre: "POS-80C", predeterminada: true }];
  await conServidor({ onListarImpresoras: async () => lista }, async (base) => {
    const r = await fetch(`${base}/__impresoras`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, impresoras: lista });
  });
});

test("/__impresoras sin main detrás (o si falla) contesta ok:false, no una lista vacía", async () => {
  await conServidor({}, async (base) => {
    assert.equal((await (await fetch(`${base}/__impresoras`)).json()).ok, false);
  });
  await conServidor({ onListarImpresoras: async () => { throw new Error("sin ventana"); } }, async (base) => {
    const j = await (await fetch(`${base}/__impresoras`)).json();
    assert.equal(j.ok, false);
    assert.match(j.error, /sin ventana/);
  });
});

test("/__imprimir le pasa al main el nombre de la impresora de Windows", async () => {
  let recibido = null;
  await conServidor({ onImprimir: async (p) => { recibido = p; return { ok: true }; } }, async (base) => {
    const r = await fetch(`${base}/__imprimir`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ impresoraWindows: "POS-80C", datosB64: "G0A=", soloConectar: false }),
    });
    assert.deepEqual(await r.json(), { ok: true });
    assert.equal(recibido.impresoraWindows, "POS-80C");
    assert.equal(recibido.datosB64, "G0A=");
  });
});
