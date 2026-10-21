// Fase 1 · Runtime local del POS de escritorio.
// Gestiona el "backend en la caja": Postgres embebido (sin Docker) + migraciones idempotentes
// + PostgREST como sidecar. Es el mismo stack validado en la Fase 0, ahora como módulo
// reusable que arranca el proceso main de Electron (o el verify headless).
import EmbeddedPostgres from "embedded-postgres";
import { arrancarConReintentos, crearCapturaDeLog, esperarPostgrest, reintentarBackend } from "./arranque-reintentos.mjs";
import { reanotarHuellasClientes0156UnaVez, sembrarRepartidoresUnaVez, sembrarZonasUnaVez } from "./sync-push.mjs";
import { blindarTablasInternas, repararRevokesUnaVez } from "./privilegios.mjs";
import { conTope } from "./tope.mjs";
import { puertoLibre, puertoOcupado } from "./puerto-libre.mjs";
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

/**
 * El instalador PUEDE salir sin PostgREST: `bin/postgrest.exe` está en .gitignore y electron-builder
 * no protesta por un extraResources ausente. Pasó en las 0.4.60–0.4.62 (6 sep 2026): `spawn` de un
 * archivo inexistente devuelve pid undefined, el readiness esperaba sus 60 s y el error decía
 * "PostgREST no respondió" — señalando al proceso, no al paquete. Costó horas. Aquí se dice qué
 * falta, dónde y qué hacer, ANTES de lanzar nada. Exportada para probarla.
 */
export function comprobarBinarioPostgrest(ruta) {
  if (existsSync(ruta)) return;
  throw new Error(`Falta el binario de PostgREST en ${ruta}: el instalador quedó incompleto. Reinstala VIM POS.`);
}

/**
 * Traduce el 'error' de un spawn fallido a algo que el log y el diálogo puedan decir. Sin esto, un
 * ENOENT/EACCES del hijo llega como excepción asíncrona sin oyente: no deja rastro y nadie sabe por
 * qué la caja no abrió. Exportada para probarla.
 */
export function explicarFalloDeSpawn(e, ruta) {
  const code = e?.code ?? "";
  if (code === "ENOENT") return `no se pudo lanzar PostgREST: ${ruta} no existe`;
  if (code === "EACCES" || code === "EPERM") {
    return `no se pudo lanzar PostgREST (${code}): sin permisos para ejecutar ${ruta}, o el antivirus lo bloqueó`;
  }
  return `no se pudo lanzar PostgREST (${code || "sin código"}): ${e?.message ?? e}`;
}

/**
 * Nombre del ejecutable de cada PID (en minúsculas), o null si no se pudo preguntar al sistema.
 * Un PID que ya no existe simplemente no aparece en el Map.
 *
 * Windows: una sola consulta CIM para todos (powershell tarda ~1 s en arrancar; no se paga por PID).
 * Linux: /proc/<pid>/comm (solo para desarrollo). Otros: null.
 */
export function nombresDeProcesos(pids) {
  const validos = pids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!validos.length) return new Map();
  try {
    if (process.platform === "win32") {
      const filtro = validos.map((n) => `ProcessId=${n}`).join(" OR ");
      const salida = execFileSync("powershell", [
        "-NoProfile", "-NonInteractive", "-Command",
        `Get-CimInstance Win32_Process -Filter "${filtro}" | ForEach-Object { "$($_.ProcessId)|$($_.Name)" }`,
      ], { encoding: "utf8", timeout: 15000 });
      const m = new Map();
      for (const linea of salida.split("\n")) {
        const [pid, nombre] = linea.trim().split("|");
        if (pid && nombre) m.set(Number(pid), nombre.toLowerCase());
      }
      return m;
    }
    if (process.platform === "linux") {
      const m = new Map();
      for (const n of validos) {
        try { m.set(n, readFileSync(`/proc/${n}/comm`, "utf8").trim().toLowerCase()); } catch { /* no existe */ }
      }
      return m;
    }
  } catch { /* powershell/CIM no disponible */ }
  return null;
}

/** ¿Es uno de los nuestros? postgres(.exe) o postgrest(.exe). */
const ES_NUESTRO = /^postgres(t)?(\.exe)?$/;

/**
 * Mata procesos huérfanos (Postgres/PostgREST) que quedaron de un arranque anterior que no cerró
 * limpio (crash / kill forzado). Lee el pidfile del run previo + el postmaster.pid del data dir.
 * Con la instancia única de Electron, aquí no hay riesgo de matar la instancia viva. Exportada
 * para poder probarla. Idempotente.
 *
 * Auditoría integral 30/09/2026, D11 — antes mataba esos PID a ciegas. Tras un corte de luz el
 * pidfile y el postmaster.pid sobreviven, pero Windows RECICLA los PID: al arrancar, ese número
 * puede ser ya el antivirus, el explorador o el spooler de impresión. Ahora se comprueba que el
 * proceso se llame postgres/postgrest antes de matarlo. Si el sistema no deja preguntar (CIM
 * caído), se conserva el comportamiento anterior: una caja que no arranca por un PostgREST huérfano
 * ocupando su puerto es peor, y ese caso ya es raro.
 */
export function matarHuerfanos(dataDir, log = () => {}, pidfile = PIDFILE, { nombres = nombresDeProcesos, matar = (pid) => process.kill(pid, "SIGKILL") } = {}) {
  let candidatos = [];
  try {
    if (existsSync(pidfile)) {
      const { pids = [] } = JSON.parse(readFileSync(pidfile, "utf8"));
      candidatos.push(...pids.map((pid) => ({ pid, que: "huérfano" })));
    }
  } catch { /* pidfile ilegible: ignorar */ }
  // postmaster.pid: un Postgres previo sobre el MISMO data dir bloquearía el arranque.
  const pm = path.join(dataDir, "postmaster.pid");
  try {
    if (existsSync(pm)) {
      const pid = parseInt(readFileSync(pm, "utf8").split("\n")[0], 10);
      if (pid > 0) candidatos.push({ pid, que: "postgres previo" });
    }
  } catch { /* */ }
  candidatos = candidatos.filter((c) => Number.isInteger(Number(c.pid)) && Number(c.pid) > 0 && Number(c.pid) !== process.pid);

  const conocidos = candidatos.length ? nombres(candidatos.map((c) => Number(c.pid))) : new Map();
  for (const { pid, que } of candidatos) {
    const n = Number(pid);
    if (conocidos) {
      const nombre = conocidos.get(n);
      if (nombre === undefined) continue; // ya no existe
      if (!ES_NUESTRO.test(nombre)) { log(`PID ${n} ahora es ${nombre}: no se toca (el PID se recicló)`); continue; }
    }
    try { matar(n); log(`${que} ${n} terminado`); } catch { /* ya no existe */ }
  }
  try { rmSync(pidfile, { force: true }); } catch { /* */ }
  try {
    if (existsSync(pm)) {
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

/** ¿Sigue existiendo ese proceso? (La señal 0 no mata: solo pregunta.) */
export function procesoVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e?.code === "EPERM"; }
}

/**
 * Detiene Postgres SIN quedarse esperando, y dice si de verdad quedó detenido.
 *
 * `detener` es el `stop()` de embedded-postgres: pide a taskkill que mate postgres.exe y espera su
 * evento 'exit'. Si Postgres YA estaba muerto —justo el caso para el que existe el watchdog— ese
 * evento ya pasó y la espera no termina nunca: el reinicio se quedaba colgado antes de empezar. Por
 * eso primero se pregunta si el proceso vive, y si vive se le espera con tope.
 *
 * `barrer` mata lo que quede de esta instalación (hijos sin padre, o el propio Postgres si no
 * obedeció). El resultado importa: el respaldo copia el pgdata EN FRÍO y solo puede hacerlo con
 * Postgres detenido. Exportada para probarla sin Postgres.
 */
export async function detenerPostgres({ pid, detener, barrer = () => {}, desarmar = () => {}, vivo = procesoVivo, topeMs = 10_000, log = () => {} }) {
  // `desarmar`: embedded-postgres guarda el proceso y, al salir la app, su gancho de salida vuelve a
  // lanzar `taskkill /f /t` contra ese PID. Si Postgres murió por su cuenta, horas después ese PID
  // puede ser de otro programa. Cuando se sabe muerto, se le quita la referencia.
  if (pid && !vivo(pid)) {
    log("parada: Postgres ya no estaba vivo");
    try { barrer(); } catch { /* */ }
    try { desarmar(); } catch { /* */ }
    return true;
  }
  let vencio = false;
  try {
    ({ vencio } = await conTope(detener(), topeMs, () => log("parada: Postgres no avisó de su salida; se barre a mano")));
  } catch { vencio = true; }
  if (!vencio) return true;
  try { barrer(); } catch { /* */ }
  // Sin PID no hay forma de comprobarlo: se cuenta como NO detenido (nadie copia a ciegas).
  const detenido = pid ? !vivo(pid) : false;
  if (detenido) { try { desarmar(); } catch { /* */ } }
  else log(pid ? `parada: Postgres (PID ${pid}) SIGUE VIVO tras el barrido` : "parada: no se pudo confirmar que Postgres se detuvo");
  return detenido;
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

/** Contraseña con la que nace el superusuario en las cajas anteriores a CN-018. */
const CLAVE_DE_FABRICA = "postgres";

/**
 * Conecta como superusuario con `password`; si Postgres la rechaza (28P01) y no era ya la de
 * fábrica, reintenta con la de fábrica y, si entra, deja puesta `password` (ALTER ROLE). Es el caso
 * de restaurar un respaldo del pgdata tomado antes de la rotación: sin esto la caja no abría.
 * Exportada para probarla con un cliente falso.
 */
export async function conectarSuperusuario(crearCliente, password, log = () => {}) {
  const c = crearCliente(password);
  try {
    await c.connect();
    return { client: c, rotada: false };
  } catch (e) {
    try { await c.end(); } catch { /* */ }
    if (e?.code !== "28P01" || password === CLAVE_DE_FABRICA) throw e;
  }
  const f = crearCliente(CLAVE_DE_FABRICA);
  await f.connect(); // si tampoco entra, que el error de autenticación suba tal cual
  await f.query(`ALTER ROLE postgres PASSWORD '${password}'`); // base64url: sin comillas ni backslashes
  log("la BD traía la contraseña de fábrica (¿respaldo restaurado de antes de la rotación?): rotada de nuevo");
  return { client: f, rotada: true };
}

/** Arranca el backend local y devuelve puertos + pool + stop(). Idempotente entre arranques. */
/**
 * Levanta el backend local (Postgres + PostgREST). Si PostgREST muere o no contesta al arrancar,
 * lo vuelve a intentar entero, que es lo que antes hacía el cajero abriendo la app otra vez
 * (ver `esperarPostgrest`). Lo usan el arranque, el watchdog y el respaldo.
 */
export function startLocalBackend(opts = {}) {
  const log = opts.log ?? (() => {});
  return reintentarBackend(() => arrancarUnaVez(opts), { log: (m) => log(`arranque: ${m}`) });
}

async function arrancarUnaVez(opts) {
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
  let restPort = opts.restPort ?? 54331; // el de siempre; cambia si ya tiene dueño (ver el paso 6)
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
  // Un respaldo restaurado de ANTES de la rotación (CN-018) trae la contraseña de fábrica, mientras
  // .pg-password ya guarda la nueva: se reintenta con la de fábrica y se vuelve a rotar (D11).
  const conexion = await conectarSuperusuario(
    (pw) => new pg.Client({ host: "localhost", port: pgPort, user: "postgres", password: pw, database: "postgres" }),
    password, log);
  const su = conexion.client;
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
  // Antes de las migraciones nuevas: devolver a las cajas ya instaladas los REVOKE que el antiguo
  // GRANT masivo del arranque les deshizo (una sola vez; ver privilegios.mjs, hallazgo D1).
  await repararRevokesUnaVez(db, { hayMigracionesPrevias: aplicadas.size > 0, log });
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

  // 3b) Libreta del sync de repartidores (0114), sembrada AQUÍ y no en el primer push.
  //
  // Va en el arranque porque el arranque es el único momento que NO depende de la nube: las
  // migraciones de arriba se aplican con internet o sin él, mientras que el push ni se intenta si
  // el dispositivo no logra autenticarse contra Supabase (main.mjs). Sembrando desde el push, una
  // caja que se actualizara sin conexión se quedaba sin libreta, el cajero daba de alta a un
  // repartidor —el caso para el que se hizo la función— y la siembra del primer sync lo marcaba
  // como ya subido: no llegaba nunca a la nube y nadie se enteraba. El porqué completo, y por qué
  // sembrar en este instante es seguro, están en `sembrarRepartidoresUnaVez` (sync-push.mjs).
  //
  // Antes del seed de fixtures a propósito: lo que siembre `seed.sql` debe quedar FUERA de la
  // libreta. Equivocarse hacia "no marcado" cuesta un envío de más; hacia "marcado", un alta que
  // no existe en la nube y que nadie puede recuperar.
  //
  // NO PUEDE TUMBAR EL ARRANQUE, y se encarga ella de eso. Esta línea se recorre también a media
  // jornada —el perro guardián reinicia el backend, y el respaldo bajo demanda lo para y lo vuelve
  // a levantar (`main.mjs`)—, así que un throw aquí no sería "la caja no actualiza": sería la caja
  // sin cobrar en plena comida. La siembra se traga su propio fallo y lo deja en el log; como el
  // marcador se escribe ANTES, un fallo tampoco queda armado para el arranque siguiente.
  await sembrarRepartidoresUnaVez(db, log);

  // 3c) Misma libreta, mismo motivo, para zonas de envío (0116/Task 4): ver `sembrarZonasUnaVez`
  // en sync-push.mjs, que reusa el razonamiento completo de `sembrarRepartidoresUnaVez` de arriba.
  await sembrarZonasUnaVez(db, log);

  // 3d) La 0156 añadió clientes.codigo_publico y con eso cambió la huella de cada cliente de la
  // libreta del push: sin esto el primer ciclo re-subiría todo el padrón y pisaría en la nube lo que
  // se editó o se dio de baja en el panel. Ver `reanotarHuellasClientes0156UnaVez` (sync-push.mjs).
  await reanotarHuellasClientes0156UnaVez(db, log);

  // 4) Privilegios de los roles API. Aquí había un GRANT … ON ALL TABLES a authenticated/anon en
  //    cada arranque: dejaba las libretas _vim_* escribibles desde la LAN y deshacía los REVOKE de
  //    las migraciones (Auditoría integral 30/09/2026, D1). Los privilegios de cada tabla los
  //    ponen ya los default privileges (shim + 0065) y las propias migraciones, como en Supabase.
  //    Solo queda el USAGE del esquema y sacar las tablas internas de la API.
  await db.query("GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role");
  await blindarTablasInternas(db);

  // 4b) Trigger de tiempo real del KDS (Fase 2, local-only): NOTIFY al cambiar estado de cocina.
  await db.query(readFileSync(kdsNotifyFile, "utf8"));

  // 5) Seed de fixtures solo si la BD está vacía (en producción llega por sync/provisioning).
  //
  // SIN TRUNCATE. Aquí había un
  //   TRUNCATE planes, folios_paquetes, roles, permisos, rol_permisos RESTART IDENTITY CASCADE
  // antes del seed, y hacía daño de dos formas:
  //
  //   • Los catálogos globales los siembran las MIGRACIONES (0046, con ids fijos; 0086 para los
  //     planes por paquete). El TRUNCATE los borraba y dejaba que el seed los repusiera desde su
  //     propia copia, que es anterior a la 0086: en la caja de desarrollo quedaba 'QS' ACTIVO y
  //     los tres escalones —ESENCIAL, NEGOCIO, CADENA— ni existían. O sea, dev decía una cosa y
  //     la nube otra sobre qué planes se pueden contratar. Se destapó el 5/09/2026 al enganchar
  //     los smokes al CI: `smoke_provisioning.sql` pasaba en dev y fallaba contra el stack real.
  //   • `seed.sql` inserta los roles con gen_random_uuid(). Tras el TRUNCATE nacían con ids
  //     DISTINTOS de los de la nube, y al bajar la rebanada de un tenant los empleados llegaban
  //     con un rol_id que aquí no existía: el POS no los listaba. Con los ids fijos de la 0046
  //     intactos, eso deja de pasar.
  //
  // El TRUNCATE tampoco hacía falta: TODOS los bloques de seed.sql terminan en
  // `ON CONFLICT DO NOTHING`, así que sobre una base ya migrada el seed es inocuo — que es
  // exactamente cómo se comporta en la nube, donde nadie trunca nada antes de `supabase db reset`.
  // El `CASCADE`, además, podía llevarse por delante filas dependientes sin que nadie lo pidiera.
  const vacia = (await db.query("SELECT count(*)::int n FROM tenants")).rows[0].n === 0;
  if (vacia && seedIfEmpty) {
    await db.query(readFileSync(seedFile, "utf8"));
    log("seed de fixtures aplicado (BD estaba vacía)");
  }
  await db.end();

  // 6) PostgREST como sidecar (con libpq.dll del propio Postgres embebido).
  // En Windows un segundo servidor enlaza sin error un puerto que ya tiene dueño (Warp pone
  // SO_REUSEADDR) y no recibe nada: las peticiones se las queda el primero. Si en el puerto de
  // siempre ya escucha alguien —un PostgREST viejo que no murió, u otro programa— se usa uno
  // libre. Es un puerto interno: solo lo usa el gateway, que lo toma de lo que devuelve esta función.
  if (await puertoOcupado(restPort)) {
    const ocupado = restPort;
    restPort = await puertoLibre();
    log(`el puerto ${ocupado} de PostgREST ya está ocupado: se usa el ${restPort}`);
  }
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
  // Antes de abrir el log (que quedaría en 0 bytes) y de lanzar nada: si el paquete no trae el
  // binario, que el error lo diga ya, no tras 60 s de readiness a un proceso que nunca nació.
  comprobarBinarioPostgrest(postgrestExe);
  const logFd = openSync(logPath, "w");
  const rest = spawn(postgrestExe, [confPath], {
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, PATH: `${pgBin}${path.delimiter}${process.env.PATH}` },
  });
  // Un spawn fallido (EACCES por antivirus, DLL bloqueada…) emite 'error' de forma asíncrona; sin
  // oyente tumba el proceso sin dejar rastro. Se registra y se corta el readiness abajo.
  let falloSpawn = null;
  rest.on("error", (e) => { falloSpawn = explicarFalloDeSpawn(e, postgrestExe); log(falloSpawn); });
  // Cómo terminó, si termina. Sin este oyente el readiness sondeaba 60 s a un proceso que ya no
  // existía y el error no decía con qué código había muerto.
  let salidaRest = null;
  rest.on("exit", (code, signal) => { salidaRest = { code, signal }; });

  // Registrar los PIDs YA, ANTES del readiness. Si el arranque falla aquí (readiness expira),
  // el postgrest recién lanzado queda rastreado en el pidfile → el próximo arranque lo mata en
  // matarHuerfanos. Sin esto, un boot fallido deja un postgrest huérfano ocupando restPort que
  // hace fallar TODOS los reintentos siguientes (el nuevo postgrest no puede enlazar el puerto).
  try { writeFileSync(pidfile, JSON.stringify({ pids: [pgPid, rest.pid].filter(Boolean), at: Date.now() })); } catch { /* */ }

  /** Detiene Postgres y dice si de verdad quedó detenido. Lo usan la parada y un arranque fallido. */
  const pararPostgres = () => detenerPostgres({
    pid: pgPid,
    detener: () => database.stop(),
    barrer: () => {
      matarPostgresDeEstaInstalacion(pgBin, (m) => log(`limpieza: ${m}`));
      matarQuienOcupaElPuerto(pgPort, (m) => log(`limpieza: ${m}`));
    },
    desarmar: () => { database.process = undefined; },
    log,
  });

  const listo = await esperarPostgrest({
    // 127.0.0.1 (no 'localhost'): PostgREST escucha solo en IPv4; en el Electron empaquetado
    // 'localhost' resuelve a ::1 (IPv6) primero → nunca conectaría.
    sondear: () => fetch(`http://127.0.0.1:${restPort}/`),
    // Un spawn fallido no llegó a ser proceso: tampoco hay nada que esperar.
    salida: () => salidaRest ?? (falloSpawn ? { code: null, signal: null } : null),
    baseViva: () => !pgPid || procesoVivo(pgPid),
  }); // hasta ~60 s por intento: bajo carga, el schema cache tarda en cargar
  if (!listo.listo) {
    try { rest.kill(); } catch { /* */ } // no dejarlo colgado como huérfano ocupando restPort
    if (falloSpawn) throw new Error(`${falloSpawn}. Reinstala VIM POS.`);
    let tail = "";
    try { tail = readFileSync(logPath, "utf8").split("\n").slice(-6).join("\n"); } catch { /* */ }
    // Postgres se detiene AQUÍ y no al salir de la app: si se va a reintentar, el siguiente intento
    // tiene que encontrar el pgdata libre; y si no, que no quede un Postgres sin dueño.
    const pgSeguiaVivo = !pgPid || procesoVivo(pgPid);
    if (await pararPostgres()) { try { rmSync(pidfile, { force: true }); } catch { /* */ } }
    const partes = [`PostgREST no respondió: ${listo.detalle}.`];
    if (!pgSeguiaVivo) partes.push(`Postgres ya no estaba vivo; lo último que escribió:\n${capturaPg.texto()}`);
    if (tail.trim()) partes.push(`Lo último de PostgREST:\n${tail.trim()}`);
    const error = new Error(partes.join("\n"));
    // Si algo murió o PostgREST nunca contestó, volver a arrancar lo ha arreglado siempre. Si
    // los dos viven y PostgREST contesta pero no carga el esquema, el problema está en la base y
    // repetir solo alarga la espera.
    error.reintentable = listo.motivo !== "sin-esquema" || !pgSeguiaVivo;
    throw error;
  }
  log(`PostgREST en localhost:${restPort}`);

  // Pool para el auth local (device sign-in, pin-login) — service_role local.
  const pool = new pg.Pool({ host: "localhost", port: pgPort, user: "postgres", password, database: "vimpos", max: 4 });
  // Una conexión ociosa del pool que pierde a Postgres emite 'error' en el pool. Sin oyente es una
  // excepción sin capturar en el proceso principal — justo cuando el watchdog tiene que actuar.
  pool.on("error", (e) => log(`pool local: se perdió una conexión a Postgres (${e?.message ?? e})`));

  /** Devuelve `{ postgresDetenido }`: quien vaya a copiar el pgdata en frío tiene que saberlo. */
  const stop = async () => {
    try { rest.kill(); } catch { /* */ }
    // pool.end() espera a que se devuelvan las conexiones prestadas: una consulta atorada lo retiene.
    try { await conTope(pool.end(), 5000, () => log("parada: el pool local no cerró a tiempo; se sigue")); } catch { /* */ }
    const postgresDetenido = await pararPostgres();
    // Cierre limpio → sin huérfanos que limpiar. Si no lo fue, el pidfile se queda: el próximo
    // arranque repite la limpieza con él.
    if (postgresDetenido) { try { rmSync(pidfile, { force: true }); } catch { /* */ } }
    return { postgresDetenido };
  };
  return { pgPort, restPort, secret, pool, stop, dataDir, dataRoot, pgPassword: password };
}
