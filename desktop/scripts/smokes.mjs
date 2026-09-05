// Corre los smokes de supabase/scripts contra un Postgres embebido RECIÉN sembrado.
//
// Existe porque estos smokes no los corría nada: smoke_propina.sql estuvo cinco semanas en rojo
// sin que nadie se enterara (ver migración 0102). Y se siembra una BD nueva a propósito: contra el
// pgdata de dev fallan por ruido —turnos abiertos de otras sesiones, precios del seed cambiados—
// y ese ruido se confunde con bugs reales.
//
//   node scripts/smokes.mjs                 # todos
//   node scripts/smokes.mjs smoke_propina.sql smoke_mesa_abandonada.sql
//
// Los .sql corren como `postgres`, que SE SALTA RLS. Para probar el camino real bajo RLS, el patrón
// está en src/verify-e2e.mjs (device sign-in → pin-login → RPC por /rest/v1).
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startLocalBackend } from "../src/runtime.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dirSmokes = path.join(raiz, "supabase", "scripts");
const pedidos = process.argv.slice(2);
const archivos = pedidos.length
  ? pedidos
  : readdirSync(dirSmokes).filter((f) => f.startsWith("smoke_") && f.endsWith(".sql")).sort();

// dataRoot temporal y puertos propios: no pisa el pgdata ni los secretos del backend de dev.
const dir = mkdtempSync(path.join(tmpdir(), "vim-smoke-"));
let backend, fallos = 0;
try {
  backend = await startLocalBackend({ dataRoot: dir, pgPort: 54396, restPort: 54395, log: () => {} });
  for (const a of archivos) {
    // \set y BEGIN/ROLLBACK son de psql; la transacción la abre este runner.
    const sql = readFileSync(path.join(dirSmokes, a), "utf8")
      .split("\n").filter((l) => !l.trimStart().startsWith("\\set")).join("\n")
      .replace(/^\s*BEGIN;\s*$/m, "").replace(/^\s*ROLLBACK;\s*$/m, "");
    const c = await backend.pool.connect();
    const notices = [];
    // Sin esto los RAISE NOTICE se pierden y un fallo no dice en qué paso murió.
    c.on("notice", (n) => notices.push(n.message));
    try {
      await c.query("BEGIN");
      await c.query(sql);
      console.log(`✅ ${a}`);
    } catch (e) {
      fallos++;
      console.log(`❌ ${a}\n      ${e.message}`);
      for (const n of notices) console.log(`      · ${n}`);
    } finally {
      try { await c.query("ROLLBACK"); } catch { /* la transacción ya murió */ }
      c.release();
    }
  }
  console.log(`\n${fallos === 0 ? "✅" : "❌"} ${archivos.length - fallos}/${archivos.length} smokes en verde`);
} catch (e) {
  console.error("❌ el runner falló:", e.message);
  fallos++;
} finally {
  if (backend) await backend.stop();
  rmSync(dir, { recursive: true, force: true });
  process.exitCode = fallos === 0 ? 0 : 1;
}
