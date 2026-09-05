// Un instalador nuevo debe arrancar (a) desde cero y (b) desde una caja que se quedó en una
// migración vieja, aplicando solas las que faltan. Aquí se prueba (a) con un dataRoot temporal
// (pgdata + bin/conf/log/pidfile/secretos, TODO aislado del entorno de dev): si una migración no
// entra en el Postgres embebido (por ejemplo, 0098 usa storage.buckets y depende del shim), esto
// lo dice antes de publicar.
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const esperadas = readdirSync(path.join(raiz, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort();
const dir = mkdtempSync(path.join(tmpdir(), "vim-mig-"));

let backend;
try {
  const { startBackend } = await import("./backend.mjs");
  // Puertos y dataRoot propios: runtime.mjs elige puerto/dataDir por OPCIONES, no por variables de
  // entorno (VIM_DATA_DIR/VIM_PG_PORT no existen en el código). dataRoot aparte evita además pisar
  // el postgrest.conf/pidfile/.jwt-secret/.pg-password del backend de dev (viven bajo dataRoot/bin
  // y se comparten si no se aísla). host 127.0.0.1: el default 0.0.0.0 expone el gateway a la LAN.
  backend = await startBackend({
    dataRoot: dir,
    pgPort: 54398,
    restPort: 54397,
    gatewayPort: 54399,
    host: "127.0.0.1",
    uiPorts: [54360],
    log: () => {},
  });
  const { rows } = await backend.pool.query("SELECT nombre FROM _vim_migraciones ORDER BY nombre");
  const aplicadas = rows.map((r) => r.nombre);
  const faltan = esperadas.filter((m) => !aplicadas.includes(m));
  if (faltan.length) throw new Error(`no se aplicaron: ${faltan.join(", ")}`);
  const ultima = aplicadas[aplicadas.length - 1];
  const fn = (await backend.pool.query("SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('sync_pull_snapshot','sync_push_snapshot','_vim_aplicar_movimientos','guardar_receta','registrar_compra')")).rows[0].n;
  if (fn !== 5) throw new Error(`faltan funciones (esperaba 5, hay ${fn})`);
  console.log(`✅ MIGRACIONES OK — ${aplicadas.length} aplicadas desde cero, última ${ultima}`);
} catch (e) {
  console.error("❌ MIGRACIONES FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  if (backend) await backend.stop();
  rmSync(dir, { recursive: true, force: true });
}
