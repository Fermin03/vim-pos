import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { nombreArchivo, planAnuncios, sincronizarAnuncios, listarAnuncios, rutaDeAnuncio } from "./anuncios.mjs";

const T = "99999999-0000-0000-0000-0000000000aa";
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const fila = (id, ext = "jpg", extra = {}) => ({ id, ruta: `${T}/${id}.${ext}`, orden: 0, ...extra });

/** Postgres de mentira: contesta las dos consultas del módulo. */
function poolFalso(filas, segundos = 8) {
  return {
    query: async (sql) => {
      if (/FROM anuncios_pantalla/i.test(sql)) return { rows: filas };
      if (/pantalla_cliente_segundos/i.test(sql)) return { rows: segundos === null ? [] : [{ pantalla_cliente_segundos: segundos }] };
      throw new Error("consulta inesperada: " + sql);
    },
  };
}
const imagen = (tipo = "image/jpeg", bytes = 10) => new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": tipo } });
const enTemporal = async (fn) => { const dir = mkdtempSync(path.join(os.tmpdir(), "vim-anuncios-")); try { await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test("el nombre en disco es el id con la extensión de la ruta", () => {
  assert.equal(nombreArchivo(fila(A, "png")), `${A}.png`);
  assert.equal(nombreArchivo(fila(A, "JPEG")), `${A}.jpg`);
  assert.equal(nombreArchivo({ id: A, ruta: `${T}/foto.gif` }), null, "una extensión que no es imagen permitida no entra");
  assert.equal(nombreArchivo({ id: "../../x", ruta: `${T}/a.jpg` }), null, "un id que no es uuid no entra");
});

test("el plan baja lo que falta y borra lo que sobra, sin tocar lo ajeno", () => {
  const p = planAnuncios([fila(A), fila(B, "png")], [`${A}.jpg`, "33333333-3333-3333-3333-333333333333.jpg", "leeme.txt", `${B}.png.tmp`]);
  assert.deepEqual(p.descargar, [{ archivo: `${B}.png`, ruta: `${T}/${B}.png` }]);
  assert.deepEqual(p.borrar.sort(), ["33333333-3333-3333-3333-333333333333.jpg", `${B}.png.tmp`].sort());
});

test("baja las imágenes que faltan desde el almacén público", async () => {
  await enTemporal(async (dir) => {
    const pedidas = [];
    const r = await sincronizarAnuncios({
      pool: poolFalso([fila(A), fila(B, "png")]), dir, cloudUrl: "https://nube.example",
      fetch: async (url) => { pedidas.push(url); return imagen(url.endsWith(".png") ? "image/png" : "image/jpeg"); },
    });
    assert.deepEqual(r, { bajados: 2, borrados: 0, fallidos: 0 });
    assert.deepEqual(pedidas, [`https://nube.example/storage/v1/object/public/anuncios/${T}/${A}.jpg`, `https://nube.example/storage/v1/object/public/anuncios/${T}/${B}.png`]);
    assert.deepEqual(readdirSync(dir).sort(), [`${A}.jpg`, `${B}.png`]);
  });
});

test("no vuelve a bajar lo que ya tiene y borra lo que ya no está en la lista", async () => {
  await enTemporal(async (dir) => {
    writeFileSync(path.join(dir, `${A}.jpg`), "ya");
    writeFileSync(path.join(dir, `${B}.png`), "sobra");
    let pedidas = 0;
    const r = await sincronizarAnuncios({ pool: poolFalso([fila(A)]), dir, cloudUrl: "https://nube.example", fetch: async () => { pedidas++; return imagen(); } });
    assert.deepEqual(r, { bajados: 0, borrados: 1, fallidos: 0 });
    assert.equal(pedidas, 0);
    assert.equal(readFileSync(path.join(dir, `${A}.jpg`), "utf8"), "ya");
    assert.deepEqual(readdirSync(dir), [`${A}.jpg`], "lo que sobraba se borró de verdad");
  });
});

test("una descarga que falla se salta, no deja medio archivo y no tumba a las demás", async () => {
  await enTemporal(async (dir) => {
    const logs = [];
    const r = await sincronizarAnuncios({
      pool: poolFalso([fila(A), fila(B)]), dir, cloudUrl: "https://nube.example", log: (m) => logs.push(m),
      fetch: async (url) => { if (url.includes(A)) throw new Error("sin red"); return imagen(); },
    });
    assert.deepEqual(r, { bajados: 1, borrados: 0, fallidos: 1 });
    assert.deepEqual(readdirSync(dir), [`${B}.jpg`]);
    assert.equal(logs.length, 1);
  });
});

test("lo que no es una imagen, o pesa de más, no se guarda", async () => {
  await enTemporal(async (dir) => {
    const r = await sincronizarAnuncios({
      pool: poolFalso([fila(A), fila(B)]), dir, cloudUrl: "https://nube.example",
      fetch: async (url) => (url.includes(A) ? new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }) : imagen("image/jpeg", 3 * 1024 * 1024)),
    });
    assert.deepEqual(r, { bajados: 0, borrados: 0, fallidos: 2 });
    assert.deepEqual(readdirSync(dir), []);
  });
});

test("si la base falla, no lanza y no borra lo que hay en disco", async () => {
  await enTemporal(async (dir) => {
    writeFileSync(path.join(dir, `${A}.jpg`), "ya");
    const r = await sincronizarAnuncios({ pool: { query: async () => { throw new Error("sin base"); } }, dir, cloudUrl: "https://nube.example", fetch: async () => imagen() });
    assert.deepEqual(r, { bajados: 0, borrados: 0, fallidos: 0 });
    assert.deepEqual(readdirSync(dir), [`${A}.jpg`]);
  });
});

test("la lista para la pantalla trae solo lo que ya está en disco, en orden, con los segundos", async () => {
  await enTemporal(async (dir) => {
    writeFileSync(path.join(dir, `${B}.png`), "x");
    const l = await listarAnuncios({ pool: poolFalso([fila(A), fila(B, "png")], 12), dir });
    assert.deepEqual(l, { segundos: 12, anuncios: [{ id: B, url: `/__anuncios/${B}.png`, segundos: 12 }] });
  });
});

test("un anuncio con tiempo propio lo conserva; uno sin él, o con uno inválido, usa el general", async () => {
  await enTemporal(async (dir) => {
    const C = "33333333-3333-3333-3333-333333333333";
    for (const id of [A, B, C]) writeFileSync(path.join(dir, `${id}.jpg`), "x");
    const filas = [fila(A, "jpg", { segundos: 20 }), fila(B, "jpg", { segundos: null }), fila(C, "jpg", { segundos: 999 })];
    const l = await listarAnuncios({ pool: poolFalso(filas, 10), dir });
    assert.deepEqual(l.anuncios.map((a) => a.segundos), [20, 10, 10]);
  });
});

test("sin configuración usa 8 segundos; si algo falla, lista vacía", async () => {
  await enTemporal(async (dir) => {
    assert.deepEqual(await listarAnuncios({ pool: poolFalso([], null), dir }), { segundos: 8, anuncios: [] });
    assert.deepEqual(await listarAnuncios({ pool: { query: async () => { throw new Error("x"); } }, dir }), { segundos: 8, anuncios: [] });
  });
});

test("la ruta de un archivo solo se resuelve para nombres con forma de anuncio", () => {
  const dir = path.join(os.tmpdir(), "anuncios");
  assert.equal(rutaDeAnuncio(dir, `${A}.jpg`), path.join(dir, `${A}.jpg`));
  for (const malo of ["../secreto.jpg", `${A}.exe`, `..%2f${A}.jpg`, `${A}.jpg/..`, ""]) assert.equal(rutaDeAnuncio(dir, malo), null, malo);
});
