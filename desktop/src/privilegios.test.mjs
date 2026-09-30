// Auditoría integral 30/09/2026, hallazgo D1 — privilegios del Postgres local.
//
// Necesita un Postgres con el esquema aplicado (shim + migraciones), porque lo que se prueba es el
// ACL real, no un mock. Se activa con:
//   VIM_TEST_PG="postgres://postgres@localhost:5499/postgres?host=/tmp"  (conexión de superusuario)
//   VIM_TEST_PG_PLANTILLA=vimpos_d_131                                    (BD con shim + migraciones hasta N)
//   VIM_TEST_PG_HASTA=131                                                 (N; el resto de supabase/migrations
//                                                                          se aplica como "migraciones nuevas")
// Sin esas variables se salta (la CI del escritorio no levanta Postgres).
//
// Reproduce la caja de HOY (arranques con el GRANT masivo y libretas _vim_* ya creadas), aplica lo
// que hace el arranque nuevo, y comprueba como `authenticated`/`anon` lo que se puede tocar.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blindarTablasInternas, repararRevokesUnaVez } from "./privilegios.mjs";

const URL_ADMIN = process.env.VIM_TEST_PG;
const PLANTILLA = process.env.VIM_TEST_PG_PLANTILLA;
const SHIM = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sql", "00-compat-shim.sql");
const MIGRACIONES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "migrations");
const HASTA = Number(process.env.VIM_TEST_PG_HASTA ?? 9999);
const TENANT = "99999999-0000-0000-0000-0000000000aa"; // supabase/seed.sql
const omitir = !URL_ADMIN || !PLANTILLA ? "sin VIM_TEST_PG/VIM_TEST_PG_PLANTILLA" : false;

// El GRANT que hacía runtime.mjs en cada arranque hasta la 0.4.98.
const GRANT_MASIVO_VIEJO = `
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;`;

async function conBdClonada(fn) {
  const nombre = `vim_priv_${process.pid}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new pg.Client({ connectionString: URL_ADMIN });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${nombre} TEMPLATE ${PLANTILLA}`);
  const u = new URL(URL_ADMIN);
  u.pathname = `/${nombre}`;
  const db = new pg.Client({ connectionString: u.toString() });
  await db.connect();
  try {
    await fn(db);
  } finally {
    await db.end();
    await admin.query(`DROP DATABASE ${nombre} WITH (FORCE)`);
    await admin.end();
  }
}

/**
 * ¿Tiene `rol` el PRIVILEGIO para ejecutar `sql`? Dentro de una transacción que siempre se deshace.
 * Postgres comprueba privilegios antes de ejecutar: cualquier otro error (NOT NULL, RLS…) quiere
 * decir que el privilegio sí estaba, y cuenta como `true`.
 */
async function puede(db, rol, sql, claims = null) {
  await db.query("BEGIN");
  try {
    await db.query(`SET LOCAL ROLE ${rol}`);
    if (claims) await db.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await db.query(sql);
    return true;
  } catch (e) {
    return !/permission denied/.test(e.message);
  } finally {
    await db.query("ROLLBACK");
  }
}

/** Deja la BD como una caja instalada con el escritorio viejo: sin event trigger, libretas creadas, GRANT masivo. */
async function comoCajaVieja(db) {
  await db.query("DROP EVENT TRIGGER IF EXISTS vim_blindar_tablas_internas");
  await db.query("CREATE TABLE IF NOT EXISTS _vim_migraciones (nombre text PRIMARY KEY, aplicada_at timestamptz DEFAULT now())");
  await db.query("INSERT INTO _vim_migraciones(nombre) VALUES ('0001_x.sql')");
  await db.query("CREATE TABLE IF NOT EXISTS _vim_mov_ok (movimiento_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
  await db.query(GRANT_MASIVO_VIEJO);
}

/** Lo que hace el arranque nuevo, en el mismo orden que runtime.mjs (shim → reparación → migraciones nuevas → blindaje). */
async function arranqueNuevo(db) {
  await db.query(readFileSync(SHIM, "utf8"));
  await repararRevokesUnaVez(db, { hayMigracionesPrevias: true });
  const nuevas = readdirSync(MIGRACIONES).filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) > HASTA).sort();
  for (const f of nuevas) await db.query(readFileSync(path.join(MIGRACIONES, f), "utf8"));
  await db.query("GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role");
  await blindarTablasInternas(db);
}

const claims = { sub: "99999999-0000-0000-0000-00000000000d", role: "authenticated", tenant_id: TENANT };

test("la caja vieja es vulnerable (el test sabe detectarlo)", { skip: omitir }, async () => {
  await conBdClonada(async (db) => {
    await comoCajaVieja(db);
    assert.equal(await puede(db, "authenticated", "DELETE FROM _vim_migraciones", claims), true);
    assert.equal(await puede(db, "anon", "SELECT * FROM _vim_migraciones"), true);
    assert.equal(await puede(db, "authenticated", "INSERT INTO pagos_suscripcion DEFAULT VALUES", claims), true);
  });
});

test("arranque nuevo: authenticated y anon ya no tocan las libretas _vim_*", { skip: omitir }, async () => {
  await conBdClonada(async (db) => {
    await comoCajaVieja(db);
    await arranqueNuevo(db);
    for (const sql of ["SELECT * FROM _vim_migraciones", "DELETE FROM _vim_migraciones",
      "INSERT INTO _vim_mov_ok(movimiento_id) VALUES (gen_random_uuid())"]) {
      assert.equal(await puede(db, "authenticated", sql, claims), false, `authenticated: ${sql}`);
      assert.equal(await puede(db, "anon", sql), false, `anon: ${sql}`);
    }
    // Una libreta creada A MEDIA JORNADA (como hace el primer push) nace ya blindada: event trigger.
    await db.query("CREATE TABLE IF NOT EXISTS _vim_push_ok (ticket_id uuid PRIMARY KEY, pushed_at timestamptz DEFAULT now())");
    assert.equal(await puede(db, "authenticated", "SELECT * FROM _vim_push_ok", claims), false);
    assert.equal(await puede(db, "authenticated", "INSERT INTO _vim_push_ok(ticket_id) VALUES (gen_random_uuid())", claims), false);
    // El superusuario (el proceso main) sigue usándolas.
    await db.query("INSERT INTO _vim_push_ok(ticket_id) VALUES (gen_random_uuid())");
  });
});

test("arranque nuevo: vuelven los REVOKE de las migraciones y lo operativo sigue bajo RLS", { skip: omitir }, async () => {
  await conBdClonada(async (db) => {
    await comoCajaVieja(db);
    await arranqueNuevo(db);
    // 0130: pagos_suscripcion solo lectura para authenticated; 0090: delivery_pedidos solo lectura.
    assert.equal(await puede(db, "authenticated", "INSERT INTO pagos_suscripcion DEFAULT VALUES", claims), false);
    assert.equal(await puede(db, "authenticated", "SELECT * FROM pagos_suscripcion", claims), true);
    assert.equal(await puede(db, "authenticated", "DELETE FROM delivery_pedidos", claims), false);
    assert.equal(await puede(db, "authenticated", "SELECT * FROM delivery_pedidos", claims), true);
    assert.equal(await puede(db, "authenticated", "SELECT * FROM prospectos", claims), false);
    // anon (sin sesión, desde la LAN) ya no lee el catálogo global, como en una caja nueva (0065);
    // conserva lo único que una migración le da a propósito (0072, errores_app).
    assert.equal(await puede(db, "anon", "SELECT * FROM planes"), false);
    assert.equal(await puede(db, "anon", "SELECT * FROM tickets"), false);
    assert.equal(await puede(db, "anon", "SELECT * FROM errores_app"), true);
    // Tablas operativas: siguen accesibles (el RLS decide las filas).
    for (const sql of ["SELECT * FROM tickets", "SELECT * FROM productos", "UPDATE tickets SET updated_at = updated_at WHERE false",
      "SELECT id, nombre FROM usuarios_perfil"]) {
      assert.equal(await puede(db, "authenticated", sql, claims), true, sql);
    }
    // 0132 (equipo A): grants por columna. El pin_hash no se lee y tenants no se actualiza entero;
    // el resto de columnas sí. Si el arranque volviera a hacer GRANT masivo, esto se perdería.
    if (HASTA < 132) {
      assert.equal(await puede(db, "authenticated", "SELECT pin_hash FROM usuarios_perfil", claims), false);
      assert.equal(await puede(db, "anon", "SELECT pin_hash FROM usuarios_perfil"), false);
      assert.equal(await puede(db, "authenticated", "SELECT id FROM usuarios_perfil", claims), true);
      assert.equal(await puede(db, "authenticated", "UPDATE tenants SET estado = estado WHERE false", claims), false);
      assert.equal(await puede(db, "anon", "UPDATE tenants SET estado = estado WHERE false"), false);
    }
    // Y una tabla que cree una migración NUEVA nace con sus privilegios (default privileges).
    await db.query("CREATE TABLE tabla_de_migracion_nueva (id int)");
    assert.equal(await puede(db, "authenticated", "SELECT * FROM tabla_de_migracion_nueva", claims), true);
    // La reparación corre una sola vez: un GRANT posterior de una migración no se vuelve a pisar.
    await db.query("GRANT INSERT ON pagos_suscripcion TO authenticated");
    const r = await repararRevokesUnaVez(db, { hayMigracionesPrevias: true });
    assert.equal(r.yaCorrio, true);
  });
});
