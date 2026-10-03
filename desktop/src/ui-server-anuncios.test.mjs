// Las rutas de los anuncios de la pantalla del cliente: la lista y las imágenes que la caja ya
// bajó a disco. Las sirve el servidor local de la caja, que también escucha en la LAN.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startUiServer } from "./ui-server.mjs";
import { rutaDeAnuncio } from "./anuncios.mjs";

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pos-ui");
const ID = "0b9f6c1e-3a52-4d7e-8f10-2c4a9d6e7b13";
const ARCHIVO = `${ID}.jpg`;
const BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
const LISTA = { segundos: 10, anuncios: [{ id: ID, url: `/__anuncios/${ARCHIVO}`, segundos: 10 }] };

/** Servidor real en un puerto al azar, con una carpeta temporal que tiene un anuncio conocido. */
async function conServidor(extra, fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "anuncios-ui-"));
  writeFileSync(path.join(dir, ARCHIVO), BYTES);
  const pedidos = [];
  const port = 55000 + Math.floor(Math.random() * 41);
  const opts = { archivoAnuncio: (n) => { pedidos.push(n); return rutaDeAnuncio(dir, n); }, ...extra };
  const server = await startUiServer(UI_DIR, port, 54350, "127.0.0.1", opts);
  try { await fn({ base: `http://127.0.0.1:${port}`, dir, pedidos }); }
  finally { await new Promise((r) => server.close(r)); rmSync(dir, { recursive: true, force: true }); }
}

test("GET /__anuncios devuelve la lista del proceso principal", async () => {
  await conServidor({ anuncios: async () => LISTA }, async ({ base }) => {
    const r = await fetch(`${base}/__anuncios`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /application\/json/);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(await r.json(), LISTA);
  });
});

test("sin gancho devuelve una lista vacía, no un error", async () => {
  await conServidor({}, async ({ base }) => {
    const r = await fetch(`${base}/__anuncios`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { segundos: 8, anuncios: [] });
  });
});

// Una lectura fallida no puede parecer "no hay anuncios": con un 200 vacío la pantalla quitaría el
// carrusel. Con un 503 la pantalla (leerAnuncios → null) conserva la lista que ya tenía.
test("si el gancho lanza, responde 503 y no una lista vacía", async () => {
  await conServidor({ anuncios: async () => { throw new Error("base caída"); } }, async ({ base }) => {
    const r = await fetch(`${base}/__anuncios`);
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const cuerpo = await r.json();
    assert.equal(cuerpo.ok, false);
    assert.equal(cuerpo.anuncios, undefined, "nada que la pantalla pueda tomar por una lista");
  });
});

test("si el gancho devuelve null (lectura fallida), responde 503", async () => {
  await conServidor({ anuncios: async () => null }, async ({ base }) => {
    const r = await fetch(`${base}/__anuncios`);
    assert.equal(r.status, 503);
    assert.equal((await r.json()).ok, false);
  });
});

test("GET /__anuncios/<archivo> sirve la imagen con su tipo", async () => {
  await conServidor({}, async ({ base }) => {
    const r = await fetch(`${base}/__anuncios/${ARCHIVO}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/jpeg");
    assert.match(r.headers.get("cache-control"), /immutable/);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), BYTES);
  });
});

test("un nombre que el gancho no reconoce da 404", async () => {
  await conServidor({}, async ({ base, pedidos }) => {
    const r = await fetch(`${base}/__anuncios/otra-cosa.jpg`);
    assert.equal(r.status, 404);
    assert.deepEqual(pedidos, ["otra-cosa.jpg"]);
  });
});

test("un archivo que ya no está en disco da 404, no el index del POS", async () => {
  await conServidor({ archivoAnuncio: (n) => path.join(os.tmpdir(), "no-existe-anuncios", n) }, async ({ base }) => {
    const r = await fetch(`${base}/__anuncios/${ARCHIVO}`);
    assert.equal(r.status, 404);
    assert.doesNotMatch(r.headers.get("content-type") ?? "", /html/);
    assert.doesNotMatch(await r.text(), /<html|<!doctype/i);
  });
});

test("no se sale de la carpeta", async () => {
  await conServidor({}, async ({ base, pedidos }) => {
    for (const malo of ["..%2f..%2fpackage.json", "..%2f..%2f..%2fpackage.json", "%2e%2e%2f%2e%2e%2fpackage.json", "..%5c..%5cpackage.json"]) {
      const r = await fetch(`${base}/__anuncios/${malo}`);
      assert.equal(r.status, 404, malo);
      assert.doesNotMatch(await r.text(), /"name"/, malo);
    }
    // El nombre llega al gancho decodificado y tal cual: quien conoce la carpeta lo rechaza.
    // `every` sobre una lista vacía es true: sin contar, la prueba pasaría aunque el gancho nunca se llamara.
    assert.equal(pedidos.length, 4, "cada nombre malo debe llegar al gancho");
    assert.ok(pedidos.every((n) => n.includes("..")), "el gancho debe recibir el nombre sin armar ruta");
  });
});

test("en modo cocina la lista no se sirve (cae al estático)", async () => {
  let llamadas = 0;
  const dir = mkdtempSync(path.join(os.tmpdir(), "anuncios-kds-"));
  const port = 55000 + Math.floor(Math.random() * 41);
  const server = await startUiServer(UI_DIR, port, 54350, "127.0.0.1", { kds: true, hub: "http://192.168.1.50:54350", anuncios: async () => { llamadas++; return LISTA; }, archivoAnuncio: () => { llamadas++; return null; } });
  try {
    const r = await fetch(`http://127.0.0.1:${port}/__anuncios`);
    const texto = await r.text();
    assert.equal(llamadas, 0);
    assert.doesNotMatch(texto, /"anuncios"/);
    const r2 = await fetch(`http://127.0.0.1:${port}/__anuncios/${ARCHIVO}`);
    await r2.text();
    assert.equal(llamadas, 0);
  } finally { await new Promise((res) => server.close(res)); rmSync(dir, { recursive: true, force: true }); }
});
