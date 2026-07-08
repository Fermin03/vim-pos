// Fase 1 · Proceso main de Electron — el POS de escritorio local-first.
// Arranca el backend local (Postgres embebido + PostgREST + gateway) y carga el POS,
// inyectándole el endpoint local. La caja opera 100% offline.
import { app, BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBackend } from "./backend.mjs";
import { startUiServer } from "./ui-server.mjs";
import { pullFromCloud } from "./sync-pull.mjs";
import { pushToCloud } from "./sync-push.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(__dirname, "..", "pos-ui");
const UI_PORT = 54360;
let backend;
let uiServer;
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

  // 3) Cargar el POS. Preferimos el UI empaquetado (desktop/pos-ui/, `npm run build:ui`) servido
  //    en localhost → UI 100% offline. Si no está, cae a VIM_POS_URL (dev) o al dominio desplegado.
  //    Los DATOS siempre van al gateway local.
  let posUrl = process.env.VIM_POS_URL;
  if (!posUrl && existsSync(path.join(UI_DIR, "index.html"))) {
    uiServer = await startUiServer(UI_DIR, UI_PORT);
    posUrl = `http://localhost:${UI_PORT}`;
    console.log(`· [ui] POS servido offline desde ${posUrl}`);
  }
  posUrl = posUrl || "https://pos.vimpos.com.mx";
  await win.loadURL(posUrl);

  // 4) Sync best-effort al arrancar (si hay red + credenciales). NO bloquea la operación:
  //    si falla u offline, la caja sigue con lo local. Ciclo completo: PULL baja referencia
  //    (catálogo/config/empleados), PUSH sube las ventas que se generaron offline.
  syncBestEffort().catch(() => {});
}

/** Sincroniza con la nube: PULL (referencia ↓) + PUSH (ventas ↑). Gated por env; best-effort. */
async function syncBestEffort() {
  const cloudUrl = process.env.VIM_CLOUD_URL;         // p.ej. https://<proj>.supabase.co
  const anon = process.env.VIM_CLOUD_ANON;
  const email = process.env.VIM_DEVICE_EMAIL;         // caja-<id>@dispositivos.vimpos.mx
  const pass = process.env.VIM_DEVICE_PASS;
  if (!cloudUrl || !anon || !email || !pass) { console.log("· [sync] omitido (sin credenciales de nube configuradas)"); return; }
  try {
    const r = await fetch(`${cloudUrl}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pass }),
    });
    const s = await r.json();
    if (!s.access_token) { console.log("· [sync] omitido (login de dispositivo en la nube falló)"); return; }
    const deviceToken = s.access_token;
    const opts = { cloudUrl, anonKey: anon, deviceToken };
    try {
      console.log("· [sync] PULL: bajando rebanada del tenant…");
      const rp = await pullFromCloud(backend.pool, opts, (m) => console.log("· [sync]", m));
      console.log(`· [sync] PULL OK: ${Object.keys(rp).length} tablas`);
    } catch (e) { console.log("· [sync] PULL omitido:", e.message); }
    try {
      console.log("· [sync] PUSH: subiendo ventas offline…");
      const rs = await pushToCloud(backend.pool, opts, (m) => console.log("· [sync]", m));
      console.log(`· [sync] PUSH OK: ${rs.subidos} ventas subidas`);
    } catch (e) { console.log("· [sync] PUSH omitido:", e.message); }
  } catch (e) {
    console.log("· [sync] best-effort omitido:", e.message);
  }
}

app.whenReady().then(boot).catch((e) => { console.error("Boot falló:", e); app.quit(); });

app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) boot(); });
app.on("window-all-closed", async () => {
  try { if (uiServer) uiServer.close(); if (backend) await backend.stop(); } finally { app.quit(); }
});
