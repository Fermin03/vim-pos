import { test } from "node:test";
import assert from "node:assert/strict";
import { accionInternaPermitida, secretoInternoValido } from "./interno.ts";

test("secreto correcto → válido", () => {
  assert.equal(secretoInternoValido("clave-buena", "clave-buena"), true);
});

test("secreto incorrecto → inválido (INTERNO_INVALIDO en el handler)", () => {
  assert.equal(secretoInternoValido("clave-mala", "clave-buena"), false);
});

test("secreto no configurado en el entorno → inválido aunque el recibido sea vacío igual", () => {
  assert.equal(secretoInternoValido("", ""), false);
  assert.equal(secretoInternoValido("cualquier-cosa", ""), false);
});

test("accion \"pausar\" con secreto válido → permitida", () => {
  assert.equal(accionInternaPermitida("pausar"), true);
});

test("una acción distinta de \"pausar\", aun con el secreto válido → se rechaza", () => {
  assert.equal(accionInternaPermitida("desconectar"), false);
  assert.equal(accionInternaPermitida("reanudar"), false);
  assert.equal(accionInternaPermitida(undefined), false);
});
