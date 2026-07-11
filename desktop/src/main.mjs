// Fase 1/2/3 · Proceso main de Electron. Una sola app, dos roles:
//  • CAJA (por defecto): POS local-first — backend en la caja (Postgres embebido + PostgREST +
//    gateway) + UI del POS. Hace de HUB en la LAN. Fase 3: bandeja (no se apaga por accidente) +
//    watchdog (se auto-recupera) + respaldo del pgdata al cerrar y bajo demanda.
//  • COCINA (--role=cocina): pantalla de cocina como CLIENTE DELGADO del hub. SIN backend local.
import { app, BrowserWindow, Tray, Menu, nativeImage, clipboard } from "electron";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBackend } from "./backend.mjs";
import { startUiServer } from "./ui-server.mjs";
import { pullFromCloud } from "./sync-pull.mjs";
import { pushToCloud } from "./sync-push.mjs";
import { respaldar } from "./backup.mjs";
import { crearWatchdog } from "./watchdog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_PORT = 54360;       // UI del POS (caja)
const KDS_UI_PORT = 54361;   // UI de la cocina (cliente delgado)
const EMPAQUETADO = app.isPackaged;
const RES_DIR = EMPAQUETADO ? process.resourcesPath : null;
const UI_DIR = EMPAQUETADO ? path.join(process.resourcesPath, "pos-ui") : path.join(__dirname, "..", "pos-ui");
const KDS_UI_DIR = EMPAQUETADO ? path.join(process.resourcesPath, "kds-ui") : path.join(__dirname, "..", "kds-ui");
const TRAY_ICON = EMPAQUETADO ? path.join(process.resourcesPath, "tray.png") : path.join(__dirname, "..", "build", "tray.png");

// Rol de esta instancia. El acceso directo "VIM POS Cocina" pasa --role=cocina.
const ROL = process.argv.includes("--role=cocina") ? "cocina" : "caja";
const CONFIG_DIR = process.env.VIM_DATA_DIR || app.getPath("userData");
const HUB_CFG = path.join(CONFIG_DIR, "kds-hub.json");

let backend;
let uiServer;
let win;
let tray;
let watchdog;
let opcionesBackend = {};   // para poder re-arrancar el backend igual (watchdog / respaldo)
let backupsDir = null;
let saliendoDeVerdad = false; // distinguir "cerrar ventana" (→ bandeja) de "salir de verdad"
let respaldando = false;

// ── Config del hub (rol cocina) ──────────────────────────────────────────────
function leerHubUrl() {
  if (process.env.VIM_HUB_URL) return process.env.VIM_HUB_URL;
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

// ── Rol CAJA: POS local-first + hub de la LAN + endurecimiento (Fase 3) ──────
async function bootCaja() {
  const dataRoot = EMPAQUETADO ? (process.env.VIM_DATA_DIR || app.getPath("userData")) : (process.env.VIM_DATA_DIR || undefined);
  opcionesBackend = { log: (m) => console.log("· [backend]", m), resDir: RES_DIR ?? undefined, dataRoot };
  backend = await startBackend(opcionesBackend);
  backupsDir = path.join(backend.dataRoot, "backups");
  console.log(`· [backend] gateway local: ${backend.url}`);

  win = crearVentana([`--vim-url=${backend.url}`]);
  // Cerrar la ventana la MANDA A LA BANDEJA (no apaga la caja). Solo "Salir" (bandeja) o apagar la
  // PC la cierran de verdad → así nadie tumba el servidor del local sin querer.
  win.on("close", (e) => {
    if (!saliendoDeVerdad) { e.preventDefault(); win.hide(); }
  });

  let posUrl = process.env.VIM_POS_URL;
  if (!posUrl && existsSync(path.join(UI_DIR, "index.html"))) {
    uiServer = await startUiServer(UI_DIR, UI_PORT, backend.gatewayPort);
    posUrl = `http://localhost:${UI_PORT}`;
    console.log(`· [ui] POS servido offline desde ${posUrl} · KDS/2ª caja en la LAN: http://${backend.lanIp}:${UI_PORT}`);
  }
  posUrl = posUrl || "https://pos.vimpos.com.mx";
  await win.loadURL(posUrl);

  crearTray();
  // Watchdog: si Postgres/PostgREST se caen, reinicia el backend solo (auto-recuperación).
  watchdog = crearWatchdog({ url: backend.url, alReiniciar: reiniciarBackend, log: (m) => console.log("· [watchdog]", m) });

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
  win = crearVentana([]);
  await win.loadURL(`http://localhost:${KDS_UI_PORT}`);
}

async function boot() {
  if (ROL === "cocina") return bootCocina();
  return bootCaja();
}

/** Reinicia el backend conservando puertos (lo llama el watchdog al detectar caída). */
async function reiniciarBackend() {
  const prev = backend;
  backend = null;
  try { if (prev) await prev.stop(); } catch { /* */ }
  backend = await startBackend(opcionesBackend);
}

/** Respaldo bajo demanda: pausa el watchdog, detiene el backend (para copiar en frío), respalda
 *  y lo vuelve a levantar. Breve interrupción (~segundos); pensado para el fin de turno. */
async function respaldarAhora() {
  if (respaldando || !backend) return;
  respaldando = true;
  watchdog?.pausar();
  const dd = backend.dataDir;
  const bd = backupsDir || path.join(backend.dataRoot, "backups");
  try {
    const prev = backend; backend = null;
    await prev.stop();
    respaldar(dd, bd, 7, (m) => console.log("· [backup]", m));
    backend = await startBackend(opcionesBackend);
    console.log("· [backup] respaldo terminado; la caja está de vuelta en línea");
  } catch (e) {
    console.error("· [backup] error en respaldo bajo demanda:", e.message);
    if (!backend) { try { backend = await startBackend(opcionesBackend); } catch { /* */ } }
  } finally {
    watchdog?.reanudar();
    respaldando = false;
  }
}

/** Bandeja (solo caja): abrir, respaldar, salir. Evita que cerrar la ventana apague el servidor. */
function crearTray() {
  try {
    const img = nativeImage.createFromPath(TRAY_ICON);
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  } catch { return; }
  const ip = backend?.lanIp ?? "127.0.0.1";
  tray.setToolTip(`VIM POS — Caja (servidor del local). La cocina se conecta a ${ip}. No la cierres durante el servicio.`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `IP de esta caja (para la cocina): ${ip}`, enabled: false },
    { label: "Copiar IP", click: () => clipboard.writeText(ip) },
    { type: "separator" },
    { label: "Abrir caja", click: () => { if (win) { win.show(); win.focus(); } } },
    { label: "Respaldar ahora", click: () => respaldarAhora() },
    { type: "separator" },
    { label: "Salir (apaga la caja)", click: () => { saliendoDeVerdad = true; app.quit(); } },
  ]));
  tray.on("double-click", () => { if (win) { win.show(); win.focus(); } });
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
/** Apagado idempotente: watchdog + UI server + backend (Postgres/PostgREST) + RESPALDO al cerrar. */
async function cerrarTodo() {
  if (cerrando) return;
  cerrando = true;
  try { watchdog?.stop(); } catch { /* */ }
  try { if (uiServer) uiServer.close(); } catch { /* */ }
  try {
    if (backend) {
      const dd = backend.dataDir;
      const bd = backupsDir || path.join(backend.dataRoot, "backups");
      await backend.stop(); // Postgres detenido → el pgdata queda consistente para copiar en frío.
      if (dd && bd) respaldar(dd, bd, 7, (m) => console.log("· [backup]", m));
    }
  } catch (e) { console.error("· [backup] al cerrar:", e.message); }
  try { tray?.destroy(); } catch { /* */ }
}

// Instancia única SOLO para la caja (la que arranca Postgres). La cocina es cliente delgado.
if (ROL === "caja" && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) { win.show(); if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(boot).catch((e) => { console.error("Boot falló:", e); app.quit(); });
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) boot(); });
  // Con bandeja (caja), cerrar la ventana la oculta (no dispara esto). En cocina sí cierra la app.
  app.on("window-all-closed", async () => { await cerrarTodo(); app.quit(); });
  app.on("before-quit", (e) => {
    if (!cerrando) { e.preventDefault(); cerrarTodo().finally(() => app.exit(0)); }
  });
}
