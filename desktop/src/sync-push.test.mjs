// La libreta `_vim_repartidores_ok`, probada sin Postgres y sin nube.
//
// Es la pieza que decide qué repartidores se mandan y cuáles no, y equivocarse en cualquiera de
// los dos sentidos se paga caro y EN SILENCIO:
//
//   · marcar de más → esa fila no vuelve a viajar NUNCA (por diseño), así que un alta hecha en la
//     caja no existirá jamás en la nube y nadie se entera;
//   · marcar de menos → la caja reenvía su copia y pisa lo que se editó en el panel, porque la
//     nube aplica `ON CONFLICT (id) DO UPDATE` de todas las columnas.
//
// Los dos casos de aquí son justamente los bordes: qué pasa cuando la nube RECHAZA una fila, y
// cuándo se puede sembrar la libreta con el catálogo que ya está en la caja.
//
// Vive sin base de datos a propósito (igual que verify-push-lotes): lo que se prueba es la
// política, y provocar un rechazo de la nube a voluntad con el Postgres embebido es lento y
// difícil de montar. El SQL real lo cubre `npm run verify:push`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { listarPendientes, pushToCloud } from "./sync-push.mjs";

/**
 * Un pool que sabe lo justo para este archivo: sin ventas, sin turnos, sin movimientos, y los
 * repartidores pendientes que se le pasen. Apunta lo que se escribe en la libreta.
 */
function crearPoolFalso({ repartidores = [], tablaYaExistia = true, catalogo = [] } = {}) {
  const marcados = new Set();
  const sembrados = [];
  const pool = {
    marcados,
    sembrados,
    async query(sql, params = []) {
      if (sql.includes("to_regclass('public._vim_repartidores_ok')")) {
        return { rows: [{ existia: tablaYaExistia }] };
      }
      if (sql.startsWith("CREATE TABLE")) return { rows: [] };

      // La siembra del arranque: `SELECT id FROM repartidores`, sin parámetros.
      if (sql.includes("_vim_repartidores_ok") && sql.includes("SELECT id FROM repartidores")) {
        sembrados.push(...catalogo);
        for (const id of catalogo) marcados.add(id);
        return { rows: [] };
      }
      // El marcado tras confirmar la nube: `SELECT unnest($1::uuid[])`.
      if (sql.includes("_vim_repartidores_ok") && sql.includes("unnest")) {
        for (const id of params[0]) marcados.add(id);
        return { rows: [] };
      }

      // Rescate de cortes (0.4.50): se contesta "ya corrió" para que no intente nada.
      if (sql.includes("_vim_migraciones_sync")) {
        return sql.trim().toUpperCase().startsWith("SELECT") ? { rows: [{}], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      const pendientes = repartidores.filter((id) => !marcados.has(id));

      if (sql.includes("array_agg(id ORDER BY fecha_apertura)")) {
        return { rows: [{ ids: null, turnos: null, movimientos: null, repartidores: pendientes.length ? pendientes : null }] };
      }
      if (sql.includes("WITH tk AS")) {
        return {
          rows: [{
            ids: null, turnos: null, movimientos: null,
            repartidores: pendientes.length ? pendientes : null,
            snapshot: { repartidores: pendientes.map((id) => ({ id, nombre: `Repartidor ${id}` })) },
          }],
        };
      }
      throw new Error(`consulta no prevista por el pool falso: ${sql.slice(0, 80)}`);
    },
  };
  return pool;
}

/** Sustituye `fetch` por una nube que contesta lo que diga `respuesta`. Devuelve cómo restaurarlo. */
function nubeFalsa(respuesta) {
  const original = globalThis.fetch;
  const peticiones = [];
  globalThis.fetch = async (_url, init) => {
    peticiones.push(JSON.parse(init.body));
    return { ok: true, status: 200, async json() { return respuesta; }, async text() { return ""; } };
  };
  return { peticiones, restaurar: () => { globalThis.fetch = original; } };
}

const OPTS = { cloudUrl: "http://nube.falsa", anonKey: "x", deviceToken: "y" };
const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";

test("un repartidor que la nube RECHAZA no se marca y vuelve a intentarse", async () => {
  const pool = crearPoolFalso({ repartidores: [A, B] });
  // La nube aísla la fila conflictiva (migración 0074) y dice cuál se quedó fuera.
  const nube = nubeFalsa({ resultado: { repartidores: 1, _errores: [{ tabla: "repartidores", id: B, error: "repartidor_nombre_uq" }] } });
  try {
    await pushToCloud(pool, OPTS, () => {});

    assert.ok(pool.marcados.has(A), "el repartidor que SÍ entró debía quedar marcado");
    assert.ok(!pool.marcados.has(B), "marcar un rechazado lo perdería para siempre: no debe marcarse");

    // Y por eso sigue pendiente: el siguiente ciclo lo vuelve a mandar.
    const pend = await listarPendientes(pool);
    assert.deepEqual(pend.repartidorIds, [B]);
  } finally { nube.restaurar(); }
});

test("sin rechazos se marcan todos los que viajaron", async () => {
  const pool = crearPoolFalso({ repartidores: [A, B] });
  const nube = nubeFalsa({ resultado: { repartidores: 2 } });
  try {
    await pushToCloud(pool, OPTS, () => {});
    assert.deepEqual([...pool.marcados].sort(), [A, B].sort());
    const pend = await listarPendientes(pool);
    assert.deepEqual(pend.repartidorIds, []);
  } finally { nube.restaurar(); }
});

test("un error de OTRA tabla no arrastra al repartidor que sí entró", async () => {
  const pool = crearPoolFalso({ repartidores: [A] });
  const nube = nubeFalsa({ resultado: { _errores: [{ tabla: "delivery_asignaciones", id: "otra-cosa", error: "boom" }] } });
  try {
    await pushToCloud(pool, OPTS, () => {});
    assert.ok(pool.marcados.has(A), "solo los errores con tabla=repartidores retienen un repartidor");
  } finally { nube.restaurar(); }
});

test("la libreta se siembra con el catálogo SOLO cuando la tabla no existía", async () => {
  // Primera vez: la tabla se crea ahora, así que todo lo local bajó del pull y la nube ya lo tiene.
  const nueva = crearPoolFalso({ tablaYaExistia: false, catalogo: [A, B], repartidores: [A, B] });
  const pend = await listarPendientes(nueva);
  assert.deepEqual(nueva.sembrados.sort(), [A, B].sort());
  assert.deepEqual(pend.repartidorIds, [], "tras sembrar no queda nada pendiente de subir");
});

test("la siembra NO se repite en cada arranque (si se repitiera, un alta local se perdería)", async () => {
  // La tabla ya existe y hay un alta hecha en la caja que todavía no ha viajado. Sembrar aquí la
  // marcaría como subida y, por diseño, no volvería a viajar nunca: el repartidor no existiría en
  // la nube y nadie se enteraría.
  const pool = crearPoolFalso({ tablaYaExistia: true, catalogo: [A], repartidores: [A] });
  const pend = await listarPendientes(pool);
  assert.deepEqual(pool.sembrados, [], "no debe sembrarse nada cuando la tabla ya existía");
  assert.deepEqual(pend.repartidorIds, [A], "el alta local sigue pendiente de subir");
});
