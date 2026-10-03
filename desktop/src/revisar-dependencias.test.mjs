import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dependenciasFaltantes, nodeModulesEsEnlace } from "./revisar-dependencias.mjs";

const PKG = { dependencies: { pg: "^8.13.1", jsonwebtoken: "^9.0.2", "@scope/paquete": "1.0.0" } };

function enTemporal(fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "vim-deps-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Un paquete instalado es una carpeta con su package.json. */
function instalar(base, nombre) {
  mkdirSync(path.join(base, "node_modules", nombre), { recursive: true });
  writeFileSync(path.join(base, "node_modules", nombre, "package.json"), JSON.stringify({ name: nombre }));
}

test("con todas las dependencias instaladas no falta nada", () => {
  enTemporal((dir) => {
    for (const n of Object.keys(PKG.dependencies)) instalar(dir, n);
    assert.deepEqual(dependenciasFaltantes(PKG, dir), []);
  });
});

test("dice cuáles faltan, incluidos los paquetes con scope", () => {
  enTemporal((dir) => {
    instalar(dir, "pg");
    assert.deepEqual(dependenciasFaltantes(PKG, dir).sort(), ["@scope/paquete", "jsonwebtoken"]);
  });
});

test("una carpeta sin package.json no cuenta como instalada", () => {
  enTemporal((dir) => {
    for (const n of Object.keys(PKG.dependencies)) instalar(dir, n);
    rmSync(path.join(dir, "node_modules", "pg", "package.json"));
    assert.deepEqual(dependenciasFaltantes(PKG, dir), ["pg"]);
  });
});

test("sin node_modules faltan todas; sin dependencias no falta nada", () => {
  enTemporal((dir) => {
    assert.equal(dependenciasFaltantes(PKG, dir).length, 3);
    assert.deepEqual(dependenciasFaltantes({}, dir), []);
  });
});

test("node_modules como enlace (junction) se detecta; una carpeta real no", () => {
  enTemporal((dir) => {
    const real = path.join(dir, "real");
    mkdirSync(path.join(real, "node_modules"), { recursive: true });
    assert.equal(nodeModulesEsEnlace(real), false);

    const conEnlace = path.join(dir, "con-enlace");
    mkdirSync(conEnlace);
    symlinkSync(path.join(real, "node_modules"), path.join(conEnlace, "node_modules"), "junction");
    assert.equal(nodeModulesEsEnlace(conEnlace), true);
  });
});

test("sin node_modules no es un enlace (lo reporta la revisión de faltantes)", () => {
  enTemporal((dir) => {
    assert.equal(nodeModulesEsEnlace(dir), false);
  });
});
