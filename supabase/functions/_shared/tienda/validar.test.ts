import { test } from "node:test";
import assert from "node:assert/strict";
import { esUuid, leerCuerpo, normalizarTelefono, textoLimpio } from "./validar.ts";

const SUC = "99999999-0000-0000-0000-0000000000bb";

test("teléfono: 10 dígitos tal cual", () => {
  assert.equal(normalizarTelefono("4771112233"), "4771112233");
});
test("teléfono: se quitan espacios, guiones y paréntesis", () => {
  assert.equal(normalizarTelefono("(477) 111-22 33"), "4771112233");
});
test("teléfono: se quita el prefijo de México, con y sin el 1 de celular", () => {
  assert.equal(normalizarTelefono("+52 477 111 2233"), "4771112233");
  assert.equal(normalizarTelefono("5214771112233"), "4771112233");
});
test("teléfono: cualquier otra longitud se rechaza", () => {
  for (const t of ["477111223", "47711122334", "", "abc", null, undefined, 4771112233]) {
    assert.equal(normalizarTelefono(t), null);
  }
});
test("texto: recorta, colapsa espacios y quita caracteres de control", () => {
  assert.equal(textoLimpio("  Ana \u0000 María\n\tLópez  ", 50), "Ana María López");
});
test("texto: vacío o no texto es null; lo largo se corta", () => {
  assert.equal(textoLimpio("   ", 10), null);
  assert.equal(textoLimpio(42, 10), null);
  assert.equal(textoLimpio("abcdefghijkl", 5), "abcde");
});
test("uuid", () => {
  assert.equal(esUuid(SUC), true);
  assert.equal(esUuid("99999999-0000-0000-0000-0000000000b"), false);
  assert.equal(esUuid(null), false);
});

test("cuerpo: acción desconocida o cuerpo que no es objeto", () => {
  assert.deepEqual(leerCuerpo(null), { ok: false, error: "CUERPO_INVALIDO" });
  assert.deepEqual(leerCuerpo([]), { ok: false, error: "CUERPO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ accion: "borrar", negocio: "x" }), { ok: false, error: "ACCION_INVALIDA" });
});
test("cuerpo: el negocio es un slug en minúsculas", () => {
  assert.deepEqual(leerCuerpo({ accion: "negocio", negocio: "Knock-Out" }), { ok: true, valor: { accion: "negocio", negocio: "knock-out" } });
  assert.deepEqual(leerCuerpo({ accion: "negocio", negocio: "con espacios" }), { ok: false, error: "NEGOCIO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ accion: "negocio" }), { ok: false, error: "NEGOCIO_INVALIDO" });
});
test("cuerpo: menu exige una sucursal uuid", () => {
  assert.deepEqual(leerCuerpo({ accion: "menu", negocio: "knockout", sucursal_id: "x" }), { ok: false, error: "SUCURSAL_INVALIDA" });
  assert.equal(leerCuerpo({ accion: "menu", negocio: "knockout", sucursal_id: SUC }).ok, true);
});
test("cuerpo: cotizar valida modo, zona e items como arreglo acotado", () => {
  const base = { accion: "cotizar", negocio: "knockout", sucursal_id: SUC, modo: "RECOGER", items: [{}] };
  assert.equal(leerCuerpo(base).ok, true);
  assert.deepEqual(leerCuerpo({ ...base, modo: "MESA" }), { ok: false, error: "MODO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ ...base, zona_id: "x" }), { ok: false, error: "ZONA_INVALIDA" });
  assert.deepEqual(leerCuerpo({ ...base, items: "x" }), { ok: false, error: "CARRITO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ ...base, items: [] }), { ok: false, error: "CARRITO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ ...base, items: Array(41).fill({}) }), { ok: false, error: "CARRITO_INVALIDO" });
});

const pedir = {
  accion: "pedir", negocio: "knockout", sucursal_id: SUC, modo: "DOMICILIO",
  zona_id: "99999999-0000-0000-0000-0000000000aa", items: [{}],
  cliente: { nombre: " Ana ", telefono: "(477) 111 2233", email: "ANA@Example.com " },
  direccion: { calle: "Av. Siempre Viva", numero_exterior: "742", colonia: "Centro",
               codigo_postal: "37000", ciudad: "León", estado: "Guanajuato" },
  pago: "EFECTIVO", paga_con: 500, nota: " tocar el timbre ", captcha: "tok",
};
test("cuerpo: pedir normaliza cliente, dirección, pago y nota", () => {
  const r = leerCuerpo(pedir);
  assert.equal(r.ok, true);
  if (!r.ok || r.valor.accion !== "pedir") return;
  assert.deepEqual(r.valor.cliente, { nombre: "Ana", telefono: "4771112233", email: "ana@example.com" });
  assert.equal(r.valor.direccion?.numero_interior, null);
  assert.equal(r.valor.direccion?.referencias, null);
  assert.equal(r.valor.paga_con, "500.00");
  assert.equal(r.valor.nota, "tocar el timbre");
  assert.equal(r.valor.captcha, "tok");
});
test("cuerpo: pedir rechaza lo que no cuadra", () => {
  const con = (cambio: object) => leerCuerpo({ ...pedir, ...cambio });
  assert.deepEqual(con({ cliente: { ...pedir.cliente, telefono: "123" } }), { ok: false, error: "CLIENTE_INVALIDO" });
  assert.deepEqual(con({ cliente: { ...pedir.cliente, nombre: "  " } }), { ok: false, error: "CLIENTE_INVALIDO" });
  assert.deepEqual(con({ cliente: { ...pedir.cliente, email: "sin-arroba" } }), { ok: false, error: "CLIENTE_INVALIDO" });
  assert.deepEqual(con({ direccion: null }), { ok: false, error: "DIRECCION_INVALIDA" });
  assert.deepEqual(con({ direccion: { ...pedir.direccion, codigo_postal: "3700" } }), { ok: false, error: "DIRECCION_INVALIDA" });
  assert.deepEqual(con({ modo: "RECOGER" }), { ok: false, error: "DIRECCION_INVALIDA" });
  assert.deepEqual(con({ pago: "CHEQUE" }), { ok: false, error: "PAGO_INVALIDO" });
  assert.deepEqual(con({ pago: "TARJETA" }), { ok: false, error: "PAGO_INVALIDO" });
  assert.deepEqual(con({ paga_con: -1 }), { ok: false, error: "PAGO_INVALIDO" });
  assert.deepEqual(con({ paga_con: "mucho" }), { ok: false, error: "PAGO_INVALIDO" });
});
test("cuerpo: pedir para recoger no lleva dirección ni zona; correo y paga_con son opcionales", () => {
  const r = leerCuerpo({ ...pedir, modo: "RECOGER", zona_id: null, direccion: null, paga_con: null,
                         cliente: { nombre: "Ana", telefono: "4771112233" } });
  assert.equal(r.ok, true);
  if (!r.ok || r.valor.accion !== "pedir") return;
  assert.equal(r.valor.cliente.email, null);
  assert.equal(r.valor.paga_con, null);
});
test("cuerpo: seguimiento exige un código con forma de código", () => {
  assert.equal(leerCuerpo({ accion: "seguimiento", negocio: "knockout", codigo: "A".repeat(22) }).ok, true);
  assert.deepEqual(leerCuerpo({ accion: "seguimiento", negocio: "knockout", codigo: "corto" }), { ok: false, error: "CODIGO_INVALIDO" });
});
