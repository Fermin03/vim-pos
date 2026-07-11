// Fase 3 · Respaldo local del pgdata (respaldo FÍSICO en frío).
// El bin de Postgres embebido es mínimo (no trae pg_dump), así que respaldamos copiando el
// directorio de datos con Postgres DETENIDO → copia 100% consistente. Se dispara al cerrar limpio
// la caja (Postgres ya está apagado) y bajo demanda (stop→copia→start). La nube (sync PUSH) es el
// respaldo offsite de las ventas; esto protege el estado completo local y permite restaurar rápido.
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

// Archivos que NO se copian: el lock del postmaster (un PID viejo confundiría a la limpieza de
// huérfanos al restaurar) y logs. pg_wal SÍ se copia (necesario para consistencia).
const EXCLUIR = new Set(["postmaster.pid", "postmaster.opts"]);

/** Marca de tiempo ordenable para el nombre del respaldo: 2026-07-11_14-30-05. */
function sello(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** Lista los respaldos existentes (carpetas pgdata-*), más nuevos primero. */
export function listarRespaldos(backupsDir) {
  if (!existsSync(backupsDir)) return [];
  return readdirSync(backupsDir)
    .filter((n) => n.startsWith("pgdata-"))
    .map((n) => ({ nombre: n, ruta: path.join(backupsDir, n) }))
    .sort((a, b) => b.nombre.localeCompare(a.nombre));
}

/**
 * Copia en frío el pgdata a backupsDir/pgdata-<sello>/. Postgres DEBE estar detenido.
 * Rota dejando solo los `keep` más recientes. Devuelve la ruta del respaldo (o null si falló).
 */
export function respaldar(dataDir, backupsDir, keep = 7, log = () => {}) {
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) { log("respaldo omitido: no hay pgdata todavía"); return null; }
  mkdirSync(backupsDir, { recursive: true });
  const dest = path.join(backupsDir, `pgdata-${sello()}`);
  const tmp = `${dest}.parcial`;
  try {
    // Copia a una carpeta .parcial y luego renombra → un respaldo a medias nunca se ve como válido.
    cpSync(dataDir, tmp, { recursive: true, filter: (src) => !EXCLUIR.has(path.basename(src)) });
    renameSync(tmp, dest); // .parcial → final: un respaldo a medias nunca se ve como válido

    log(`respaldo creado: ${dest}`);
  } catch (e) {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
    log(`respaldo FALLÓ: ${e.message}`);
    return null;
  }
  // Rotación: conservar los `keep` más recientes.
  const viejos = listarRespaldos(backupsDir).slice(keep);
  for (const v of viejos) {
    try { rmSync(v.ruta, { recursive: true, force: true }); log(`respaldo viejo purgado: ${v.nombre}`); } catch { /* */ }
  }
  return dest;
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
