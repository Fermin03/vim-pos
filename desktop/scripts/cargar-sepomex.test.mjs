import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearSepomex } from "./cargar-sepomex.mjs";

const MUESTRA = [
  "El Catálogo Nacional de Códigos Postales, es elaborado por Correos de México…",
  "d_codigo|d_asenta|d_tipo_asenta|D_mnpio|d_estado|d_ciudad|d_CP|c_estado|c_oficina|c_CP|c_tipo_asenta|c_mnpio|id_asenta_cpcons|d_zona|c_cve_ciudad",
  "37000|León de los Aldama Centro|Colonia|León|Guanajuato|León de los Aldama|37001|11|37001||09|020|0001|Urbano|01",
  "37280|Jardines del Moral|Fraccionamiento|León|Guanajuato|León de los Aldama|37001|11|37001||21|020|0420|Urbano|01",
  "",
].join("\r\n");

test("parsea las filas y arma la clave de municipio", () => {
  const filas = parsearSepomex(MUESTRA);
  assert.equal(filas.length, 2);
  assert.deepEqual(filas[1], {
    codigo_postal: "37280", nombre: "Jardines del Moral", tipo: "Fraccionamiento",
    municipio: "León", estado: "Guanajuato", clave_municipio: "11020",
  });
});

test("rechaza un archivo sin los encabezados esperados", () => {
  assert.throws(() => parsearSepomex("hola\nmundo"), /encabezados/);
});
