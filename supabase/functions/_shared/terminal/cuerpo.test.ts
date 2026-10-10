import { test } from "node:test";
import assert from "node:assert/strict";
import { validarCuerpo } from "./cuerpo.ts";

const ID = "11111111-1111-4111-8111-111111111111";

test("crear exige cobro, ticket y un monto válido", () => {
  const r = validarCuerpo({ accion: "crear", cobro_id: ID, ticket_id: ID, monto: "348", folio: "A-12" });
  assert.deepEqual(r, { ok: true, cuerpo: { accion: "crear", cobro_id: ID, ticket_id: ID, folio: "A-12", monto: "348.00", caja_id: null, usuario_id: null } });
  assert.deepEqual(validarCuerpo({ accion: "crear", cobro_id: ID, ticket_id: ID, monto: "0" }), { ok: false, error: "MONTO_INVALIDO" });
  assert.deepEqual(validarCuerpo({ accion: "crear", cobro_id: ID, monto: "5" }), { ok: false, error: "TICKET_ID_INVALIDO" });
  assert.deepEqual(validarCuerpo({ accion: "crear", cobro_id: "x", ticket_id: ID, monto: "5" }), { ok: false, error: "COBRO_ID_INVALIDO" });
});

test("un folio con algo que no es folio no viaja a Mercado Pago", () => {
  const r = validarCuerpo({ accion: "crear", cobro_id: ID, ticket_id: ID, monto: "5", folio: "Juan Pérez 4771234567 <x>" });
  assert.equal(r.ok && r.cuerpo.accion === "crear" && r.cuerpo.folio, null);
});

test("las demás acciones", () => {
  assert.equal(validarCuerpo({ accion: "pendientes" }).ok, true);
  assert.equal(validarCuerpo({ accion: "estado", cobro_id: ID }).ok, true);
  assert.deepEqual(validarCuerpo({ accion: "borrar", cobro_id: ID }), { ok: false, error: "ACCION_INVALIDA" });
  assert.deepEqual(validarCuerpo(null), { ok: false, error: "COBRO_ID_INVALIDO" });
});
