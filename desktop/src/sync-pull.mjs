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
export async function pullSnapshot(pool, snapshot, log = () => {}) {
  const client = await pool.connect();
  const resumen = {};
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica"); // no disparar triggers/audit
    for (const { t, schema = "public" } of PULL_ORDER) {
      const filas = snapshot[t] ?? snapshot[`${schema}.${t}`];
      if (!filas?.length) continue;
      const n = await upsertTabla(client, schema, t, filas);
      resumen[t] = n;
      if (n) log(`  ${schema}.${t}: ${n}`);
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
