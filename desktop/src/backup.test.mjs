// Pruebas de la copia en frío (backup.mjs). Carpetas temporales; sin Postgres.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hacerSitio, limpiarParciales, listarRespaldos, respaldar, respaldarAsync, tamanoDe } from "./backup.mjs";

async function conCarpeta(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "vim-backup-"));
  try { return await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function pgdataFalso(dir, bytes = 1000) {
  const data = path.join(dir, "pgdata");
  mkdirSync(path.join(data, "base"), { recursive: true });
  writeFileSync(path.join(data, "PG_VERSION"), "17");
  writeFileSync(path.join(data, "base", "tabla"), Buffer.alloc(bytes, 1));
  writeFileSync(path.join(data, "postmaster.pid"), "123");
  return data;
}
const viejos = (bd, dias) => dias.map((d) => {
  const r = path.join(bd, `pgdata-2026-09-${d}_23-00-00`);
  mkdirSync(r, { recursive: true });
  writeFileSync(path.join(r, "PG_VERSION"), "17");
  return path.basename(r);
});

test("una carpeta .parcial o ajena no cuenta como respaldo ni ocupa uno de los 7 lugares", () => conCarpeta((dir) => {
  const bd = path.join(dir, "backups");
  viejos(bd, [27, 28]);
  mkdirSync(path.join(bd, "pgdata-2026-09-29_23-00-00.parcial"));
  mkdirSync(path.join(bd, "pgdata-copia-de-juan"));
  assert.deepEqual(listarRespaldos(bd).map((r) => r.nombre), ["pgdata-2026-09-28_23-00-00", "pgdata-2026-09-27_23-00-00"]);
}));

test("al empezar un respaldo se borran las copias a medias que dejó un corte de luz", () => conCarpeta((dir) => {
  const data = pgdataFalso(dir), bd = path.join(dir, "backups");
  mkdirSync(path.join(bd, "pgdata-2026-09-29_23-00-00.parcial"), { recursive: true });
  assert.equal(limpiarParciales(bd), 1);
  mkdirSync(path.join(bd, "pgdata-2026-09-30_23-00-00.parcial"));
  assert.ok(respaldar(data, bd, 7));
  assert.deepEqual(readdirSync(bd).filter((n) => n.endsWith(".parcial")), []);
}));

test("respaldarAsync copia sin bloquear el proceso, excluye el pid y rota a 7", () => conCarpeta(async (dir) => {
  const data = pgdataFalso(dir), bd = path.join(dir, "backups");
  viejos(bd, [20, 21, 22, 23, 24, 25, 26, 27]);
  // Si la copia fuera síncrona, este temporizador no podría dispararse mientras dura.
  let latidos = 0;
  const dest = await respaldarAsync(data, bd, 7, () => {}, {
    copiar: async (de, a, opciones) => {
      const { cp } = await import("node:fs/promises");
      await new Promise((r) => setTimeout(() => { latidos++; r(); }, 5));
      return cp(de, a, opciones);
    },
  });
  assert.equal(latidos, 1);
  assert.ok(dest && existsSync(path.join(dest, "base", "tabla")));
  assert.ok(!existsSync(path.join(dest, "postmaster.pid")));
  assert.equal(readFileSync(path.join(dest, "PG_VERSION"), "utf8"), "17");
  assert.equal(listarRespaldos(bd).length, 7);
}));

test("respaldarAsync con la copia de verdad (fs.promises.cp) deja un respaldo completo", () => conCarpeta(async (dir) => {
  const data = pgdataFalso(dir), bd = path.join(dir, "backups");
  const dest = await respaldarAsync(data, bd, 7);
  assert.ok(dest && existsSync(path.join(dest, "base", "tabla")));
  assert.ok(!existsSync(path.join(dest, "postmaster.pid")));
}));

test("respaldarAsync que falla no deja .parcial y devuelve null con el motivo en el log", () => conCarpeta(async (dir) => {
  const data = pgdataFalso(dir), bd = path.join(dir, "backups");
  const mensajes = [];
  const dest = await respaldarAsync(data, bd, 7, (m) => mensajes.push(m), {
    copiar: async (_de, a) => { mkdirSync(a, { recursive: true }); throw new Error("ENOSPC: no space left on device"); },
  });
  assert.equal(dest, null);
  assert.match(mensajes.at(-1), /FALLÓ: ENOSPC/);
  assert.deepEqual(readdirSync(bd), []);
}));

test("tamanoDe suma los archivos del pgdata", () => conCarpeta(async (dir) => {
  const data = pgdataFalso(dir, 5000);
  assert.ok((await tamanoDe(data)) >= 5000);
}));

test("hay espacio de sobra: no purga nada", () => conCarpeta(async (dir) => {
  const data = pgdataFalso(dir), bd = path.join(dir, "backups");
  viejos(bd, [27, 28]);
  const r = await hacerSitio(data, bd, { tamano: async () => 100e6, libre: () => 10e9 });
  assert.equal(r.cabe, true);
  assert.equal(r.purgados.length, 0);
  assert.equal(listarRespaldos(bd).length, 2);
}));

test("disco justo: purga los más viejos hasta que quepa, y siempre deja al menos uno bueno", () => conCarpeta(async (dir) => {
  const data = pgdataFalso(dir), bd = path.join(dir, "backups");
  viejos(bd, [25, 26, 27, 28]);
  let libre = 150e6; // hacen falta ~310 MB; cada respaldo purgado libera 100 MB
  const r = await hacerSitio(data, bd, { tamano: async () => 100e6, libre: () => libre, alPurgar: () => { libre += 100e6; } });
  assert.equal(r.cabe, true);
  assert.deepEqual(r.purgados, ["pgdata-2026-09-25_23-00-00", "pgdata-2026-09-26_23-00-00"]);
  assert.deepEqual(listarRespaldos(bd).map((x) => x.nombre), ["pgdata-2026-09-28_23-00-00", "pgdata-2026-09-27_23-00-00"]);
}));

test("disco lleno de verdad: no cabe ni purgando, y el último respaldo bueno NO se toca", () => conCarpeta(async (dir) => {
  const data = pgdataFalso(dir), bd = path.join(dir, "backups");
  viejos(bd, [27, 28]);
  const r = await hacerSitio(data, bd, { tamano: async () => 100e6, libre: () => 1e6 });
  assert.equal(r.cabe, false);
  assert.deepEqual(listarRespaldos(bd).map((x) => x.nombre), ["pgdata-2026-09-28_23-00-00"]);
  assert.match(r.error, /espacio/);
}));

test("si no se puede medir el disco, no se bloquea el respaldo por eso", () => conCarpeta(async (dir) => {
  const data = pgdataFalso(dir), bd = path.join(dir, "backups");
  const r = await hacerSitio(data, bd, { tamano: async () => 100e6, libre: () => { throw new Error("statfs no disponible"); } });
  assert.equal(r.cabe, true);
}));
