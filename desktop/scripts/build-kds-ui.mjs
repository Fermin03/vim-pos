// Fase 2 · Build del UI de la COCINA (KDS) para el escritorio.
// Exporta apps/kds como sitio estático (VIM_DESKTOP_EXPORT=1) y lo copia a desktop/kds-ui/.
// El main de Electron (rol cocina) sirve esa carpeta apuntándola al gateway del hub. `npm run build:kds-ui`.
import { spawn } from "node:child_process";
import { cp, rm, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const repoRoot = path.resolve(root, "..");
const outDir = path.join(repoRoot, "apps", "kds", "out");
const uiDir = path.join(root, "kds-ui");

const run = (cmd, args, opts) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts });
  p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} salió con código ${code}`))));
});

// El endpoint del gateway lo inyecta el ui-server en runtime (URL del hub remoto), no se hornea:
// aquí solo se necesita un placeholder para que el build no falle (el @vim/kds-core ya trae fallback).
console.log("· Exportando la cocina (KDS) como sitio estático (VIM_DESKTOP_EXPORT=1)…");
await run("pnpm", ["--filter", "@vim/kds", "build"], {
  cwd: repoRoot,
  env: { ...process.env, VIM_DESKTOP_EXPORT: "1" },
});

await access(outDir).catch(() => { throw new Error(`No se generó ${outDir}`); });
console.log("· Copiando out/ → desktop/kds-ui/…");
await rm(uiDir, { recursive: true, force: true });
await cp(outDir, uiDir, { recursive: true });
console.log("✅ UI de la cocina lista en desktop/kds-ui/. `npm run start:cocina` la sirve.");
