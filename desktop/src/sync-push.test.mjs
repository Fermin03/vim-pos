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
// Lo que se cubre aquí son los bordes: qué pasa cuando la nube RECHAZA una fila, y —sobre todo— EN
// QUÉ MOMENTO se siembra la libreta. Lo segundo ya falló una vez: la siembra vivía en el push, al
// que solo se llega con la nube respondiendo, así que una caja actualizada sin conexión se quedaba
// sin libreta, el cajero daba de alta a un repartidor y la siembra del primer sync lo marcaba como
// subido. Por eso las pruebas de orden imitan ese calendario: arranque → alta local → push.
//
// Vive sin base de datos a propósito (igual que verify-push-lotes): lo que se prueba es la
// política, y provocar un rechazo de la nube a voluntad con el Postgres embebido es lento y
// difícil de montar. El SQL real lo cubre `npm run verify:push`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { listarPendientes, pushToCloud, sembrarRepartidoresUnaVez } from "./sync-push.mjs";

/**
 * Un pool que sabe lo justo para este archivo: sin ventas, sin turnos, sin movimientos, y el
 * catálogo de repartidores que se le pase. Modela tres cosas y apunta lo que se escribe en ellas:
 * la tabla `repartidores` (`catalogo`, mutable: las pruebas le añaden altas hechas en la caja), la
 * libreta `_vim_repartidores_ok` (`marcados`) y los marcadores de una-sola-vez
 * (`marcadores`, `_vim_migraciones_sync`).
 */
function crearPoolFalso({ catalogo = [], yaMarcados = [], fallaLaSiembra = false } = {}) {
  const marcados = new Set(yaMarcados);
  // El rescate de cortes (0.4.50) se da por corrido: aquí no se prueba y no debe tocar nada.
  const marcadores = new Set(["rescate_cortes_0089"]);
  const sembrados = [];
  const pool = {
    catalogo: [...catalogo],
    marcados,
    marcadores,
    sembrados,
    fallaLaSiembra,
    async query(sql, params = []) {
      if (sql.startsWith("CREATE TABLE")) return { rows: [], rowCount: 0 };

      // `_vim_migraciones_sync`: el marcador de "esto ya corrió una vez en esta caja".
      if (sql.includes("_vim_migraciones_sync")) {
        const clave = sql.match(/'([a-z0-9_]+)'/)?.[1];
        if (sql.trimStart().toUpperCase().startsWith("SELECT")) {
          return { rows: [], rowCount: marcadores.has(clave) ? 1 : 0 };
        }
        marcadores.add(clave);
        return { rows: [], rowCount: 1 };
      }

      // La guarda del arranque: ¿la libreta ya tiene anotaciones de alguien más?
      if (sql.includes("SELECT 1 FROM _vim_repartidores_ok")) {
        return { rows: [], rowCount: marcados.size ? 1 : 0 };
      }

      // La siembra del ARRANQUE: `SELECT id FROM repartidores`, sin parámetros.
      if (sql.includes("_vim_repartidores_ok") && sql.includes("SELECT id FROM repartidores")) {
        if (pool.fallaLaSiembra) throw new Error("siembra rota a propósito");
        const nuevos = pool.catalogo.filter((id) => !marcados.has(id));
        sembrados.push(...nuevos);
        for (const id of nuevos) marcados.add(id);
        return { rows: [], rowCount: nuevos.length };
      }
      // El marcado tras confirmar la nube: `SELECT unnest($1::uuid[])`.
      if (sql.includes("_vim_repartidores_ok") && sql.includes("unnest")) {
        for (const id of params[0]) marcados.add(id);
        return { rows: [], rowCount: params[0].length };
      }

      const pendientes = pool.catalogo.filter((id) => !marcados.has(id));

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

/** Ids de repartidores que viajaron en la petición número `i` del push. */
const enviadosEn = (nube, i = 0) => (nube.peticiones[i]?.snapshot?.repartidores ?? []).map((r) => r.id);

test("un repartidor que la nube RECHAZA no se marca y vuelve a intentarse", async () => {
  const pool = crearPoolFalso({ catalogo: [A, B] });
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
  const pool = crearPoolFalso({ catalogo: [A, B] });
  const nube = nubeFalsa({ resultado: { repartidores: 2 } });
  try {
    await pushToCloud(pool, OPTS, () => {});
    assert.deepEqual([...pool.marcados].sort(), [A, B].sort());
    const pend = await listarPendientes(pool);
    assert.deepEqual(pend.repartidorIds, []);
  } finally { nube.restaurar(); }
});

test("un error de OTRA tabla no arrastra al repartidor que sí entró", async () => {
  const pool = crearPoolFalso({ catalogo: [A] });
  const nube = nubeFalsa({ resultado: { _errores: [{ tabla: "delivery_asignaciones", id: "otra-cosa", error: "boom" }] } });
  try {
    await pushToCloud(pool, OPTS, () => {});
    assert.ok(pool.marcados.has(A), "solo los errores con tabla=repartidores retienen un repartidor");
  } finally { nube.restaurar(); }
});

test("el ARRANQUE siembra la libreta con el catálogo que ya estaba en la caja", async () => {
  // Primer arranque tras actualizar: todo lo que hay en `repartidores` bajó del pull —ninguna
  // versión anterior sabía darlos de alta aquí— así que la nube ya lo tiene y marcarlo es seguro.
  const pool = crearPoolFalso({ catalogo: [A, B] });
  assert.equal(await sembrarRepartidoresUnaVez(pool), 2);
  assert.deepEqual(pool.sembrados.sort(), [A, B].sort());
  const pend = await listarPendientes(pool);
  assert.deepEqual(pend.repartidorIds, [], "tras sembrar no queda nada pendiente de subir");
});

test("la siembra NO se repite en el siguiente arranque (si se repitiera, un alta local se perdería)", async () => {
  const pool = crearPoolFalso({ catalogo: [B] });
  await sembrarRepartidoresUnaVez(pool);

  // La caja se usa: el cajero da de alta a A, que todavía no ha viajado. Mañana se vuelve a abrir.
  pool.catalogo.push(A);
  assert.equal(await sembrarRepartidoresUnaVez(pool), 0, "la siembra corre una sola vez por caja");
  assert.deepEqual(pool.sembrados, [B], "no debe sembrarse nada en el segundo arranque");

  const pend = await listarPendientes(pool);
  assert.deepEqual(pend.repartidorIds, [A], "el alta local sigue pendiente después de reiniciar");
});

test("un alta hecha SIN CONEXIÓN, antes de que la libreta existiera, sí llega a la nube", async () => {
  // Esta es la prueba del ORDEN, y el calendario es el del incidente que la motivó.
  //
  // La caja se actualiza a esta versión sin internet (o con una credencial de dispositivo que no
  // entra, como le pasó al piloto el 8/09/2026). Arranca igual: las migraciones y la siembra no
  // dependen de la nube. En el catálogo solo está B, que bajó del pull antes de actualizar.
  const pool = crearPoolFalso({ catalogo: [B] });
  await sembrarRepartidoresUnaVez(pool);
  assert.deepEqual(pool.sembrados, [B]);

  // Sigue sin conexión, y el cajero da de alta a A para poder sacar un domicilio: es EL caso para
  // el que existe el alta desde la caja, no un borde.
  pool.catalogo.push(A);

  // Vuelve la conexión y corre el primer push de esta versión. Cuando la siembra vivía aquí, este
  // push marcaba a A sin haberlo mandado: no llegaba nunca a la nube, y de paso sus
  // `delivery_asignaciones` se quedaban sin atribución porque la FK las rechaza allá arriba.
  const nube = nubeFalsa({ resultado: { repartidores: 1 } });
  try {
    await pushToCloud(pool, OPTS, () => {});
    assert.deepEqual(pool.sembrados, [B], "el push no debe sembrar la libreta: eso es del arranque");
    assert.deepEqual(enviadosEn(nube), [A], "el alta hecha en la caja tenía que viajar en el push");
    assert.ok(pool.marcados.has(A), "y quedar marcada una vez que la nube la confirmó");
  } finally { nube.restaurar(); }
});

test("una siembra que falla NO tumba el arranque, y no queda armada para uno posterior", async () => {
  // La caja no puede dejar de cobrar por una libreta de sincronización, y este camino se recorre
  // también a media jornada (reinicio del perro guardián, respaldo bajo demanda). Que se trague el
  // fallo es seguro precisamente por el orden: el marcador ya está puesto cuando la siembra lanza,
  // así que el arranque siguiente no la reintenta — y no puede marcar un alta local de mañana.
  const pool = crearPoolFalso({ catalogo: [B], fallaLaSiembra: true });
  const dicho = [];
  const grito = [];
  const errorOriginal = console.error;
  console.error = (...partes) => grito.push(partes.join(" "));
  try {
    assert.equal(
      await sembrarRepartidoresUnaVez(pool, (m) => dicho.push(m)), 0,
      "un fallo al sembrar no puede propagarse: la caja tiene que abrir",
    );
  } finally { console.error = errorOriginal; }

  assert.deepEqual(pool.sembrados, [], "no llegó a sembrar nada");
  assert.ok(pool.marcadores.has("siembra_repartidores_0114"), "el marcador se escribe antes de sembrar");
  assert.ok(dicho.some((m) => /no se pudo sembrar/.test(m)), "el fallo tiene que quedar en el log de la caja");
  assert.ok(grito.length > 0, "y también en consola: en silencio no se diagnostica nada");

  // Arranque siguiente, ya con un alta hecha en la caja: no se reintenta, así que A conserva su
  // viaje. El precio de la siembra perdida es que B vuelva a subir una vez, no perder a A.
  pool.fallaLaSiembra = false;
  pool.catalogo.push(A);
  assert.equal(await sembrarRepartidoresUnaVez(pool), 0);
  assert.deepEqual(pool.sembrados, []);

  const pend = await listarPendientes(pool);
  assert.ok(pend.repartidorIds.includes(A), "el alta local no puede perderse por una siembra fallida");
});

test("no siembra si la libreta YA tenía anotaciones, aunque no haya marcador", async () => {
  // Máquina que corrió la build anterior de esta rama: la libreta ya existe —la escribió el pull, o
  // la siembra vieja que vivía en el push— pero el marcador no, porque entonces no se usaba. Si se
  // sembrara ahora, el catálogo actual ya puede traer un alta hecha en la caja y sin subir, y
  // quedaría marcada como enviada: la misma pérdida que este arreglo existe para impedir, cometida
  // por el propio arreglo. A ninguna caja de cliente le llegó esa build, pero a las de desarrollo sí.
  const pool = crearPoolFalso({ catalogo: [A, B], yaMarcados: [B] });
  assert.equal(await sembrarRepartidoresUnaVez(pool), 0);
  assert.deepEqual(pool.sembrados, [], "no debe sembrar sobre una libreta que ya escribió alguien más");
  assert.ok(pool.marcadores.has("siembra_repartidores_0114"), "pero marca igual: no se repasa en cada arranque");

  const pend = await listarPendientes(pool);
  assert.deepEqual(pend.repartidorIds, [A], "el alta local conserva su viaje a la nube");
});
