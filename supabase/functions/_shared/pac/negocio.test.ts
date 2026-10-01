import test from "node:test";
import assert from "node:assert/strict";
import { negocioPermiteTimbrar, negocioPuedeTimbrar, NEGOCIO_DADO_DE_BAJA } from "./negocio.ts";

const AHORA = new Date("2026-10-01T18:00:00Z");
const ANTES = "2026-10-01T17:59:00Z";
const DESPUES = "2026-10-04T12:00:00Z";

/** Lectura simulada: devuelve la fila que se le diga y cuenta las veces que se leyó. */
function lector(fila: { estado: string; bloqueo_desde?: string | null } | null, error: { message: string } | null = null) {
  const l = Object.assign(() => { l.veces += 1; return Promise.resolve({ data: fila, error }); }, { veces: 0 });
  return l;
}

test("CANCELADO con el bloqueo ya en vigor no timbra: está a un paso de poder eliminarse (0144)", () => {
  assert.equal(negocioPermiteTimbrar({ estado: "CANCELADO", bloqueo_desde: ANTES }, AHORA), false);
  assert.equal(negocioPermiteTimbrar({ estado: "CANCELADO", bloqueo_desde: AHORA.toISOString() }, AHORA), false);
});

test("CANCELADO sin fecha de bloqueo no timbra: sin fecha no hay gracia que respetar", () => {
  assert.equal(negocioPermiteTimbrar({ estado: "CANCELADO", bloqueo_desde: null }, AHORA), false);
  assert.equal(negocioPermiteTimbrar({ estado: "CANCELADO" }, AHORA), false);
  assert.equal(negocioPermiteTimbrar({ estado: "CANCELADO", bloqueo_desde: "no-es-fecha" }, AHORA), false);
});

test("CANCELADO en sus días de gracia sigue facturando, igual que su caja sigue vendiendo (ADR 0014)", () => {
  assert.equal(negocioPermiteTimbrar({ estado: "CANCELADO", bloqueo_desde: DESPUES }, AHORA), true);
});

test("los demás estados no los decide esta regla (el bloqueo con gracia va por mi_acceso)", () => {
  for (const e of ["ACTIVO", "TRIAL", "SUSPENDIDO", "INTERNO"]) {
    assert.equal(negocioPermiteTimbrar({ estado: e, bloqueo_desde: ANTES }, AHORA), true, e);
  }
});

test("un negocio que ya no existe tampoco timbra", () => {
  assert.equal(negocioPermiteTimbrar(null, AHORA), false);
  assert.equal(negocioPermiteTimbrar(undefined, AHORA), false);
  assert.equal(negocioPermiteTimbrar({ estado: "" }, AHORA), false);
});

test("negocioPuedeTimbrar lee el estado cada vez que se le pregunta (no lo recuerda)", async () => {
  const activo = lector({ estado: "ACTIVO" });
  assert.equal(await negocioPuedeTimbrar(activo, AHORA), true);
  assert.equal(await negocioPuedeTimbrar(activo, AHORA), true);
  assert.equal(activo.veces, 2);
  assert.equal(await negocioPuedeTimbrar(lector({ estado: "CANCELADO", bloqueo_desde: ANTES }), AHORA), false);
  assert.equal(await negocioPuedeTimbrar(lector({ estado: "CANCELADO", bloqueo_desde: DESPUES }), AHORA), true);
});

test("eliminado entre el borrador y el PAC (no hay fila): no se timbra", async () => {
  assert.equal(await negocioPuedeTimbrar(lector(null), AHORA), false);
});

test("si la lectura falla, no se timbra: ante la duda no se manda nada al SAT", async () => {
  assert.equal(await negocioPuedeTimbrar(lector(null, { message: "timeout" }), AHORA), false);
  assert.equal(await negocioPuedeTimbrar(lector({ estado: "ACTIVO" }, { message: "timeout" }), AHORA), false);
});

test("el aviso es uno solo, en español, para las tres funciones", () => {
  assert.equal(NEGOCIO_DADO_DE_BAJA.error, "NEGOCIO_DADO_DE_BAJA");
  assert.match(NEGOCIO_DADO_DE_BAJA.detalle, /dado de baja/);
});
