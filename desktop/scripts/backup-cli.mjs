// Fase 3 · Respaldo manual desde la terminal (con VIM POS CERRADO). Copia en frío el pgdata.
// Uso: npm run backup   (respeta VIM_DATA_DIR si lo usas para reubicar los datos).
import { respaldar } from "../src/backup.mjs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = process.env.VIM_DATA_DIR || root;
const dataDir = path.join(dataRoot, "pgdata");
const backupsDir = path.join(dataRoot, "backups");

if (existsSync(path.join(dataDir, "postmaster.pid"))) {
  console.error("⚠️  VIM POS parece estar ABIERTO (hay postmaster.pid). Ciérralo (o usa 'Respaldar ahora'\n   desde la bandeja) — un respaldo en caliente saldría inconsistente.");
  process.exit(1);
}
const dest = respaldar(dataDir, backupsDir, 7, (m) => console.log("·", m));
console.log(dest ? `✅ Respaldo creado: ${dest}` : "No se pudo respaldar (¿ya arrancaste la caja al menos una vez?).");
