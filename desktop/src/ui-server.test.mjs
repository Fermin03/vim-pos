// Pruebas del endpoint "Actualizar menú" del servidor de UI.
//
// Es una ruta que ESCRIBE (dispara una descarga del catálogo contra la nube) y escucha en la LAN,
// así que lo que hay que proteger es la guarda de origen —SEC CN-020: sin ella, cualquier web
// abierta en el navegador de la caja podía dispararla— y el freno, sin el cual un dedo apoyado en
// el botón pone a la caja a bajar el menú entero en bucle.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startUiServer, ESPERA_CATALOGO_MANUAL_MS } from "./ui-server.mjs";

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pos-ui");

/** Levanta un servidor en un puerto libre y devuelve con qué hablarle. */
async function conServidor(opts, fn) {
  const port = 54800 + Math.floor(Math.random() * 150);
  const server = await startUiServer(UI_DIR, port, 54350, "127.0.0.1", opts);
  const pedir = (cabeceras = {}) =>
    fetch(`http://127.0.0.1:${port}/__sincronizar-catalogo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}`, ...cabeceras },
      body: "{}",
    });
  try {
    await fn({ pedir, port });
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test("el botón baja el catálogo y contesta que sí", async () => {
  let veces = 0;
  await conServidor({ onSincronizarCatalogo: async () => { veces++; return true; } }, async ({ pedir }) => {
    const r = await pedir();
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    assert.equal(veces, 1);
  });
});

test("sin nube, el cajero se entera en vez de quedarse mirando", async () => {
  await conServidor({ onSincronizarCatalogo: async () => false }, async ({ pedir }) => {
    const j = await (await pedir()).json();
    assert.equal(j.ok, false);
    assert.match(j.error, /nube/i);
  });
});

test("una web abierta en el navegador de la caja NO puede disparar la descarga", async () => {
  let veces = 0;
  await conServidor({ onSincronizarCatalogo: async () => { veces++; return true; } }, async ({ pedir }) => {
    const r = await pedir({ Origin: "http://sitio-cualquiera.example" });
    assert.equal(r.status, 403, "origen ajeno rechazado (SEC CN-020)");
    assert.equal(veces, 0, "y no llegó a tocar la nube");
  });
});

test("Sec-Fetch-Site delata la petición cruzada aunque el Origin venga bien", async () => {
  let veces = 0;
  await conServidor({ onSincronizarCatalogo: async () => { veces++; return true; } }, async ({ pedir }) => {
    const r = await pedir({ "Sec-Fetch-Site": "cross-site" });
    assert.equal(r.status, 403);
    assert.equal(veces, 0);
  });
});

test("el freno corta la segunda pulsación seguida, y suelta al pasar la espera", async () => {
  let veces = 0;
  let reloj = 1_000_000;
  await conServidor(
    { onSincronizarCatalogo: async () => { veces++; return true; }, ahora: () => reloj },
    async ({ pedir }) => {
      assert.equal((await pedir()).status, 200);
      const segunda = await pedir();
      assert.equal(segunda.status, 429, "dos pulsaciones seguidas no bajan el catálogo dos veces");
      assert.equal(veces, 1);

      reloj += ESPERA_CATALOGO_MANUAL_MS + 1;
      assert.equal((await pedir()).status, 200, "pasada la espera, el botón vuelve a servir");
      assert.equal(veces, 2);
    },
  );
});

test("un escritorio viejo sin el gancho no revienta: contesta que no pudo", async () => {
  await conServidor({}, async ({ pedir }) => {
    const j = await (await pedir()).json();
    assert.equal(j.ok, false);
  });
});
