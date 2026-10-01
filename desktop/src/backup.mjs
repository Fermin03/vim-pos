// Fase 3 · Respaldo local del pgdata (respaldo FÍSICO en frío).
// El bin de Postgres embebido es mínimo (no trae pg_dump), así que respaldamos copiando el
// directorio de datos con Postgres DETENIDO → copia 100% consistente. Se dispara una vez al día
// cuando la caja está quieta (respaldo-diario.mjs), al cerrar limpio la caja (Postgres ya está
// apagado) y bajo demanda (stop→copia→start). La nube (sync PUSH) guarda las VENTAS fuera del
// local; esto protege el estado completo local y permite restaurar rápido. No es una copia de la
// base entera fuera del local: si se pierde la computadora, se recuperan las ventas ya subidas.
//
// Dos caminos para la misma copia:
//   · `respaldarAsync` — con la caja ENCENDIDA (diario y "Respaldar ahora"). No bloquea el proceso
//     de Electron: con `cpSync` la bandeja, el IPC y el servidor del POS se quedaban congelados lo
//     que durara la copia.
//   · `respaldar` — síncrono, solo para SALIR (la app ya se está cerrando y no hay nada que
//     atender) y para la terminal.
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statfsSync } from "node:fs";
import { cp, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

// Archivos que NO se copian: el lock del postmaster (un PID viejo confundiría a la limpieza de
// huérfanos al restaurar) y logs. pg_wal SÍ se copia (necesario para consistencia).
const EXCLUIR = new Set(["postmaster.pid", "postmaster.opts"]);
const filtro = (src) => !EXCLUIR.has(path.basename(src));

/** El nombre de un respaldo TERMINADO: `pgdata-2026-09-30_03-12-05`. Ni `.parcial` ni carpetas ajenas. */
export const RE_RESPALDO = /^pgdata-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;

/** Marca de tiempo ordenable para el nombre del respaldo: 2026-07-11_14-30-05. */
function sello(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/**
 * Lista los respaldos TERMINADOS, más nuevos primero.
 *
 * Antes contaba todo lo que empezara por `pgdata-`: una copia a medias (`.parcial`) ocupaba uno de
 * los siete lugares y empujaba fuera a un respaldo bueno.
 */
export function listarRespaldos(backupsDir) {
  if (!existsSync(backupsDir)) return [];
  return readdirSync(backupsDir)
    .filter((n) => RE_RESPALDO.test(n))
    .map((n) => ({ nombre: n, ruta: path.join(backupsDir, n) }))
    .sort((a, b) => b.nombre.localeCompare(a.nombre));
}

/** Borra las copias a medias (`*.parcial`) que dejó un corte de luz o un disco lleno. Devuelve cuántas. */
export function limpiarParciales(backupsDir, log = () => {}) {
  if (!existsSync(backupsDir)) return 0;
  let n = 0;
  for (const nombre of readdirSync(backupsDir)) {
    if (!nombre.endsWith(".parcial")) continue;
    try { rmSync(path.join(backupsDir, nombre), { recursive: true, force: true }); n++; log(`copia a medias borrada: ${nombre}`); } catch { /* */ }
  }
  return n;
}

/** Rotación: conservar los `keep` más recientes. */
function rotar(backupsDir, keep, log) {
  for (const v of listarRespaldos(backupsDir).slice(keep)) {
    try { rmSync(v.ruta, { recursive: true, force: true }); log(`respaldo viejo purgado: ${v.nombre}`); } catch { /* */ }
  }
}

/**
 * Copia en frío el pgdata a backupsDir/pgdata-<sello>/. Postgres DEBE estar detenido.
 * SÍNCRONA: bloquea el proceso mientras copia. Solo para salir de la app y para la terminal.
 * Rota dejando solo los `keep` más recientes. Devuelve la ruta del respaldo (o null si falló).
 */
export function respaldar(dataDir, backupsDir, keep = 7, log = () => {}) {
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) { log("respaldo omitido: no hay pgdata todavía"); return null; }
  mkdirSync(backupsDir, { recursive: true });
  limpiarParciales(backupsDir, log);
  const dest = path.join(backupsDir, `pgdata-${sello()}`);
  const tmp = `${dest}.parcial`;
  try {
    // Copia a una carpeta .parcial y luego renombra → un respaldo a medias nunca se ve como válido.
    cpSync(dataDir, tmp, { recursive: true, filter: filtro });
    renameSync(tmp, dest);
    log(`respaldo creado: ${dest}`);
  } catch (e) {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
    log(`respaldo FALLÓ: ${e.message}`);
    return null;
  }
  rotar(backupsDir, keep, log);
  return dest;
}

/**
 * La misma copia, sin bloquear el proceso. Postgres DEBE estar detenido.
 * `copiar` se inyecta solo en las pruebas (por omisión, `fs.promises.cp`).
 */
export async function respaldarAsync(dataDir, backupsDir, keep = 7, log = () => {}, { copiar = cp } = {}) {
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) { log("respaldo omitido: no hay pgdata todavía"); return null; }
  mkdirSync(backupsDir, { recursive: true });
  limpiarParciales(backupsDir, log);
  const dest = path.join(backupsDir, `pgdata-${sello()}`);
  const tmp = `${dest}.parcial`;
  try {
    await copiar(dataDir, tmp, { recursive: true, filter: filtro });
    await rename(tmp, dest);
    log(`respaldo creado: ${dest}`);
  } catch (e) {
    try { await rm(tmp, { recursive: true, force: true }); } catch { /* */ }
    log(`respaldo FALLÓ: ${e.message}`);
    return null;
  }
  rotar(backupsDir, keep, log);
  return dest;
}

/** Bytes que ocupa una carpeta (lo que se va a copiar). Asíncrono: no congela la caja al medir. */
export async function tamanoDe(dir) {
  let total = 0;
  let entradas;
  try { entradas = await readdir(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entradas) {
    if (EXCLUIR.has(e.name)) continue;
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) total += await tamanoDe(ruta);
    else { try { total += (await stat(ruta)).size; } catch { /* se fue mientras se medía */ } }
  }
  return total;
}

/** Bytes libres en el disco donde vive `dir` (o su carpeta padre, si aún no existe). */
function espacioLibre(dir) {
  let d = dir;
  while (!existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
  const s = statfsSync(d);
  return Number(s.bavail) * Number(s.bsize);
}

/** Holgura sobre el tamaño del pgdata: la base sigue creciendo y el disco no debe quedar en cero. */
const MARGEN = 1.1;
const COLCHON_BYTES = 200 * 1024 * 1024;

/**
 * ¿Cabe el respaldo? Se pregunta ANTES de detener Postgres.
 *
 * Sin esto, con el disco lleno la caja detenía la base cada hora, fallaba con ENOSPC, y como la
 * rotación solo corría tras un respaldo bueno, nunca liberaba nada: una interrupción por hora,
 * para siempre, y ningún respaldo.
 *
 * Si no cabe, purga respaldos del más viejo al más nuevo hasta que quepa — pero SIEMPRE deja al
 * menos uno bueno: quedarse sin ninguno para intentar hacer otro es cambiar un respaldo viejo por
 * una promesa. Si ni así cabe, devuelve `cabe: false` y quien llama NO detiene la base.
 *
 * Si el disco no se deja medir, se asume que cabe: una medición que falla no debe dejar a la caja
 * sin respaldos; si de verdad no hay sitio, la copia falla y se reporta por el otro camino.
 *
 * `libre`, `tamano` y `alPurgar` se inyectan en las pruebas.
 */
export async function hacerSitio(dataDir, backupsDir, { log = () => {}, libre = espacioLibre, tamano = tamanoDe, alPurgar = () => {} } = {}) {
  const purgados = [];
  let necesario, disponible;
  try {
    necesario = Math.ceil((await tamano(dataDir)) * MARGEN) + COLCHON_BYTES;
    disponible = libre(backupsDir);
  } catch (e) {
    log(`no se pudo medir el disco (${e?.message ?? e}); se intenta el respaldo igual`);
    return { cabe: true, purgados, necesario: null, libre: null };
  }
  // Una copia a medias también ocupa: se va primero.
  if (disponible < necesario && limpiarParciales(backupsDir, log) > 0) disponible = libre(backupsDir);
  while (disponible < necesario) {
    const lista = listarRespaldos(backupsDir);
    if (lista.length <= 1) break; // el último bueno no se toca
    const viejo = lista[lista.length - 1];
    try { rmSync(viejo.ruta, { recursive: true, force: true }); } catch { break; }
    purgados.push(viejo.nombre);
    log(`sin espacio para el respaldo: purgado ${viejo.nombre}`);
    alPurgar(viejo.nombre);
    disponible = libre(backupsDir);
  }
  const mb = (b) => `${Math.round(b / 1024 / 1024)} MB`;
  if (disponible >= necesario) return { cabe: true, purgados, necesario, libre: disponible };
  return {
    cabe: false, purgados, necesario, libre: disponible,
    error: `no hay espacio en el disco para el respaldo: hacen falta ${mb(necesario)} y hay ${mb(disponible)} libres`,
  };
}

/**
 * Restaura un respaldo sobre el pgdata (mueve el actual a pgdata.pre-restauracion-<sello> y copia
 * el respaldo en su lugar). La app DEBE estar cerrada. Devuelve la ruta del pgdata anterior.
 */
export function restaurar(dataDir, backupDir, log = () => {}) {
  if (!existsSync(path.join(backupDir, "PG_VERSION"))) throw new Error(`respaldo inválido (sin PG_VERSION): ${backupDir}`);
  if (existsSync(path.join(dataDir, "postmaster.pid"))) throw new Error("parece haber un Postgres corriendo (postmaster.pid). Cierra VIM POS antes de restaurar.");
  const previo = `${dataDir}.pre-restauracion-${sello()}`;
  if (existsSync(dataDir)) {
    renameSync(dataDir, previo);
    log(`pgdata actual movido a ${previo}`);
  }
  cpSync(backupDir, dataDir, { recursive: true });
  log(`restaurado desde ${backupDir}`);
  return existsSync(previo) ? previo : null;
}
