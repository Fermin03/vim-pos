import test from "node:test";
import assert from "node:assert/strict";
import { estadoPermiteTimbrar, negocioPuedeTimbrar, NEGOCIO_DADO_DE_BAJA } from "./negocio.ts";

/** Lectura simulada: devuelve la fila que se le diga y cuenta las veces que se leyó. */
function lector(fila: { estado: string } | null, error: { message: string } | null = null) {
  const l = Object.assign(() => { l.veces += 1; return Promise.resolve({ data: fila, error }); }, { veces: 0 });
  return l;
}

test("un negocio CANCELADO no timbra: está a un paso de poder eliminarse (0144)", () => {
  assert.equal(estadoPermiteTimbrar("CANCELADO"), false);
});

test("los demás estados no los decide esta regla (el bloqueo con gracia va por mi_acceso)", () => {
  for (const e of ["ACTIVO", "TRIAL", "SUSPENDIDO", "INTERNO"]) assert.equal(estadoPermiteTimbrar(e), true, e);
});

test("un negocio que ya no existe tampoco timbra", () => {
  assert.equal(estadoPermiteTimbrar(null), false);
  assert.equal(estadoPermiteTimbrar(undefined), false);
  assert.equal(estadoPermiteTimbrar(""), false);
});

test("negocioPuedeTimbrar lee el estado cada vez que se le pregunta (no lo recuerda)", async () => {
  const activo = lector({ estado: "ACTIVO" });
  assert.equal(await negocioPuedeTimbrar(activo), true);
  assert.equal(await negocioPuedeTimbrar(activo), true);
  assert.equal(activo.veces, 2);
  assert.equal(await negocioPuedeTimbrar(lector({ estado: "CANCELADO" })), false);
});

test("eliminado entre el borrador y el PAC (no hay fila): no se timbra", async () => {
  assert.equal(await negocioPuedeTimbrar(lector(null)), false);
});

test("si la lectura falla, no se timbra: ante la duda no se manda nada al SAT", async () => {
  assert.equal(await negocioPuedeTimbrar(lector(null, { message: "timeout" })), false);
  assert.equal(await negocioPuedeTimbrar(lector({ estado: "ACTIVO" }, { message: "timeout" })), false);
});

test("el aviso es uno solo, en español, para las tres funciones", () => {
  assert.equal(NEGOCIO_DADO_DE_BAJA.error, "NEGOCIO_DADO_DE_BAJA");
  assert.match(NEGOCIO_DADO_DE_BAJA.detalle, /dado de baja/);
});
