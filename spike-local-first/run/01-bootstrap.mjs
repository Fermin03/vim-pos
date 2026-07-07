// Fase 0 · [1] Bootstrap del stack local shippable.
// Arranca Postgres EMBEBIDO (sin Docker) y corre: shim de compatibilidad +
// las 53 migraciones VIM + seed.sql. Deja el cluster en ./pgdata (persistente)
// para que 02-venta y 03-postgrest lo reutilicen. Idempotente: recrea la BD vimpos.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const repoRoot = path.resolve(root, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const seedFile = path.join(repoRoot, "supabase", "seed.sql");
const shimFile = path.join(root, "sql", "00-compat-shim.sql");
const dataDir = path.join(root, "pgdata");
const PORT = 54329;

const database = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: true,
});

const t0 = Date.now();
if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
  console.log("· initialise() — primer arranque, creando cluster…");
  await database.initialise();
}
await database.start();
console.log(`· Postgres embebido escuchando en localhost:${PORT}`);

const admin = new pg.Client({ host: "localhost", port: PORT, user: "postgres", password: "postgres", database: "postgres" });
await admin.connect();
await admin.query("DROP DATABASE IF EXISTS vimpos");
// Windows arranca el clúster en WIN1252 (locale del SO). Supabase corre en UTF8;
// forzamos la BD a UTF8 desde template0 para que el dominio en español (→, acentos) viva igual.
await admin.query("CREATE DATABASE vimpos WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'");
await admin.end();

const client = new pg.Client({ host: "localhost", port: PORT, user: "postgres", password: "postgres", database: "vimpos" });
await client.connect();
await client.query("SET client_encoding TO 'UTF8'");

const runSql = async (label, sql) => {
  const t = Date.now();
  await client.query(sql);
  console.log(`  ✓ ${label} (${Date.now() - t}ms)`);
};

try {
  console.log("\n[1] Capa de compatibilidad Supabase→plano");
  await runSql("00-compat-shim.sql", readFileSync(shimFile, "utf8"));

  console.log("\n[2] Migraciones VIM");
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) await runSql(f, readFileSync(path.join(migrationsDir, f), "utf8"));

  console.log("\n[3] Seed (fixtures Knock-Out)");
  // seed.sql (fixture de dev) reinserta los 5 catálogos globales que la migración 0046
  // ya sembró para provisioning en la nube. Pre-seed esos catálogos solo tienen datos de
  // 0046 y nada del tenant depende de ellos aún → los limpiamos para que gane el fixture.
  await runSql("reconciliar catálogos 0046↔seed", "TRUNCATE planes, folios_paquetes, roles, permisos, rol_permisos RESTART IDENTITY CASCADE;");
  await runSql("seed.sql", readFileSync(seedFile, "utf8"));

  console.log("\n[3b] Privilegios de rol (lo que Supabase da fuera de las migraciones)");
  // Supabase concede a anon/authenticated/service_role acceso a public por defecto; sin
  // esto PostgREST no expone ninguna tabla (schema cache vacío). RLS sigue filtrando filas.
  await runSql("grants public → roles API", `
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
  `);

  console.log("\n[4] Verificación");
  const ext = await client.query("SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','citext','pg_trgm','unaccent') ORDER BY 1");
  console.log("  extensiones cargadas:", ext.rows.map((r) => r.extname).join(", ") || "NINGUNA");
  for (const [t, q] of [["auth.users", "auth.users"], ["tenants", "tenants"], ["productos", "productos"], ["usuarios_acceso", "usuarios_acceso"]]) {
    const r = await client.query(`SELECT count(*)::int n FROM ${q}`);
    console.log(`  ${t}: ${r.rows[0].n} filas`);
  }
  console.log(`\n✅ BOOTSTRAP OK en ${((Date.now() - t0) / 1000).toFixed(1)}s — Postgres embebido corrió shim + ${files.length} migraciones + seed SIN Docker ni Supabase.`);
} catch (e) {
  console.error("\n❌ FALLÓ:", e.message);
  if (e.position) console.error("  posición:", e.position);
  console.error(String(e.stack || "").split("\n").slice(0, 4).join("\n"));
  process.exitCode = 1;
} finally {
  await client.end();
  await database.stop();
  console.log("· Postgres detenido (datos persistidos en ./pgdata).");
}
