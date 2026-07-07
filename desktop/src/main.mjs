// Fase 1 · Proceso main de Electron — el POS de escritorio local-first.
// Arranca el backend local (Postgres embebido + PostgREST + gateway) y carga el POS,
// inyectándole el endpoint local. La caja opera 100% offline.
import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBackend } from "./backend.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let backend;
let win;

async function boot() {
  // 1) Levantar el backend en la caja.
  backend = await startBackend({ log: (m) => console.log("· [backend]", m) });
  console.log(`· [backend] gateway local: ${backend.url}`);

  // 2) Ventana del POS. contextIsolation:false para que el preload inyecte el endpoint
  //    local en el window del POS (app de primera parte; se endurece en Fase 3).
  win = new BrowserWindow({
    width: 1440, height: 900, backgroundColor: "#0f0f12", show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: false, nodeIntegration: false, sandbox: false,
      additionalArguments: [`--vim-url=${backend.url}`],
    },
  });
  win.once("ready-to-show", () => win.show());

  // 3) Cargar el POS. En producción se sirve un build local empaquetado; en dev, VIM_POS_URL
  //    (dev server) o el dominio desplegado. Los DATOS siempre van al gateway local.
  const posUrl = process.env.VIM_POS_URL || "https://pos.vimpos.com.mx";
  await win.loadURL(posUrl);
}

app.whenReady().then(boot).catch((e) => { console.error("Boot falló:", e); app.quit(); });

app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) boot(); });
app.on("window-all-closed", async () => {
  try { if (backend) await backend.stop(); } finally { app.quit(); }
});
