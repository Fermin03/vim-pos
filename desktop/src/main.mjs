// Fase 1/2/3 · Proceso main de Electron. Una sola app, dos roles:
//  • CAJA (por defecto): POS local-first — backend en la caja (Postgres embebido + PostgREST +
//    gateway) + UI del POS. Hace de HUB en la LAN. Fase 3: bandeja (no se apaga por accidente) +
//    watchdog (se auto-recupera) + respaldo del pgdata al cerrar y bajo demanda.
//  • COCINA (--role=cocina): pantalla de cocina como CLIENTE DELGADO del hub. SIN backend local.
import { app, BrowserWindow, Tray, Menu, nativeImage, clipboard, Notification, dialog, shell } from "electron";
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, writeSync } from "node:fs";
import { inspect } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBackend } from "./backend.mjs";
import { startUiServer } from "./ui-server.mjs";
import { pullFromCloud } from "./sync-pull.mjs";
import { pushToCloud } from "./sync-push.mjs";
import { respaldar } from "./backup.mjs";
import { crearWatchdog } from "./watchdog.mjs";
import { buscarActualizacion, descargarInstalador } from "./updater.mjs";

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
// Credenciales de la nube de esta caja, guardadas al vincular el dispositivo. Antes solo se podían
// dar por variables de entorno, lo que hacía imposible dar de alta la caja de un cliente desde la
// interfaz (un restaurantero no define env vars). Ahora la pantalla de vinculación las persiste.
const NUBE_CFG = path.join(CONFIG_DIR, "nube.json");
const LOG_PATH = path.join(CONFIG_DIR, "vim-pos.log");

/**
 * Espeja console.log/error a un archivo. La app empaquetada no tiene consola: sin esto, un fallo
 * de arranque en la caja de un cliente no deja NINGÚN rastro (la ventana solo se cierra). Aprendido
 * a la mala: un EPERM al instalar en Program Files costó una tarde de diagnóstico a ciegas.
 */
function iniciarLog() {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    const fd = openSync(LOG_PATH, "a");
    const volcar = (nivel, args) => {
      const txt = args.map((a) => (typeof a === "string" ? a : inspect(a, { depth: 3 }))).join(" ");
      try { writeSync(fd, `[${new Date().toISOString()}] ${nivel} ${txt}\n`); } catch { /* */ }
    };
    for (const [nivel, orig] of [["INFO", console.log], ["ERROR", console.error]]) {
      console[nivel === "INFO" ? "log" : "error"] = (...a) => { try { orig(...a); } catch { /* */ } volcar(nivel, a); };
    }
    console.log(`=== VIM POS ${app.getVersion()} · rol ${ROL} · ${EMPAQUETADO ? "empaquetado" : "dev"} · ${process.platform} ===`);
    console.log(`ejecutable: ${app.getPath("exe")}`);
  } catch { /* si ni el log se puede escribir, seguimos: no es motivo para no arrancar */ }
}

// Auto-actualización (Opción B, sin firma): feed del manifiesto. Por defecto el bucket público de
// Supabase Storage del proyecto; se puede override con VIM_UPDATE_FEED.
const UPDATE_FEED = process.env.VIM_UPDATE_FEED || "https://pbiaxzvmssjsxdwqrumb.supabase.co/storage/v1/object/public/actualizaciones/latest.json";

// Nube de VIM: mismo proyecto que el feed de actualizaciones. La anon key es pública por diseño
// (la protege RLS) y debe hornearse en el build para que el cliente no teclee nada; si falta, la
// vinculación por nube lo dice con todas sus letras en vez de fallar en silencio.
const CLOUD_URL = process.env.VIM_CLOUD_URL || "https://pbiaxzvmssjsxdwqrumb.supabase.co";
const CLOUD_ANON = process.env.VIM_CLOUD_ANON || "";

let backend;
let uiServer;
let win;
let tray;
let watchdog;
let opcionesBackend = {};   // para poder re-arrancar el backend igual (watchdog / respaldo)
let backupsDir = null;
let saliendoDeVerdad = false; // distinguir "cerrar ventana" (→ bandeja) de "salir de verdad"
let arrancado = false;        // ya terminó el boot: después, un rechazo suelto no debe matar la caja
let respaldando = false;
let updateInfo = null;        // manifiesto de la actualización disponible (o null)
let descargandoUpdate = false;

// ── Config del hub (rol cocina) ──────────────────────────────────────────────
function leerHubUrl() {
  if (process.env.VIM_HUB_URL) return process.env.VIM_HUB_URL;
  try { return JSON.parse(readFileSync(HUB_CFG, "utf8")).hubUrl || null; } catch { return null; }
}
function guardarHubUrl(url) {
  try { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(HUB_CFG, JSON.stringify({ hubUrl: url }, null, 2)); } catch { /* */ }
}

// ── Credenciales de la nube de esta caja ─────────────────────────────────────
// El env manda (útil para pruebas y para el verify headless); si no, lo persistido al vincular.
function leerNube() {
  const env = {
    cloudUrl: process.env.VIM_CLOUD_URL,
    anon: process.env.VIM_CLOUD_ANON,
    email: process.env.VIM_DEVICE_EMAIL,
    pass: process.env.VIM_DEVICE_PASS,
  };
  if (env.cloudUrl && env.anon && env.email && env.pass) return env;
  try {
    const c = JSON.parse(readFileSync(NUBE_CFG, "utf8"));
    return c.email && c.pass ? { cloudUrl: c.cloudUrl || CLOUD_URL, anon: c.anon || CLOUD_ANON, email: c.email, pass: c.pass } : null;
  } catch { return null; }
}
function guardarNube({ cloudUrl, anon, email, pass }) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(NUBE_CFG, JSON.stringify({ cloudUrl, anon, email, pass }, null, 2));
  } catch (e) { console.error("No se pudieron guardar las credenciales de nube:", e.message); }
}

/**
 * Da de alta esta caja desde la nube: valida las credenciales del dispositivo contra el Supabase
 * de VIM y, si son buenas, baja la rebanada del tenant (catálogo, empleados+PIN, org y el propio
 * usuario-dispositivo) al Postgres local. Después de esto el login local de la pantalla de
 * vinculación ya encuentra al dispositivo. Es el puente que faltaba: las credenciales se crean en
 * el Admin de la nube, pero el POS valida contra su base local.
 */
async function vincularConNube({ email, password } = {}) {
  if (!email || !password) return { ok: false, motivo: "FALTAN_DATOS", error: "Faltan las credenciales del dispositivo." };
  if (!CLOUD_ANON) {
    return { ok: false, motivo: "SIN_CONFIG", error: "Esta instalación no trae la llave pública de la nube (VIM_CLOUD_ANON). Avisa a soporte de VIM." };
  }
  if (!backend?.pool) return { ok: false, motivo: "SIN_BACKEND", error: "El backend local no está listo." };

  let token;
  try {
    const r = await fetch(`${CLOUD_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: CLOUD_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15000),
    });
    const s = await r.json().catch(() => ({}));
    token = s.access_token;
    if (!token) {
      // La nube contestó y dijo que no: son las credenciales, no la red.
      return { ok: false, motivo: "CREDENCIALES", error: "La nube rechazó estas credenciales del dispositivo." };
    }
  } catch (e) {
    return { ok: false, motivo: "RED", error: `No se pudo contactar la nube de VIM: ${e?.message ?? "sin conexión"}` };
  }

  try {
    console.log("· [alta] credenciales válidas en la nube; bajando datos del negocio…");
    const r = await pullFromCloud(backend.pool, { cloudUrl: CLOUD_URL, anonKey: CLOUD_ANON, deviceToken: token }, (m) => console.log("· [alta]", m));
    guardarNube({ cloudUrl: CLOUD_URL, anon: CLOUD_ANON, email, pass: password });
    const tablas = Object.keys(r ?? {}).length;
    console.log(`· [alta] OK: ${tablas} tablas sincronizadas; la caja ya puede vincularse.`);
    return { ok: true, tablas };
  } catch (e) {
    console.error("· [alta] falló la bajada de datos:", e.message);
    return { ok: false, motivo: "PULL", error: `Se validaron las credenciales, pero no se pudieron bajar los datos: ${e.message}` };
  }
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
    uiServer = await startUiServer(UI_DIR, UI_PORT, backend.gatewayPort, "0.0.0.0", {
      onActualizar: () => buscarActualizacionManual(),
      onImprimir: (p) => imprimirRaw(p),
      onVincularNube: (p) => vincularConNube(p),
    });
    posUrl = `http://localhost:${UI_PORT}`;
    console.log(`· [ui] POS servido offline desde ${posUrl} · KDS/2ª caja en la LAN: http://${backend.lanIp}:${UI_PORT}`);
  }
  posUrl = posUrl || "https://pos.vimpos.com.mx";
  await win.loadURL(posUrl);

  crearTray();
  // Watchdog: si Postgres/PostgREST se caen, reinicia el backend solo (auto-recuperación).
  watchdog = crearWatchdog({ url: backend.url, alReiniciar: reiniciarBackend, log: (m) => console.log("· [watchdog]", m) });

  syncBestEffort().catch(() => {});
  revisarActualizacion().catch(() => {}); // best-effort, no bloquea
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
  revisarActualizacion().catch(() => {}); // la cocina también se actualiza (sin bandeja: notificación)
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
  tray.on("double-click", () => { if (win) { win.show(); win.focus(); } });
  refrescarMenuTray();
}

/** (Re)construye el menú de la bandeja — incluye el ítem de actualización si hay una disponible. */
function refrescarMenuTray() {
  if (!tray) return;
  const ip = backend?.lanIp ?? "127.0.0.1";
  tray.setToolTip(`VIM POS — Caja (servidor del local). La cocina se conecta a ${ip}. No la cierres durante el servicio.`);
  const items = [];
  if (updateInfo) items.push({ label: `⬇ Actualización v${updateInfo.version} — instalar`, click: () => ofrecerInstalar() }, { type: "separator" });
  items.push(
    { label: `IP de esta caja (para la cocina): ${ip}`, enabled: false },
    { label: "Copiar IP", click: () => clipboard.writeText(ip) },
    { type: "separator" },
    { label: "Abrir caja", click: () => { if (win) { win.show(); win.focus(); } } },
    { label: "Respaldar ahora", click: () => respaldarAhora() },
    { type: "separator" },
    { label: "Salir (apaga la caja)", click: () => { saliendoDeVerdad = true; app.quit(); } },
  );
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

/** Revisa el feed al arrancar (best-effort). Si hay versión nueva: notifica + ítem en la bandeja. */
async function revisarActualizacion() {
  try {
    const info = await buscarActualizacion(UPDATE_FEED, app.getVersion());
    if (!info.hay) { console.log(`· [update] al día (v${app.getVersion()})`); return; }
    updateInfo = info;
    console.log(`· [update] disponible v${info.version}`);
    refrescarMenuTray();
    if (Notification.isSupported()) {
      const n = new Notification({ title: "VIM POS — Actualización disponible", body: `Versión ${info.version}. Haz clic para instalar.` });
      n.on("click", () => ofrecerInstalar());
      n.show();
    }
  } catch (e) {
    console.log("· [update] chequeo omitido:", e.message);
  }
}

/** Relay de impresión RAW (ESC/POS por el puerto 9100). La UI arma los bytes y los manda al
 *  ui-server; aquí se abren al socket de la impresora y se escriben. `soloConectar` = prueba de
 *  alcance (abre y cierra sin escribir). Clasifica el fallo para que la UI diga la verdad:
 *  no se alcanza la impresora (OFFLINE) vs. otro error. */
async function imprimirRaw({ ip, puerto = 9100, datosB64 = "", soloConectar = false } = {}) {
  if (!ip) return { ok: false, motivo: "ERROR", error: "Falta la IP de la impresora." };
  const { Socket } = await import("node:net");
  return new Promise((resolve) => {
    const sock = new Socket();
    let resuelto = false;
    const fin = (r) => { if (resuelto) return; resuelto = true; try { sock.destroy(); } catch { /* */ } resolve(r); };
    sock.setTimeout(6000);
    sock.on("timeout", () => fin({ ok: false, motivo: "OFFLINE", error: "La impresora no respondió (timeout)." }));
    sock.on("error", (e) => fin({ ok: false, motivo: "OFFLINE", error: e?.message ?? "No se pudo conectar." }));
    sock.connect(puerto, ip, () => {
      if (soloConectar) return fin({ ok: true });
      const buf = Buffer.from(datosB64, "base64");
      sock.write(buf, () => {
        // Dar un instante a que la impresora drene antes de cerrar; si no, se corta el ticket.
        setTimeout(() => fin({ ok: true }), 350);
      });
    });
  });
}

/** Chequeo a petición del usuario (botón del menú del POS). A diferencia del automático, este SÍ
 *  informa el resultado: la UI necesita decir "ya estás al día" en vez de quedarse callada. Si hay
 *  versión nueva abre el mismo diálogo que la bandeja, pero contesta primero para que el botón deje
 *  de girar antes de que el modal bloquee la ventana. */
async function buscarActualizacionManual() {
  if (descargandoUpdate) return { estado: "descargando" };
  const info = await buscarActualizacion(UPDATE_FEED, app.getVersion());
  if (!info.hay) return { estado: "al-dia", version: app.getVersion() };
  updateInfo = info;
  refrescarMenuTray();
  setTimeout(() => { ofrecerInstalar().catch(() => {}); }, 150);
  return { estado: "hay", version: info.version, notas: info.notas ?? "" };
}

/** Descarga (verificando SHA-512), y en la app empaquetada cierra e instala. Datos se conservan. */
async function ofrecerInstalar() {
  if (!updateInfo || descargandoUpdate) return;
  const q = await dialog.showMessageBox(win ?? undefined, {
    type: "info", buttons: ["Descargar e instalar", "Después"], defaultId: 0, cancelId: 1,
    title: "Actualización disponible",
    message: `Hay una nueva versión: ${updateInfo.version}`,
    detail: (updateInfo.notas ? updateInfo.notas + "\n\n" : "") + "Se descargará (verificando su integridad) y luego VIM POS se cerrará para instalar. Tus datos se conservan.",
  });
  if (q.response !== 0) return;
  descargandoUpdate = true;
  const destino = path.join(app.getPath("temp"), `VIM-POS-Setup-${updateInfo.version}.exe`);
  try {
    if (win) win.setProgressBar(0.02);
    const { path: instalador } = await descargarInstalador(updateInfo.url, updateInfo.sha512, destino, (frac) => { if (win) win.setProgressBar(frac); });
    if (win) win.setProgressBar(-1);
    if (!app.isPackaged) {
      await dialog.showMessageBox(win ?? undefined, { type: "info", message: "Descargada y verificada (modo dev — no se instala)", detail: instalador });
      shell.showItemInFolder(instalador);
      descargandoUpdate = false;
      return;
    }
    const c = await dialog.showMessageBox(win ?? undefined, {
      type: "question", buttons: ["Instalar ahora", "Cancelar"], defaultId: 0, cancelId: 1,
      title: "Listo para instalar", message: `Actualización ${updateInfo.version} descargada y verificada.`,
      detail: "VIM POS se cerrará para instalar. Vuelve a abrirlo cuando termine.",
    });
    if (c.response !== 0) { descargandoUpdate = false; return; }
    await shell.openPath(instalador);       // lanza el instalador NSIS
    saliendoDeVerdad = true;
    setTimeout(() => app.quit(), 1200);     // en la caja, cerrarTodo respalda antes de salir
  } catch (e) {
    if (win) win.setProgressBar(-1);
    descargandoUpdate = false;
    console.error("· [update] error:", e.message);
    try { await dialog.showMessageBox(win ?? undefined, { type: "error", message: "No se pudo actualizar", detail: e.message }); } catch { /* */ }
  }
}

/** Sincroniza con la nube: PULL (referencia ↓) + PUSH (ventas ↑). Gated por env; best-effort. */
async function syncBestEffort() {
  // Del env o de lo persistido al vincular la caja (ver vincularConNube).
  const nube = leerNube();
  if (!nube) { console.log("· [sync] omitido (esta caja aún no se ha vinculado con la nube)"); return; }
  const { cloudUrl, anon, email, pass } = nube;
  if (!cloudUrl || !anon || !email || !pass) { console.log("· [sync] omitido (configuración de nube incompleta)"); return; }
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

/** Un arranque fallido tiene que DECIR por qué: antes solo parpadeaba una ventana y se cerraba,
 *  dejando al cajero (y a quien lo soporte) sin nada que reportar. */
function falloElArranque(causa) {
  const msg = causa instanceof Error ? causa.message : String(causa);
  console.error("Boot falló:", causa);
  // Permisos = casi siempre instalación en Program Files: el Postgres embebido ajusta el modo de
  // sus binarios al arrancar y ahí no puede escribir. Decirlo evita otra tarde de diagnóstico.
  const pista = /EPERM|EACCES|operation not permitted/i.test(msg)
    ? "Parece un problema de permisos.\n\nVIM POS debe instalarse en la carpeta que propone el instalador (dentro de tu usuario). Si está en \"Archivos de programa\" / \"Program Files\", desinstálalo y vuelve a instalarlo sin cambiar la carpeta.\n\n"
    : "";
  try {
    dialog.showErrorBox("VIM POS no pudo iniciar", `${pista}${msg}\n\nDetalle completo del arranque:\n${LOG_PATH}`);
  } catch { /* */ }
  app.quit();
}

iniciarLog();

/** ¿El rechazo es un problema de permisos? Es el único que justifica abortar el arranque: significa
 *  que la app no puede escribir donde está instalada (típicamente Program Files) y NADA va a
 *  funcionar. Ver falloElArranque, que además explica cómo resolverlo. */
function esFalloDePermisos(causa) {
  const msg = causa instanceof Error ? `${causa.message}\n${causa.stack ?? ""}` : String(causa ?? "");
  return /EPERM|EACCES|operation not permitted|access is denied/i.test(msg);
}

// Los rechazos sin manejar se REGISTRAN siempre (antes se perdían: la app empaquetada no tiene
// consola, y por eso el EPERM de Program Files era invisible). Pero NO se aborta el arranque por
// ellos: el backend produce ruido benigno —el hook de salida de embedded-postgres rechaza con
// "done is not a function" y a veces con undefined— y matar el boot por eso dejaba la caja sin
// abrir. Solo los fallos de permisos son fatales; el resto lo decide el catch del propio boot.
process.on("unhandledRejection", (causa) => {
  console.error("Rechazo no manejado:", causa ?? "(sin detalle)");
  if (!arrancado && esFalloDePermisos(causa)) falloElArranque(causa);
});

// Instancia única SOLO para la caja (la que arranca Postgres). La cocina es cliente delgado.
if (ROL === "caja" && !app.requestSingleInstanceLock()) {
  console.log("Ya hay otra instancia abierta: esta se cierra.");
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) { win.show(); if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(boot).then(() => { arrancado = true; }).catch(falloElArranque);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) boot(); });
  // Con bandeja (caja), cerrar la ventana la oculta (no dispara esto). En cocina sí cierra la app.
  app.on("window-all-closed", async () => { await cerrarTodo(); app.quit(); });
  app.on("before-quit", (e) => {
    if (!cerrando) { e.preventDefault(); cerrarTodo().finally(() => app.exit(0)); }
  });
}
