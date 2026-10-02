// La ruta del ajuste de la pantalla del cliente. Mueve una ventana en la computadora de la caja,
// así que solo la propia caja puede usarla: ni la segunda caja de la LAN ni una web cualquiera.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startUiServer } from "./ui-server.mjs";

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pos-ui");
const ESTADO = { disponible: true, modo: "auto", displayId: null, abierta: true, monitores: [] };

async function conServidor(opts, fn) {
  const port = 54950 + Math.floor(Math.random() * 40);
  const server = await startUiServer(UI_DIR, port, 54350, "127.0.0.1", opts);
  const base = `http://127.0.0.1:${port}/__pantalla-cliente`;
  const origen = { Origin: `http://127.0.0.1:${port}` };
  try { await fn({ base, origen }); } finally { await new Promise((r) => server.close(r)); }
}

test("GET devuelve el estado que da el proceso principal", async () => {
  await conServidor({ pantallaCliente: () => ESTADO }, async ({ base }) => {
    const r = await fetch(base);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), ESTADO);
  });
});

test("sin controlador (POS sin escritorio) dice que no está disponible", async () => {
  await conServidor({}, async ({ base }) => {
    assert.deepEqual(await (await fetch(base)).json(), { disponible: false });
  });
});

test("POST guarda el cambio y devuelve el estado nuevo", async () => {
  let recibido = null;
  const opts = { onPantallaCliente: (c) => { recibido = c; return { ...ESTADO, modo: "apagada", abierta: false }; } };
  await conServidor(opts, async ({ base, origen }) => {
    const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", ...origen }, body: JSON.stringify({ modo: "apagada", displayId: null }) });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.modo, "apagada");
    assert.deepEqual(recibido, { modo: "apagada", displayId: null });
  });
});

test("una web ajena no puede mover la pantalla", async () => {
  let veces = 0;
  await conServidor({ onPantallaCliente: () => { veces++; return ESTADO; } }, async ({ base }) => {
    const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://sitio-cualquiera.example" }, body: "{}" });
    assert.equal(r.status, 403);
    assert.equal(veces, 0);
  });
});

test("un cuerpo que no es JSON se rechaza sin tocar nada", async () => {
  let veces = 0;
  await conServidor({ onPantallaCliente: () => { veces++; return ESTADO; } }, async ({ base, origen }) => {
    const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", ...origen }, body: "{roto" });
    assert.equal(r.status, 400);
    assert.equal(veces, 0);
  });
});
