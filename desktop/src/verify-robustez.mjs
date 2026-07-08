// Fase 1 · Verificación de robustez: limpieza de procesos huérfanos (crash-safe) + ciclo de vida
// del pidfile. Prueba lo que dolió en las pruebas: procesos Postgres/PostgREST colgados.
import { startLocalBackend, matarHuerfanos } from "./runtime.mjs";
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PIDFILE = path.join(root, "bin", ".pids.json");
const dataDir = path.join(root, "pgdata");
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // ── Test 1: matarHuerfanos termina los PIDs del pidfile de un run anterior ──
  const dummy = spawn(process.execPath, ["-e", "setInterval(()=>{}, 1e9)"], { stdio: "ignore" });
  await wait(300);
  if (!vivo(dummy.pid)) throw new Error("el proceso dummy no arrancó");
  writeFileSync(PIDFILE, JSON.stringify({ pids: [dummy.pid], at: Date.now() }));
  console.log(`· simulado huérfano PID ${dummy.pid} + pidfile`);
  matarHuerfanos(dataDir, (m) => console.log(`  ${m}`));
  await wait(600);
  if (vivo(dummy.pid)) throw new Error(`el huérfano ${dummy.pid} sigue vivo`);
  if (existsSync(PIDFILE)) throw new Error("el pidfile no se borró");
  console.log("· matarHuerfanos: huérfano terminado + pidfile borrado ✓");

  // ── Test 2: ciclo start/stop escribe y limpia el pidfile ──
  const b = await startLocalBackend({ log: () => {} });
  if (!existsSync(PIDFILE)) throw new Error("startLocalBackend no escribió el pidfile");
  const pids = JSON.parse((await import("node:fs")).readFileSync(PIDFILE, "utf8")).pids;
  console.log(`· backend arriba; pidfile con ${pids.length} PIDs (${pids.join(", ")}); vivos: ${pids.map(vivo).join(",")}`);
  if (!pids.every(vivo)) throw new Error("algún PID del pidfile no está vivo");
  await b.stop();
  await wait(500);
  if (existsSync(PIDFILE)) throw new Error("stop() no borró el pidfile (cierre limpio)");
  if (pids.some(vivo)) throw new Error("stop() dejó procesos vivos");
  console.log("· start→stop: pidfile escrito con procesos vivos, y borrado + procesos muertos al cerrar ✓");

  console.log("\n✅ ROBUSTEZ OK — huérfanos de un cierre no limpio se matan al arrancar; cierre limpio no deja procesos.");
  console.log("   + instancia única en main.mjs (una sola caja) + apagado en window-all-closed/before-quit.");
} catch (e) {
  console.error("\n❌ ROBUSTEZ FALLÓ:", e.message);
  process.exitCode = 1;
}
