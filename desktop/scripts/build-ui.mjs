// Fase 1 · Build del UI del POS para el escritorio.
// Exporta apps/pos como sitio estático (VIM_DESKTOP_EXPORT=1) y lo copia a desktop/pos-ui/.
// El main de Electron sirve esa carpeta offline. Correr: `npm run build:ui`.
import { spawn } from "node:child_process";
import { cp, rm, access, readFile, writeFile } from "node:fs/promises";
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

// El export del escritorio hornea el endpoint del gateway LOCAL (puerto fijo 54350). Así el POS
// apunta a localhost sin depender de la inyección runtime del preload. process.env gana sobre
// .env.local en el orden de carga de Next, así que esto sobrescribe la URL de dev/nube.
console.log("· Exportando el POS como sitio estático (VIM_DESKTOP_EXPORT=1, endpoint local)…");
await run("pnpm", ["--filter", "@vim/pos", "build"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    VIM_DESKTOP_EXPORT: "1",
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54350",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon",
  },
});

await access(outDir).catch(() => { throw new Error(`No se generó ${outDir}`); });
console.log("· Copiando out/ → desktop/pos-ui/…");
await rm(uiDir, { recursive: true, force: true });
await cp(outDir, uiDir, { recursive: true });

// Sellar el service worker con la versión de la app: su caché pasa a llamarse
// "vimpos-shell-<versión>", y al activarse purga las de versiones anteriores. Sin esto el nombre
// era fijo y los chunks de todas las versiones se acumulaban en la caja para siempre.
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const swPath = path.join(uiDir, "sw.js");
try {
  const sw = await readFile(swPath, "utf8");
  await writeFile(swPath, sw.replaceAll("__VIM_SW_VERSION__", pkg.version));
  console.log(`· Service worker sellado con la versión ${pkg.version}.`);
} catch {
  console.warn("· Aviso: no se pudo sellar sw.js con la versión (la caché no se purgará por versión).");
}

console.log("✅ UI del POS lista en desktop/pos-ui/. `npm start` la sirve offline.");
