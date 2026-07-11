// Fase 3 · Restaura un respaldo del pgdata (con VIM POS CERRADO).
// Uso: npm run restore            → restaura el MÁS RECIENTE
//      npm run restore -- <nombre> → restaura ese respaldo (carpeta pgdata-YYYY-MM-DD_HH-MM-SS)
import { restaurar, listarRespaldos } from "../src/backup.mjs";
import { matarHuerfanos } from "../src/runtime.mjs";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = process.env.VIM_DATA_DIR || root;
const dataDir = path.join(dataRoot, "pgdata");
const backupsDir = path.join(dataRoot, "backups");

const lista = listarRespaldos(backupsDir);
if (!lista.length) {
  console.error(`No hay respaldos en ${backupsDir}`);
  process.exit(1);
}
const arg = process.argv[2];
const elegido = arg ? lista.find((b) => b.nombre === arg) : lista[0];
if (!elegido) {
  console.error(`Respaldo "${arg}" no encontrado. Disponibles:\n  ${lista.map((b) => b.nombre).join("\n  ")}`);
  process.exit(1);
}

// Asegurar que no quede un Postgres corriendo sobre el pgdata (cierra la app antes; esto limpia
// cualquier proceso huérfano y el postmaster.pid rancio para poder restaurar).
matarHuerfanos(dataDir, (m) => console.log("·", m));
const pidFile = path.join(dataDir, "postmaster.pid");
if (existsSync(pidFile)) { try { rmSync(pidFile, { force: true }); } catch { /* */ } }

console.log(`Restaurando ${elegido.nombre} → ${dataDir}`);
const previo = restaurar(dataDir, elegido.ruta, (m) => console.log("·", m));
console.log(`✅ Restaurado desde ${elegido.nombre}.`);
if (previo) console.log(`   (el pgdata anterior quedó en ${previo} por si acaso; bórralo cuando confirmes)`);
