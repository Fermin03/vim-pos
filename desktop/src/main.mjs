// Fase 1/2 · Proceso main de Electron. Una sola app, dos roles:
//  • CAJA (por defecto): POS local-first — backend en la caja (Postgres embebido + PostgREST +
//    gateway) + UI del POS. Hace de HUB en la LAN.
//  • COCINA (--role=cocina): pantalla de cocina como CLIENTE DELGADO del hub. SIN backend local;
//    solo sirve el UI del KDS apuntándolo al gateway de la caja (por LAN). Config de la IP del hub
//    una sola vez (pantalla de setup). El instalador crea un acceso directo por rol.
import { app, BrowserWindow } from "electron";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBackend } from "./backend.mjs";
import { startUiServer } from "./ui-server.mjs";
import { pullFromCloud } from "./sync-pull.mjs";
import { pushToCloud } from "./sync-push.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_PORT = 54360;       // UI del POS (caja)
const KDS_UI_PORT = 54361;   // UI de la cocina (cliente delgado)
const EMPAQUETADO = app.isPackaged;
const RES_DIR = EMPAQUETADO ? process.resourcesPath : null;
const UI_DIR = EMPAQUETADO ? path.join(process.resourcesPath, "pos-ui") : path.join(__dirname, "..", "pos-ui");
const KDS_UI_DIR = EMPAQUETADO ? path.join(process.resourcesPath, "kds-ui") : path.join(__dirname, "..", "kds-ui");

// Rol de esta instancia. El acceso directo "VIM POS Cocina" pasa --role=cocina.
const ROL = process.argv.includes("--role=cocina") ? "cocina" : "caja";
// Dir escribible para la config del rol cocina (la IP del hub). En una PC normal userData sirve.
const CONFIG_DIR = process.env.VIM_DATA_DIR || app.getPath("userData");
const HUB_CFG = path.join(CONFIG_DIR, "kds-hub.json");

let backend;
let uiServer;
let win;

// ── Config del hub (rol cocina) ──────────────────────────────────────────────
function leerHubUrl() {
  if (process.env.VIM_HUB_URL) return process.env.VIM_HUB_URL; // override para dev/pruebas
  try { return JSON.parse(readFileSync(HUB_CFG, "utf8")).hubUrl || null; } catch { return null; }
}
function guardarHubUrl(url) {
  try { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(HUB_CFG, JSON.stringify({ hubUrl: url }, null, 2)); } catch { /* */ }
}

function crearVentana(preloadArgs) {
  const w = new BrowserWindow({
    width: 1440, height: 900, backgroundColor: "#1a1a1e", show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: false, nodeIntegration: false, sandbox: false,
      additionalArguments: preloadArgs,
    },
  });
  w.once("ready-to-show", () => w.show());
  return w;
}

// ── Rol CAJA: POS local-first + hub de la LAN ────────────────────────────────
async function bootCaja() {
  // Datos escribibles: userData por defecto. VIM_DATA_DIR reubica si el perfil está en un volumen
  // que no soporta los renames de Postgres (junction / carpeta redirigida) — initdb falla ahí.
  const dataRoot = EMPAQUETADO ? (process.env.VIM_DATA_DIR || app.getPath("userData")) : (process.env.VIM_DATA_DIR || undefined);
  backend = await startBackend({ log: (m) => console.log("· [backend]", m), resDir: RES_DIR ?? undefined, dataRoot });
  console.log(`· [backend] gateway local: ${backend.url}`);

  win = crearVentana([`--vim-url=${backend.url}`]);

  // Preferimos el UI empaquetado (pos-ui/) servido en localhost → UI 100% offline. Si no está,
  // cae a VIM_POS_URL (dev) o al dominio desplegado. Los DATOS siempre van al gateway local.
  let posUrl = process.env.VIM_POS_URL;
  if (!posUrl && existsSync(path.join(UI_DIR, "index.html"))) {
    uiServer = await startUiServer(UI_DIR, UI_PORT, backend.gatewayPort);
    posUrl = `http://localhost:${UI_PORT}`;
    console.log(`· [ui] POS servido offline desde ${posUrl} · KDS/2ª caja en la LAN: http://${backend.lanIp}:${UI_PORT}`);
  }
  posUrl = posUrl || "https://pos.vimpos.com.mx";
  await win.loadURL(posUrl);

  syncBestEffort().catch(() => {});
}

// ── Rol COCINA: cliente delgado del hub ──────────────────────────────────────
async function bootCocina() {
  if (!existsSync(path.join(KDS_UI_DIR, "index.html"))) {
    console.error("Falta kds-ui/ (corre `npm run build:kds-ui`).");
    app.quit();
    return;
  }
  const hub = leerHubUrl();
  uiServer = await startUiServer(KDS_UI_DIR, KDS_UI_PORT, 54350, "127.0.0.1", {
    kds: true,
    hub,
    onSetHub: (url) => { guardarHubUrl(url); console.log(`· [cocina] hub configurado: ${url}`); },
  });
  console.log(`· [cocina] UI de cocina en http://localhost:${KDS_UI_PORT} · hub: ${hub ?? "(sin configurar → setup)"}`);
  win = crearVentana([]); // sin --vim-url: el ui-server inyecta el gateway remoto del hub
  await win.loadURL(`http://localhost:${KDS_UI_PORT}`);
}

async function boot() {
  if (ROL === "cocina") return bootCocina();
  return bootCaja();
}

/** Sincroniza con la nube: PULL (referencia ↓) + PUSH (ventas ↑). Gated por env; best-effort. */
async function syncBestEffort() {
  const cloudUrl = process.env.VIM_CLOUD_URL;
  const anon = process.env.VIM_CLOUD_ANON;
  const email = process.env.VIM_DEVICE_EMAIL;
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

let cerrando = false;
/** Apagado idempotente: detiene UI server + backend (Postgres/PostgREST). Sin esto quedan huérfanos. */
async function cerrarTodo() {
  if (cerrando) return;
  cerrando = true;
  try { if (uiServer) uiServer.close(); } catch { /* */ }
  try { if (backend) await backend.stop(); } catch { /* */ }
}

// Instancia única SOLO para la caja (la que arranca Postgres — dos cajas corromperían el estado y
// chocarían en los puertos). La cocina es un cliente delgado sin backend: no toma el lock, así una
// caja y una cocina pueden convivir en la misma PC (dev / casos borde) sin bloquearse.
if (ROL === "caja" && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(boot).catch((e) => { console.error("Boot falló:", e); app.quit(); });
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) boot(); });
  app.on("window-all-closed", async () => { await cerrarTodo(); app.quit(); });
  app.on("before-quit", (e) => {
    if (!cerrando) { e.preventDefault(); cerrarTodo().finally(() => app.exit(0)); }
  });
}
