import test from "node:test";
import assert from "node:assert/strict";
import {
  campoDelRechazo,
  REGIMENES_RECEPTOR,
  RFC_VALIDO,
  traducirRechazo,
  usosParaRegimen,
  usosPorRegimen,
} from "./receptor.ts";

test("quien deduce: Gastos en general primero, luego mercancías y sin efectos", () => {
  assert.deepEqual(usosParaRegimen("612"), ["G03", "G01", "S01"]);
  assert.deepEqual(usosParaRegimen("626"), ["G03", "G01", "S01"]);
  assert.deepEqual(usosParaRegimen("625"), ["G03", "G01", "S01"]);
});

test("sueldos y salarios: G03 lo rechaza el PAC, así que solo Sin efectos fiscales", () => {
  // «La clave G03 del campo UsoCFDI no es válida para usarse con el régimen fiscal 605.»
  assert.deepEqual(usosParaRegimen("605"), ["S01"]);
  assert.deepEqual(usosParaRegimen("614"), ["S01"]);
  assert.deepEqual(usosParaRegimen("616"), ["S01"]);
});

test("ya no se ofrece P01 (no existe en CFDI 4.0) ni usos que no son de una comida", () => {
  for (const usos of Object.values(usosPorRegimen())) {
    assert.ok(!usos.includes("P01"));
    assert.ok(usos.every((u) => ["G01", "G03", "S01"].includes(u)));
  }
});

test("todo régimen ofrecido tiene al menos un uso, y el 625 está", () => {
  assert.ok(REGIMENES_RECEPTOR.some((r) => r.clave === "625"));
  for (const r of REGIMENES_RECEPTOR) assert.ok(usosParaRegimen(r.clave).length > 0, r.clave);
  assert.deepEqual(usosParaRegimen("999"), []);
});

test("RFC: 12 caracteres empresa, 13 persona física", () => {
  assert.ok(RFC_VALIDO.test("EKU9003173C9"));
  assert.ok(RFC_VALIDO.test("XAMA620210DQ5"));
  assert.ok(RFC_VALIDO.test("ÑAÑA850101AB1"));
  assert.ok(!RFC_VALIDO.test("ABC12345678"));
  assert.ok(!RFC_VALIDO.test("ABCD1234567890"));
});

test("el rechazo del régimen marca el campo del régimen, no el genérico", () => {
  const m = "El campo RegimenFiscalReceptor no corresponde al RFC del receptor";
  assert.equal(campoDelRechazo(m), "regimenFiscal");
  assert.match(traducirRechazo(m), /régimen fiscal/);
});

test("el del código postal sigue diciendo dónde buscarlo", () => {
  const m = "El campo DomicilioFiscalReceptor del receptor, debe encontrarse en la lista de RFC inscritos no cancelados en el SAT.";
  assert.equal(campoDelRechazo(m), "codigoPostal");
  assert.match(traducirRechazo(m), /Constancia de Situación Fiscal/);
});
