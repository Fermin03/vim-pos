import { test } from "node:test";
import assert from "node:assert/strict";
import { cajaIdDeEmail, validarCuerpo } from "./latido.ts";

test("saca el caja_id del correo sintético del dispositivo", () => {
  assert.equal(
    cajaIdDeEmail("caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.mx"),
    "99999999-0000-0000-0000-0000000000cc",
  );
});

test("rechaza un correo que no es de dispositivo", () => {
  assert.equal(cajaIdDeEmail("dueno@negocio.mx"), null);
  assert.equal(cajaIdDeEmail(""), null);
  assert.equal(cajaIdDeEmail(null), null);
});

test("acepta un cuerpo válido", () => {
  const r = validarCuerpo({ version: "0.4.58", so: "Windows 11", avisos_vistos: [] });
  assert.equal(r.version, "0.4.58");
  assert.equal(r.so, "Windows 11");
});

test("un cuerpo vacío es válido: el latido sirve aunque no reporte nada", () => {
  const r = validarCuerpo({});
  assert.equal(r.version, null);
  assert.deepEqual(r.avisos_vistos, []);
});

test("recorta textos largos en vez de rechazar el latido", () => {
  const r = validarCuerpo({ version: "9".repeat(50), so: "x".repeat(200) });
  assert.equal(r.version!.length, 20);
  assert.equal(r.so!.length, 80);
});

test("descarta avisos que no son uuid y limita la lista", () => {
  const r = validarCuerpo({ avisos_vistos: ["no-uuid", "99999999-0000-0000-0000-0000000000cc"] });
  assert.deepEqual(r.avisos_vistos, ["99999999-0000-0000-0000-0000000000cc"]);
});

test("un cuerpo que no es objeto no revienta", () => {
  assert.deepEqual(validarCuerpo(null), { version: null, so: null, avisos_vistos: [] });
  assert.deepEqual(validarCuerpo("hola"), { version: null, so: null, avisos_vistos: [] });
});
