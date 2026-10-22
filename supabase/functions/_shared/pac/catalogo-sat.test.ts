import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarClavesSat } from "./catalogo-sat.ts";

test("acepta Value/Name y Code/Description, y descarta lo que no es clave de 8 dígitos", () => {
  assert.deepEqual(normalizarClavesSat([
    { Value: "53101602", Name: "Camisas de hombre" },
    { Code: "53111600", Description: "Zapatos de mujer" },
    { Value: "xx", Name: "basura" },
    "texto",
  ]), [
    { clave: "53101602", descripcion: "Camisas de hombre" },
    { clave: "53111600", descripcion: "Zapatos de mujer" },
  ]);
});

test("cualquier cosa que no es arreglo da vacío", () => {
  assert.deepEqual(normalizarClavesSat({ Message: "error" }), []);
  assert.deepEqual(normalizarClavesSat(null), []);
});
