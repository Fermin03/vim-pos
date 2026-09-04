import { test } from "node:test";
import assert from "node:assert/strict";
import { deltaPendiente, SIGNO_MOVIMIENTO } from "./sync-pull.mjs";

const I = "11111111-1111-1111-1111-111111111111";
const S = "22222222-2222-2222-2222-222222222222";

test("deltaPendiente suma con signo por (insumo, sucursal)", () => {
  const d = deltaPendiente([
    { insumo_id: I, sucursal_id: S, tipo: "SALIDA_VENTA", cantidad: "3.000" },
    { insumo_id: I, sucursal_id: S, tipo: "SALIDA_MODIFICADOR_EXTRA", cantidad: 2 },
    { insumo_id: I, sucursal_id: S, tipo: "REVERSA_CANCELACION", cantidad: 1 },
  ]);
  assert.equal(d.get(`${I}|${S}`), -4);
});

test("deltaPendiente separa sucursales y devuelve vacío sin movimientos", () => {
  const S2 = "33333333-3333-3333-3333-333333333333";
  const d = deltaPendiente([
    { insumo_id: I, sucursal_id: S, tipo: "SALIDA_VENTA", cantidad: 1 },
    { insumo_id: I, sucursal_id: S2, tipo: "AJUSTE_POSITIVO", cantidad: 5 },
  ]);
  assert.equal(d.get(`${I}|${S}`), -1);
  assert.equal(d.get(`${I}|${S2}`), 5);
  assert.equal(deltaPendiente([]).size, 0);
});

test("SIGNO_MOVIMIENTO cubre los diez tipos del enum", () => {
  assert.deepEqual(Object.keys(SIGNO_MOVIMIENTO).sort(), [
    "AJUSTE_NEGATIVO", "AJUSTE_POSITIVO", "DEVOLUCION_PROVEEDOR", "ENTRADA_COMPRA", "MERMA",
    "REVERSA_CANCELACION", "SALIDA_MODIFICADOR_EXTRA", "SALIDA_VENTA", "TRANSFERENCIA_ENTRADA", "TRANSFERENCIA_SALIDA",
  ]);
});
