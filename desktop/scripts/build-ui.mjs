// Fase 1 · Build del UI del POS para el escritorio.
// Exporta apps/pos como sitio estático (VIM_DESKTOP_EXPORT=1) y lo copia a desktop/pos-ui/.
// El main de Electron sirve esa carpeta offline. Correr: `npm run build:ui`.
import { spawn } from "node:child_process";
import { cp, rm, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const repoRoot = path.resolve(root, "..");
const outDir = path.join(repoRoot, "apps", "pos", "out");
const uiDir = path.join(root, "pos-ui");

const run = (cmd, args, opts) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts });
  p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} salió con código ${code}`))));
});

console.log("· Exportando el POS como sitio estático (VIM_DESKTOP_EXPORT=1)…");
await run("pnpm", ["--filter", "@vim/pos", "build"], { cwd: repoRoot, env: { ...process.env, VIM_DESKTOP_EXPORT: "1" } });

await access(outDir).catch(() => { throw new Error(`No se generó ${outDir}`); });
console.log("· Copiando out/ → desktop/pos-ui/…");
await rm(uiDir, { recursive: true, force: true });
await cp(outDir, uiDir, { recursive: true });
console.log("✅ UI del POS lista en desktop/pos-ui/. `npm start` la sirve offline.");
