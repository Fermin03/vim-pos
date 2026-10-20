import { test } from "node:test";
import assert from "node:assert/strict";
import { cuentaDeClave, nombreDeCuenta, timeoutDelLector, validarConfiguracion, validarCredenciales } from "./clip-conexion.ts";

const ID = "11111111-1111-4111-8111-111111111111";

test("credenciales: vacías, con espacios o de más de 200 caracteres no pasan", () => {
  assert.deepEqual(validarCredenciales({ api_key: "abc123", secreto: "s3cr3t" }), { ok: true, api_key: "abc123", secreto: "s3cr3t" });
  for (const malo of ["", " abc", "ab c", "abc\n", "x".repeat(201), 123, null, undefined]) {
    assert.deepEqual(validarCredenciales({ api_key: malo, secreto: "ok" }), { ok: false, error: "FALTAN_CAMPOS" });
    assert.deepEqual(validarCredenciales({ api_key: "ok", secreto: malo }), { ok: false, error: "FALTAN_CAMPOS" });
  }
  assert.equal(validarCredenciales({ api_key: "x".repeat(200), secreto: "y" }).ok, true);
  assert.deepEqual(validarCredenciales(null), { ok: false, error: "FALTAN_CAMPOS" });
});

const config = (c: Record<string, unknown>) => validarConfiguracion({ sucursal_id: ID, imprime_terminal: true, espera_segundos: 180, propina_opciones: [10, 15, 20], ...c });

test("configurar: propina_opciones de 1 a 3 enteros entre 1 y 100, o nada", () => {
  assert.deepEqual(config({}), { ok: true, sucursal_id: ID, imprime_terminal: true, espera_segundos: 180, propina_opciones: [10, 15, 20] });
  assert.equal(config({ propina_opciones: null }).ok, true);
  assert.equal(config({ propina_opciones: undefined }).ok, true);
  for (const malo of [[], [10, 101], [0], [10, 15, 20, 25], [10.5], ["10"], [null], "10"]) {
    assert.deepEqual(config({ propina_opciones: malo }), { ok: false, error: "PROPINA_INVALIDA" }, JSON.stringify(malo));
  }
});

test("configurar: espera entre 60 y 10800 segundos, entera", () => {
  assert.equal(config({ espera_segundos: 60 }).ok, true);
  assert.equal(config({ espera_segundos: 10800 }).ok, true);
  for (const malo of [59, 10801, 30, 90.5, "180", null]) assert.deepEqual(config({ espera_segundos: malo }), { ok: false, error: "FALTAN_CAMPOS" });
  assert.deepEqual(config({ imprime_terminal: "si" }), { ok: false, error: "FALTAN_CAMPOS" });
  assert.deepEqual(config({ sucursal_id: "x" }), { ok: false, error: "FALTAN_CAMPOS" });
});

test("el lector espera lo pedido menos el minuto fijo que suma Clip", () => {
  assert.equal(timeoutDelLector(180), 120);
  assert.equal(timeoutDelLector(60), 0);
});

test("la cuenta se identifica por el sha256 de la API key, nunca por la clave", async () => {
  const id = await cuentaDeClave("abc");
  assert.equal(id, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(nombreDeCuenta("clave-larga-1234"), "Clip ····1234");
});
