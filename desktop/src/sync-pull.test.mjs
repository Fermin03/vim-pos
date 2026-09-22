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

import { PULL_ORDER } from "./sync-pull.mjs";

test("PULL_ORDER baja los slots de combos después de productos y sus opciones después de los slots", () => {
  const t = PULL_ORDER.map((x) => x.t);
  assert.ok(t.indexOf("combo_grupos") > t.indexOf("productos"), "combo_grupos va después de productos (FK a productos)");
  assert.ok(t.indexOf("combo_opciones") > t.indexOf("combo_grupos"), "combo_opciones va después de combo_grupos (FK)");
  assert.ok(t.indexOf("combo_opciones") < t.indexOf("configuracion_tenant"));
});

import { pullSnapshot } from "./sync-pull.mjs";

/**
 * Un cliente de mentiras que responde lo mínimo para que `pullSnapshot` corra: la metadata de la
 * tabla y un OK para todo lo demás. Apunta cada consulta para poder mirarlas después.
 */
function clienteFalso() {
  const consultas = [];
  const client = {
    consultas,
    async query(sql, params = []) {
      consultas.push({ sql, params });
      if (sql.includes("information_schema.columns")) {
        return { rows: [
          { column_name: "id", udt_name: "uuid", is_generated: "NEVER", is_identity: "NO" },
          { column_name: "nombre", udt_name: "varchar", is_generated: "NEVER", is_identity: "NO" },
          { column_name: "activo", udt_name: "bool", is_generated: "NEVER", is_identity: "NO" },
        ] };
      }
      if (sql.includes("indisprimary")) return { rows: [{ attname: "id" }] };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  return { client, pool: { async connect() { return client; } } };
}

const R1 = "aaaaaaaa-0000-0000-0000-000000000001";
const R2 = "bbbbbbbb-0000-0000-0000-000000000002";

test("el pull anota en _vim_repartidores_ok lo que acaba de bajar", async () => {
  // Sin esto, el push volvía a mandar a la nube su propia copia del catálogo y pisaba lo editado
  // en el panel — incluido un `deleted_at`, que resucitaba a un repartidor dado de baja.
  const { client, pool } = clienteFalso();
  await pullSnapshot(pool, {
    repartidores: [
      { id: R1, nombre: "Luis", activo: true },
      { id: R2, nombre: "Ana", activo: false },
    ],
  });
  const marca = client.consultas.find((c) => c.sql.includes("_vim_repartidores_ok") && c.sql.includes("unnest"));
  assert.ok(marca, "el pull debía anotar los repartidores que bajó");
  assert.deepEqual(marca.params[0].sort(), [R1, R2].sort());
  // Y dentro de la misma transacción: si el pull revienta, las marcas se van con el ROLLBACK.
  const iMarca = client.consultas.indexOf(marca);
  const iCommit = client.consultas.findIndex((c) => c.sql === "COMMIT");
  assert.ok(iMarca < iCommit, "la marca va antes del COMMIT, dentro de la transacción del pull");
});

test("un pull sin repartidores no toca la libreta", async () => {
  const { client, pool } = clienteFalso();
  await pullSnapshot(pool, { repartidores: [] });
  assert.ok(!client.consultas.some((c) => c.sql.includes("_vim_repartidores_ok")));
});

// Zonas de envío (0116/Task 4): misma gemela que los repartidores, mirando _vim_zonas_ok.
//
// Ronda de arreglos 1/5: la primera versión de estas dos pruebas llamaba a `marcarZonasDelPull`
// directamente, sin pasar por `pullSnapshot`. Eso no verificaba que el bucle de `pullSnapshot`
// invoque la función cuando `t === "zonas_envio"`, ni que la marca ocurra ANTES del `COMMIT` —la
// garantía de rollback que la propia tarea exige explícitamente—. Se reescriben para pasar por
// `pullSnapshot` real, exactamente como las de repartidores de arriba (líneas 74-97).

const Z1 = "cccccccc-0000-0000-0000-000000000001";
const Z2 = "dddddddd-0000-0000-0000-000000000002";

test("el pull anota en _vim_zonas_ok lo que acaba de bajar", async () => {
  // Sin esto, el push volvía a mandar a la nube su propia copia del catálogo y pisaba el nombre,
  // el costo o el `activa` que se acaban de editar en el panel.
  const { client, pool } = clienteFalso();
  await pullSnapshot(pool, {
    zonas_envio: [
      { id: Z1, nombre: "Centro", costo_mxn: 30 },
      { id: Z2, nombre: "Norte", costo_mxn: 45 },
    ],
  });
  const marca = client.consultas.find((c) => c.sql.includes("INSERT INTO _vim_zonas_ok"));
  assert.ok(marca, "el pull debía anotar las zonas que bajó");
  assert.deepEqual(marca.params[0].sort(), [Z1, Z2].sort());
  // C3: con la huella de la fila LOCAL recién escrita (la misma expresión que compara el push) y
  // pisando la que hubiera: lo que acaba de bajar es lo "ya sabido" y no debe volver a subir.
  assert.match(marca.sql, /md5\(to_jsonb\(x\)::text\)/);
  assert.match(marca.sql, /DO UPDATE SET huella = EXCLUDED\.huella/);
  // Y dentro de la misma transacción: si el pull revienta, las marcas se van con el ROLLBACK.
  const iMarca = client.consultas.indexOf(marca);
  const iCommit = client.consultas.findIndex((c) => c.sql === "COMMIT");
  assert.ok(iMarca < iCommit, "la marca va antes del COMMIT, dentro de la transacción del pull");
});

test("un pull sin zonas no toca la libreta", async () => {
  const { client, pool } = clienteFalso();
  await pullSnapshot(pool, { zonas_envio: [] });
  assert.ok(!client.consultas.some((c) => c.sql.includes("_vim_zonas_ok")));
});
