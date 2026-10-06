import { test } from "node:test";
import assert from "node:assert/strict";
import { deltaPendiente, SIGNO_MOVIMIENTO, deltaLealtadPendiente } from "./sync-pull.mjs";

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

// I6 (revisión final): la caja crea "Centro" sin conexión y el panel crea otro "Centro". El pull
// chocaba contra zona_envio_nombre_uq y hacía ROLLBACK de TODO (catálogo, empleados), para
// siempre. Se reconcilia por clave natural (sucursal, nombre sin mayúsculas ni espacios de sobra):
// la zona local se borra para que entre la de la nube, y ANTES los tickets y las direcciones que la
// usaban se reapuntan al id de la nube — borrarlos, como hacen los `dependientes` de roles, sería
// perder ventas.
test("una zona local que choca por nombre con una de la nube se reapunta y se borra antes del upsert", async () => {
  const LOCAL = "eeeeeeee-0000-0000-0000-000000000001";
  const NUBE = "ffffffff-0000-0000-0000-000000000002";
  const SUC = "99999999-0000-0000-0000-0000000000bb";
  const { client, pool } = clienteFalso();
  const query = client.query.bind(client);
  client.query = async (sql, params = []) => {
    // La fila local en conflicto: mismo nombre (otra capitalización), otro id.
    if (sql.includes("FROM zonas_envio") && sql.includes("lower(btrim(nombre))") && sql.trimStart().startsWith("SELECT")) {
      await query(sql, params);
      return { rows: [{ id: LOCAL }], rowCount: 1 };
    }
    return query(sql, params);
  };

  await pullSnapshot(pool, { zonas_envio: [{ id: NUBE, sucursal_id: SUC, nombre: "Centro ", deleted_at: null }] });

  const busca = client.consultas.find((c) => c.sql.includes("lower(btrim(nombre))"));
  assert.ok(busca, "debía buscar la zona local por clave natural");
  assert.deepEqual(busca.params.slice(0, 2), [SUC, "Centro "]);

  const i = (pred) => client.consultas.findIndex(pred);
  const iTickets = i((c) => /UPDATE tickets SET "zona_envio_id"/.test(c.sql));
  const iDirs = i((c) => /UPDATE direcciones_cliente SET "zona_envio_id"/.test(c.sql));
  const iBorra = i((c) => c.sql.startsWith("DELETE FROM zonas_envio"));
  const iUpsert = i((c) => c.sql.includes('INSERT INTO public."zonas_envio"'));
  assert.ok(iTickets >= 0 && iDirs >= 0, "los tickets y las direcciones debían reapuntarse");
  assert.deepEqual(client.consultas[iTickets].params, [NUBE, LOCAL]);
  assert.deepEqual(client.consultas[iDirs].params, [NUBE, LOCAL]);
  assert.ok(iTickets < iBorra && iDirs < iBorra, "se reapunta ANTES de borrar la zona local");
  assert.ok(iBorra < iUpsert, "y se borra ANTES de que entre la de la nube");
  assert.ok(!client.consultas.some((c) => c.sql.startsWith("DELETE FROM tickets")), "nunca se borran ventas");
});

// Pantalla del cliente (revisión final): el pull solo hace upsert, así que al revincular una caja a
// otro negocio las filas del anterior se quedan. La caja anota de qué negocio es el snapshot para que
// los anuncios (anuncios.mjs) enseñen solo los del negocio vinculado ahora.
const TEN = "12121212-0000-0000-0000-000000000001";

test("el pull anota en _vim_sync el negocio del snapshot, dentro de la transacción", async () => {
  const { client, pool } = clienteFalso();
  await pullSnapshot(pool, { tenants: [{ id: TEN, nombre: "Knock-Out", activo: true }], __watermark: "w1" });
  const marca = client.consultas.find((c) => c.sql.includes("INSERT INTO _vim_sync") && c.params.includes(TEN));
  assert.ok(marca, "el pull debía anotar el negocio del snapshot");
  assert.match(marca.sql, /'tenant'/);
  assert.match(marca.sql, /ON CONFLICT \(clave\) DO UPDATE/);
  const iMarca = client.consultas.indexOf(marca);
  const iCommit = client.consultas.findIndex((c) => c.sql === "COMMIT");
  assert.ok(iMarca < iCommit, "la marca va antes del COMMIT: si el pull revienta, se va con el ROLLBACK");
});

test("un snapshot viejo sin tenants no rompe el pull ni anota negocio", async () => {
  const { client, pool } = clienteFalso();
  await pullSnapshot(pool, { repartidores: [{ id: R1, nombre: "Luis", activo: true }] });
  assert.ok(client.consultas.some((c) => c.sql === "COMMIT"));
  assert.ok(!client.consultas.some((c) => c.sql.includes("INSERT INTO _vim_sync") && /'tenant'/.test(c.sql)));
});

test("una zona de la nube ya borrada no reconcilia nada (no choca con el índice parcial)", async () => {
  const { client, pool } = clienteFalso();
  await pullSnapshot(pool, { zonas_envio: [{ id: "ffffffff-0000-0000-0000-000000000003", sucursal_id: "s", nombre: "Vieja", deleted_at: "2026-09-01T00:00:00Z" }] });
  assert.ok(!client.consultas.some((c) => c.sql.includes("lower(btrim(nombre))")));
});

test("PULL_ORDER baja el menú por sucursal después de productos y de sucursales (0152)", () => {
  const t = PULL_ORDER.map((x) => x.t);
  assert.ok(t.includes("productos_sucursal"), "productos_sucursal está en PULL_ORDER");
  assert.ok(t.indexOf("productos_sucursal") > t.indexOf("productos"), "va después de productos (FK)");
  assert.ok(t.indexOf("productos_sucursal") > t.indexOf("sucursales"), "va después de sucursales (FK)");
});

// Lealtad (0156, ADR 0030, tarea 8).
test("lealtad: deltaLealtadPendiente suma por cliente solo lo de la versión vigente", () => {
  const d = deltaLealtadPendiente([
    { cliente_id: "ana", puntos: 12, programa_version: 2 },
    { cliente_id: "ana", puntos: -5, programa_version: 2 },
    { cliente_id: "ana", puntos: 40, programa_version: 1 }, // versión vieja: registrado, no suma
    { cliente_id: "beto", puntos: 3, programa_version: 2 },
  ], 2);
  assert.equal(d.get("ana"), 7);
  assert.equal(d.get("beto"), 3);
  assert.equal(d.size, 2);
});

test("lealtad: deltaLealtadPendiente aguanta vacío y sin versión", () => {
  assert.equal(deltaLealtadPendiente([], 1).size, 0);
  assert.equal(deltaLealtadPendiente(null, 1).size, 0);
  assert.equal(deltaLealtadPendiente([{ cliente_id: "ana", puntos: 5, programa_version: 1 }], null).size, 0);
});

test("lealtad: el pull respeta las llaves foráneas en el orden", () => {
  const pos = (t) => PULL_ORDER.findIndex((x) => x.t === t);
  assert.ok(pos("clientes") > pos("tenants"), "clientes después de tenants");
  assert.ok(pos("lealtad_saldos") > pos("clientes"), "saldos después de clientes");
  assert.ok(pos("lealtad_saldos") > pos("lealtad_programa"), "saldos después del programa (se corrigen con su versión)");
  assert.ok(pos("lealtad_premios") > pos("productos"), "premios después de productos");
});

const CLI_LOCAL = "c1c1c1c1-0000-0000-0000-000000000001";
const CLI_NUBE = "c2c2c2c2-0000-0000-0000-000000000002";

/** Cliente falso que simula un cliente local duplicado (mismo teléfono) y las FK que apuntan a clientes. */
function clienteFalsoConDuplicado() {
  const { client, pool } = clienteFalso();
  const query = client.query.bind(client);
  client.query = async (sql, params = []) => {
    if (sql.includes("pg_constraint")) {
      await query(sql, params);
      return { rows: [
        { tabla: "tickets", col: "cliente_id" },
        { tabla: "direcciones_cliente", col: "cliente_id" },
        { tabla: "lealtad_saldos", col: "cliente_id" },
        { tabla: "clientes_alias", col: "cliente_id" },
      ] };
    }
    if (sql.includes("regexp_replace(telefono") && sql.trimStart().startsWith("SELECT")) {
      await query(sql, params);
      return { rows: [{ id: CLI_LOCAL }], rowCount: 1 };
    }
    return query(sql, params);
  };
  return { client, pool };
}

test("lealtad: el cliente local con el mismo teléfono (formateado distinto) se busca por dígitos", async () => {
  const { client, pool } = clienteFalsoConDuplicado();
  await pullSnapshot(pool, { clientes: [{ id: CLI_NUBE, tenant_id: TEN, nombre: "Ana", telefono: "(477) 000-1567", deleted_at: null }] });
  const busca = client.consultas.find((c) => c.sql.includes("regexp_replace(telefono"));
  assert.ok(busca, "debía buscar el duplicado local por teléfono");
  // Barra invertida literal en el SQL: lo que Postgres lee como la clase \D (no dígito).
  assert.ok(busca.sql.includes(String.raw`regexp_replace(telefono, '\D', '', 'g') = $2`), busca.sql);
  assert.deepEqual(busca.params.slice(0, 2), [TEN, "4770001567"], "el teléfono entrante se reduce a dígitos");
});

test("lealtad: un teléfono sin dígitos no busca duplicado", async () => {
  const { client, pool } = clienteFalsoConDuplicado();
  await pullSnapshot(pool, { clientes: [{ id: CLI_NUBE, tenant_id: TEN, nombre: "Ana", telefono: "--", deleted_at: null }] });
  assert.ok(!client.consultas.some((c) => c.sql.includes("regexp_replace(telefono")), "sin dígitos no hay clave natural");
});

test("lealtad: al fundir, las direcciones se arreglan antes de mudarse, el saldo no se muda y la libreta se limpia", async () => {
  const { client, pool } = clienteFalsoConDuplicado();
  await pullSnapshot(pool, { clientes: [{ id: CLI_NUBE, tenant_id: TEN, nombre: "Ana", telefono: "4770001567", deleted_at: null }] });
  const i = (pred) => client.consultas.findIndex(pred);
  const iPrincipal = i((c) => /UPDATE direcciones_cliente SET es_principal = false/.test(c.sql));
  const iDirs = i((c) => /UPDATE direcciones_cliente SET "cliente_id"/.test(c.sql));
  const iTickets = i((c) => /UPDATE tickets SET "cliente_id"/.test(c.sql));
  const iBorra = i((c) => c.sql.startsWith("DELETE FROM clientes WHERE id"));
  const iUpsert = i((c) => c.sql.includes('INSERT INTO public."clientes"'));
  assert.ok(iPrincipal >= 0, "debía quitar la marca de principal del duplicado si hace falta");
  assert.ok(iPrincipal < iDirs, "la marca de principal se arregla ANTES de mudar las direcciones");
  assert.ok(iDirs >= 0 && iTickets >= 0);
  assert.deepEqual(client.consultas[iDirs].params, [CLI_NUBE, CLI_LOCAL]);
  assert.ok(!client.consultas.some((c) => /UPDATE lealtad_saldos SET "cliente_id"/.test(c.sql)), "el saldo no se muda");
  assert.ok(client.consultas.some((c) => /DELETE FROM lealtad_saldos WHERE "cliente_id"/.test(c.sql)), "el saldo del duplicado se borra");
  assert.ok(client.consultas.some((c) => /DELETE FROM _vim_clientes_ok WHERE "cliente_id"/.test(c.sql)), "la libreta no guarda un id que ya no existe");
  assert.ok(iDirs < iBorra && iBorra < iUpsert, "se muda, se borra al duplicado y entra el de la nube");
});

test("lealtad: sin llaves de lealtad en el snapshot (nube vieja) el pull no toca nada de eso", async () => {
  const { client, pool } = clienteFalso();
  await pullSnapshot(pool, { repartidores: [{ id: R1, nombre: "Luis", activo: true }] });
  assert.ok(!client.consultas.some((c) => /clientes|lealtad/.test(c.sql)), "ninguna consulta menciona clientes ni lealtad");
});
