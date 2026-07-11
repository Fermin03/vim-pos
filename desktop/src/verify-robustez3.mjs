// Fase 3 · Verificación headless del endurecimiento:
//  A) RESPALDO: copia en frío del pgdata → y se comprueba que el respaldo es un clúster VÁLIDO
//     y CONSULTABLE (se arranca un Postgres sobre la copia y se cuentan los tenants).
//  B) WATCHDOG: se mata postgrest.exe y el watchdog debe REVIVIR el backend solo.
import { startBackend } from "./backend.mjs";
import { respaldar, listarRespaldos } from "./backup.mjs";
import { crearWatchdog } from "./watchdog.mjs";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupsDir = path.join(root, "backups-verify");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const matar = (img) => { try { execSync(`taskkill /F /IM ${img}`, { stdio: "ignore" }); } catch { /* no corría */ } };
const salud = async (url) => { try { return (await fetch(`${url}/health/deep`, { signal: AbortSignal.timeout(5000) })).ok; } catch { return false; } };

let backend, wd, ok = true;
const fail = (m) => { ok = false; console.error("❌", m); };

try {
  matar("postgres.exe"); matar("postgrest.exe"); await wait(1500);
  try { rmSync(backupsDir, { recursive: true, force: true }); } catch { /* */ }

  // ── A) RESPALDO + RESTAURABILIDAD ──────────────────────────────────────────
  console.log("· A) respaldo…");
  backend = await startBackend({ log: () => {} });
  const antes = (await backend.pool.query("SELECT count(*)::int n FROM tenants")).rows[0].n;
  console.log(`  caja arriba, ${antes} tenant(s)`);
  await backend.stop(); backend = null; // Postgres detenido → copia consistente
  const dest = respaldar(path.join(root, "pgdata"), backupsDir, 7, (m) => console.log("  ·", m));
  if (!dest || !existsSync(path.join(dest, "PG_VERSION"))) fail("el respaldo no se creó / sin PG_VERSION");
  else {
    // Arrancar un Postgres SOBRE la copia (otro puerto) y consultar → prueba que es válido.
    const pgCopia = new EmbeddedPostgres({ databaseDir: dest, user: "postgres", password: "postgres", port: 54339, persistent: true });
    await pgCopia.start();
    const c = new pg.Client({ host: "127.0.0.1", port: 54339, user: "postgres", password: "postgres", database: "vimpos" });
    await c.connect();
    const despues = (await c.query("SELECT count(*)::int n FROM tenants")).rows[0].n;
    await c.end(); await pgCopia.stop();
    if (despues === antes) console.log(`  ✓ respaldo RESTAURABLE (clúster copia consultable, ${despues} tenant(s))`);
    else fail(`el respaldo no coincide: original ${antes} vs copia ${despues}`);
  }

  // ── B) WATCHDOG revive el backend ──────────────────────────────────────────
  console.log("· B) watchdog…");
  matar("postgres.exe"); matar("postgrest.exe"); await wait(1500);
  backend = await startBackend({ log: () => {} });
  if (!(await salud(backend.url))) fail("la caja no está sana al empezar B");
  let ref = backend;
  wd = crearWatchdog({
    url: backend.url, intervaloMs: 2500, fallosParaReiniciar: 2,
    alReiniciar: async () => { const p = ref; ref = null; try { await p.stop(); } catch { /* */ } ref = await startBackend({ log: () => {} }); },
    log: (m) => console.log("  · [watchdog]", m),
  });

  console.log("  matando postgrest.exe (simula caída)…");
  matar("postgrest.exe");
  // El watchdog debe detectar (2×2.5s) y reiniciar (~10s). Sondeamos hasta 45s.
  let recuperado = false;
  for (let i = 0; i < 30; i++) {
    await wait(1500);
    if (await salud(ref?.url ?? backend.url)) { recuperado = true; console.log(`  ✓ backend REVIVIDO por el watchdog (~${((i + 1) * 1.5).toFixed(0)}s)`); break; }
  }
  if (!recuperado) fail("el watchdog no revivió el backend en 45s");
  backend = ref;

  console.log(ok ? "\n✅ ROBUSTEZ F3 OK — respaldo restaurable + watchdog auto-recupera." : "\n❌ ROBUSTEZ F3 con fallos.");
} catch (e) {
  fail(`excepción: ${e.message}`); console.error(e);
} finally {
  try { wd?.stop(); } catch { /* */ }
  try { if (backend) await backend.stop(); } catch { /* */ }
  try { rmSync(backupsDir, { recursive: true, force: true }); } catch { /* */ }
  matar("postgres.exe"); matar("postgrest.exe");
  process.exitCode = ok ? 0 : 1;
}
