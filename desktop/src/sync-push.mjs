// ⚠ `git blame` de este archivo MIENTE. El envío por lotes de aquí abajo entró en el commit
// 2383b29, cuyo mensaje habla de cortes de caja: se arrastró sin querer con `git add -A`. La
// historia no se reescribió porque de ese SHA salió la versión 0.4.50 ya publicada.
// El detalle está en docs/bitacora/2026-08-commits-mal-etiquetados.md.
//
// Fase 1 · Sync PUSH — sube a la nube las ventas que la caja generó offline.
// En el desktop las ventas se escriben directo al Postgres LOCAL (no al outbox de Dexie del POS
// web), así que el push LEE las filas operativas locales aún no subidas y las replica VERBATIM
// a la nube vía la RPC sync_push_snapshot (modo réplica → conserva folio/totales/PAGADO exactos).
// Solo sube tickets terminales (PAGADO/FACTURADO/CANCELADO): no cambian, así que subir una vez basta.
// Idempotente por id en el servidor; el device marca lo subido en _vim_push_ok para no re-trabajar.
//
// POR QUÉ VA EN LOTES Y NO DE UN JALÓN.
//
// Antes el push armaba TODO lo pendiente en un solo snapshot y lo mandaba en una sola petición.
// Con la caja al corriente eso son dos o tres ventas y no se nota. Pero el pendiente no tiene
// techo: una caja sin internet una semana acumula ~1,000 ventas, y un local que dejó de pagar el
// internet un mes acumula ~4,500 — con sus renglones, son decenas de MB en UNA petición.
//
// Eso no es "lento": es un fallo permanente. La Edge Function rechaza el cuerpo por tamaño, el
// device no marca nada como subido, y al ciclo siguiente vuelve a armar el MISMO paquete gigante
// y a fallar igual. La caja queda atorada para siempre, en silencio, y justo el cliente que peor
// conexión tiene es el que nunca vuelve a subir una venta. Es la misma forma del incidente del 17
// de agosto (ver el comentario de `construirSnapshotPush`): un push que falla entero deja el
// rastro solo en un log dentro de la máquina del cliente.
//
// Ahora se parte: N ventas por petición, cada lote con los turnos que sus tickets referencian
// (si el turno no viaja con ellos, la FK los rechaza). Y sobre todo, cada lote se marca como
// subido en cuanto la nube lo confirma. Si el lote 7 falla, los 6 primeros YA quedaron arriba y
// el siguiente ciclo retoma donde se quedó, en vez de repetir el trabajo desde cero.
import { Buffer } from "node:buffer";

const TERMINALES = ["PAGADO", "FACTURADO", "CANCELADO"];

/**
 * Cuántas ventas caben en una petición.
 *
 * 100 ventas con sus renglones rondan los 500 KB: cómodamente por debajo de lo que acepta una
 * Edge Function, y con margen para tickets gordos. El costo de equivocarse hacia abajo es una
 * petición de más —que a este ritmo (6 por hora por caja) no le cuesta nada a nadie—; el de
 * equivocarse hacia arriba es dejar una caja atorada.
 */
export const MAX_VENTAS_POR_LOTE = 100;

/** Techo duro por petición. Un lote que lo cruce se parte en dos, sin importar cuántas ventas trae. */
export const MAX_BYTES_POR_LOTE = 2 * 1024 * 1024;

/**
 * I2: techo de movimientos de inventario por CORRIDA de push, no por lote.
 *
 * `pushToCloud` pegaba TODOS los movimientos pendientes al primer lote, y `partir` solo dividía
 * `ticketIds` — `movimientoIds` viajaba entero con cada mitad. Con un backlog grande (una caja
 * mucho tiempo sin conexión, o un ajuste masivo) ese primer lote podía pesar más de
 * `MAX_BYTES_POR_LOTE` aunque no llevara ni una venta, y como antes de este fix un lote sin
 * tickets no podía partirse (`ticketIds.length > 1` era la única condición de corte), el 413 se
 * repetía para siempre: la misma caja atorada del comentario de arriba, ahora por inventario y
 * no por ventas. El resto de lo pendiente se pospone al siguiente ciclo (unos minutos después).
 */
export const MAX_MOVIMIENTOS_POR_PUSH = 500;

async function asegurarTabla(pool) {
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_push_ok (ticket_id uuid PRIMARY KEY, pushed_at timestamptz DEFAULT now())");
  // Los turnos se rastrean por HUELLA, no por "ya lo mandé": un ticket terminal nunca cambia,
  // pero un turno sí —se abre, se cierra, se le cuenta el efectivo— y cada cambio tiene que
  // volver a viajar. Ver el porqué en el comentario de `construirSnapshotPush`.
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_turnos_ok (turno_id uuid PRIMARY KEY, huella text NOT NULL, pushed_at timestamptz DEFAULT now())");

  // Movimientos de inventario: la caja los genera al vender (y al cancelar/devolver) y NUNCA los
  // baja del pull, así que todo lo que hay en la tabla local es de origen local. Se marcan por id
  // en cuanto la nube confirma; la nube es idempotente por id, así que reenviar no descuenta doble.
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_mov_ok (movimiento_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");

  // Repartidores: la caja puede darlos de alta (0114) porque un domicilio no puede quedarse sin
  // salir porque nadie entró al panel. Suben UNA sola vez, por id.
  //
  // OJO, no es como _vim_mov_ok aunque se parezca: los movimientos de inventario nunca bajan del
  // pull, así que allí la libreta solo evita re-trabajo. Los repartidores SÍ bajan, y aquí la
  // libreta es lo que impide que la caja reenvíe su copia vieja y pise lo que se editó en el panel.
  //
  // PARA QUE ESO SEA CIERTO, LA LIBRETA TIENE QUE SABER DE LOS QUE BAJARON.
  //
  // Solo se escribía al SUBIR (marcarRepartidoresSubidos). Las filas que llegaban por el pull no
  // se anotaban en ningún lado, y `sync_pull_snapshot` manda el catálogo COMPLETO del tenant: el
  // "solo los que no están en la libreta" del snapshot de push acababa siendo "casi todos". El
  // resultado era justo lo contrario de lo que la libreta promete — cada repartidor creado en el
  // panel hacía un viaje de ida y vuelta y volvía a subir tal como la caja lo tenía, y la nube lo
  // aplica con ON CONFLICT (id) DO UPDATE de TODAS las columnas: nombre, teléfono, activo,
  // deleted_at. Y como el push corre ANTES que el pull (main.mjs, ADR 0013), la caja nunca se
  // refresca antes de pisar: la ventana es un ciclo entero, no unos segundos. Un repartidor dado
  // de baja en el panel entre el último pull y el siguiente push RESUCITABA.
  //
  // Se cierra por los dos lados: el pull anota lo que baja (sync-pull.mjs), y la libreta nace
  // SEMBRADA con el catálogo que ya estaba en la caja.
  //
  // AQUÍ SOLO SE CREA LA TABLA. LA SIEMBRA VIVE EN EL ARRANQUE, NO EN EL PUSH.
  //
  // La siembra estuvo aquí y era una pérdida de datos esperando su turno: a este archivo solo se
  // llega desde pushToCloud, y el push ni se intenta si el login del dispositivo contra la nube
  // falla (main.mjs). O sea, la libreta no nacía al instalar sino en el primer sync EXITOSO. Una
  // caja que se actualiza sin internet (o con una credencial que no entra, como le pasó al piloto
  // el 8/09/2026) se queda sin libreta; el cajero da de alta a un repartidor —que es justo para lo
  // que se hizo esto—, y cuando vuelve la conexión la siembra lo encuentra en el catálogo y lo
  // marca como ya subido. Por diseño no vuelve a viajar nunca: no llega a la nube, nadie se entera,
  // y sus `delivery_asignaciones` se estrellan contra la FK allá arriba —donde `rechazadosPorTicket`
  // las deja pasar a propósito—, así que cada reparto que hizo pierde también su atribución.
  // Ver `sembrarRepartidoresUnaVez`, que corre al arrancar el backend local (runtime.mjs).
  //
  // El CREATE se queda porque el push tiene que funcionar igual en las pruebas y en cualquier caja
  // cuyo arranque no haya pasado por ahí: sin la tabla, todas las consultas de abajo reventarían.
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_repartidores_ok (repartidor_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");

  // Zonas de envío (0115): mismo mecanismo que los repartidores de arriba, mismo motivo — la caja
  // puede darlas de alta (el cajero necesita cobrar un domicilio a una colonia nueva sin esperar al
  // panel) y suben UNA sola vez, por id. Ver `sembrarZonasUnaVez` para la siembra en el arranque.
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_zonas_ok (zona_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");

  await rescatarCortesUnaVez(pool);
}

/**
 * Sube los cortes que se quedaron atrapados en esta caja. UNA sola vez por caja.
 *
 * Hasta la 0.4.50 el snapshot no incluía `cortes_caja` ni el reporte Z: se generaban aquí, se
 * imprimían, y no salían nunca. En el piloto quedaron trece turnos cerrados sin un solo corte en
 * la nube, y «Cortes Z históricos» del panel vacío para siempre.
 *
 * Arreglar el snapshot no basta para recuperarlos. La caja rastrea los turnos por HUELLA para no
 * reenviar lo ya subido, y esos turnos no han cambiado desde entonces: su huella coincide, así que
 * no se volverían a mandar y sus cortes seguirían aquí.
 *
 * Basta con borrar su huella: en el siguiente ciclo se ven como "cambiados" y suben otra vez, esta
 * vez arrastrando el cierre. No se borra ningún dato, y re-subir un turno es inofensivo — la nube
 * hace `ON CONFLICT (id) DO UPDATE`.
 *
 * VA AUTOMÁTICO, NO EN UN SCRIPT
 *
 * Pedirle a alguien que abra una terminal en la caja de un restaurante para correr un comando es
 * pedir que no se haga. Y esto no le pasa solo al piloto: le pasa a TODA caja que haya cerrado un
 * turno antes de actualizar. Se arregla solo al actualizar, que es cuando toca.
 *
 * El marcador impide que se repita: sin él, cada ciclo volvería a marcar todos los turnos con
 * corte y la caja estaría re-subiendo su historia entera cada diez minutos, para siempre.
 */
async function rescatarCortesUnaVez(pool) {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS _vim_migraciones_sync (clave text PRIMARY KEY, aplicada_at timestamptz DEFAULT now())",
  );
  const { rowCount: yaCorrio } = await pool.query(
    "SELECT 1 FROM _vim_migraciones_sync WHERE clave = 'rescate_cortes_0089'",
  );
  if (yaCorrio) return;

  // Se marca ANTES de tocar nada: si el borrado fallara a medias, el peor caso es que algunos
  // cortes no suban — no una caja que reintenta el rescate en cada ciclo indefinidamente.
  await pool.query(
    "INSERT INTO _vim_migraciones_sync(clave) VALUES ('rescate_cortes_0089') ON CONFLICT DO NOTHING",
  );

  const { rowCount: n } = await pool.query(`
    DELETE FROM _vim_turnos_ok o
     WHERE EXISTS (SELECT 1 FROM cortes_caja c          WHERE c.turno_id = o.turno_id)
        OR EXISTS (SELECT 1 FROM reportes_z_historico z WHERE z.turno_id = o.turno_id)
  `);
  if (n > 0) {
    console.log(`[sync] rescate de cortes: ${n} turno(s) volverán a subir con su cierre.`);
  }
}

/**
 * Siembra `_vim_repartidores_ok` con el catálogo que ya está en la caja. UNA sola vez por caja, EN
 * EL ARRANQUE — la llama `startLocalBackend` (runtime.mjs) justo después de aplicar migraciones.
 *
 * QUÉ SIEMBRA Y POR QUÉ ES SEGURO
 *
 * La libreta dice qué repartidores NO hay que mandar a la nube. Al instalar esta versión, el
 * catálogo local solo puede traer filas que BAJARON del pull: ninguna versión anterior sabía dar de
 * alta un repartidor desde la caja. La nube ya los tiene, así que marcarlos no pierde nada — y sin
 * marcarlos, el primer push subiría el catálogo entero y pisaría con la copia local el nombre, el
 * teléfono, el `activo` y el `deleted_at` que se hayan editado en el panel.
 *
 * POR QUÉ EN EL ARRANQUE Y NO EN EL PRIMER PUSH
 *
 * Porque el arranque no depende de la nube y el push sí. Aplicar las migraciones es lo primero que
 * hace la caja al abrir, pase lo que pase con el internet; el push ni se intenta si el dispositivo
 * no logra autenticarse contra Supabase. Sembrar desde el push dejaba sin libreta a la caja que se
 * actualiza sin conexión, y la siembra acababa corriendo DESPUÉS de que el cajero diera de alta a un
 * repartidor: lo marcaba como subido y esa alta no existía jamás en la nube. Ver `asegurarTabla`.
 *
 * Aquí eso no puede pasar: el primer arranque tras la actualización ocurre antes de que la caja
 * pueda escribir nada, y todo lo que se cree después ya nace fuera de la libreta.
 *
 * POR QUÉ SE MARCA ANTES DE SEMBRAR (igual que `rescatarCortesUnaVez`)
 *
 * Porque los dos fallos posibles no cuestan lo mismo. Si la siembra falla con el marcador ya
 * puesto, la libreta se queda vacía y el catálogo sube una vez: se pisa lo que el panel haya
 * editado en el último ciclo, es acotado y se acaba solo. Si en cambio el marcador se escribiera al
 * final, una siembra fallida quedaría armada para un arranque POSTERIOR — y para entonces el
 * catálogo ya puede tener un alta hecha en la caja, que la siembra marcaría como subida y se
 * perdería para siempre y en silencio. Es exactamente el fallo que esta función existe para cerrar.
 *
 * Y POR ESO UN FALLO AL SEMBRAR NO TUMBA EL ARRANQUE
 *
 * Es consecuencia de lo anterior, no una excepción: cuando el `INSERT` de la siembra lanza, el
 * marcador YA está confirmado, así que el arranque siguiente sale por el `return 0` de arriba y no
 * vuelve a intentarlo nunca. La siembra no puede quedar armada para más tarde, que era lo único
 * que justificaría morirse aquí. Lo que queda es el coste ya aceptado —una subida del catálogo
 * entero, que pisa como mucho un ciclo de ediciones del panel— contra dejar la caja sin abrir.
 *
 * Y no sería solo "sin abrir al actualizar": `startLocalBackend` se vuelve a recorrer a media
 * jornada, en el reinicio del perro guardián y en el del respaldo bajo demanda (`main.mjs`), donde
 * un throw aquí dejaría `backend` en null con una línea de consola. La caja nunca deja de cobrar
 * por una libreta de sincronización. Solo se protege el `INSERT` de la siembra: si fallara la
 * escritura del marcador, que aborte — de todos modos abortaría en los GRANT de doce líneas abajo.
 */
export async function sembrarRepartidoresUnaVez(db, log = () => {}) {
  await db.query("CREATE TABLE IF NOT EXISTS _vim_repartidores_ok (repartidor_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
  await db.query(
    "CREATE TABLE IF NOT EXISTS _vim_migraciones_sync (clave text PRIMARY KEY, aplicada_at timestamptz DEFAULT now())",
  );
  const { rowCount: yaCorrio } = await db.query(
    "SELECT 1 FROM _vim_migraciones_sync WHERE clave = 'siembra_repartidores_0114'",
  );
  if (yaCorrio) return 0;

  // Libreta con filas y sin marcador: la escribió algo que no fue esta función — el pull anotando
  // lo que bajó, o la siembra vieja que vivía en el push. Entonces el catálogo local YA puede
  // contener un alta hecha en la caja y todavía sin subir, y sembrar ahora la marcaría como
  // enviada: la misma pérdida que esta función existe para impedir, ejecutada por el propio
  // arreglo. Pasa en las máquinas de desarrollo que corrieron la build anterior de esta rama (a
  // ninguna caja de cliente le llegó), y el plan de pruebas a mano hace justo ese recorrido.
  // No sembrar es seguro: lo único que se pierde es la protección contra una subida del catálogo.
  const { rowCount: yaTieneFilas } = await db.query("SELECT 1 FROM _vim_repartidores_ok LIMIT 1");

  await db.query(
    "INSERT INTO _vim_migraciones_sync(clave) VALUES ('siembra_repartidores_0114') ON CONFLICT DO NOTHING",
  );

  // Se marca igual, para no volver a mirarlo en cada arranque.
  if (yaTieneFilas) {
    log("libreta de repartidores ya tenía anotaciones: no se siembra (marcaría un alta local sin subir)");
    return 0;
  }

  try {
    const { rowCount: n } = await db.query(
      "INSERT INTO _vim_repartidores_ok (repartidor_id) SELECT id FROM repartidores ON CONFLICT DO NOTHING",
    );
    if (n > 0) log(`libreta de repartidores sembrada con ${n} del catálogo (bajaron de la nube: no vuelven a subir)`);
    return n;
  } catch (e) {
    // Ruidoso pero no fatal: la caja abre. El siguiente push subirá el catálogo entero una vez.
    const aviso = `no se pudo sembrar la libreta de repartidores (${e.message}). La caja abre igual;`
      + " el próximo push subirá el catálogo completo una vez y puede pisar ediciones recientes del panel.";
    log(`⚠ ${aviso}`);
    console.error("· [sync]", aviso);
    return 0;
  }
}

/**
 * Siembra `_vim_zonas_ok` con el catálogo que ya está en la caja. UNA sola vez por caja, EN EL
 * ARRANQUE — la llama `startLocalBackend` (runtime.mjs) justo después de `sembrarRepartidoresUnaVez`.
 *
 * Es la misma función que la de arriba, copiada para `zonas_envio`: mismo riesgo en los dos
 * sentidos (marcar de más pierde un alta local para siempre; marcar de menos pisa el nombre, el
 * costo y el `activa` que se acaban de editar en el panel), mismo motivo para sembrar en el
 * arranque y no en el primer push (el arranque no depende de la nube), y misma razón para marcar el
 * marcador ANTES de sembrar y para que un fallo aquí no tumbe la caja. El razonamiento completo,
 * comentario por comentario, está en `sembrarRepartidoresUnaVez` — no se repite aquí.
 */
export async function sembrarZonasUnaVez(db, log = () => {}) {
  await db.query("CREATE TABLE IF NOT EXISTS _vim_zonas_ok (zona_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
  await db.query(
    "CREATE TABLE IF NOT EXISTS _vim_migraciones_sync (clave text PRIMARY KEY, aplicada_at timestamptz DEFAULT now())",
  );
  const { rowCount: yaCorrio } = await db.query(
    "SELECT 1 FROM _vim_migraciones_sync WHERE clave = 'siembra_zonas_0115'",
  );
  if (yaCorrio) return 0;

  // Libreta con filas y sin marcador: la escribió el pull, o una siembra anterior. El catálogo
  // local YA puede traer un alta hecha en la caja y sin subir; sembrar ahora la marcaría como
  // enviada — la misma pérdida que esta función existe para impedir. No sembrar es seguro: lo
  // único que se pierde es la protección contra una subida del catálogo.
  const { rowCount: yaTieneFilas } = await db.query("SELECT 1 FROM _vim_zonas_ok LIMIT 1");

  await db.query(
    "INSERT INTO _vim_migraciones_sync(clave) VALUES ('siembra_zonas_0115') ON CONFLICT DO NOTHING",
  );

  // Se marca igual, para no volver a mirarlo en cada arranque.
  if (yaTieneFilas) {
    log("libreta de zonas ya tenía anotaciones: no se siembra (marcaría un alta local sin subir)");
    return 0;
  }

  try {
    const { rowCount: n } = await db.query(
      "INSERT INTO _vim_zonas_ok (zona_id) SELECT id FROM zonas_envio ON CONFLICT DO NOTHING",
    );
    if (n > 0) log(`libreta de zonas sembrada con ${n} del catálogo (bajaron de la nube: no vuelven a subir)`);
    return n;
  } catch (e) {
    // Ruidoso pero no fatal: la caja abre. El siguiente push subirá el catálogo entero una vez.
    const aviso = `no se pudo sembrar la libreta de zonas (${e.message}). La caja abre igual;`
      + " el próximo push subirá el catálogo completo una vez y puede pisar ediciones recientes del panel.";
    log(`⚠ ${aviso}`);
    console.error("· [sync]", aviso);
    return 0;
  }
}

/** Parte una lista en trozos de a lo más `tamano`. */
export function trocear(lista, tamano) {
  const trozos = [];
  for (let i = 0; i < lista.length; i += tamano) trozos.push(lista.slice(i, i + tamano));
  return trozos;
}

/**
 * Qué está pendiente de subir, sin armar todavía el contenido.
 *
 * Va aparte del armado porque el armado ahora es POR LOTE: primero hay que saber cuántas ventas
 * hay para repartirlas, y traer los ids es barato mientras que traer las filas completas de un
 * mes de operación son decenas de MB que ni siquiera caben en una petición.
 */
export async function listarPendientes(pool) {
  await asegurarTabla(pool);
  const { rows } = await pool.query(`
    SELECT
      -- En orden cronológico: si el envío se corta a media lista, lo que quedó arriba es un
      -- prefijo del historial y no un revoltijo.
      (SELECT array_agg(id ORDER BY fecha_apertura)
         FROM tickets
        WHERE estado_fiscal = ANY($1)
          AND id NOT IN (SELECT ticket_id FROM _vim_push_ok)) AS ids,
      -- Turnos que cambiaron (o que nunca viajaron) aunque no arrastren ventas nuevas.
      (SELECT array_agg(x.id)
         FROM turnos x
         LEFT JOIN _vim_turnos_ok o ON o.turno_id = x.id
        WHERE o.turno_id IS NULL
           OR o.huella IS DISTINCT FROM md5(to_jsonb(x)::text)) AS turnos,
      -- Movimientos de inventario aún no confirmados por la nube, en orden de fecha.
      (SELECT array_agg(m.id ORDER BY m.fecha)
         FROM movimientos_inventario m
         LEFT JOIN _vim_mov_ok ok ON ok.movimiento_id = m.id
        WHERE ok.movimiento_id IS NULL) AS movimientos,
      -- Repartidores dados de alta en la caja aún no confirmados por la nube (ver _vim_repartidores_ok
      -- en asegurarTabla). Sin esto, un alta a media jornada sin ventas ni turnos ni movimientos de
      -- por medio no hace pasar la guarda de pushToCloud y se queda atorada en silencio.
      (SELECT array_agg(x.id) FROM repartidores x
        WHERE x.id NOT IN (SELECT repartidor_id FROM _vim_repartidores_ok)) AS repartidores,
      -- Zonas de envío dadas de alta en la caja aún no confirmadas por la nube (ver _vim_zonas_ok
      -- en asegurarTabla). Mismo motivo que los repartidores: sin esto, un alta suelta se queda
      -- atorada en silencio.
      (SELECT array_agg(x.id) FROM zonas_envio x
        WHERE x.id NOT IN (SELECT zona_id FROM _vim_zonas_ok)) AS zonas
  `, [TERMINALES]);
  return {
    ids: rows[0].ids ?? [], turnosCambiados: rows[0].turnos ?? [],
    movimientoIds: rows[0].movimientos ?? [], repartidorIds: rows[0].repartidores ?? [],
    zonaIds: rows[0].zonas ?? [],
  };
}

/**
 * Arma el snapshot: ventas terminales no subidas, sus hijos, y los turnos que cambiaron.
 *
 * Sin argumentos arma TODO lo pendiente (es como lo usan las verificaciones). Con `ticketIds`
 * arma solo ese lote, y con `turnoIds` fuerza además esos turnos — los que cambiaron sin ventas,
 * que viajan pegados al primer lote.
 *
 * Los turnos que los tickets del lote REFERENCIAN entran siempre, se pidan o no: `tickets.turno_id`
 * es una FK, así que un ticket cuyo turno no viaja en la misma petición es una fila rechazada.
 *
 * POR QUÉ LOS TURNOS VAN POR HUELLA Y NO POR "YA SE MANDÓ".
 *
 * Antes los turnos solo viajaban si arrastraban una venta pendiente. Un turno cuyas ventas ya
 * estaban subidas nunca volvía a mandarse — y como el CIERRE ocurre después de la última venta,
 * el turno se quedaba ABIERTO en la nube PARA SIEMPRE. El siguiente turno de esa caja chocaba
 * entonces contra `idx_turno_unico_activo_por_caja` (un solo turno activo por caja) y el push
 * completo empezaba a fallar: no volvía a subir ni una venta más.
 *
 * No es teórico. En el piloto un turno del 17 de agosto quedó abierto en la nube, y del 18 en
 * adelante NADA subió: 27 ventas retenidas, 16 reintentos, y el panel mostrando cifras de días
 * atrás como si fueran de hoy. Se descubrió leyendo el log de la caja a mano.
 *
 * La huella es el md5 de la fila completa, no una lista de campos elegidos: así cualquier cambio
 * viaja —cierre, arqueo, justificación de diferencia, decisión del admin— sin que haya que
 * acordarse de añadir cada columna nueva a una lista que nadie va a mantener.
 *
 * `movimientos_caja` sigue a los mismos turnos y no solo a los de las ventas: un turno con puras
 * entradas y salidas de efectivo, sin vender nada, tampoco subía jamás.
 */
export async function construirSnapshotPush(pool, { ticketIds = null, turnoIds = null, movimientoIds = null } = {}) {
  await asegurarTabla(pool);
  const { rows } = await pool.query(`
    WITH tk AS (
      -- Con lista: exactamente ese lote. Sin lista: todo lo pendiente (comportamiento original).
      SELECT id, turno_id FROM tickets
       WHERE ($2::uuid[] IS NOT NULL AND id = ANY($2::uuid[]))
          OR ($2::uuid[] IS NULL
              AND estado_fiscal = ANY($1)
              AND id NOT IN (SELECT ticket_id FROM _vim_push_ok))
    ),
    tn AS (
      SELECT x.id, md5(to_jsonb(x)::text) AS huella
        FROM turnos x
        LEFT JOIN _vim_turnos_ok o ON o.turno_id = x.id
       WHERE x.id IN (SELECT turno_id FROM tk)                       -- los que la FK exige
          OR ($3::uuid[] IS NOT NULL AND x.id = ANY($3::uuid[]))     -- los que pidió el llamador
          OR ($3::uuid[] IS NULL AND $2::uuid[] IS NULL              -- modo completo: los cambiados
              AND (o.turno_id IS NULL OR o.huella IS DISTINCT FROM md5(to_jsonb(x)::text)))
    )
    SELECT
      (SELECT array_agg(id) FROM tk) AS ids,
      (SELECT jsonb_agg(jsonb_build_object('id', id, 'huella', huella)) FROM tn) AS turnos,
      (SELECT array_agg(id) FROM movimientos_inventario x WHERE ($4::uuid[] IS NOT NULL AND x.id = ANY($4::uuid[])) OR ($4::uuid[] IS NULL AND $2::uuid[] IS NULL AND x.id NOT IN (SELECT movimiento_id FROM _vim_mov_ok))) AS movimientos,
      (SELECT array_agg(id) FROM repartidores x WHERE x.id NOT IN (SELECT repartidor_id FROM _vim_repartidores_ok)) AS repartidores,
      (SELECT array_agg(id) FROM zonas_envio x WHERE x.id NOT IN (SELECT zona_id FROM _vim_zonas_ok)) AS zonas,
      jsonb_strip_nulls(jsonb_build_object(
        'turnos',                    (SELECT jsonb_agg(to_jsonb(x)) FROM turnos x WHERE x.id IN (SELECT id FROM tn)),
        'tickets',                   (SELECT jsonb_agg(to_jsonb(x)) FROM tickets x WHERE x.id IN (SELECT id FROM tk)),
        'ticket_items',              (SELECT jsonb_agg(to_jsonb(x)) FROM ticket_items x WHERE x.ticket_id IN (SELECT id FROM tk)),
        'ticket_item_modificadores', (SELECT jsonb_agg(to_jsonb(x)) FROM ticket_item_modificadores x WHERE x.ticket_item_id IN (SELECT id FROM ticket_items WHERE ticket_id IN (SELECT id FROM tk))),
        'pagos',                     (SELECT jsonb_agg(to_jsonb(x)) FROM pagos x WHERE x.ticket_id IN (SELECT id FROM tk)),
        'movimientos_caja',          (SELECT jsonb_agg(to_jsonb(x)) FROM movimientos_caja x WHERE x.turno_id IN (SELECT id FROM tn)),
        -- Quién repartió cada domicilio. Viaja con su ticket: la asignación se anota al marcar la
        -- salida, antes de cobrar, así que para cuando el ticket entra en esta rebanada ya está
        -- liquidada y sube completa.
        'delivery_asignaciones',     (SELECT jsonb_agg(to_jsonb(x)) FROM delivery_asignaciones x WHERE x.ticket_id IN (SELECT id FROM tk)),

        -- El catálogo de repartidores, solo los que la nube aún no confirmó. Ver _vim_repartidores_ok.
        'repartidores',              (SELECT jsonb_agg(to_jsonb(x)) FROM repartidores x
                                        WHERE x.id NOT IN (SELECT repartidor_id FROM _vim_repartidores_ok)),

        -- El catálogo de zonas de envío, solo las que la nube aún no confirmó. Ver _vim_zonas_ok.
        'zonas_envio',                (SELECT jsonb_agg(to_jsonb(x)) FROM zonas_envio x
                                        WHERE x.id NOT IN (SELECT zona_id FROM _vim_zonas_ok)),

        -- EL CIERRE DEL TURNO. Se quedaba en la caja.
        --
        -- El corte y el reporte Z los generan RPCs que en el escritorio corren contra ESTE
        -- Postgres local, así que nacían aquí y no salían nunca: el dueño abría «Cortes Z
        -- históricos» en el panel y lo veía vacío para siempre. Trece turnos cerrados sin un
        -- solo corte en la nube antes de detectarlo.
        --
        -- Van colgados de tn (los turnos de esta rebanada), igual que los movimientos: si el
        -- turno sube, su cierre sube con él. El detalle cuelga del corte, no del turno.
        'cortes_parciales',          (SELECT jsonb_agg(to_jsonb(x)) FROM cortes_parciales x WHERE x.turno_id IN (SELECT id FROM tn)),
        'cortes_caja',               (SELECT jsonb_agg(to_jsonb(x)) FROM cortes_caja x WHERE x.turno_id IN (SELECT id FROM tn)),
        'cortes_caja_detalle',       (SELECT jsonb_agg(to_jsonb(x)) FROM cortes_caja_detalle x WHERE x.corte_caja_id IN (SELECT id FROM cortes_caja WHERE turno_id IN (SELECT id FROM tn))),
        'reportes_z_historico',      (SELECT jsonb_agg(to_jsonb(x)) FROM reportes_z_historico x WHERE x.turno_id IN (SELECT id FROM tn)),

        -- Inventario (ADR 0013): con lista, exactamente esos; sin lista (modo completo), todos los
        -- pendientes. Solo columnas reales: costo_total_mxn es generada y la nube la ignora igual.
        'movimientos_inventario',    (SELECT jsonb_agg(to_jsonb(x) - 'costo_total_mxn' ORDER BY x.fecha) FROM movimientos_inventario x
                                        WHERE ($4::uuid[] IS NOT NULL AND x.id = ANY($4::uuid[]))
                                           OR ($4::uuid[] IS NULL AND $2::uuid[] IS NULL
                                               AND x.id NOT IN (SELECT movimiento_id FROM _vim_mov_ok)))
      )) AS snapshot
  `, [TERMINALES, ticketIds, turnoIds, movimientoIds]);
  return {
    snapshot: rows[0].snapshot ?? {}, ids: rows[0].ids ?? [], turnos: rows[0].turnos ?? [],
    movimientos: rows[0].movimientos ?? [], repartidores: rows[0].repartidores ?? [],
    zonas: rows[0].zonas ?? [],
  };
}

/** Marca tickets como subidos (para no re-enviarlos). */
export async function marcarPushed(pool, ids) {
  if (!ids?.length) return;
  await pool.query(
    "INSERT INTO _vim_push_ok(ticket_id) SELECT unnest($1::uuid[]) ON CONFLICT (ticket_id) DO NOTHING", [ids]);
}

/** Marca movimientos de inventario confirmados por la nube. */
export async function marcarMovimientosPushed(pool, ids) {
  if (!ids?.length) return;
  await pool.query(
    "INSERT INTO _vim_mov_ok(movimiento_id) SELECT unnest($1::uuid[]) ON CONFLICT (movimiento_id) DO NOTHING", [ids]);
}

/** Marca los repartidores que la nube ya aplicó: no vuelven a subir nunca. */
export async function marcarRepartidoresSubidos(pool, ids) {
  if (!ids?.length) return;
  await pool.query(
    "INSERT INTO _vim_repartidores_ok (repartidor_id) SELECT unnest($1::uuid[]) ON CONFLICT DO NOTHING",
    [ids],
  );
}

/** Marca las zonas de envío que la nube ya aplicó: no vuelven a subir nunca. */
export async function marcarZonasSubidas(pool, ids) {
  if (!ids?.length) return;
  await pool.query(
    "INSERT INTO _vim_zonas_ok (zona_id) SELECT unnest($1::uuid[]) ON CONFLICT DO NOTHING",
    [ids],
  );
}

/**
 * Guarda la huella de los turnos enviados. Se ACTUALIZA en conflicto, al revés que los tickets:
 * el mismo turno se manda muchas veces a lo largo de su vida y lo que importa es en qué estado
 * quedó la última vez que la nube lo recibió.
 */
export async function marcarTurnosPushed(pool, turnos) {
  if (!turnos?.length) return;
  await pool.query(
    `INSERT INTO _vim_turnos_ok(turno_id, huella)
     SELECT (x->>'id')::uuid, x->>'huella' FROM jsonb_array_elements($1::jsonb) AS x
     ON CONFLICT (turno_id) DO UPDATE SET huella = EXCLUDED.huella, pushed_at = now()`,
    [JSON.stringify(turnos)]);
}

/**
 * Traduce las filas que la nube rechazó a los IDS QUE NO DEBEN MARCARSE COMO SUBIDOS.
 *
 * No basta con excluir el id rechazado: si lo que falló fue un renglón o un pago, el ticket
 * llegó incompleto. Darlo por subido dejaría en la nube una venta a la que le falta la mitad,
 * y nadie volvería a intentarlo. Por eso se sube por la cadena hasta el ticket dueño.
 */
function rechazadosPorTicket(errores, snapshot) {
  const fuera = new Set();
  if (!errores?.length) return fuera;
  const itemATicket = new Map((snapshot.ticket_items ?? []).map((i) => [i.id, i.ticket_id]));
  for (const e of errores) {
    if (!e?.id) continue;
    if (e.tabla === "ticket_item_modificadores") {
      const item = (snapshot.ticket_item_modificadores ?? []).find((m) => m.id === e.id);
      const ticket = item && itemATicket.get(item.ticket_item_id);
      if (ticket) fuera.add(ticket);
    } else if (e.tabla === "delivery_asignaciones") {
      // Que no suba quién repartió no invalida la venta. Retener el ticket por esto lo dejaría
      // reintentándose para siempre si la asignación nunca puede aplicarse.
      continue;
    } else if (e.tabla === "repartidores") {
      // Un repartidor rechazado se reintenta solo (ver repartidoresRechazados); no cuelga de
      // ningún ticket, igual que delivery_asignaciones: que no suba el catálogo no invalida ventas.
      continue;
    } else if (e.tabla === "zonas_envio") {
      // Igual que un repartidor rechazado: la zona se reintenta sola (ver zonasRechazadas), no
      // cuelga de ningún ticket.
      continue;
    } else if (e.tabla === "ticket_items" || e.tabla === "pagos") {
      const fila = (snapshot[e.tabla] ?? []).find((x) => x.id === e.id);
      if (fila?.ticket_id) fuera.add(fila.ticket_id);
    } else if (e.tabla === "movimientos_inventario") {
      // Un movimiento rechazado se reintenta solo (ver movimientosRechazados); no invalida la venta.
      continue;
    } else {
      fuera.add(e.id); // tickets, turnos y movimientos_caja: el id ya es el que importa
    }
  }
  return fuera;
}

/** Ids de movimientos de inventario que la nube rechazó: no se marcan y se reintentan. */
function movimientosRechazados(errores) {
  return new Set((errores ?? []).filter((e) => e?.tabla === "movimientos_inventario" && e.id).map((e) => e.id));
}

/**
 * Ids de repartidores que la nube rechazó: no se marcan en _vim_repartidores_ok.
 *
 * Marcar un rechazado lo perdería para siempre — por diseño un repartidor confirmado nunca vuelve
 * a viajar, así que si se marca sin haber llegado de verdad, esa alta no existirá jamás en la nube.
 */
function repartidoresRechazados(errores) {
  return new Set((errores ?? []).filter((e) => e?.tabla === "repartidores" && e.id).map((e) => e.id));
}

/**
 * Ids de zonas de envío que la nube rechazó: no se marcan en _vim_zonas_ok.
 *
 * Marcar una rechazada la perdería para siempre — por diseño una zona confirmada nunca vuelve a
 * viajar, así que si se marca sin haber llegado de verdad, esa alta no existirá jamás en la nube.
 */
function zonasRechazadas(errores) {
  return new Set((errores ?? []).filter((e) => e?.tabla === "zonas_envio" && e.id).map((e) => e.id));
}

/**
 * Envía UN lote y marca lo que la nube aceptó.
 *
 * Se parte solo si hace falta: primero por tamaño medido antes de salir, y también si la nube
 * contesta 413 (el techo real puede ser más bajo que el nuestro, y ese error nunca se arregla
 * reintentando lo mismo). Partir a la mitad en vez de recalcular un tamaño "correcto" converge
 * en pocas vueltas y no necesita saber cuál es el límite del otro lado.
 */
async function enviarLote(pool, { cloudUrl, anonKey, deviceToken }, { ticketIds, turnoIds, movimientoIds = [], maxBytes }, log) {
  const { snapshot, ids, turnos, movimientos, repartidores, zonas } = await construirSnapshotPush(pool, { ticketIds, turnoIds, movimientoIds });
  const cuerpo = JSON.stringify({ snapshot });
  const bytes = Buffer.byteLength(cuerpo);

  // I2: un lote puede pesar de más por sus ventas, por sus movimientos, o por ambos — así que se
  // puede partir mientras CUALQUIERA de los dos traiga más de uno, no solo por ticketIds. Un lote
  // de puros movimientos (ticketIds vacío o con 1 sola venta) también debe poder encogerse.
  const partible = () => ticketIds.length > 1 || movimientoIds.length > 1;

  const partir = async (motivo) => {
    const mitadT = Math.ceil(ticketIds.length / 2);
    const mitadM = Math.ceil(movimientoIds.length / 2);
    log(`${motivo}: se parte en ${mitadT} + ${ticketIds.length - mitadT} ventas`
      + (movimientoIds.length > 1 ? ` y ${mitadM} + ${movimientoIds.length - mitadM} movimientos` : ""));
    // Los turnos forzados van con la primera mitad; la segunda ya solo carga los suyos por FK.
    // Los movimientos se parten a la mitad en ambas: no tienen FK que los arrastre solos.
    const a = await enviarLote(pool, { cloudUrl, anonKey, deviceToken }, { ticketIds: ticketIds.slice(0, mitadT), turnoIds, movimientoIds: movimientoIds.slice(0, mitadM), maxBytes }, log);
    const b = await enviarLote(pool, { cloudUrl, anonKey, deviceToken }, { ticketIds: ticketIds.slice(mitadT), turnoIds: [], movimientoIds: movimientoIds.slice(mitadM), maxBytes }, log);
    return { subidos: a.subidos + b.subidos, turnos: a.turnos + b.turnos, movimientos: a.movimientos + b.movimientos, rechazados: a.rechazados + b.rechazados };
  };

  if (bytes > maxBytes && partible()) {
    return partir(`lote de ${(bytes / 1048576).toFixed(1)} MB`);
  }

  const res = await fetch(`${cloudUrl}/functions/v1/sync-push`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${deviceToken}`, "Content-Type": "application/json" },
    body: cuerpo,
  });
  if (res.status === 413 && partible()) {
    return partir("la nube rechazó el lote por tamaño");
  }
  if (!res.ok) throw new Error(`sync-push HTTP ${res.status}: ${await res.text().catch(() => "")}`);

  // La nube aísla las filas conflictivas en vez de rechazar el paquete entero (migración 0074) y
  // devuelve cuáles se quedaron fuera. Marcarlas como subidas sería peor que el fallo original:
  // se perderían en silencio, sin reintento y sin nadie mirando.
  const respuesta = await res.json().catch(() => ({}));
  const errores = respuesta?.resultado?._errores ?? [];
  const fuera = rechazadosPorTicket(errores, snapshot);
  await marcarPushed(pool, ids.filter((id) => !fuera.has(id)));
  await marcarTurnosPushed(pool, turnos.filter((t) => !fuera.has(t.id)));
  const movFuera = movimientosRechazados(errores);
  await marcarMovimientosPushed(pool, movimientos.filter((id) => !movFuera.has(id)));
  const repFuera = repartidoresRechazados(errores);
  await marcarRepartidoresSubidos(pool, repartidores.filter((id) => !repFuera.has(id)));
  const zonaFuera = zonasRechazadas(errores);
  await marcarZonasSubidas(pool, zonas.filter((id) => !zonaFuera.has(id)));
  if (errores.length) {
    const muestra = errores.slice(0, 3).map((e) => `${e.tabla}/${String(e.id).slice(0, 8)}: ${e.error}`).join(" · ");
    log(`la nube rechazó ${errores.length} fila(s), se reintentarán: ${muestra}`);
  }
  return { subidos: ids.length - fuera.size, turnos: turnos.length, movimientos: movimientos.length - movFuera.size, rechazados: errores.length };
}

/**
 * PUSH a la nube: manda lo pendiente en lotes a la Edge Function sync-push (autenticada como el
 * dispositivo), marcando cada lote en cuanto la nube lo confirma.
 *
 * Si un lote falla, LANZA — el ciclo lo cuenta como fallo y aplica su backoff, que es lo correcto
 * cuando la nube no está. La diferencia con antes es que lo ya subido queda marcado: el reintento
 * arranca donde se quedó en vez de rearmar el paquete completo y volver a estrellarse.
 */
export async function pushToCloud(pool, opts, log = () => {}, cfg = {}) {
  const maxVentas = cfg.maxVentasPorLote ?? MAX_VENTAS_POR_LOTE;
  const maxBytes = cfg.maxBytesPorLote ?? MAX_BYTES_POR_LOTE;
  const maxMovimientos = cfg.maxMovimientosPorPush ?? MAX_MOVIMIENTOS_POR_PUSH;

  const { ids, turnosCambiados, movimientoIds: movimientoIdsTodos, repartidorIds, zonaIds } = await listarPendientes(pool);
  // I2: techo por corrida (ver el comentario de MAX_MOVIMIENTOS_POR_PUSH). El resto se queda
  // pendiente y lo recoge listarPendientes() en el siguiente ciclo — en orden de fecha, así que no
  // se salta ninguno, solo se pospone.
  const movimientoIds = movimientoIdsTodos.slice(0, maxMovimientos);
  if (movimientoIdsTodos.length > movimientoIds.length) {
    log(`${movimientoIdsTodos.length - movimientoIds.length} movimiento(s) de inventario se posponen al siguiente ciclo (techo ${maxMovimientos} por corrida)`);
  }
  // Un cierre de turno SIN ventas nuevas también es algo que subir. Cuando esta condición solo
  // miraba los tickets, el cierre se quedaba en la caja y la nube nunca se enteraba. Lo mismo pasa
  // con un movimiento de inventario suelto (ADR 0013), con un repartidor dado de alta a media
  // jornada (0114/Task 2) y con una zona de envío dada de alta igual (0115/Task 4): sin
  // `!repartidorIds.length` ni `!zonaIds.length`, una alta que cae justo cuando no hay ventas,
  // turnos cambiados NI movimientos pendientes hacía volver esta guarda antes de llegar a
  // construirSnapshotPush, y se quedaba atorada en la caja hasta que ALGO ajeno volviera a hacerla
  // pasar — en silencio, sin error, contra el motivo de tener el catálogo aquí.
  if (!ids.length && !turnosCambiados.length && !movimientoIds.length && !repartidorIds.length && !zonaIds.length) { log("nada pendiente por subir"); return { subidos: 0, turnos: 0, movimientos: 0, rechazados: 0, lotes: 0 }; }

  const parte = [
    ids.length ? `${ids.length} venta${ids.length === 1 ? "" : "s"}` : null,
    turnosCambiados.length ? `${turnosCambiados.length} turno${turnosCambiados.length === 1 ? "" : "s"}` : null,
    movimientoIds.length ? `${movimientoIds.length} movimiento(s) de inventario` : null,
    repartidorIds.length ? `${repartidorIds.length} repartidor(es)` : null,
    zonaIds.length ? `${zonaIds.length} zona(s) de envío` : null,
  ].filter(Boolean).join(" y ");

  // Sin ventas queda un solo lote vacío: el que lleva los turnos que cambiaron (y los movimientos).
  const lotes = ids.length ? trocear(ids, maxVentas) : [[]];
  log(`subiendo ${parte}${lotes.length > 1 ? ` en ${lotes.length} lotes` : ""}…`);

  let subidos = 0;
  let turnos = 0;
  let movimientos = 0;
  let rechazados = 0;
  let n = 0;

  for (const lote of lotes) {
    // Los turnos que cambiaron sin arrastrar ventas, y los movimientos pendientes, viajan pegados
    // al primer lote; los demás lotes ya cargan por FK los turnos de sus propios tickets.
    const turnoIds = n === 0 ? turnosCambiados : [];
    const movIds = n === 0 ? movimientoIds : [];
    n++;
    try {
      const r = await enviarLote(pool, opts, { ticketIds: lote, turnoIds, movimientoIds: movIds, maxBytes }, log);
      subidos += r.subidos;
      turnos += r.turnos;
      movimientos += r.movimientos;
      rechazados += r.rechazados;
    } catch (e) {
      // El mensaje dice cuánto SÍ quedó arriba: sin eso, el log de la caja (que es el único
      // testimonio que hay) haría pensar que no subió nada y se volvería a diagnosticar de cero.
      throw new Error(`${e.message} · lote ${n}/${lotes.length}, ${subidos} de ${ids.length} ventas ya quedaron en la nube`);
    }
    if (lotes.length > 1) log(`lote ${n}/${lotes.length} · ${subidos}/${ids.length} ventas arriba`);
  }

  return { subidos, turnos, movimientos, rechazados, lotes: n };
}
