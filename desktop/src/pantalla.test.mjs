import { test } from "node:test";
import assert from "node:assert/strict";
import { describirPantalla, pantallaDeLaCaja } from "./pantalla.mjs";

test("reporta píxeles físicos y la escala: 1280×1024 al 125 %", () => {
  // Electron da el tamaño en DIP: 1024×819.2 a escala 1.25.
  assert.deepEqual(describirPantalla({ size: { width: 1024, height: 819.2 }, scaleFactor: 1.25 }), { ancho: 1280, alto: 1024, escala: 1.25 });
});

test("una pantalla al 100 % se reporta tal cual", () => {
  assert.deepEqual(describirPantalla({ size: { width: 1920, height: 1080 }, scaleFactor: 1 }), { ancho: 1920, alto: 1080, escala: 1 });
});

test("sin display o con escala inválida no inventa una pantalla", () => {
  assert.equal(describirPantalla(null), null);
  assert.equal(describirPantalla({ size: { width: 1024, height: 768 }, scaleFactor: 0 }), null);
  assert.equal(describirPantalla({ size: { width: 1024, height: 768 }, scaleFactor: Number.NaN }), null);
});

test("usa la pantalla de la ventana de la caja si existe; si no, la principal", () => {
  const principal = { size: { width: 1920, height: 1080 }, scaleFactor: 1 };
  const secundaria = { size: { width: 1024, height: 768 }, scaleFactor: 1 };
  const screen = { getPrimaryDisplay: () => principal, getDisplayMatching: () => secundaria };
  const ventana = { isDestroyed: () => false, getBounds: () => ({ x: 2000, y: 0, width: 800, height: 600 }) };
  assert.deepEqual(pantallaDeLaCaja(screen, ventana), { ancho: 1024, alto: 768, escala: 1 });
  assert.deepEqual(pantallaDeLaCaja(screen, null), { ancho: 1920, alto: 1080, escala: 1 });
});

test("si Electron falla al leer la pantalla, el latido sigue sin ella", () => {
  const screen = { getPrimaryDisplay: () => { throw new Error("sin pantalla"); } };
  assert.equal(pantallaDeLaCaja(screen, null), null);
});
