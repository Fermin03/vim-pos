// Fase 1 · Runtime local del POS de escritorio.
// Gestiona el "backend en la caja": Postgres embebido (sin Docker) + migraciones idempotentes
// + PostgREST como sidecar. Es el mismo stack validado en la Fase 0, ahora como módulo
// reusable que arranca el proceso main de Electron (o el verify headless).
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, openSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const repoRoot = path.resolve(root, "..");
const MIGRATIONS = path.join(repoRoot, "supabase", "migrations");
const SEED = path.join(repoRoot, "supabase", "seed.sql");
const SHIM = path.join(root, "sql", "00-compat-shim.sql");
const PG_BIN = path.join(root, "node_modules", "@embedded-postgres", "windows-x64", "native", "bin");
const PIDFILE = path.join(root, "bin", ".pids.json");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Mata procesos huérfanos (Postgres/PostgREST) que quedaron de un arranque anterior que no cerró
 * limpio (crash / kill forzado). Lee el pidfile del run previo + el postmaster.pid del data dir.
 * Con la instancia única de Electron, aquí no hay riesgo de matar la instancia viva. Exportada
 * para poder probarla. Idempotente.
 */
export function matarHuerfanos(dataDir, log = () => {}, pidfile = PIDFILE) {
  try {
    if (existsSync(pidfile)) {
      const { pids = [] } = JSON.parse(readFileSync(pidfile, "utf8"));
      for (const pid of pids) {
        try { process.kill(pid, "SIGKILL"); log(`huérfano ${pid} terminado`); } catch { /* ya no existe */ }
      }
      rmSync(pidfile, { force: true });
    }
  } catch { /* pidfile ilegible: ignorar */ }
  // postmaster.pid: un Postgres previo sobre el MISMO data dir bloquearía el arranque.
  try {
    const pm = path.join(dataDir, "postmaster.pid");
    if (existsSync(pm)) {
      const pid = parseInt(readFileSync(pm, "utf8").split("\n")[0], 10);
      if (pid > 0) { try { process.kill(pid, "SIGKILL"); log(`postgres previo ${pid} terminado`); } catch { /* */ } }
      // Borrar SIEMPRE el candado: si el proceso ya no existe (corte de luz, cierre forzado, o
      // Windows matando la app), el archivo queda huérfano e impide que Postgres vuelva a arrancar.
      rmSync(pm, { force: true });
      log("candado postmaster.pid retirado");
    }
  } catch { /* */ }
}

/**
 * Último recurso antes de arrancar: si el puerto de Postgres sigue ocupado, es por un postgres.exe
 * que sobrevivió sin quedar registrado (el pidfile se borró, o murió la app pero no su hijo). Sin
 * esto la caja no abre y el error no dice nada útil ("Boot falló: undefined"), porque
 * embedded-postgres rechaza sin motivo cuando no puede enlazar el puerto.
 * Windows-only (la app se distribuye para Windows); si algo falla, se ignora y el arranque sigue.
 */
function matarQuienOcupaElPuerto(puerto, log = () => {}) {
  if (process.platform !== "win32") return;
  try {
    const salida = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8", timeout: 8000 });
    const pids = new Set();
    for (const linea of salida.split("\n")) {
      // "  TCP    127.0.0.1:54329   0.0.0.0:0   LISTENING   1234"
      const m = linea.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
      if (m && Number(m[1]) === puerto) pids.add(Number(m[2]));
    }
    for (const pid of pids) {
      if (!pid || pid === process.pid) continue;
      try { process.kill(pid, "SIGKILL"); log(`proceso ${pid} liberado del puerto ${puerto}`); } catch { /* */ }
    }
  } catch { /* netstat no disponible: seguimos */ }
}

/** Arranca el backend local y devuelve puertos + pool + stop(). Idempotente entre arranques. */
export async function startLocalBackend(opts = {}) {
  // Empaquetado (Electron): recursos read-only en resDir (extraResources) y datos escribibles en
  // dataRoot (userData). Dev: todo bajo el repo (comportamiento original). Rutas resueltas aquí.
  const resDir = opts.resDir ?? null;      // null = dev
  const dataRoot = opts.dataRoot ?? root;  // escribible
  const migrationsDir = resDir ? path.join(resDir, "migrations") : MIGRATIONS;
  const seedFile = resDir ? path.join(resDir, "seed.sql") : SEED;
  const shimFile = resDir ? path.join(resDir, "sql", "00-compat-shim.sql") : SHIM;
  const kdsNotifyFile = resDir ? path.join(resDir, "sql", "kds-notify.sql") : path.join(root, "sql", "kds-notify.sql");
  const pgBin = resDir ? path.join(resDir, "pg-bin") : PG_BIN;
  const postgrestExe = resDir ? path.join(resDir, "bin", "postgrest.exe") : path.join(root, "bin", "postgrest.exe");
  const confPath = path.join(dataRoot, "bin", "postgrest.conf");
  const logPath = path.join(dataRoot, "bin", "postgrest.log");
  const pidfile = path.join(dataRoot, "bin", ".pids.json");

  const dataDir = opts.dataDir ?? path.join(dataRoot, "pgdata");
  const pgPort = opts.pgPort ?? 54329;
  const restPort = opts.restPort ?? 54331;
  const secret = opts.jwtSecret ?? "vim-pos-local-jwt-secret-cambia-en-produccion-32+";
  // El fixture de desarrollo (Knock-Out Burger de demo) SOLO va en dev. En una instalación real
  // sembrarlo hacía dos daños: metía datos de demostración en la caja del cliente, y —peor— el
  // TRUNCATE+reseed de los catálogos globales recreaba los roles de sistema con IDs aleatorios,
  // distintos de los de la nube. Al bajar la rebanada del tenant, los empleados llegaban con un
  // rol_id inexistente aquí y el POS no los listaba. Una caja real arranca vacía y se llena con el
  // alta contra la nube (ver vincularConNube en main.mjs).
  const seedIfEmpty = opts.seedIfEmpty ?? !resDir;
  const log = opts.log ?? (() => {});

  // Antes de arrancar: limpiar cualquier Postgres/PostgREST huérfano de un cierre no limpio.
  matarHuerfanos(dataDir, (m) => log(`limpieza: ${m}`), pidfile);
  // Y si aun así el puerto sigue tomado (huérfano no registrado), liberarlo: si no, Postgres no
  // enlaza y el arranque muere sin explicación.
  matarQuienOcupaElPuerto(pgPort, (m) => log(`limpieza: ${m}`));

  const database = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "postgres", port: pgPort, persistent: true });
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) { log("initdb (primer arranque)…"); await database.initialise(); }
  await database.start();
  let pgPid = 0;
  try { pgPid = parseInt(readFileSync(path.join(dataDir, "postmaster.pid"), "utf8").split("\n")[0], 10) || 0; } catch { /* */ }
  log(`Postgres embebido en localhost:${pgPort}`);

  // 1) Asegurar la BD vimpos en UTF8 (Windows arranca el clúster en WIN1252).
  const su = new pg.Client({ host: "localhost", port: pgPort, user: "postgres", password: "postgres", database: "postgres" });
  await su.connect();
  const existe = (await su.query("SELECT 1 FROM pg_database WHERE datname='vimpos'")).rowCount > 0;
  if (!existe) await su.query("CREATE DATABASE vimpos WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'");
  await su.end();

  const db = new pg.Client({ host: "localhost", port: pgPort, user: "postgres", password: "postgres", database: "vimpos" });
  await db.connect();
  await db.query("SET client_encoding TO 'UTF8'");

  // 2) Shim de compatibilidad Supabase (idempotente).
  await db.query(readFileSync(shimFile, "utf8"));

  // 3) Migraciones idempotentes (registradas en _vim_migraciones).
  await db.query("CREATE TABLE IF NOT EXISTS _vim_migraciones (nombre text PRIMARY KEY, aplicada_at timestamptz DEFAULT now())");
  const aplicadas = new Set((await db.query("SELECT nombre FROM _vim_migraciones")).rows.map((r) => r.nombre));
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  let nuevas = 0;
  for (const f of files) {
    if (aplicadas.has(f)) continue;
    try {
      await db.query(readFileSync(path.join(migrationsDir, f), "utf8"));
      await db.query("INSERT INTO _vim_migraciones(nombre) VALUES ($1)", [f]);
      nuevas++;
    } catch (e) {
      throw new Error(`Migración ${f} falló: ${e.message}`);
    }
  }
  if (nuevas) log(`${nuevas} migraciones nuevas aplicadas`);

  // 4) Grants a los roles API (lo que Supabase da fuera de las migraciones).
  await db.query(`
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
  `);

  // 4b) Trigger de tiempo real del KDS (Fase 2, local-only): NOTIFY al cambiar estado de cocina.
  await db.query(readFileSync(kdsNotifyFile, "utf8"));

  // 5) Seed de fixtures solo si la BD está vacía (en producción llega por sync/provisioning).
  const vacia = (await db.query("SELECT count(*)::int n FROM tenants")).rows[0].n === 0;
  if (vacia && seedIfEmpty) {
    await db.query("TRUNCATE planes, folios_paquetes, roles, permisos, rol_permisos RESTART IDENTITY CASCADE");
    await db.query(readFileSync(seedFile, "utf8"));
    log("seed de fixtures aplicado (BD estaba vacía)");
  }
  await db.end();

  // 6) PostgREST como sidecar (con libpq.dll del propio Postgres embebido).
  mkdirSync(path.dirname(confPath), { recursive: true }); // dataRoot/bin (userData en empaquetado)
  writeFileSync(confPath, [
    // 127.0.0.1 (no 'localhost'): bajo Electron, la resolución de 'localhost' del proceso hijo
    // postgrest puede no alcanzar el Postgres (mismo motivo por el que readiness/proxy usan IPv4).
    // Con IP literal, libpq no hace getaddrinfo y conecta directo → schema cache carga siempre.
    `db-uri = "postgres://authenticator:postgres@127.0.0.1:${pgPort}/vimpos"`,
    `db-schemas = "public"`,
    `db-anon-role = "anon"`,
    `jwt-secret = "${secret}"`,
    `server-port = ${restPort}`,
    ``,
  ].join("\n"));
  const logFd = openSync(logPath, "w");
  const rest = spawn(postgrestExe, [confPath], {
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, PATH: `${pgBin}${path.delimiter}${process.env.PATH}` },
  });

  // Registrar los PIDs YA, ANTES del readiness. Si el arranque falla aquí (readiness expira),
  // el postgrest recién lanzado queda rastreado en el pidfile → el próximo arranque lo mata en
  // matarHuerfanos. Sin esto, un boot fallido deja un postgrest huérfano ocupando restPort que
  // hace fallar TODOS los reintentos siguientes (el nuevo postgrest no puede enlazar el puerto).
  try { writeFileSync(pidfile, JSON.stringify({ pids: [pgPid, rest.pid].filter(Boolean), at: Date.now() })); } catch { /* */ }

  let ready = false;
  for (let i = 0; i < 120; i++) { // hasta ~60s: bajo carga, el schema cache tarda en cargar
    // 127.0.0.1 (no 'localhost'): PostgREST escucha 0.0.0.0 (IPv4); en el Electron empaquetado
    // 'localhost' resuelve a ::1 (IPv6) primero → nunca conectaría.
    try { if ((await fetch(`http://127.0.0.1:${restPort}/`)).ok) { ready = true; break; } } catch { /* aún no */ }
    await wait(500);
  }
  if (!ready) {
    try { rest.kill(); } catch { /* */ } // no dejarlo colgado como huérfano ocupando restPort
    let tail = "";
    try { tail = readFileSync(logPath, "utf8").split("\n").slice(-6).join("\n"); } catch { /* */ }
    throw new Error(`PostgREST no respondió.\n${tail}`);
  }
  log(`PostgREST en localhost:${restPort}`);

  // Pool para el auth local (device sign-in, pin-login) — service_role local.
  const pool = new pg.Pool({ host: "localhost", port: pgPort, user: "postgres", password: "postgres", database: "vimpos", max: 4 });

  const stop = async () => {
    try { rest.kill(); } catch { /* */ }
    try { await pool.end(); } catch { /* */ }
    try { await database.stop(); } catch { /* */ }
    try { rmSync(pidfile, { force: true }); } catch { /* */ } // cierre limpio → sin huérfanos que limpiar
  };
  return { pgPort, restPort, secret, pool, stop, dataDir, dataRoot };
}
