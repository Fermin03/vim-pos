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
  assert.deepEqual(validarCuerpo(null), { version: null, so: null, avisos_vistos: [], pantalla: null });
  assert.deepEqual(validarCuerpo("hola"), { version: null, so: null, avisos_vistos: [], pantalla: null });
});

test("la pantalla válida pasa con su escala redondeada a centésimas (0121)", () => {
  const r = validarCuerpo({ pantalla: { ancho: 1280, alto: 1024, escala: 1.25 } });
  assert.deepEqual(r.pantalla, { ancho: 1280, alto: 1024, escala: 1.25 });
  assert.deepEqual(validarCuerpo({ pantalla: { ancho: 1920, alto: 1080, escala: 1.3333333 } }).pantalla, { ancho: 1920, alto: 1080, escala: 1.33 });
});

test("una pantalla incompleta o fuera de rango se descarta, sin tumbar el latido", () => {
  assert.equal(validarCuerpo({ pantalla: { ancho: 1280, alto: 1024 } }).pantalla, null);
  assert.equal(validarCuerpo({ pantalla: { ancho: 99999, alto: 1024, escala: 1 } }).pantalla, null);
  assert.equal(validarCuerpo({ pantalla: { ancho: "1280", alto: 1024, escala: 1 } }).pantalla, null);
  assert.equal(validarCuerpo({ pantalla: { ancho: 1280.5, alto: 1024, escala: 1 } }).pantalla, null);
  assert.equal(validarCuerpo({ pantalla: { ancho: 1280, alto: 1024, escala: 9 } }).pantalla, null);
  const r = validarCuerpo({ version: "0.4.87", pantalla: "1280x1024" });
  assert.equal(r.version, "0.4.87");
  assert.equal(r.pantalla, null);
});

test("sin pantalla (cajas anteriores a 0.4.87) el campo es null", () => {
  assert.equal(validarCuerpo({ version: "0.4.86" }).pantalla, null);
});
