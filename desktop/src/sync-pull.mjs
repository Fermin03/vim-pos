// Fase 1 · Sync PULL — baja la "rebanada" del tenant (catálogo, config, empleados+PIN, org)
// de la nube al Postgres local. Complementa el PUSH (outbox) que ya existe: los datos de
// referencia (que edita el Admin) bajan; las ventas suben. Full-snapshot upsert idempotente.
//
// Motor genérico: para cada tabla detecta su PK y los tipos de columna, ignora columnas
// generadas, y hace INSERT ... ON CONFLICT (pk) DO UPDATE. Corre en modo réplica para no
// disparar triggers (misma semántica que la replicación lógica). Reusable con cualquier fuente.

// Orden de FKs: padres antes que hijos. Solo se procesan las tablas presentes en el snapshot.
export const PULL_ORDER = [
  { t: "tenants" },
  { t: "sucursales" },
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
    const setCols = cols.filter((c) => !meta.pk.includes(c));
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
    // IS NOT DISTINCT FROM: trata NULL = NULL (los catálogos globales llevan tenant_id NULL).
    const cond = cfg.claves.map((c, i) => `"${c}" IS NOT DISTINCT FROM $${i + 1}`).join(" AND ");
    const params = cfg.claves.map((c) => f[c] ?? null);
    const { rows } = await client.query(
      `SELECT id FROM ${tabla} WHERE ${cond} AND id <> $${cfg.claves.length + 1}`,
      [...params, f.id],
    );
    for (const vieja of rows) {
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

export async function pullSnapshot(pool, snapshot, log = () => {}) {
  const client = await pool.connect();
  const resumen = {};
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica"); // no disparar triggers/audit
    for (const { t, schema = "public" } of PULL_ORDER) {
      const filas = snapshot[t] ?? snapshot[`${schema}.${t}`];
      if (!filas?.length) continue;
      await reconciliarCatalogo(client, t, filas, log);
      const n = await upsertTabla(client, schema, t, filas);
      resumen[t] = n;
      if (n) log(`  ${schema}.${t}: ${n}`);
      if (t === "insumo_stock_sucursal") await corregirExistenciasPorPendientes(client, log, filas);
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
