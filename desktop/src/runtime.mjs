// Fase 1 · Runtime local del POS de escritorio.
// Gestiona el "backend en la caja": Postgres embebido (sin Docker) + migraciones idempotentes
// + PostgREST como sidecar. Es el mismo stack validado en la Fase 0, ahora como módulo
// reusable que arranca el proceso main de Electron (o el verify headless).
import EmbeddedPostgres from "embedded-postgres";
import { arrancarConReintentos, crearCapturaDeLog } from "./arranque-reintentos.mjs";
import pg from "pg";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
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
 * Barre los postgres.exe DE ESTA INSTALACIÓN que hayan quedado vivos, escuchen o no.
 *
 * El hueco que cierra: cuando la app muere sin cierre limpio, sobrevive un hijo
 * `postgres.exe --forkchild="startup"` cuyo padre ya no existe. Ese proceso retiene el segmento de
 * memoria compartida del pgdata, así que el siguiente arranque muere con "pre-existing shared
 * memory block is still in use" y la caja no abre. Ninguna de las dos limpiezas previas lo ve:
 * `matarHuerfanos` mira el pidfile (que se borra al cerrar bien) y el postmaster.pid (él no lo es),
 * y `matarQuienOcupaElPuerto` filtra por LISTENING (un forkchild en arranque no escucha).
 *
 * Se filtra por RUTA, no por nombre: matar cualquier postgres.exe de la máquina tumbaría otro
 * Postgres que el usuario tenga instalado para algo distinto.
 *
 * Se mira ExecutablePath Y CommandLine porque en estos huérfanos ExecutablePath viene VACÍO
 * (medido: un `--forkchild="startup"` cuyo padre ya murió devuelve cadena vacía en CIM). El
 * CommandLine sí conserva la ruta completa —con barras normales, tal como lo lanzó
 * embedded-postgres—, así que la comparación normaliza separadores en ambos lados.
 *
 * Windows-only, como el resto de la limpieza; si algo falla, se ignora y el arranque sigue.
 */
export function matarPostgresDeEstaInstalacion(pgBin, log = () => {}) {
  if (process.platform !== "win32" || !pgBin) return;
  const norm = (p) => String(p || "").replace(/\//g, "\\").toLowerCase();
  const raiz = norm(pgBin);
  try {
    const salida = execFileSync("powershell", [
      "-NoProfile", "-NonInteractive", "-Command",
      "Get-CimInstance Win32_Process -Filter \"Name='postgres.exe'\" | " +
        "ForEach-Object { \"$($_.ProcessId)|$($_.ExecutablePath)|$($_.CommandLine)\" }",
    ], { encoding: "utf8", timeout: 15000 });

    for (const linea of salida.split("\n")) {
      const partes = linea.trim().split("|");
      if (partes.length < 2) continue;
      const n = Number(partes[0]);
      // El CommandLine puede traer '|' dentro: se reensambla todo lo que sigue al 2º separador.
      const ruta = partes[1];
      const cmd = partes.slice(2).join("|");
      if (!n || n === process.pid) continue;
      const nuestro = norm(ruta).startsWith(raiz) || norm(cmd).includes(raiz);
      if (!nuestro) continue; // de otra instalación (o sin datos): no se toca
      try { process.kill(n, "SIGKILL"); log(`postgres huérfano ${n} terminado`); } catch { /* ya murió */ }
    }
  } catch { /* powershell no disponible o CIM falló: seguimos */ }
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

/**
 * SEC CN-001 — secreto JWT propio de CADA instalación.
 *
 * Antes había un literal por defecto commiteado en el repositorio, y NADIE pasaba `opts.jwtSecret`
 * (ni backend.mjs ni main.mjs), así que TODAS las cajas del mundo firmaban y validaban con el mismo
 * secreto público. Como PostgREST lo usa como `jwt-secret`, cualquiera en la LAN del local podía
 * acuñar un JWT con `role: service_role` y saltarse el RLS entero contra la base de la caja.
 *
 * Ahora se genera uno de 32 bytes en el primer arranque y se persiste junto al resto del estado
 * escribible (dataRoot/bin). base64url: sin comillas ni backslashes, seguro de interpolar en el
 * .conf. 43 caracteres > los 32 que PostgREST exige para HS256.
 *
 * OJO: el modo 0o600 solo aplica de verdad en POSIX; en Windows la protección real es la ACL del
 * perfil de usuario (dataRoot vive en userData). Quien ya tenga acceso a esa carpeta también tiene
 * el pgdata, así que no es una regresión — pero por eso el secreto NO es el último control.
 */
function secretoDeInstalacion(dataRoot) {
  const f = path.join(dataRoot, "bin", ".jwt-secret");
  try {
    const previo = readFileSync(f, "utf8").trim();
    if (previo.length >= 32) return previo;
  } catch { /* primer arranque, o archivo ilegible → se regenera abajo */ }
  const s = randomBytes(32).toString("base64url");
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, s, { mode: 0o600 });
  return s;
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
  const secret = opts.jwtSecret ?? secretoDeInstalacion(dataRoot);
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
  // Los forkchild sobrevivientes no están en el pidfile ni escuchan en ningún puerto, pero
  // retienen la memoria compartida del pgdata y bloquean el arranque. Se barren por ruta.
  matarPostgresDeEstaInstalacion(pgBin, (m) => log(`limpieza: ${m}`));
  // Y si aun así el puerto sigue tomado (huérfano no registrado), liberarlo: si no, Postgres no
  // enlaza y el arranque muere sin explicación.
  matarQuienOcupaElPuerto(pgPort, (m) => log(`limpieza: ${m}`));

  // SEC CN-018 — credencial del Postgres local, propia de cada instalación.
  // Estaba fija en 'postgres' en cinco sitios, y el pg_hba del clúster exige contraseña (no es
  // `trust`), así que era una credencial de superusuario REAL, idéntica en todas las cajas y
  // publicada en el repositorio. Postgres solo escucha en loopback, lo que acota el alcance a
  // procesos de la propia máquina — pero ahí dentro daba acceso total, incluidos los pin_hash.
  const rutaPass = path.join(dataRoot, "bin", ".pg-password");
  const nuevaClave = () => randomBytes(24).toString("base64url"); // [A-Za-z0-9_-]: seguro en el .conf y en la URI
  let passGuardada = null;
  try { const p = readFileSync(rutaPass, "utf8").trim(); if (p.length >= 24) passGuardada = p; } catch { /* aún no existe */ }
  const guardarPass = (v) => { mkdirSync(path.dirname(rutaPass), { recursive: true }); writeFileSync(rutaPass, v, { mode: 0o600 }); };

  const clusterNuevo = !existsSync(path.join(dataDir, "PG_VERSION"));
  // Clúster nuevo → nace con credencial propia. Existente → arranca con la que ya funciona
  // ('postgres' si nunca se rotó) y se rota más abajo, una sola vez.
  let password = clusterNuevo ? nuevaClave() : (passGuardada ?? "postgres");

  // Lo que escribe postgres.exe se guarda para explicar un fallo de arranque (antes llegaba como
  // "Boot falló: undefined": embedded-postgres rechaza sin motivo si el proceso muere temprano).
  const capturaPg = crearCapturaDeLog();
  const database = new EmbeddedPostgres({
    databaseDir: dataDir, user: "postgres", password, port: pgPort, persistent: true,
    onLog: (m) => capturaPg.onLog(m),
    onError: (e) => capturaPg.onLog(String(e?.message ?? e)),
    // scram-sha-256 en vez del 'password' (contraseña EN CLARO por el socket) que trae por
    // defecto embedded-postgres. Solo aplica al initdb: los clústeres ya creados conservan su
    // pg_hba, y reescribirlo en caliente arriesga dejar la caja sin poder conectarse a su BD.
    ...(clusterNuevo ? { authMethod: "scram-sha-256" } : {}),
  });
  if (clusterNuevo) {
    log("initdb (primer arranque)…");
    await database.initialise();
    guardarPass(password); // ya es la del clúster: persistir antes de seguir
  }
  // Reintentos con limpieza entre intentos: un postgres anterior que aún no suelta el puerto o el
  // candado se quita solo en segundos; antes eso obligaba al cajero a abrir la app dos o tres veces.
  await arrancarConReintentos({
    arrancar: () => database.start(),
    captura: capturaPg,
    intentos: 3,
    esperaMs: 3000,
    log: (m) => log(`arranque: ${m}`),
    limpiar: () => {
      matarHuerfanos(dataDir, (m) => log(`limpieza: ${m}`), pidfile);
      matarPostgresDeEstaInstalacion(pgBin, (m) => log(`limpieza: ${m}`));
      matarQuienOcupaElPuerto(pgPort, (m) => log(`limpieza: ${m}`));
    },
  });
  let pgPid = 0;
  try { pgPid = parseInt(readFileSync(path.join(dataDir, "postmaster.pid"), "utf8").split("\n")[0], 10) || 0; } catch { /* */ }
  log(`Postgres embebido en localhost:${pgPort}`);

  // 1) Asegurar la BD vimpos en UTF8 (Windows arranca el clúster en WIN1252).
  const su = new pg.Client({ host: "localhost", port: pgPort, user: "postgres", password, database: "postgres" });
  await su.connect();
  const existe = (await su.query("SELECT 1 FROM pg_database WHERE datname='vimpos'")).rowCount > 0;
  if (!existe) await su.query("CREATE DATABASE vimpos WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'");

  // Caja ya instalada que sigue con la contraseña publicada: se rota aquí, una única vez.
  // Se persiste DESPUÉS del ALTER: si algo fallara, el próximo arranque vuelve a intentarlo con
  // la anterior en vez de quedarse con un archivo que no corresponde a la BD.
  if (!clusterNuevo && !passGuardada) {
    const nueva = nuevaClave();
    await su.query(`ALTER ROLE postgres PASSWORD '${nueva}'`); // base64url: sin comillas ni backslashes
    guardarPass(nueva);
    password = nueva;
    log("credencial local de Postgres rotada (era la publicada por defecto)");
  }
  await su.end();

  const db = new pg.Client({ host: "localhost", port: pgPort, user: "postgres", password, database: "vimpos" });
  await db.connect();
  await db.query("SET client_encoding TO 'UTF8'");

  // 2) Shim de compatibilidad Supabase (idempotente).
  await db.query(readFileSync(shimFile, "utf8"));
  // El shim crea `authenticator` con la contraseña fija del repositorio y no la toca si ya existe
  // (CREATE ROLE ... EXCEPTION duplicate_object). Se alinea siempre con la de esta instalación:
  // es el rol con el que PostgREST se conecta, así que su credencial también estaba publicada.
  await db.query(`ALTER ROLE authenticator PASSWORD '${password}'`);

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
    `db-uri = "postgres://authenticator:${password}@127.0.0.1:${pgPort}/vimpos"`,
    `db-schemas = "public"`,
    `db-anon-role = "anon"`,
    `jwt-secret = "${secret}"`,
    `server-port = ${restPort}`,
    // SEC CN-001 — sin server-host, PostgREST usa su default `!4` y escucha en TODAS las
    // interfaces IPv4: quedaba accesible desde la LAN, saltándose el gateway. Nadie lo necesita
    // ahí fuera — el único cliente es el proxy /rest/v1 del gateway, que ya usa 127.0.0.1.
    `server-host = "127.0.0.1"`,
    ``,
  ].join("\n"), { mode: 0o600 }); // el .conf lleva el jwt-secret y las credenciales de la BD
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
  const pool = new pg.Pool({ host: "localhost", port: pgPort, user: "postgres", password, database: "vimpos", max: 4 });

  const stop = async () => {
    try { rest.kill(); } catch { /* */ }
    try { await pool.end(); } catch { /* */ }
    try { await database.stop(); } catch { /* */ }
    try { rmSync(pidfile, { force: true }); } catch { /* */ } // cierre limpio → sin huérfanos que limpiar
  };
  return { pgPort, restPort, secret, pool, stop, dataDir, dataRoot, pgPassword: password };
}
