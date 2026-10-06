import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  codigoDeAsentar, ERRORES_DE_ASENTAR, moduloLealtadActivo, payloadAsentar, usuarioDelCanje, validarCuerpo,
} from "./cuerpo.ts";

const UUID = "11111111-1111-4111-8111-111111111111";
const OTRO = "22222222-2222-4222-8222-222222222222";

test("moduloLealtadActivo lee efectivos, no permitidos, y falla cerrado", () => {
  assert.equal(moduloLealtadActivo({ permitidos: { lealtad: true }, efectivos: { lealtad: true } }), true);
  assert.equal(moduloLealtadActivo({ permitidos: { lealtad: true }, efectivos: { lealtad: false } }), false);
  assert.equal(moduloLealtadActivo({ permitidos: { lealtad: true }, efectivos: {} }), false);
  assert.equal(moduloLealtadActivo(null), false);
  assert.equal(moduloLealtadActivo(undefined), false);
});

test("saldo exige cliente o teléfono", () => {
  assert.deepEqual(validarCuerpo({ accion: "saldo" }), { ok: false, error: "FALTAN_CAMPOS" });
  assert.equal(validarCuerpo({ accion: "saldo", telefono: "477 000 1234" }).ok, true);
  assert.equal(validarCuerpo({ accion: "saldo", cliente_id: UUID }).ok, true);
});

test("canjear exige id del canje, a quién, y puntos o premio (no ambos)", () => {
  assert.equal(validarCuerpo({ accion: "canjear", cliente_id: UUID, puntos: 10 }).ok, false, "sin canje_id");
  assert.equal(validarCuerpo({ accion: "canjear", canje_id: UUID, puntos: 10 }).ok, false, "sin cliente ni teléfono");
  assert.equal(validarCuerpo({ accion: "canjear", canje_id: UUID, cliente_id: UUID }).ok, false, "sin puntos ni premio");
  assert.equal(validarCuerpo({ accion: "canjear", canje_id: UUID, cliente_id: UUID, puntos: 10, premio_id: UUID }).ok, false, "ambos");
  assert.equal(validarCuerpo({ accion: "canjear", canje_id: UUID, cliente_id: UUID, puntos: 0 }).ok, false, "cero");
  assert.equal(validarCuerpo({ accion: "canjear", canje_id: UUID, cliente_id: UUID, puntos: 1.5 }).ok, false, "fracción");
  assert.equal(validarCuerpo({ accion: "canjear", canje_id: UUID, cliente_id: UUID, puntos: 10 }).ok, true);
  assert.equal(validarCuerpo({ accion: "canjear", canje_id: UUID, telefono: "4770001234", premio_id: UUID }).ok, true);
});

test("asentar exige canje y ticket", () => {
  assert.equal(validarCuerpo({ accion: "asentar", canje_id: UUID }).ok, false);
  assert.equal(validarCuerpo({ accion: "asentar", canje_id: UUID, ticket_id: UUID }).ok, true);
});

test("un uuid mal formado o una acción desconocida se rechazan", () => {
  assert.deepEqual(validarCuerpo({ accion: "regalar" }), { ok: false, error: "ACCION_INVALIDA" });
  assert.equal(validarCuerpo({ accion: "saldo", cliente_id: "no-es-uuid" }).ok, false);
  assert.deepEqual(validarCuerpo(null), { ok: false, error: "ACCION_INVALIDA" });
});

test("el cuerpo validado no arrastra tenant ni monto del navegador", () => {
  const v = validarCuerpo({ accion: "asentar", canje_id: UUID, ticket_id: OTRO, monto_mxn: 9999, tenant_id: OTRO });
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal("monto_mxn" in v.cuerpo, false);
    assert.equal("tenant_id" in v.cuerpo, false);
  }
});

test("el empleado: desde la web es el autenticado, nunca el del cuerpo", () => {
  assert.equal(usuarioDelCanje({ esDispositivo: false, autenticadoId: UUID, delCuerpo: OTRO, delCuerpoEsDelNegocio: true }), UUID);
});

test("el empleado desde una caja: el del cuerpo solo si es del negocio; si no, ninguno", () => {
  assert.equal(usuarioDelCanje({ esDispositivo: true, autenticadoId: "disp", delCuerpo: OTRO, delCuerpoEsDelNegocio: true }), OTRO);
  assert.equal(usuarioDelCanje({ esDispositivo: true, autenticadoId: "disp", delCuerpo: OTRO, delCuerpoEsDelNegocio: false }), null);
  assert.equal(usuarioDelCanje({ esDispositivo: true, autenticadoId: "disp", delCuerpoEsDelNegocio: true }), null);
});

test("payloadAsentar usa los datos y el teléfono de la nube; tenant y usuario, del servidor", () => {
  const canje = {
    ok: true, canje_id: UUID, cliente_id: "cli-real", telefono: "4770001234", puntos: 40, monto_mxn: 40,
    premio_id: null, programa_version: 3, saldo: 5, vence_el: null, producto_id: null, tenant_id: "otro-tenant",
  };
  const p = payloadAsentar(canje, { tenantId: "T", ticketId: "t1", ticketItemId: "i1", usuarioId: "U" });
  assert.deepEqual(p, {
    canje_id: UUID, cliente_id: "cli-real", telefono: "4770001234", puntos: 40, monto_mxn: 40, premio_id: null,
    programa_version: 3, tenant_id: "T", usuario_id: "U", ticket_id: "t1", ticket_item_id: "i1",
  });
});

test("codigoDeAsentar reconoce solo mensajes que SON un código", () => {
  assert.equal(codigoDeAsentar("TICKET_NO_ABIERTO"), "TICKET_NO_ABIERTO");
  assert.equal(codigoDeAsentar(" MONTO_INVALIDO "), "MONTO_INVALIDO");
  assert.equal(codigoDeAsentar("relation tickets does not exist: TICKET_NO_ABIERTO"), null, "contenerlo no basta");
  assert.equal(codigoDeAsentar("duplicate key value violates unique constraint"), null);
  assert.equal(codigoDeAsentar(undefined), null);
});

test("ERRORES_DE_ASENTAR contiene exactamente los códigos que lealtad_asentar_canje lanza en el SQL", () => {
  const sql = readFileSync(new URL("../../../migrations/0156_lealtad.sql", import.meta.url), "utf8");
  const ini = sql.indexOf("CREATE OR REPLACE FUNCTION lealtad_asentar_canje(");
  assert.ok(ini > 0, "no se encontró la función en la migración");
  const fin = sql.indexOf("END $$;", ini);
  const cuerpo = sql.slice(ini, fin);
  const delSql = new Set([...cuerpo.matchAll(/RAISE EXCEPTION '([A-Z_]+)'/g)].map((m) => m[1]));
  assert.ok(delSql.size >= 10, "la extracción no encontró los códigos");
  assert.deepEqual([...ERRORES_DE_ASENTAR].sort(), [...delSql].sort());
});
