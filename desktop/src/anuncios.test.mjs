import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { nombreArchivo, planAnuncios, sincronizarAnuncios, listarAnuncios, rutaDeAnuncio } from "./anuncios.mjs";

const T = "99999999-0000-0000-0000-0000000000aa";
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const fila = (id, ext = "jpg", extra = {}) => ({ id, tenant_id: T, ruta: `${T}/${id}.${ext}`, orden: 0, ...extra });

/**
 * Postgres de mentira: contesta las consultas del módulo como lo haría la base de la caja.
 * `tenant` es el negocio que el pull dejó anotado en _vim_sync (null = nunca se anotó;
 * `sinTabla` = la caja nunca ha hecho un pull). Las filas y la configuración se filtran por negocio
 * solo si la consulta trae `tenant_id = $1`, igual que el WHERE de verdad: una consulta sin filtro
 * devuelve las de todos los negocios.
 */
function poolFalso(filas, segundos = 8, { tenant = T, sinTabla = false, configuraciones } = {}) {
  const cfgs = configuraciones ?? (segundos === null ? [] : [{ tenant_id: T, pantalla_cliente_segundos: segundos }]);
  const delNegocio = (sql, params, lista) => (/tenant_id\s*=\s*\$1/.test(sql) ? lista.filter((x) => x.tenant_id === params[0]) : lista);
  return {
    query: async (sql, params = []) => {
      if (/to_regclass/i.test(sql)) return { rows: [{ hay: !sinTabla }] };
      if (/FROM _vim_sync/i.test(sql)) return { rows: tenant === null ? [] : [{ valor: tenant }] };
      if (/FROM anuncios_pantalla/i.test(sql)) return { rows: delNegocio(sql, params, filas) };
      if (/pantalla_cliente_segundos/i.test(sql)) return { rows: delNegocio(sql, params, cfgs) };
      throw new Error("consulta inesperada: " + sql);
    },
  };
}
const imagen = (tipo = "image/jpeg", bytes = 10) => new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": tipo } });
const enTemporal = async (fn) => { const dir = mkdtempSync(path.join(os.tmpdir(), "vim-anuncios-")); try { await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test("el nombre en disco es el id con la extensión de la ruta", () => {
  assert.equal(nombreArchivo(fila(A, "png")), `${A}.png`);
  assert.equal(nombreArchivo(fila(A, "JPEG")), null, "la nube solo guarda minúsculas jpg|png|webp");
  assert.equal(nombreArchivo(fila(A, "jpeg")), null);
  assert.equal(nombreArchivo({ id: A, ruta: `${T}/foto.gif` }), null, "una extensión que no es imagen permitida no entra");
  assert.equal(nombreArchivo({ id: "../../x", ruta: `${T}/a.jpg` }), null, "un id que no es uuid no entra");
});

test("una ruta que no es <uuid>/<uuid>.<ext> exacta no entra", () => {
  for (const ruta of ["x/../../auth/v1/y.jpg", `${T}/${A}.jpg?x=1`, `${T}/${A}.jpg#f`, `${T}/sub/${A}.jpg`, `${T}/${A}.JPG`, `${A}.jpg`, `../${T}/${A}.jpg`, `x${T}/${A}.jpg`, `${T}/${A}xjpg`, `${T}/${A}/png`, null, 5]) assert.equal(nombreArchivo({ id: A, ruta }), null, String(ruta));
});

test("un archivo con casi la forma de anuncio (punto cambiado) ni cuenta ni se borra", () => {
  assert.deepEqual(planAnuncios([], [`${A}xjpg`]), { descargar: [], borrar: [] });
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

test("una fila con ruta hostil no provoca ninguna petición ni cuenta como fallida", async () => {
  await enTemporal(async (dir) => {
    const pedidas = [];
    const r = await sincronizarAnuncios({
      pool: poolFalso([{ id: A, tenant_id: T, ruta: "x/../../auth/v1/y.jpg" }, { id: B, tenant_id: T, ruta: `${T}/${B}.jpg?x=1` }]), dir, cloudUrl: "https://nube.example",
      fetch: async (url) => { pedidas.push(url); return imagen(); },
    });
    assert.deepEqual(pedidas, []);
    assert.deepEqual(r, { bajados: 0, borrados: 0, fallidos: 0 });
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

test("sin configuración usa 8 segundos", async () => {
  await enTemporal(async (dir) => {
    assert.deepEqual(await listarAnuncios({ pool: poolFalso([], null), dir }), { segundos: 8, anuncios: [] });
  });
});

// Una lectura fallida NO es "no hay anuncios": la pantalla la trataría como lista vacía y quitaría el
// carrusel (ADR 0026 promete que conserva la lista anterior). Devuelve null, sin lanzar.
test("si la base falla, devuelve null (no una lista vacía) y no lanza", async () => {
  await enTemporal(async (dir) => {
    assert.equal(await listarAnuncios({ pool: { query: async () => { throw new Error("x"); } }, dir }), null);
    assert.equal(await listarAnuncios({ pool: undefined, dir }), null, "sin backend todavía también es una lectura fallida");
    // Falla a la mitad: el negocio se leyó, la lista no.
    const aMedias = { query: async (sql) => { if (/to_regclass/.test(sql)) return { rows: [{ hay: true }] }; if (/_vim_sync/.test(sql)) return { rows: [{ valor: T }] }; throw new Error("se cayó"); } };
    assert.equal(await listarAnuncios({ pool: aMedias, dir }), null);
  });
});

// Revisión final: el pull solo hace upsert, así que una caja revinculada del negocio A al B conserva
// las filas de A. Sin filtrar por el negocio vinculado, la pantalla mezclaba los anuncios de los dos
// (y la duración general de A podía ganar).
const T2 = "88888888-0000-0000-0000-0000000000bb";
const C = "33333333-3333-3333-3333-333333333333";
const filaDe = (tenant, id) => ({ id, tenant_id: tenant, ruta: `${tenant}/${id}.jpg`, orden: 0 });

test("con dos negocios en la base, solo baja y lista los del negocio vinculado; los del otro se borran", async () => {
  await enTemporal(async (dir) => {
    writeFileSync(path.join(dir, `${C}.jpg`), "de A"); // la imagen que había bajado el negocio anterior
    const pool = poolFalso([filaDe(T, C), filaDe(T2, A)], 8, {
      tenant: T2,
      configuraciones: [{ tenant_id: T, pantalla_cliente_segundos: 30 }, { tenant_id: T2, pantalla_cliente_segundos: 12 }],
    });
    const pedidas = [];
    const r = await sincronizarAnuncios({ pool, dir, cloudUrl: "https://nube.example", fetch: async (url) => { pedidas.push(url); return imagen(); } });
    assert.deepEqual(pedidas, [`https://nube.example/storage/v1/object/public/anuncios/${T2}/${A}.jpg`]);
    assert.deepEqual(r, { bajados: 1, borrados: 1, fallidos: 0 });
    assert.deepEqual(readdirSync(dir), [`${A}.jpg`], "el archivo del negocio anterior se borró");
    assert.deepEqual(await listarAnuncios({ pool, dir }), { segundos: 12, anuncios: [{ id: A, url: `/__anuncios/${A}.jpg`, segundos: 12 }] });
  });
});

test("sin negocio anotado no hay anuncios ni descargas", async () => {
  for (const opciones of [{ tenant: null }, { sinTabla: true }]) {
    await enTemporal(async (dir) => {
      writeFileSync(path.join(dir, `${A}.jpg`), "x");
      const pool = poolFalso([fila(A), fila(B)], 8, opciones);
      let pedidas = 0;
      await sincronizarAnuncios({ pool, dir, cloudUrl: "https://nube.example", fetch: async () => { pedidas++; return imagen(); } });
      assert.equal(pedidas, 0, JSON.stringify(opciones));
      assert.deepEqual(await listarAnuncios({ pool, dir }), { segundos: 8, anuncios: [] }, JSON.stringify(opciones));
    });
  }
});

test("la ruta de un archivo solo se resuelve para nombres con forma de anuncio", () => {
  const dir = path.join(os.tmpdir(), "anuncios");
  assert.equal(rutaDeAnuncio(dir, `${A}.jpg`), path.join(dir, `${A}.jpg`));
  for (const malo of ["../secreto.jpg", `${A}.exe`, `${A}/png`, `${A}xjpg`, `${A}\\png`, `..%2f${A}.jpg`, `${A}.jpg/..`, ""]) assert.equal(rutaDeAnuncio(dir, malo), null, malo);
});
