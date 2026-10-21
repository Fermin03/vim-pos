import { test } from "node:test";
import assert from "node:assert/strict";
import { validarCuerpo } from "./cuerpo.ts";

const ID = "11111111-1111-4111-8111-111111111111";

test("crear exige cobro, ticket y un monto válido", () => {
  const r = validarCuerpo({ accion: "crear", cobro_id: ID, ticket_id: ID, monto: "348", folio: "A-12" });
  assert.deepEqual(r, { ok: true, cuerpo: { accion: "crear", cobro_id: ID, ticket_id: ID, folio: "A-12", monto: "348.00", caja_id: null, usuario_id: null, propina_en_lector: false } });
  assert.deepEqual(validarCuerpo({ accion: "crear", cobro_id: ID, ticket_id: ID, monto: "0" }), { ok: false, error: "MONTO_INVALIDO" });
  assert.deepEqual(validarCuerpo({ accion: "crear", cobro_id: ID, monto: "5" }), { ok: false, error: "TICKET_ID_INVALIDO" });
  assert.deepEqual(validarCuerpo({ accion: "crear", cobro_id: "x", ticket_id: ID, monto: "5" }), { ok: false, error: "COBRO_ID_INVALIDO" });
});

test("propina_en_lector solo con un true de verdad", () => {
  const lector = (v: unknown) => {
    const r = validarCuerpo({ accion: "crear", cobro_id: ID, ticket_id: ID, monto: "5", propina_en_lector: v });
    return r.ok && r.cuerpo.accion === "crear" && r.cuerpo.propina_en_lector;
  };
  assert.equal(lector(true), true);
  for (const v of [undefined, false, "true", 1, null]) assert.equal(lector(v), false, String(v));
});

test("un folio con algo que no es folio no viaja a Mercado Pago", () => {
  const r = validarCuerpo({ accion: "crear", cobro_id: ID, ticket_id: ID, monto: "5", folio: "Juan Pérez 4771234567 <x>" });
  assert.equal(r.ok && r.cuerpo.accion === "crear" && r.cuerpo.folio, null);
});

test("las demás acciones", () => {
  assert.equal(validarCuerpo({ accion: "pendientes" }).ok, true);
  assert.deepEqual(validarCuerpo({ accion: "disponible", caja_id: ID }), { ok: true, cuerpo: { accion: "disponible", caja_id: ID } });
  assert.deepEqual(validarCuerpo({ accion: "confirmar", cobro_id: ID, autorizo_id: "no-es-uuid" }), { ok: true, cuerpo: { accion: "confirmar", cobro_id: ID, caja_id: null, autorizo_id: null } });
  assert.equal(validarCuerpo({ accion: "estado", cobro_id: ID }).ok, true);
  assert.deepEqual(validarCuerpo({ accion: "borrar", cobro_id: ID }), { ok: false, error: "ACCION_INVALIDA" });
  assert.deepEqual(validarCuerpo(null), { ok: false, error: "COBRO_ID_INVALIDO" });
  assert.deepEqual(validarCuerpo({ accion: "reembolsar", ticket_id: ID }), { ok: true, cuerpo: { accion: "reembolsar", ticket_id: ID, caja_id: null } });
  assert.deepEqual(validarCuerpo({ accion: "reembolsar" }), { ok: false, error: "TICKET_ID_INVALIDO" });
});
