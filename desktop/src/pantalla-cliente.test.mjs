import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { rmSync, writeFileSync } from "node:fs";
import { CONFIG_INICIAL, normalizarConfig, leerConfig, guardarConfig, elegirMonitor } from "./pantalla-cliente.mjs";

const A = { id: 1 }, B = { id: 2 }, C = { id: 3 };

test("con un solo monitor no hay pantalla del cliente", () => {
  assert.equal(elegirMonitor([A], 1, CONFIG_INICIAL), null);
});

test("con dos monitores toma el que no es el de la caja, sin configurar nada", () => {
  assert.equal(elegirMonitor([A, B], 1, CONFIG_INICIAL), B);
  assert.equal(elegirMonitor([A, B], 2, CONFIG_INICIAL), A);
});

test("con tres respeta el monitor elegido", () => {
  assert.equal(elegirMonitor([A, B, C], 1, { modo: "auto", displayId: 3 }), C);
});

test("si el elegido se desconectó, cae al primero disponible", () => {
  assert.equal(elegirMonitor([A, B], 1, { modo: "auto", displayId: 3 }), B);
});

test("nunca elige el monitor de la caja aunque esté configurado", () => {
  assert.equal(elegirMonitor([A, B], 1, { modo: "auto", displayId: 1 }), B);
});

test("apagada no abre nada aunque haya monitor", () => {
  assert.equal(elegirMonitor([A, B], 1, { modo: "apagada", displayId: null }), null);
});

test("una configuración rota se lee como la inicial", () => {
  assert.deepEqual(normalizarConfig(null), CONFIG_INICIAL);
  assert.deepEqual(normalizarConfig({ modo: "kiosco", displayId: "2" }), CONFIG_INICIAL);
  assert.deepEqual(normalizarConfig({ modo: "apagada", displayId: 7 }), { modo: "apagada", displayId: 7 });
});

test("guarda y vuelve a leer; sin archivo o con basura da la inicial", () => {
  const archivo = path.join(os.tmpdir(), `vim-pc-${process.pid}-${Date.now()}.json`);
  try {
    assert.deepEqual(leerConfig(archivo), CONFIG_INICIAL);
    guardarConfig(archivo, { modo: "apagada", displayId: 5 });
    assert.deepEqual(leerConfig(archivo), { modo: "apagada", displayId: 5 });
    writeFileSync(archivo, "{no es json");
    assert.deepEqual(leerConfig(archivo), CONFIG_INICIAL);
  } finally {
    rmSync(archivo, { force: true });
  }
});
