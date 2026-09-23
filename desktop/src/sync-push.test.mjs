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
import { listarPendientes, pushToCloud, sembrarRepartidoresUnaVez, sembrarZonasUnaVez } from "./sync-push.mjs";

/**
 * Un pool que sabe lo justo para este archivo: sin ventas, sin turnos, sin movimientos, y los
 * catálogos de repartidores y de zonas de envío que se le pasen. Modela lo que se escribe en:
 * las tablas `repartidores` / `zonas_envio` (`catalogo` / `catalogoZonas`, mutables: las pruebas
 * les añaden altas hechas en la caja), las libretas `_vim_repartidores_ok` / `_vim_zonas_ok`
 * (`marcados` / `marcadasZonas`) y los marcadores de una-sola-vez (`marcadores`,
 * `_vim_migraciones_sync`).
 *
 * `catalogoZonas` guarda objetos `{ id }` (no ids sueltos como `catalogo`) porque así las trae la
 * prueba del brief de la Tarea 4 y es lo que espera `sembrarZonasUnaVez` al construir el snapshot.
 */
function crearPoolFalso({
  catalogo = [], yaMarcados = [], fallaLaSiembra = false,
  catalogoZonas = [], yaMarcadasZonas = [],
} = {}) {
  const marcados = new Set(yaMarcados);
  const marcadasZonas = new Set(yaMarcadasZonas);
  // El rescate de cortes (0.4.50) se da por corrido: aquí no se prueba y no debe tocar nada.
  const marcadores = new Set(["rescate_cortes_0089"]);
  const sembrados = [];
  const sembradosZonas = [];
  const pool = {
    catalogo: [...catalogo],
    catalogoZonas: [...catalogoZonas],
    marcados,
    marcadasZonas,
    marcadores,
    sembrados,
    sembradosZonas,
    fallaLaSiembra,
    async query(sql, params = []) {
      if (sql.startsWith("CREATE TABLE")) return { rows: [], rowCount: 0 };
      // Migración de la libreta de zonas a huella (C3): columna y relleno. Aquí no hay huellas que
      // rellenar; lo que hacen de verdad lo prueba el bloque con Postgres real al final del archivo.
      if (sql.startsWith("ALTER TABLE _vim_zonas_ok")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("UPDATE _vim_zonas_ok")) return { rows: [], rowCount: 0 };

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
      if (sql.includes("SELECT 1 FROM _vim_zonas_ok")) {
        return { rows: [], rowCount: marcadasZonas.size ? 1 : 0 };
      }

      // La siembra del ARRANQUE: `SELECT id FROM repartidores` / `SELECT id FROM zonas_envio`, sin parámetros.
      if (sql.includes("_vim_repartidores_ok") && sql.includes("SELECT id FROM repartidores")) {
        if (pool.fallaLaSiembra) throw new Error("siembra rota a propósito");
        const nuevos = pool.catalogo.filter((id) => !marcados.has(id));
        sembrados.push(...nuevos);
        for (const id of nuevos) marcados.add(id);
        return { rows: [], rowCount: nuevos.length };
      }
      if (sql.includes("_vim_zonas_ok") && sql.includes("FROM zonas_envio x ON CONFLICT")) {
        if (pool.fallaLaSiembra) throw new Error("siembra rota a propósito");
        const idsZonas = pool.catalogoZonas.map((z) => z.id);
        const nuevas = idsZonas.filter((id) => !marcadasZonas.has(id));
        sembradosZonas.push(...nuevas);
        for (const id of nuevas) marcadasZonas.add(id);
        return { rows: [], rowCount: nuevas.length };
      }
      // El marcado tras confirmar la nube: `SELECT unnest($1::uuid[])`.
      if (sql.includes("_vim_repartidores_ok") && sql.includes("unnest")) {
        for (const id of params[0]) marcados.add(id);
        return { rows: [], rowCount: params[0].length };
      }
      // Las zonas se marcan con su huella: `[{ id, huella }]` en JSON.
      if (sql.includes("_vim_zonas_ok") && sql.includes("jsonb_array_elements")) {
        const zonas = JSON.parse(params[0]);
        for (const z of zonas) marcadasZonas.add(z.id);
        return { rows: [], rowCount: zonas.length };
      }

      const pendientes = pool.catalogo.filter((id) => !marcados.has(id));
      const pendientesZonas = pool.catalogoZonas.map((z) => z.id).filter((id) => !marcadasZonas.has(id));

      if (sql.includes("array_agg(id ORDER BY fecha_apertura)")) {
        return {
          rows: [{
            ids: null, turnos: null, movimientos: null,
            repartidores: pendientes.length ? pendientes : null,
            zonas: pendientesZonas.length ? pendientesZonas : null,
          }],
        };
      }
      if (sql.includes("WITH tk AS")) {
        return {
          rows: [{
            ids: null, turnos: null, movimientos: null,
            repartidores: pendientes.length ? pendientes : null,
            zonas: pendientesZonas.length ? pendientesZonas.map((id) => ({ id, huella: `h-${id}` })) : null,
            snapshot: {
              repartidores: pendientes.map((id) => ({ id, nombre: `Repartidor ${id}` })),
              zonas_envio: pendientesZonas.map((id) => ({ id, nombre: `Zona ${id}` })),
            },
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

/** Ids de zonas de envío que viajaron en la petición número `i` del push. */
const zonasEnviadasEn = (nube, i = 0) => (nube.peticiones[i]?.snapshot?.zonas_envio ?? []).map((z) => z.id);

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

// Zonas de envío (0116/Task 4): mismo mecanismo que los repartidores (0114), mismo riesgo en los
// dos sentidos — marcar de más pierde un alta local para siempre, marcar de menos pisa lo que el
// panel acaba de editar. Ver `sembrarZonasUnaVez` en sync-push.mjs para el razonamiento completo.

test("la siembra de zonas no corre dos veces en la misma caja", async () => {
  const pool = crearPoolFalso({ catalogoZonas: [{ id: "z1" }] });
  assert.equal(await sembrarZonasUnaVez(pool, () => {}), 1);
  assert.equal(await sembrarZonasUnaVez(pool, () => {}), 0);
});

test("la siembra de zonas NO marca un alta local que todavía no sube", async () => {
  // Calendario del fallo real de la 0114: arranque sin libreta → alta en la caja → primer sync.
  // Si la libreta ya tiene anotaciones (las puso el pull), sembrar marcaría el alta local como
  // subida y esa zona no viajaría NUNCA.
  const pool = crearPoolFalso({ catalogoZonas: [{ id: "z1" }, { id: "z2" }], yaMarcadasZonas: ["z1"] });
  assert.equal(await sembrarZonasUnaVez(pool, () => {}), 0);
  assert.ok(!pool.marcadasZonas.has("z2"), "la siembra marcó un alta local sin subir");
});

test("las zonas pendientes son las que la nube aún no confirmó", async () => {
  const pool = crearPoolFalso({ catalogoZonas: [{ id: "z1" }, { id: "z2" }], yaMarcadasZonas: ["z1"] });
  const p = await listarPendientes(pool);
  assert.deepEqual(p.zonaIds, ["z2"]);
});

// Ronda de arreglos 1/5: las tres pruebas de arriba solo llaman a `sembrarZonasUnaVez` o a
// `listarPendientes`, así que nunca ejercitan el camino de PUSH real: el destructuring de `zonas`
// en `enviarLote`, `marcarZonasSubidas`, `zonasRechazadas` ni la rama `zonas_envio` de
// `rechazadosPorTicket` tenían ninguna prueba que los pasara. Gemelas exactas de las pruebas de
// repartidores de arriba ("un repartidor que la nube RECHAZA…" y "un alta hecha SIN CONEXIÓN…"),
// que sí pasan por `pushToCloud`.

test("una zona que la nube RECHAZA no se marca y vuelve a intentarse", async () => {
  const pool = crearPoolFalso({ catalogoZonas: [{ id: "z1" }, { id: "z2" }] });
  // La nube aísla la fila conflictiva (migración 0074) y dice cuál se quedó fuera.
  const nube = nubeFalsa({ resultado: { zonas_envio: 1, _errores: [{ tabla: "zonas_envio", id: "z2", error: "zona_envio_nombre_uq" }] } });
  try {
    await pushToCloud(pool, OPTS, () => {});

    assert.ok(pool.marcadasZonas.has("z1"), "la zona que SÍ entró debía quedar marcada");
    assert.ok(!pool.marcadasZonas.has("z2"), "marcar una rechazada la perdería para siempre: no debe marcarse");

    // Y por eso sigue pendiente: el siguiente ciclo la vuelve a mandar.
    const pend = await listarPendientes(pool);
    assert.deepEqual(pend.zonaIds, ["z2"]);
  } finally { nube.restaurar(); }
});

test("una zona dada de alta SIN CONEXIÓN, antes de que la libreta existiera, sí llega a la nube", async () => {
  // Mismo calendario que con los repartidores: la caja arranca sin internet —la siembra no
  // depende de la nube—, y solo después el cajero da de alta una zona nueva para poder cobrar un
  // domicilio. Cuando vuelve la conexión, el push tiene que mandarla y marcarla, no perderla.
  const pool = crearPoolFalso({ catalogoZonas: [{ id: "z1" }] });
  await sembrarZonasUnaVez(pool);
  assert.deepEqual(pool.sembradosZonas, ["z1"]);

  pool.catalogoZonas.push({ id: "z2" });

  const nube = nubeFalsa({ resultado: { zonas_envio: 1 } });
  try {
    await pushToCloud(pool, OPTS, () => {});
    assert.deepEqual(pool.sembradosZonas, ["z1"], "el push no debe sembrar la libreta: eso es del arranque");
    assert.deepEqual(zonasEnviadasEn(nube), ["z2"], "el alta hecha en la caja tenía que viajar en el push");
    assert.ok(pool.marcadasZonas.has("z2"), "y quedar marcada una vez que la nube la confirmó");
  } finally { nube.restaurar(); }
});

// ── C3 (revisión final): la libreta de zonas va por HUELLA, contra un Postgres de verdad ──────
//
// Una zona que la caja reprecia con PIN (`cambiarCostoZona`) ya está en la libreta, así que con
// "sube UNA vez por id" nunca volvía a subir, y el siguiente pull la pisaba con el precio de la
// nube: lo que autorizó el supervisor duraba minutos. Aquí va con Postgres real y no con el pool
// falso porque lo que decide es SQL (`md5(to_jsonb(x)::text)` contra la huella anotada): un pool
// falso solo probaría su propia imitación.
import { describe, before, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startLocalBackend } from "./runtime.mjs";
import { pullSnapshot } from "./sync-pull.mjs";

// El job `desktop` de ci.yml corre en ubuntu-latest y dice explícitamente que "los verify:* de
// extremo a extremo necesitan el Postgres embebido de Windows y quedan fuera de este job a
// propósito" (comentario del step "Pruebas del escritorio"). El runner de Linux no trae las
// librerías del binario `initdb` embebido (falta libicuuc.so.60) y arrancar Postgres real ahí
// falla en el hook, tumbando todas las pruebas de este bloque. Se salta fuera de Windows.
const SOLO_WINDOWS_MOTIVO =
  "Postgres embebido solo en Windows; en CI la política se cubre con los dobles";
const SOLO_WINDOWS = process.platform !== "win32" ? SOLO_WINDOWS_MOTIVO : false;

describe("libreta de zonas por huella (Postgres real)", { skip: SOLO_WINDOWS }, () => {
  const TENANT = "99999999-0000-0000-0000-0000000000aa";
  const SUC = "99999999-0000-0000-0000-0000000000bb";
  let dir, backend, db;

  /** La fila tal como la mandaría la nube (to_jsonb de la local, que es lo que subió). */
  const filaDe = async (id) => (await db.query("SELECT to_jsonb(z) AS f FROM zonas_envio z WHERE id = $1", [id])).rows[0].f;
  const pendientes = async () => (await listarPendientes(db)).zonaIds;

  before(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "vim-zonas-huella-"));
    backend = await startLocalBackend({ dataRoot: dir, pgPort: 54393, restPort: 54394, log: () => {} });
    db = backend.pool;
    // Que ninguna venta del fixture de dev viaje en los push de abajo: aquí solo importan las zonas.
    await listarPendientes(db);
    await db.query("INSERT INTO _vim_push_ok (ticket_id) SELECT id FROM tickets ON CONFLICT DO NOTHING");
  }, { timeout: 120_000 });

  after(async () => {
    if (backend) await backend.stop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("bajar del pull NO vuelve a subir; repreciar en la caja SÍ; y subido, ya no", async () => {
    const { rows: [{ id }] } = await db.query(
      "INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES ($1, $2, 'Huella Norte', 35) RETURNING id",
      [TENANT, SUC]);

    // Llega por el pull: la libreta la anota con su huella y no está pendiente.
    await pullSnapshot(db, { zonas_envio: [await filaDe(id)] });
    assert.ok(!(await pendientes()).includes(id), "una zona recién bajada del pull no debe volver a subir");

    // El supervisor autoriza otro precio en la caja.
    await db.query("UPDATE zonas_envio SET costo_mxn = 50 WHERE id = $1", [id]);
    assert.ok((await pendientes()).includes(id), "una zona repreciada en la caja tiene que volver a subir");

    const nube = nubeFalsa({ resultado: { zonas_envio: 1 } });
    try {
      await pushToCloud(db, OPTS, () => {});
      const subida = (nube.peticiones[0]?.snapshot?.zonas_envio ?? []).find((z) => z.id === id);
      assert.equal(Number(subida?.costo_mxn), 50, "el push debía llevar el precio nuevo");
    } finally { nube.restaurar(); }
    assert.ok(!(await pendientes()).includes(id), "confirmada por la nube, no vuelve a subir");

    // El siguiente pull trae de vuelta lo mismo que subió: sigue sin estar pendiente y el precio queda.
    await pullSnapshot(db, { zonas_envio: [await filaDe(id)] });
    assert.ok(!(await pendientes()).includes(id));
    const { rows: [{ costo_mxn }] } = await db.query("SELECT costo_mxn FROM zonas_envio WHERE id = $1", [id]);
    assert.equal(Number(costo_mxn), 50);
  });

  test("I6: una zona creada en la caja que choca por nombre con la de la nube no traba el pull", async () => {
    // La caja dio de alta "Centro" sin conexión y cobró un domicilio con ella; el panel creó su
    // propio "centro". El pull chocaba contra zona_envio_nombre_uq y hacía ROLLBACK de todo.
    const { rows: [{ id: local }] } = await db.query(
      "INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES ($1, $2, 'Centro I6', 0) RETURNING id",
      [TENANT, SUC]);
    // Un domicilio cobrado con esa zona (el fixture de dev no trae ventas: se abre una).
    const c = await db.connect();
    let ticket;
    try {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)",
        [JSON.stringify({ sub: "99999999-0000-0000-0000-000000000001", tenant_id: TENANT })]);
      const { rows: [{ id: turno }] } = await c.query(
        `INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn)
         VALUES ($1, $2, '99999999-0000-0000-0000-0000000000cc', 'I6', current_date, '99999999-0000-0000-0000-000000000001', 0)
         RETURNING id`, [TENANT, SUC]);
      ({ rows: [{ id: ticket }] } = await c.query(
        `SELECT abrir_ticket($1, '99999999-0000-0000-0000-0000000000cc', $2, 'DELIVERY_PROPIO', NULL, NULL, NULL,
                             '99999999-0000-0000-0000-000000000001') AS id`, [SUC, turno]));
      await c.query("SELECT fijar_envio_ticket($1, $2)", [ticket, local]);
    } finally { c.release(); }
    assert.equal((await db.query("SELECT zona_envio_id FROM tickets WHERE id = $1", [ticket])).rows[0].zona_envio_id, local);

    const nube = { ...(await filaDe(local)), id: "12345678-0000-4000-8000-00000000c1a6", nombre: "  centro i6 ", costo_mxn: 15 };
    await pullSnapshot(db, { zonas_envio: [nube] });

    const { rows: zonas } = await db.query("SELECT id, costo_mxn FROM zonas_envio WHERE lower(btrim(nombre)) = 'centro i6'");
    assert.deepEqual(zonas.map((z) => z.id), [nube.id], "debe quedar solo la zona de la nube");
    const { rows: [t] } = await db.query("SELECT zona_envio_id FROM tickets WHERE id = $1", [ticket]);
    assert.equal(t.zona_envio_id, nube.id, "el ticket que usaba la zona local debe apuntar a la de la nube");
  });

  test("una libreta vieja (sin huella) se migra sin perder filas ni subir de más", async () => {
    const { rows: [{ id }] } = await db.query(
      "INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES ($1, $2, 'Huella Vieja', 20) RETURNING id",
      [TENANT, SUC]);
    // La libreta tal como la dejaba la versión anterior: sin columna huella, con la zona anotada.
    await db.query("DROP TABLE _vim_zonas_ok");
    await db.query("CREATE TABLE _vim_zonas_ok (zona_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
    await db.query("INSERT INTO _vim_zonas_ok (zona_id) SELECT id FROM zonas_envio");

    assert.ok(!(await pendientes()).includes(id), "una fila sin huella no se da por cambiada");
    const { rows } = await db.query("SELECT count(*)::int AS n, count(huella)::int AS con FROM _vim_zonas_ok");
    assert.equal(rows[0].n, rows[0].con, "toda fila migrada debía quedar con su huella recalculada");

    await db.query("UPDATE zonas_envio SET costo_mxn = 25 WHERE id = $1", [id]);
    assert.ok((await pendientes()).includes(id), "tras la migración, repreciar vuelve a subir");
  });

  // ── Residual (re-revisión final, 22 sep): el pull pisaba un repreciado local pendiente ──────
  //
  // `pullSnapshot` hacía upsert de TODAS las zonas de la nube sin saltar las que tenían un cambio
  // local pendiente de subir, y luego las marcaba con la huella de la versión de la NUBE. Un
  // repreciado con PIN de supervisor sobrevivía solo hasta el siguiente pull (arranque, sondeo de
  // catálogo, o el pull tras un push fallido — main.mjs ~212, 641, 745): el precio volvía al de la
  // nube en silencio, y como la huella ya coincidía, el cambio no volvía a subir nunca.
  test("un pull con el precio viejo de la nube NO revierte un repreciado local pendiente de subir", async () => {
    const { rows: [{ id }] } = await db.query(
      "INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES ($1, $2, 'Huella Sur', 35) RETURNING id",
      [TENANT, SUC]);

    // La zona ya bajó del pull una vez: está en la libreta con la huella de $35.
    await pullSnapshot(db, { zonas_envio: [await filaDe(id)] });
    const filaVieja = await filaDe(id); // la nube todavía tiene el precio viejo

    // El supervisor autoriza el repreciado en la caja, ANTES de que el push lo suba.
    await db.query("UPDATE zonas_envio SET costo_mxn = 50 WHERE id = $1", [id]);
    assert.ok((await pendientes()).includes(id), "queda pendiente de subir");

    // Llega un pull (sondeo/arranque) con el snapshot viejo: la nube todavía no sabe del repreciado.
    await pullSnapshot(db, { zonas_envio: [filaVieja] });

    const { rows: [{ costo_mxn }] } = await db.query("SELECT costo_mxn FROM zonas_envio WHERE id = $1", [id]);
    assert.equal(Number(costo_mxn), 50, "el precio local repreciado debe sobrevivir al pull");
    assert.ok((await pendientes()).includes(id), "y seguir pendiente de subir: el pull no la marcó como de la nube");

    // Convergencia: el siguiente push sube el precio nuevo; después de eso, un pull ya es inocuo.
    const nube = nubeFalsa({ resultado: { zonas_envio: 1 } });
    try {
      await pushToCloud(db, OPTS, () => {});
      const subida = (nube.peticiones[0]?.snapshot?.zonas_envio ?? []).find((z) => z.id === id);
      assert.equal(Number(subida?.costo_mxn), 50, "el push debía llevar el precio nuevo, no el viejo silenciado");
    } finally { nube.restaurar(); }
    assert.ok(!(await pendientes()).includes(id), "confirmada por la nube, ya no está pendiente");

    await pullSnapshot(db, { zonas_envio: [await filaDe(id)] });
    const { rows: [{ costo_mxn: final }] } = await db.query("SELECT costo_mxn FROM zonas_envio WHERE id = $1", [id]);
    assert.equal(Number(final), 50, "converge: el pull posterior al push ya no revierte nada");
    assert.ok(!(await pendientes()).includes(id));
  });

  test("control: una zona SIN cambios locales sí se actualiza con el valor de la nube", async () => {
    const { rows: [{ id }] } = await db.query(
      "INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES ($1, $2, 'Huella Poniente', 20) RETURNING id",
      [TENANT, SUC]);
    await pullSnapshot(db, { zonas_envio: [await filaDe(id)] });
    assert.ok(!(await pendientes()).includes(id), "sin ediciones locales, no está pendiente");

    // La nube manda una versión con otro precio: como la copia local NO cambió, sí debe aplicarse.
    const filaConCambioDeLaNube = { ...(await filaDe(id)), costo_mxn: 28 };
    await pullSnapshot(db, { zonas_envio: [filaConCambioDeLaNube] });

    const { rows: [{ costo_mxn }] } = await db.query("SELECT costo_mxn FROM zonas_envio WHERE id = $1", [id]);
    assert.equal(Number(costo_mxn), 28, "sin cambio local pendiente, el valor de la nube sí se aplica");
    assert.ok(!(await pendientes()).includes(id));
  });

  // Carrera (revisión del 22 sep): `separarZonasPendientes` consultaba sin FOR UPDATE. Un
  // `cambiarCostoZona` en vuelo (su UPDATE hecho, sin COMMIT) no se veía como pendiente; el upsert
  // del pull esperaba el candado de la fila y, al soltarse, pisaba el repreciado y lo anotaba como
  // "ya sabido": el precio del supervisor se perdía y no volvía a subir.
  test("un repreciado en vuelo mientras corre el pull no se pisa", async () => {
    const { rows: [{ id }] } = await db.query(
      "INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES ($1, $2, 'Huella Carrera', 35) RETURNING id",
      [TENANT, SUC]);
    await pullSnapshot(db, { zonas_envio: [await filaDe(id)] });
    const filaVieja = await filaDe(id);

    // El repreciado de la caja, a medio camino: UPDATE hecho, COMMIT todavía no.
    const caja = await db.connect();
    let pull;
    try {
      await caja.query("BEGIN");
      await caja.query("UPDATE zonas_envio SET costo_mxn = 50 WHERE id = $1", [id]);
      pull = pullSnapshot(db, { zonas_envio: [filaVieja] });
      await new Promise((r) => setTimeout(r, 400)); // el pull llega a la zona y espera el candado
      await caja.query("COMMIT");
    } finally { caja.release(); }
    await pull;

    const { rows: [{ costo_mxn }] } = await db.query("SELECT costo_mxn FROM zonas_envio WHERE id = $1", [id]);
    assert.equal(Number(costo_mxn), 50, "el repreciado que terminó durante el pull debe sobrevivir");
    assert.ok((await pendientes()).includes(id), "y seguir pendiente de subir");
  });
});
