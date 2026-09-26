// Fase 1 · Sync PULL — baja la "rebanada" del tenant (catálogo, config, empleados+PIN, org)
// de la nube al Postgres local. Complementa el PUSH (outbox) que ya existe: los datos de
// referencia (que edita el Admin) bajan; las ventas suben. Full-snapshot upsert idempotente.
//
// Motor genérico: para cada tabla detecta su PK y los tipos de columna, ignora columnas
// generadas, y hace INSERT ... ON CONFLICT (pk) DO UPDATE. Corre en modo réplica para no
// disparar triggers (misma semántica que la replicación lógica). Reusable con cualquier fuente.

import { asegurarLibretaZonas, ZONA_EDITADA_LOCAL } from "./sync-push.mjs";

// Orden de FKs: padres antes que hijos. Solo se procesan las tablas presentes en el snapshot.
export const PULL_ORDER = [
  { t: "tenants" },
  { t: "sucursales" },
  // Zonas de envío (0116): FK a sucursales, así que van justo después de su padre.
  { t: "zonas_envio" },
  { t: "cajas" },
  { t: "areas_cocina" },
  { t: "secciones" },
  { t: "mesas" },
  { t: "marcas_virtuales" },
  { t: "categorias" },
  { t: "grupos_modificadores" },
  { t: "productos" },
  { t: "opciones_modificador" },
  { t: "productos_grupos_modificadores" },
  // Combos (ADR 0015): slots y opciones. El combo mismo ya bajó con productos.
  { t: "combo_grupos" },
  { t: "combo_opciones" },
  { t: "subtipos_personal" },
  { t: "configuracion_tenant" },
  // Inventario (ADR 0013): unidades antes que insumos; existencias, recetas y componentes después.
  // La caja lo necesita para descontar al vender; los movimientos que genera suben por el push.
  { t: "unidades_medida" },
  { t: "insumos" },
  { t: "insumo_stock_sucursal" },
  { t: "recetas" },
  { t: "receta_componentes" },
  { t: "modificador_componentes" },
  { t: "repartidores" },
  { t: "permisos" },
  { t: "roles" },
  { t: "rol_permisos" },
  { t: "users", schema: "auth" },
  { t: "usuarios_perfil" },
  { t: "usuarios_acceso" },
];

/**
 * Columnas que la NUBE no manda sobre una fila que la caja ya tiene: se escriben al insertar (una
 * mesa nueva del panel llega con su estado) pero el pull no las pisa después.
 *
 * mesas.estado y mesas.reservacion_actual_id son el estado del PISO, no catálogo: ahí se sientan,
 * se cobran y se reservan, y todo eso pasa en la caja. Antes el pull bajaba la fila entera en cada
 * ciclo y la nube —que no se entera de lo que pasa en el mostrador— pisaba el piso de la caja: una
 * mesa atorada OCUPADA en la nube volvía a aparecer ocupada aunque se liberara en la caja, y no
 * había forma de arreglarlo desde el mostrador. Ahora el piso lo manda la caja, y lo sube
 * (`mesas_estado` en el push, 0122) para que la nube lo refleje.
 */
export const SOLO_AL_INSERTAR = {
  mesas: new Set(["estado", "reservacion_actual_id"]),
};

const metaCache = new Map();
async function tablaMeta(client, schema, tabla) {
  const key = `${schema}.${tabla}`;
  if (metaCache.has(key)) return metaCache.get(key);
  const cols = (await client.query(
    `SELECT column_name, udt_name, is_generated, is_identity
       FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [schema, tabla])).rows;
  if (cols.length === 0) { metaCache.set(key, null); return null; }
  const pk = (await client.query(
    `SELECT a.attname FROM pg_index i
       JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = ($1||'.'||$2)::regclass AND i.indisprimary`, [schema, tabla])).rows.map((r) => r.attname);
  const usable = new Map(); // col → udt, excluye generadas / identity
  for (const c of cols) if (c.is_generated !== "ALWAYS" && c.is_identity !== "YES") usable.set(c.column_name, c.udt_name);
  const meta = { pk, cols: usable };
  metaCache.set(key, meta);
  return meta;
}

/** Upsert de un lote de filas en una tabla (esquema-agnóstico). Devuelve nº de filas. */
async function upsertTabla(client, schema, tabla, filas) {
  if (!filas?.length) return 0;
  const meta = await tablaMeta(client, schema, tabla);
  if (!meta || meta.pk.length === 0) return 0;
  const ref = `${schema}."${tabla}"`;
  for (const fila of filas) {
    const cols = Object.keys(fila).filter((c) => meta.cols.has(c));
    if (cols.length === 0) continue;
    const params = [];
    const placeholders = cols.map((c, i) => {
      const udt = meta.cols.get(c);
      let v = fila[c];
      if (udt === "jsonb" || udt === "json") { v = v === null || v === undefined ? null : JSON.stringify(v); params.push(v); return `$${i + 1}::${udt}`; }
      params.push(v); // arrays (udt _xxx) y escalares: node-pg los mapea directo
      return `$${i + 1}`;
    });
    const soloAlInsertar = SOLO_AL_INSERTAR[tabla];
    const setCols = cols.filter((c) => !meta.pk.includes(c) && !soloAlInsertar?.has(c));
    const conflict = meta.pk.map((c) => `"${c}"`).join(", ");
    const setSql = setCols.length ? setCols.map((c) => `"${c}"=EXCLUDED."${c}"`).join(", ") : `"${meta.pk[0]}"=EXCLUDED."${meta.pk[0]}"`;
    await client.query(
      `INSERT INTO ${ref} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders.join(", ")})
       ON CONFLICT (${conflict}) DO UPDATE SET ${setSql}`, params);
  }
  return filas.length;
}

/**
 * Aplica un snapshot { tabla: filas[] } al Postgres local, en orden de FKs y modo réplica
 * (sin triggers). Idempotente: re-aplicar el mismo snapshot no cambia nada. Devuelve el resumen.
 */
/**
 * Catálogos globales que existen a la vez en la nube y en la caja (los siembran las migraciones),
 * y que tienen CLAVE NATURAL además del id. Sus ids pueden diferir entre bases —basta con que una
 * migración los inserte sin id fijo, como PERSONALIZADO en la 0053— y entonces el upsert genérico
 * (que resuelve por PK) choca contra el índice único de la clave natural y REVIENTA TODO EL PULL:
 * la caja se queda sin empleados y el error habla de una "unique constraint" que no orienta a nada.
 *
 * Para cada uno se listan las columnas de su clave natural. `dependientes` son las tablas que
 * apuntan al id que se va a borrar y que el propio pull vuelve a traer.
 *
 * `porPadre` es la otra forma de colisión (C1): `guardar_receta` (0099) borra y vuelve a insertar
 * los componentes de una receta con ids NUEVOS en cada edición del dueño. `receta_componentes`
 * tiene UNIQUE (receta_id, insumo_id) y `modificador_componentes` UNIQUE (opcion_modificador_id,
 * insumo_id): el próximo pull trae la misma pareja con otro id → choca contra ese índice único →
 * pullSnapshot hace ROLLBACK de TODA la transacción, para siempre. Aquí no hay una clave compuesta
 * fila-a-fila que resolver: se borra TODO lo que cuelga del padre (los ids del snapshot) y se deja
 * que el upsert inserte lo que mandó la nube. También limpia lo que el dueño borró en la nube (el
 * pull no trae tombstones), y es seguro porque el padre completo vuelve en el mismo snapshot.
 */
const CLAVES_NATURALES = {
  roles: { claves: ["codigo", "tenant_id"], dependientes: [{ tabla: "rol_permisos", col: "rol_id" }] },
  permisos: { claves: ["codigo"], dependientes: [{ tabla: "rol_permisos", col: "permiso_id" }] },
  rol_permisos: { claves: ["rol_id", "permiso_id"], dependientes: [] },
  // Una venta local puede crear la fila de existencias (aplicar_movimiento_inventario la inserta si
  // no existe) con un id distinto al de la nube. Los movimientos no apuntan a esta fila, así que
  // borrar la local y dejar entrar la de la nube es seguro.
  insumo_stock_sucursal: { claves: ["insumo_id", "sucursal_id"], dependientes: [] },
  // C2: una caja de campo sembró sus unidades (0035/0085) con gen_random_uuid() antes de que
  // existiera el pull; el código coincide con la nube pero el id no. Insumos y componentes se
  // vuelven a pullear justo después con el id de la nube, así que el borrado es seguro.
  unidades_medida: { claves: ["codigo", "tenant_id"], dependientes: [] },
  // C1: reconciliación por padre, no por clave compuesta fila-a-fila (ver comentario arriba).
  receta_componentes: { porPadre: "receta_id" },
  modificador_componentes: { porPadre: "opcion_modificador_id" },
  // I6: la caja da de alta "Centro" sin conexión y el panel da de alta otro "Centro". Mismo nombre,
  // otro id: el upsert choca con zona_envio_nombre_uq —(sucursal_id, lower(btrim(nombre))) WHERE
  // deleted_at IS NULL, 0116— y el ROLLBACK se lleva TODO el pull, en cada ciclo, para siempre.
  // La clave natural es una EXPRESIÓN, no columnas sueltas, y solo cuenta entre filas vivas (una
  // zona de la nube ya borrada no choca con nada). La zona local sí tiene datos que no se pueden
  // tirar: ventas y direcciones que la usan. Por eso `reapuntar` en vez de `dependientes`: se les
  // cambia el id al de la nube (que el upsert de abajo inserta enseguida; en modo réplica la FK no
  // se revisa en el ínterin) y después se borra la zona local. Un alta que la caja no llegó a
  // subir se pierde a favor de la del panel, con su precio: la nube manda.
  zonas_envio: {
    claveSql: {
      where: "sucursal_id = $1 AND lower(btrim(nombre)) = lower(btrim($2)) AND deleted_at IS NULL",
      params: (f) => [f.sucursal_id ?? null, f.nombre ?? null],
      aplica: (f) => f.deleted_at == null,
    },
    dependientes: [],
    reapuntar: [{ tabla: "tickets", col: "zona_envio_id" }, { tabla: "direcciones_cliente", col: "zona_envio_id" }],
  },
};

/**
 * Alinea un catálogo local con el de la nube ANTES de insertarlo: borra la fila local que colisiona
 * por clave natural con una entrante de distinto id, para que entre la de la nube con su id.
 * La nube manda. Es seguro porque una caja real no tiene datos propios: todo viene de allá.
 */
async function reconciliarCatalogo(client, tabla, filas, log = () => {}) {
  const cfg = CLAVES_NATURALES[tabla];
  if (!cfg) return;

  // C1: por padre — borra TODO lo que cuelga de cada padre presente en el snapshot y deja que el
  // upsert de abajo inserte las filas de la nube con sus ids nuevos.
  if (cfg.porPadre) {
    const padres = [...new Set(filas.map((f) => f?.[cfg.porPadre]).filter((v) => v != null))];
    if (!padres.length) return;
    const { rowCount } = await client.query(
      `DELETE FROM ${tabla} WHERE "${cfg.porPadre}" = ANY($1::uuid[])`, [padres]);
    if (rowCount) log(`  ${tabla}: ${rowCount} realineada(s) con la nube (por ${cfg.porPadre})`);
    return;
  }

  let borradas = 0;
  for (const f of filas) {
    if (!f?.id) continue;
    let cond, params;
    if (cfg.claveSql) {
      // Clave natural por expresión (I6, zonas_envio): el índice único no es de columnas sueltas.
      if (!cfg.claveSql.aplica(f)) continue;
      cond = cfg.claveSql.where;
      params = cfg.claveSql.params(f);
    } else {
      // IS NOT DISTINCT FROM: trata NULL = NULL (los catálogos globales llevan tenant_id NULL).
      cond = cfg.claves.map((c, i) => `"${c}" IS NOT DISTINCT FROM $${i + 1}`).join(" AND ");
      params = cfg.claves.map((c) => f[c] ?? null);
    }
    const { rows } = await client.query(
      `SELECT id FROM ${tabla} WHERE ${cond} AND id <> $${params.length + 1}`,
      [...params, f.id],
    );
    for (const vieja of rows) {
      // Primero se mudan los que tienen datos propios al id de la nube; luego se borra lo demás.
      for (const r of cfg.reapuntar ?? []) {
        await client.query(`UPDATE ${r.tabla} SET "${r.col}" = $1 WHERE "${r.col}" = $2`, [f.id, vieja.id]);
      }
      for (const d of cfg.dependientes) {
        await client.query(`DELETE FROM ${d.tabla} WHERE "${d.col}" = $1`, [vieja.id]);
      }
      await client.query(`DELETE FROM ${tabla} WHERE id = $1`, [vieja.id]);
      borradas++;
    }
  }
  if (borradas) log(`  ${tabla}: ${borradas} realineada(s) con la nube`);
}

/** Signo de cada tipo de movimiento (misma tabla que aplicar_movimiento_inventario, 0007 §9.3). */
export const SIGNO_MOVIMIENTO = {
  ENTRADA_COMPRA: 1, REVERSA_CANCELACION: 1, AJUSTE_POSITIVO: 1, TRANSFERENCIA_ENTRADA: 1,
  SALIDA_VENTA: -1, SALIDA_MODIFICADOR_EXTRA: -1, MERMA: -1, AJUSTE_NEGATIVO: -1,
  TRANSFERENCIA_SALIDA: -1, DEVOLUCION_PROVEEDOR: -1,
};

/**
 * Lo que la nube todavía NO sabe: suma con signo de los movimientos locales pendientes de subir,
 * por (insumo, sucursal). Una salida pendiente de 3 da -3: la existencia bajada de la nube debe
 * quedar en nube + (-3). Puro, sin base de datos, para poder probarlo.
 */
export function deltaPendiente(movimientos) {
  const acumulado = new Map();
  for (const m of movimientos ?? []) {
    const signo = SIGNO_MOVIMIENTO[m.tipo] ?? 0;
    const clave = `${m.insumo_id}|${m.sucursal_id}`;
    acumulado.set(clave, (acumulado.get(clave) ?? 0) + signo * Number(m.cantidad));
  }
  return acumulado;
}

/**
 * Después de bajar `insumo_stock_sucursal` (la nube manda), resta lo que la caja vendió y aún no
 * subió. Sin esto, un pull entre dos pushes "devolvería" existencias ya vendidas.
 *
 * I1: `filasAplicadas` son las filas de `insumo_stock_sucursal` que trajo ESTE pull. Antes la
 * corrección se aplicaba a TODO par (insumo, sucursal) con movimiento pendiente, así incluyera
 * uno que la nube no mandó en este snapshot (p.ej. un insumo sin fila de existencia todavía) —
 * eso resta de una fila que la nube nunca tocó y desvía la existencia un poco en cada pull. Ahora
 * se restringe a los pares presentes en el snapshot: si la nube no lo mandó, no se corrige aquí
 * (se corregirá cuando SÍ lo mande).
 */
export async function corregirExistenciasPorPendientes(client, log = () => {}, filasAplicadas = []) {
  await client.query("CREATE TABLE IF NOT EXISTS _vim_mov_ok (movimiento_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
  const permitidas = new Set(filasAplicadas.map((f) => `${f.insumo_id}|${f.sucursal_id}`));
  if (!permitidas.size) return 0;
  const { rows } = await client.query(`
    SELECT m.insumo_id, m.sucursal_id, m.tipo, m.cantidad
      FROM movimientos_inventario m
      LEFT JOIN _vim_mov_ok ok ON ok.movimiento_id = m.id
     WHERE ok.movimiento_id IS NULL`);
  const deltas = deltaPendiente(rows);
  let n = 0;
  for (const [clave, delta] of deltas) {
    if (!delta) continue;
    if (!permitidas.has(clave)) continue; // I1: solo sobre lo que la nube mandó en este pull
    const [insumoId, sucursalId] = clave.split("|");
    // m2: stock_negativo_flag es "pegajoso" (0007 §8.5): una vez true, sigue true hasta un
    // ajuste por conteo físico. OR con el valor actual, no solo con el resultado de esta resta.
    const r = await client.query(
      `UPDATE insumo_stock_sucursal
          SET stock_actual = stock_actual + $3,
              stock_negativo_flag = stock_negativo_flag OR (stock_actual + $3) < 0
        WHERE insumo_id = $1 AND sucursal_id = $2`, [insumoId, sucursalId, delta]);
    n += r.rowCount;
  }
  if (n) log(`  insumo_stock_sucursal: ${n} existencia(s) corregida(s) por movimientos pendientes`);
  return n;
}

/**
 * Anota en la libreta del PUSH los repartidores que acaban de bajar del pull.
 *
 * `_vim_repartidores_ok` (ver `asegurarTabla` en sync-push.mjs) dice qué repartidores NO hay que
 * mandar a la nube. Si solo se escribiera al subir, todo lo que baja del pull quedaría fuera de la
 * libreta y el push lo volvería a mandar: la caja pisaría con su copia vieja el nombre, el
 * teléfono, el `activo` y hasta el `deleted_at` que se editaron en el panel — y como el push corre
 * ANTES que el pull, sin refrescarse primero. Un repartidor dado de baja en el panel resucitaba.
 *
 * Va DENTRO de la transacción del pull a propósito: si el pull revienta y hace ROLLBACK, estas
 * marcas se van con él y la caja no da por sabido lo que nunca llegó a guardar.
 *
 * `CREATE TABLE IF NOT EXISTS` porque el pull puede correr antes que el primer push de una caja
 * recién instalada. Crearla vacía aquí es correcto: la siembra del push solo aplica cuando la tabla
 * no existía, y este INSERT deja anotado exactamente lo que la nube acaba de confirmar que es suyo.
 */
export async function marcarRepartidoresDelPull(client, filas, log = () => {}) {
  const ids = [...new Set((filas ?? []).map((f) => f?.id).filter((id) => id != null))];
  if (!ids.length) return 0;
  await client.query(
    "CREATE TABLE IF NOT EXISTS _vim_repartidores_ok (repartidor_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
  await client.query(
    "INSERT INTO _vim_repartidores_ok (repartidor_id) SELECT unnest($1::uuid[]) ON CONFLICT DO NOTHING", [ids]);
  log(`  repartidores: ${ids.length} anotado(s) como de la nube (no vuelven a subir)`);
  return ids.length;
}

/**
 * Anota en la libreta del PUSH las zonas de envío que acaban de bajar del pull.
 *
 * Misma razón que con los repartidores (ver `marcarRepartidoresDelPull` arriba): si solo se
 * escribiera al subir, lo que baja del panel quedaría fuera de la libreta y el push lo volvería a
 * mandar, pisando con la copia vieja de la caja el nombre, el costo y el `activa` que se acaban de
 * editar arriba. Y el push corre ANTES que el pull, sin refrescarse primero.
 *
 * Va DENTRO de la transacción del pull a propósito: si el pull revienta y hace ROLLBACK, estas
 * marcas se van con él.
 */
export async function marcarZonasDelPull(client, filas, log = () => {}) {
  const ids = [...new Set((filas ?? []).map((f) => f?.id).filter((id) => id != null))];
  if (!ids.length) return 0;
  await asegurarLibretaZonas(client);
  // La huella se calcula sobre la fila LOCAL recién escrita, no sobre el JSON de la nube: es con la
  // local con la que el push la va a comparar. DO UPDATE porque lo que la nube acaba de mandar es
  // ahora lo "ya sabido" (ver asegurarLibretaZonas en sync-push.mjs).
  await client.query(
    `INSERT INTO _vim_zonas_ok (zona_id, huella)
     SELECT x.id, md5(to_jsonb(x)::text) FROM zonas_envio x WHERE x.id = ANY($1::uuid[])
     ON CONFLICT (zona_id) DO UPDATE SET huella = EXCLUDED.huella`, [ids]);
  log(`  zonas de envío: ${ids.length} anotada(s) como de la nube (no vuelven a subir)`);
  return ids.length;
}

/**
 * Reparte las zonas entrantes del pull en las que se pueden aplicar y las que hay que descartar
 * porque su copia LOCAL tiene un repreciado pendiente de subir (ver `ZONA_EDITADA_LOCAL` en
 * sync-push.mjs: misma huella que usa el push para decidir qué sube).
 *
 * Es el arreglo al residual de la re-revisión final (22 sep): antes, `pullSnapshot` upseteaba TODAS
 * las zonas de la nube sin mirar la libreta, y luego `marcarZonasDelPull` las anotaba con la huella
 * de la versión que ACABABA de escribir. Un repreciado con PIN de supervisor ("Zona 2" de $35 a
 * $50) sobrevivía solo hasta el siguiente pull —arranque, sondeo de catálogo, o el pull tras un
 * push fallido (main.mjs ~212, 641, 745)— y volvía a $35 en silencio; peor aún, como la huella ya
 * coincidía con la de la nube, el cambio no se volvía a subir NUNCA.
 *
 * Una zona descartada aquí no se toca en absoluto en este pull: ni upsert, ni `reconciliarCatalogo`,
 * ni `marcarZonasDelPull`. Sigue con su precio local y pendiente de subir; el siguiente push la sube
 * y, con la nube ya al día, el próximo pull de esa zona es inocuo.
 *
 * Por qué NO se descarta por "no está en la libreta" (a diferencia de `ZONA_PENDIENTE`, que sí
 * incluye ese caso para decidir qué subir): una fila que llega de la nube y no está en la libreta es
 * o bien una zona nueva del panel (nunca vista aquí, no hay nada local que proteger) o bien una zona
 * nueva de la CAJA que aún no subió (no puede venir de la nube con ese id, así que no aparece en el
 * snapshot). Solo una zona YA conocida (con huella) y cuya copia local cambió es una edición
 * pendiente que hay que proteger.
 */
async function separarZonasPendientes(client, filas) {
  const ids = [...new Set((filas ?? []).map((f) => f?.id).filter((id) => id != null))];
  if (!ids.length) return { aplicar: filas ?? [], descartadas: [] };
  await asegurarLibretaZonas(client);
  // Candado ANTES de mirar la huella, y en su propia sentencia: un `cambiarCostoZona` en vuelo (su
  // UPDATE hecho, sin COMMIT) haría que esta consulta viera la versión vieja, la diera por no
  // pendiente, y el upsert de abajo —que sí espera el candado— pisara el repreciado al soltarse.
  // Con el candado, el pull espera a ese COMMIT y la consulta siguiente (READ COMMITTED: foto nueva
  // por sentencia) ya lo ve como pendiente. Al revés, un repreciado que llega después espera a que
  // el pull confirme y se aplica encima: queda pendiente contra la huella recién anotada. Dura lo
  // que la transacción del pull.
  // FOR NO KEY UPDATE: evita choque con FOR KEY SHARE de las llaves foráneas (tickets.zona_envio_id,
  // direcciones_cliente.zona_envio_id). FOR UPDATE causaba deadlock en el fijar de envíos durante el
  // pull. FOR NO KEY UPDATE bloquea UPDATE concurrente de cambiarCostoZona sin estorbar las FK.
  await client.query("SELECT 1 FROM zonas_envio WHERE id = ANY($1::uuid[]) FOR NO KEY UPDATE", [ids]);
  const { rows } = await client.query(
    `SELECT o.zona_id FROM _vim_zonas_ok o
       JOIN zonas_envio x ON x.id = o.zona_id
      WHERE o.zona_id = ANY($1::uuid[]) AND ${ZONA_EDITADA_LOCAL}`,
    [ids]);
  const pendientes = new Set(rows.map((r) => r.zona_id));
  if (!pendientes.size) return { aplicar: filas, descartadas: [] };
  return {
    aplicar: filas.filter((f) => !pendientes.has(f.id)),
    descartadas: filas.filter((f) => pendientes.has(f.id)),
  };
}

export async function pullSnapshot(pool, snapshot, log = () => {}) {
  const client = await pool.connect();
  const resumen = {};
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica"); // no disparar triggers/audit
    for (const { t, schema = "public" } of PULL_ORDER) {
      let filas = snapshot[t] ?? snapshot[`${schema}.${t}`];
      if (!filas?.length) continue;
      if (t === "zonas_envio") {
        const { aplicar, descartadas } = await separarZonasPendientes(client, filas);
        if (descartadas.length) {
          log(`  zonas de envío: ${descartadas.length} con repreciado local pendiente, no se pisan`);
        }
        filas = aplicar;
        if (!filas.length) continue;
      }
      await reconciliarCatalogo(client, t, filas, log);
      const n = await upsertTabla(client, schema, t, filas);
      resumen[t] = n;
      if (n) log(`  ${schema}.${t}: ${n}`);
      if (t === "insumo_stock_sucursal") await corregirExistenciasPorPendientes(client, log, filas);
      if (t === "repartidores") await marcarRepartidoresDelPull(client, filas, log);
      if (t === "zonas_envio") await marcarZonasDelPull(client, filas, log);
    }
    await client.query(
      `CREATE TABLE IF NOT EXISTS _vim_sync (clave text PRIMARY KEY, valor text, at timestamptz DEFAULT now())`);
    await client.query(
      `INSERT INTO _vim_sync(clave,valor,at) VALUES ('last_pull', $1, now())
       ON CONFLICT (clave) DO UPDATE SET valor=EXCLUDED.valor, at=now()`, [snapshot.__watermark ?? ""]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return resumen;
}

/**
 * PULL desde la nube: llama la Edge Function sync-pull (autenticada como el dispositivo),
 * que devuelve el snapshot del tenant (service_role, incluye pin_hash). Best-effort.
 */
export async function pullFromCloud(pool, { cloudUrl, anonKey, deviceToken }, log = () => {}) {
  const res = await fetch(`${cloudUrl}/functions/v1/sync-pull`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${deviceToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`sync-pull HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  const { snapshot } = await res.json();
  if (!snapshot) throw new Error("sync-pull no devolvió snapshot");
  log("aplicando snapshot del tenant…");
  return pullSnapshot(pool, snapshot, log);
}
