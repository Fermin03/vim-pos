// Fase 1/2/3 · Proceso main de Electron. Una sola app, dos roles:
//  • CAJA (por defecto): POS local-first — backend en la caja (Postgres embebido + PostgREST +
//    gateway) + UI del POS. Hace de HUB en la LAN. Fase 3: bandeja (no se apaga por accidente) +
//    watchdog (se auto-recupera) + respaldo del pgdata diario (con la caja quieta), al cerrar y
//    bajo demanda.
//  • COCINA (--role=cocina): pantalla de cocina como CLIENTE DELGADO del hub. SIN backend local.
import { app, BrowserWindow, Tray, Menu, nativeImage, clipboard, Notification, dialog, shell, safeStorage, ipcMain, screen, powerMonitor, powerSaveBlocker } from "electron";
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, writeSync } from "node:fs";
import { inspect } from "node:util";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { startBackend } from "./backend.mjs";
import { startUiServer } from "./ui-server.mjs";
import { pullFromCloud } from "./sync-pull.mjs";
import { loginDispositivoNube } from "./dispositivo.mjs";
import { pushToCloud } from "./sync-push.mjs";
import { respaldar, respaldarAsync, hacerSitio } from "./backup.mjs";
import { crearGatewayDeEspera } from "./gateway.mjs";
import { crearRespaldoDiario, guardarEstado as guardarEstadoRespaldo, leerEstado as leerEstadoRespaldo, textoUltimoRespaldo } from "./respaldo-diario.mjs";
import { crearWatchdog } from "./watchdog.mjs";
import { conTope } from "./tope.mjs";
import { crearCicloSync, OMITIDO } from "./sync-ciclo.mjs";
import { crearSondeoCatalogo } from "./sondeo-catalogo.mjs";
import { crearAlmacenDirectivas, estadoDeVersion } from "./directivas.mjs";
import { pantallaDeLaCaja } from "./pantalla.mjs";
import { crearPantallaCliente } from "./pantalla-cliente.mjs";
import { sincronizarAnuncios, listarAnuncios, rutaDeAnuncio } from "./anuncios.mjs";
import { crearCoordinadorDePasadas } from "./pasada-unica.mjs";
import { crearEspejo } from "./delivery-espejo.mjs";
import { debeSondearApps } from "./delivery-espejo-modulo.mjs";
import { registrarErrorLocal, subirErrores } from "./sync-errores.mjs";
import { buscarActualizacion, descargarInstalador, nombreInstaladorTemporal } from "./updater.mjs";
import { poolVigente } from "./pool-vigente.mjs";
import { imprimirEnColaWindows, resumirImpresoras } from "./impresora-windows.mjs";
import { crearCacheCorta } from "./cache-corta.mjs";
import { origenesDe, navegacionPermitida, abrirFueraPermitido } from "./navegacion.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_PORT = 54360;       // UI del POS (caja)
const KDS_UI_PORT = 54361;   // UI de la cocina (cliente delgado)
const EMPAQUETADO = app.isPackaged;
const RES_DIR = EMPAQUETADO ? process.resourcesPath : null;
const UI_DIR = EMPAQUETADO ? path.join(process.resourcesPath, "pos-ui") : path.join(__dirname, "..", "pos-ui");
const KDS_UI_DIR = EMPAQUETADO ? path.join(process.resourcesPath, "kds-ui") : path.join(__dirname, "..", "kds-ui");
const TRAY_ICON = EMPAQUETADO ? path.join(process.resourcesPath, "tray.png") : path.join(__dirname, "..", "build", "tray.png");
// Icono de la ventana y de la barra de tareas. Se pone en caliente porque no depende de que
// electron-builder pueda editar los recursos del .exe (eso necesita winCodeSign, que en Windows
// exige Modo Desarrollador): aunque el archivo ejecutable quede con el icono por defecto, lo que
// el cajero ve mientras trabaja sale de aquí.
const APP_ICON = EMPAQUETADO ? path.join(process.resourcesPath, "icon.png") : path.join(__dirname, "..", "build", "icon.png");

// Rol de esta instancia. El acceso directo "VIM POS Cocina" pasa --role=cocina.
const ROL = process.argv.includes("--role=cocina") ? "cocina" : "caja";
const CONFIG_DIR = process.env.VIM_DATA_DIR || app.getPath("userData");
const HUB_CFG = path.join(CONFIG_DIR, "kds-hub.json");
// Credenciales de la nube de esta caja, guardadas al vincular el dispositivo. Antes solo se podían
// dar por variables de entorno, lo que hacía imposible dar de alta la caja de un cliente desde la
// interfaz (un restaurantero no define env vars). Ahora la pantalla de vinculación las persiste.
const NUBE_CFG = path.join(CONFIG_DIR, "nube.json");
// Copia local de las imágenes de los anuncios de la pantalla del cliente (anuncios.mjs).
const ANUNCIOS_DIR = path.join(CONFIG_DIR, "anuncios");
const LOG_PATH = path.join(CONFIG_DIR, "vim-pos.log");
// Lo que la nube dice que este negocio puede hacer (ADR 0014). En archivo y no en el Postgres
// local a propósito: tiene que estar disponible aunque el backend tarde en arrancar.
const directivas = crearAlmacenDirectivas({
  archivo: path.join(CONFIG_DIR, "directivas.json"),
  log: (m) => console.log("· [directivas]", m),
});

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
// Llave anon del proyecto: pública por diseño (viaja en el cliente de cualquier app Supabase; lo
// que protege los datos es RLS, no el secreto de esta llave). Va horneada para que dar de alta una
// caja no dependa de configurar nada en la máquina del cliente.
const CLOUD_ANON =
  process.env.VIM_CLOUD_ANON ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaWF4enZtc3Nqc3hkd3FydW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMzIsImV4cCI6MjA5NTgyOTIzMn0.OsfFcqw-jrj-qZtFkUPQCrLgYtnDmsOxC93iLJShpKs";

let backend;
let uiServer;
let win;
let tray;
let watchdog;
let pantallaCliente = null;   // segunda ventana, de cara al cliente (pantalla-cliente.mjs)
let opcionesBackend = {};   // para poder re-arrancar el backend igual (watchdog / respaldo)
let backupsDir = null;
let saliendoDeVerdad = false; // distinguir "cerrar ventana" (→ bandeja) de "salir de verdad"

// Salir desde el POS (botón de la barra inferior). Mismo camino que "Salir (apaga la caja)" de la
// bandeja: marcar la intención —si no, `close` solo esconde la ventana— y dejar que `before-quit`
// haga `cerrarTodo()`, que detiene sync, watchdog y ui-server, apaga Postgres y respalda en frío.
// Existía solo en la bandeja, que un cajero no conoce; la única salida que tenía a mano era la X,
// y esa no cierra nada.
ipcMain.handle("vim:salir", () => {
  saliendoDeVerdad = true;
  app.quit();
});
let arrancado = false;        // ya terminó el boot: después, un rechazo suelto no debe matar la caja
let respaldando = false;
let respaldoEnCurso = null;   // la promesa del respaldo con la caja encendida: salir la espera
let reinicioEnCurso = null;   // la promesa del reinicio del watchdog: salir la espera también
let vinculando = false;       // hay un PULL de vinculación escribiendo en la base local
let respaldoDiario = null;    // temporizador del respaldo diario (respaldo-diario.mjs)
// Última vez que alguien OPERÓ la caja (una escritura por el gateway). Arranca en "ahora": recién
// abierta la app, lo prudente es suponer que alguien está por usarla.
let ultimaActividad = Date.now();
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
// SEC CN-006 — la contraseña del dispositivo se guardaba en claro en nube.json. Con ella se puede
// llamar a sync-pull contra la nube, que devuelve el snapshot COMPLETO del tenant (incluidos los
// pin_hash de toda la plantilla), y a sync-push, que reescribe el histórico de ventas. Un equipo
// robado o un empleado con acceso al archivo bastaba.
// Ahora se cifra con safeStorage de Electron (DPAPI en Windows: ligado a la cuenta de usuario).
// Los archivos viejos en claro se leen igual y se reescriben cifrados al vuelo.
function leerNube() {
  const env = {
    cloudUrl: process.env.VIM_CLOUD_URL,
    anon: process.env.VIM_CLOUD_ANON,
    email: process.env.VIM_DEVICE_EMAIL,
    pass: process.env.VIM_DEVICE_PASS,
  };
  if (env.cloudUrl && env.anon && env.email && env.pass) return env;
  try {
    const crudo = readFileSync(NUBE_CFG);
    let texto = null;
    let enClaro = false;
    if (crudo.length > 0 && crudo[0] === 0x7b) {
      texto = crudo.toString("utf8"); // '{' → formato viejo sin cifrar
      enClaro = true;
    } else if (safeStorage.isEncryptionAvailable()) {
      texto = safeStorage.decryptString(crudo);
    } else {
      console.error("· [nube] hay credenciales cifradas pero el cifrado del sistema no está disponible.");
      return null;
    }
    const c = JSON.parse(texto);
    if (!c.email || !c.pass) return null;
    const cfg = { cloudUrl: c.cloudUrl || CLOUD_URL, anon: c.anon || CLOUD_ANON, email: c.email, pass: c.pass };
    // Migración silenciosa: si venía en claro, se reescribe cifrado en cuanto se lee.
    if (enClaro && safeStorage.isEncryptionAvailable()) {
      guardarNube(cfg);
      console.log("· [nube] credenciales migradas a almacenamiento cifrado");
    }
    return cfg;
  } catch { return null; }
}
/**
 * La nube aceptó esta caja con el correo del otro dominio (su cuenta se movió de
 * `dispositivos.vimpos.mx` a `dispositivos.vimpos.com.mx`, ver dispositivo.mjs): se guarda el
 * bueno para no gastar un intento rechazado en cada ciclo. Con credenciales del env no se toca
 * nada: esas las pone quien corre la prueba.
 */
function recordarCorreoNube(nube, email) {
  if (!email || email === nube.email || process.env.VIM_DEVICE_EMAIL) return;
  guardarNube({ cloudUrl: nube.cloudUrl, anon: nube.anon, email, pass: nube.pass });
  console.log(`· [nube] la cuenta de esta caja cambió de dominio; se guarda ${email}`);
}
function guardarNube({ cloudUrl, anon, email, pass }) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    const texto = JSON.stringify({ cloudUrl, anon, email, pass }, null, 2);
    if (safeStorage.isEncryptionAvailable()) {
      writeFileSync(NUBE_CFG, safeStorage.encryptString(texto), { mode: 0o600 });
    } else {
      // Degradación explícita: mejor que la caja funcione y quede constancia, a que no arranque.
      console.error("· [nube] cifrado del sistema NO disponible: las credenciales quedan en claro.");
      writeFileSync(NUBE_CFG, texto, { mode: 0o600 });
    }
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
    // Prueba también el otro dominio (dispositivo.mjs): quien vincula puede traer apuntado el
    // correo viejo de una cuenta que ya se movió, o al revés.
    const l = await loginDispositivoNube({ cloudUrl: CLOUD_URL, anon: CLOUD_ANON, email, pass: password });
    token = l.token;
    if (token) email = l.email;
    if (!token) {
      // La nube contestó y dijo que no: son las credenciales, no la red.
      return { ok: false, motivo: "CREDENCIALES", error: "La nube rechazó estas credenciales del dispositivo." };
    }
  } catch (e) {
    return { ok: false, motivo: "RED", error: `No se pudo contactar la nube de VIM: ${e?.message ?? "sin conexión"}` };
  }

  vinculando = true; // el respaldo diario no detiene la base a media bajada
  try {
    console.log("· [alta] credenciales válidas en la nube; bajando datos del negocio…");
    const r = await pullFromCloud(backend.pool, { cloudUrl: CLOUD_URL, anonKey: CLOUD_ANON, deviceToken: token }, (m) => console.log("· [alta]", m));
    guardarNube({ cloudUrl: CLOUD_URL, anon: CLOUD_ANON, email, pass: password });
    bajarAnuncios().catch(() => {}); // las imágenes de los anuncios, sin esperar
    const tablas = Object.keys(r ?? {}).length;
    console.log(`· [alta] OK: ${tablas} tablas sincronizadas; la caja ya puede vincularse.`);
    return { ok: true, tablas };
  } catch (e) {
    console.error("· [alta] falló la bajada de datos:", e.message);
    return { ok: false, motivo: "PULL", error: `Se validaron las credenciales, pero no se pudieron bajar los datos: ${e.message}` };
  } finally {
    vinculando = false;
  }
}

/** Bloquea ventanas nuevas y limita adónde puede navegar `w` (D9). La usan la caja y la pantalla del cliente. */
function protegerNavegacion(w, origenes = []) {
  const permitidos = origenesDe(origenes);
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (abrirFueraPermitido(url)) shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
  const frenar = (e, url) => {
    if (navegacionPermitida(url, permitidos)) return;
    e.preventDefault();
    console.log(`· [ventana] navegación bloqueada a ${url}`);
  };
  w.webContents.on("will-navigate", frenar);
  w.webContents.on("will-redirect", frenar);
}

/**
 * `origenes`: URLs a las que la ventana puede navegar (D9). Todo lo demás se bloquea; una ventana
 * nueva (window.open, target=_blank) nunca se abre dentro de la app: si es https se manda al
 * navegador del sistema, y si no, se descarta.
 */
function crearVentana(preloadArgs, origenes = []) {
  const w = new BrowserWindow({
    width: 1440, height: 900, backgroundColor: "#1a1a1e", show: false,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      // Endurecimiento (remediación Fase 4.1): contextIsolation:true aísla el mundo del preload del
      // de la página. La config se pasa por contextBridge (ver preload.cjs). nodeIntegration:false
      // ya evitaba node en el renderer; con isolation activado se cierra el anti-patrón de Electron.
      // sandbox:true (Auditoría integral 30/09/2026, D9): el preload solo usa contextBridge,
      // ipcRenderer y process.argv, que existen en el preload con sandbox. Sin sandbox, un fallo del
      // renderer tendría a mano un proceso con acceso a Node.
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      additionalArguments: preloadArgs,
    },
  });
  protegerNavegacion(w, origenes);
  w.once("ready-to-show", () => w.show());
  return w;
}

// ── Rol CAJA: POS local-first + hub de la LAN + endurecimiento (Fase 3) ──────
async function bootCaja() {
  const dataRoot = EMPAQUETADO ? (process.env.VIM_DATA_DIR || app.getPath("userData")) : (process.env.VIM_DATA_DIR || undefined);
  // `nube` va en las opciones (y no solo asignado después) para que CADA backend que se levante
  // —el del arranque, el del perro guardián, el del respaldo— lo tenga: D5.
  opcionesBackend = {
    log: (m) => console.log("· [backend]", m), resDir: RES_DIR ?? undefined, dataRoot,
    nube: (o) => tokenDeNubeCacheado(o),
    // En las opciones para que también lo tenga el backend que levantan el watchdog y el respaldo.
    alHaberActividad: () => { ultimaActividad = Date.now(); },
  };
  backend = await startBackend(opcionesBackend);
  backupsDir = path.join(backend.dataRoot, "backups");
  console.log(`· [backend] gateway local: ${backend.url}`);

  // Adónde puede navegar la ventana de la caja: el POS local (por localhost o 127.0.0.1), el POS de
  // desarrollo si se pidió con VIM_POS_URL, y el POS desplegado, que es el respaldo cuando no hay
  // pos-ui/ empaquetado (ver más abajo).
  const origenesCaja = [
    `http://localhost:${UI_PORT}`, `http://127.0.0.1:${UI_PORT}`,
    process.env.VIM_POS_URL, "https://pos.vimpos.com.mx",
  ];
  win = crearVentana([`--vim-url=${backend.url}`], origenesCaja);
  // Cerrar la ventana la MANDA A LA BANDEJA (no apaga la caja). Solo "Salir" (bandeja) o apagar la
  // PC la cierran de verdad → así nadie tumba el servidor del local sin querer.
  win.on("close", (e) => {
    if (!saliendoDeVerdad) { e.preventDefault(); win.hide(); }
  });
  // La pantalla del cliente sigue a la ventana de la caja: a la bandeja se cierra (y suelta el
  // bloqueo de suspensión), al volver reaparece, y si la caja se arrastra al otro monitor las dos
  // pantallas se intercambian. Pasa por el antirrebote del controlador, que no abre dos ventanas.
  for (const evento of ["hide", "show", "moved"]) win.on(evento, () => { try { pantallaCliente?.reevaluar(); } catch { /* */ } });

  let posUrl = process.env.VIM_POS_URL;
  if (!posUrl && existsSync(path.join(UI_DIR, "index.html"))) {
    uiServer = await startUiServer(UI_DIR, UI_PORT, backend.gatewayPort, "0.0.0.0", {
      onActualizar: () => buscarActualizacionManual(),
      // Con `impresoraWindows` el trabajo va a la cola del sistema (USB, serial…); si no, al 9100.
      onImprimir: (p) => (p?.impresoraWindows
        ? imprimirEnColaWindows({ nombre: p.impresoraWindows, datosB64: p.datosB64, soloConectar: p.soloConectar === true })
        : imprimirRaw(p)),
      onListarImpresoras: async () => resumirImpresoras(await win.webContents.getPrintersAsync()),
      onVincularNube: (p) => vincularConNube(p),
      estadoSync: () => ({ disponible: true, vinculada: leerNube() !== null, ...ciclo.estado() }),
      onFolios: () => consultarFolios(),
      onSincronizarCatalogo: () => bajarCatalogoAhora("botón"),
      avisoVisto: (id) => directivas.marcarVisto(id),
      pantallaCliente: () => pantallaCliente?.estado() ?? { disponible: false },
      onPantallaCliente: (cambio) => pantallaCliente?.configurar(cambio) ?? null,
      anuncios: () => listarAnuncios({ pool: backend?.pool, dir: ANUNCIOS_DIR }),
      archivoAnuncio: (nombre) => rutaDeAnuncio(ANUNCIOS_DIR, nombre),
      directivas: () => {
        const { directivas: d, recibidoIso } = directivas.leer();
        const ver = estadoDeVersion(d, app.getVersion());
        // El bloqueo por versión se resuelve AQUÍ, comparando con la versión instalada, y se
        // presenta en el mismo campo que la suspensión para que el POS no necesite dos caminos.
        // El `motivo` es lo único que los distingue: cambia el texto y añade el botón de instalar.
        const acceso = ver.bloqueaPorVersion
          ? { ...d.acceso, bloqueado: true, motivo: "version",
              mensaje: "Actualiza VIM POS para poder seguir vendiendo." }
          : d.acceso;
        // La versión instalada y si hay una más nueva, para que el POS pinte su banda de
        // "hay versión nueva" en la pantalla de inicio. La nube no sabe qué corre esta caja;
        // la notificación y el renglón de la bandeja solos no los veía nadie.
        const version = { ...(d.version ?? {}), instalada: app.getVersion(), hay_nueva: ver.hayNueva };
        return { disponible: true, recibido: recibidoIso, directivas: { ...d, acceso, version } };
      },
    });
    posUrl = `http://localhost:${UI_PORT}`;
    console.log(`· [ui] POS servido offline desde ${posUrl} · KDS/2ª caja en la LAN: http://${backend.lanIp}:${UI_PORT}`);
  }
  posUrl = posUrl || "https://pos.vimpos.com.mx";
  await win.loadURL(posUrl);

  crearTray();
  // Watchdog: si Postgres/PostgREST se caen, reinicia el backend solo (auto-recuperación).
  // Por 127.0.0.1 y no por «localhost»: el gateway escucha en IPv4 y así no depende de cómo
  // resuelva esa PC el nombre. VIM_WATCHDOG=0 lo apaga sin publicar otra versión (soporte).
  if (process.env.VIM_WATCHDOG === "0") {
    console.log("· [watchdog] apagado por VIM_WATCHDOG=0: el backend no se reinicia solo");
  } else {
    watchdog = crearWatchdog({
      url: `http://127.0.0.1:${backend.gatewayPort}`,
      alReiniciar: reiniciarBackend,
      log: (m) => console.log("· [watchdog]", m),
      // A la bitácora que VIM sí ve (errores_app → sube sola en el siguiente ciclo de sync).
      reportar: async (mensaje, contexto) => {
        if (!backend?.pool) return;
        await registrarErrorLocal(backend.pool, { mensaje, contexto: { ...contexto, rol: ROL }, version: app.getVersion() });
      },
    });
  }

  iniciarSync();
  iniciarRespaldoDiario();
  // Una caja que se apagó a media descarga de anuncios las completa sin esperar al siguiente pull.
  bajarAnuncios().catch(() => {});

  // Pantalla del cliente: se abre sola si hay un segundo monitor. Va DESPUÉS de cargar la caja
  // para que la ventana principal ya tenga su monitor decidido, y carga el mismo POS (mismo origen
  // que la caja: es lo que deja a las dos ventanas hablarse por BroadcastChannel).
  // Va también después de la bandeja, el watchdog, el sync y el respaldo, y dentro de un `try`: es
  // opcional, y un fallo aquí nunca debe impedir que arranque lo que sostiene la venta.
  try {
    pantallaCliente = crearPantallaCliente({
      screen, BrowserWindow, powerSaveBlocker,
      archivo: path.join(CONFIG_DIR, "pantalla-cliente.json"),
      url: `${posUrl.replace(/\/+$/, "")}/?cliente`,
      ventanaCaja: () => win,
      proteger: (w) => protegerNavegacion(w, origenesCaja),
      log: (m) => console.log("· [pantalla-cliente]", m),
    });
    pantallaCliente.iniciar();
  } catch (e) {
    console.error("· [pantalla-cliente] no se pudo iniciar:", e?.message ?? e);
  }
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
  win = crearVentana([], [`http://localhost:${KDS_UI_PORT}`, `http://127.0.0.1:${KDS_UI_PORT}`]);
  await win.loadURL(`http://localhost:${KDS_UI_PORT}`);
  revisarActualizacion().catch(() => {}); // la cocina también se actualiza (sin bandeja: notificación)
}

async function boot() {
  if (ROL === "cocina") return bootCocina();
  return bootCaja();
}

/**
 * Reinicia el backend conservando puertos (lo llama el watchdog al detectar caída).
 *
 * Uno a la vez, y nunca encima de un respaldo ni de la salida: los tres detienen y levantan el
 * mismo Postgres sobre el mismo pgdata, y dos a la vez se matan el uno al otro. La promesa en curso
 * se guarda para que salir de la app pueda esperarla (ver cerrarTodo).
 */
function reiniciarBackend() {
  if (reinicioEnCurso) return reinicioEnCurso;
  if (respaldando) return Promise.reject(new Error("hay un respaldo en curso; el respaldo vuelve a levantar el backend"));
  if (cerrando) return Promise.reject(new Error("la caja se está cerrando"));
  reinicioEnCurso = (async () => {
    console.log("· [watchdog] reiniciando el backend…");
    const prev = backend;
    backend = null;
    try { if (prev) await prev.stop(); } catch { /* */ }
    // Salir a medio reinicio: no se levanta nada que luego nadie apague.
    if (cerrando) throw new Error("la caja se está cerrando");
    backend = await startBackend(opcionesBackend);
    backend.nube = tokenDeNubeCacheado; // redundante con opcionesBackend.nube; explícito por D5
  })().finally(() => { reinicioEnCurso = null; });
  return reinicioEnCurso;
}

/** Anota el resultado de una copia en `ultimo-respaldo.json`. Así el respaldo diario, el manual y
 *  el de salir cuentan igual como "último respaldo" y ninguno hace una copia de más. */
function anotarRespaldo(bd, dest, ultimoMensaje) {
  const ahora = new Date().toISOString();
  if (dest) { guardarEstadoRespaldo(bd, { ultimoOk: ahora, ultimoError: null }); return { ok: true }; }
  const error = ultimoMensaje || "no se pudo copiar el pgdata";
  guardarEstadoRespaldo(bd, { ultimoFallo: ahora, ultimoError: error });
  return { ok: false, error };
}

/** Copia en frío SÍNCRONA + anotar. Solo al salir: la app ya se cierra y no hay nada que atender.
 *  Postgres DEBE estar detenido. */
function copiarYAnotar(dd, bd) {
  let ultimoMensaje = "";
  const dest = respaldar(dd, bd, 7, (m) => { ultimoMensaje = m; console.log("· [backup]", m); });
  return anotarRespaldo(bd, dest, ultimoMensaje);
}

/** Lo mismo sin bloquear el proceso: con la caja encendida, la bandeja, el IPC y el servidor del
 *  POS tienen que seguir contestando mientras se copia. Postgres DEBE estar detenido. */
async function copiarYAnotarAsync(dd, bd) {
  let ultimoMensaje = "";
  const dest = await respaldarAsync(dd, bd, 7, (m) => { ultimoMensaje = m; console.log("· [backup]", m); });
  return anotarRespaldo(bd, dest, ultimoMensaje);
}

/** Respaldo con la caja encendida. Lo usan "Respaldar ahora" de la bandeja —a criterio del cajero—
 *  y el respaldo diario, que solo lo llama con la caja quieta. Devuelve { ok, error?, causa? }.
 *  La promesa en curso se guarda: salir de la app la espera (ver cerrarTodo). */
function respaldarAhora() {
  if (respaldoEnCurso || respaldando) return Promise.resolve({ ok: false, error: "ya hay un respaldo en curso" });
  if (!backend || cerrando) return Promise.resolve({ ok: false, error: "la caja no está lista para respaldar" });
  respaldoEnCurso = hacerRespaldo().finally(() => { respaldoEnCurso = null; });
  return respaldoEnCurso;
}

/** Los pasos: ¿cabe? → pausar el watchdog → detener el backend → copiar en frío → levantarlo.
 *  NUNCA deja la caja sin backend: si algo falla, lo vuelve a levantar (salvo que la app se esté
 *  cerrando, que entonces ya no hace falta). */
async function hacerRespaldo() {
  respaldando = true;
  const dd = backend.dataDir;
  const bd = backupsDir || path.join(backend.dataRoot, "backups");
  const puerto = backend.gatewayPort;
  const log = (m) => console.log("· [backup]", m);
  let resultado = { ok: false, error: "no se pudo detener la base para copiarla" };
  let espera = null;
  /** Cierra el gateway de espera y libera el puerto para el backend de verdad. */
  const soltarPuerto = async () => {
    const e = espera; espera = null;
    if (e) await new Promise((r) => { try { e.close(() => r()); e.closeAllConnections?.(); } catch { r(); } });
  };
  // El watchdog se pausa YA, no después de medir el disco: en esa ventana podía dar su tercer
  // fallo y lanzar un reinicio a la vez que este respaldo (dos arranques sobre el mismo pgdata).
  watchdog?.pausar();
  try {
    // ANTES de tocar la base: si no cabe ni purgando respaldos viejos, no se detiene nada. Con el
    // disco lleno la caja se interrumpía cada hora para fallar con ENOSPC y no liberar nada.
    const sitio = await hacerSitio(dd, bd, { log });
    if (!sitio.cabe) {
      log(sitio.error);
      guardarEstadoRespaldo(bd, { ultimoFallo: new Date().toISOString(), ultimoError: sitio.error });
      return { ok: false, causa: "sin-espacio", error: sitio.error };
    }
    // Un reinicio del watchdog que ya venía en marcha dejó `backend` en null: se le espera.
    if (reinicioEnCurso) { try { await reinicioEnCurso; } catch { /* */ } }
    if (!backend) throw new Error("la caja no tiene el backend levantado; no hay base que copiar");
    log("deteniendo la base para copiarla…");
    const prev = backend; backend = null;
    const parada = await prev.stop();
    // La copia es EN FRÍO: con Postgres vivo saldría un respaldo inservible anotado como bueno.
    if (!parada?.postgresDetenido) throw new Error("no se pudo confirmar que Postgres se detuvo; no se copia");
    // Mientras la base está detenida, el puerto contesta "estoy respaldando; intenta en unos
    // segundos" en vez de quedar cerrado (que el POS lee como un fallo de red sin explicación).
    try {
      espera = crearGatewayDeEspera({ uiPorts: [UI_PORT, KDS_UI_PORT] });
      espera.on("error", () => { /* si el puerto no se deja tomar, se respalda igual */ });
      espera.listen(puerto, "0.0.0.0");
    } catch { espera = null; }
    resultado = await copiarYAnotarAsync(dd, bd);
  } catch (e) {
    console.error("· [backup] error en respaldo con la caja encendida:", e.message);
    resultado = { ok: false, error: e.message };
    guardarEstadoRespaldo(bd, { ultimoFallo: new Date().toISOString(), ultimoError: e.message });
  } finally {
    await soltarPuerto();
    // Salir a media copia: la base ya está detenida y cerrarTodo no tiene nada que apagar. Volver
    // a levantarla aquí dejaría un Postgres huérfano si la app termina antes de que arranque.
    if (!backend && !cerrando) {
      try {
        backend = await startBackend(opcionesBackend);
        backend.nube = tokenDeNubeCacheado; // D5
        log("la caja está de vuelta en línea");
      } catch (e) {
        console.error("· [backup] no se pudo levantar el backend tras el respaldo:", e.message);
        try { backend = await startBackend(opcionesBackend); backend.nube = tokenDeNubeCacheado; } catch { /* el watchdog lo reintenta */ }
      }
    }
    watchdog?.reanudar();
    respaldando = false;
    refrescarMenuTray();
  }
  return resultado;
}

/** El respaldo diario (respaldo-diario.mjs): una vez al día como mucho, y solo con la caja quieta
 *  —sin turno abierto, sin que nadie la haya operado en 10 minutos y sin teclado ni mouse en ese
 *  tiempo—. Nunca interrumpe un turno. */
function iniciarRespaldoDiario() {
  if (respaldoDiario) return;
  const bd = () => backupsDir || (backend ? path.join(backend.dataRoot, "backups") : null);
  respaldoDiario = crearRespaldoDiario({
    contexto: async () => {
      let turnoAbierto = null; // null = no se pudo saber → no se respalda
      try {
        const { rows } = await backend.pool.query("SELECT EXISTS (SELECT 1 FROM turnos WHERE estado = 'ABIERTO') AS abierto");
        turnoAbierto = rows[0]?.abierto === true;
      } catch { /* la base no contestó: se queda en null */ }
      // Teclado y mouse de ESTA computadora: el gateway solo ve escrituras, y un cajero puede
      // estar contando el fondo sin escribir nada. null si el sistema no lo sabe decir.
      let inactividadSistemaSeg = null;
      try { inactividadSistemaSeg = powerMonitor.getSystemIdleTime(); } catch { /* */ }
      return {
        turnoAbierto,
        ultimaActividad,
        inactividadSistemaSeg,
        // Todo lo que escribe en la base local: detenerla a media bajada dejaría el PULL a medias.
        ocupado: respaldando || cerrando || descargandoUpdate || !backend || vinculando
          || pullCatalogoEnCurso !== null || ciclo.estado().sincronizando === true,
      };
    },
    respaldar: () => respaldarAhora(),
    leerEstado: () => leerEstadoRespaldo(bd()),
    guardarEstado: (c) => guardarEstadoRespaldo(bd(), c),
    // A la bitácora que VIM sí ve (errores_app → sube sola en el siguiente ciclo de sync).
    reportar: async (mensaje, contexto) => {
      if (!backend?.pool) return;
      await registrarErrorLocal(backend.pool, { mensaje, contexto: { ...contexto, rol: ROL }, version: app.getVersion() });
    },
    alCambiar: () => refrescarMenuTray(),
    log: (m) => console.log("· [respaldo diario]", m),
  });
  respaldoDiario.iniciar();
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

/** Cuándo fue el último respaldo que sí terminó (para el renglón de la bandeja). */
function ultimoRespaldoOk() {
  const bd = backupsDir || (backend ? path.join(backend.dataRoot, "backups") : null);
  if (!bd) return null;
  try { return leerEstadoRespaldo(bd).ultimoOk; } catch { return null; }
}

/** (Re)construye el menú de la bandeja — incluye el ítem de actualización si hay una disponible. */
function refrescarMenuTray() {
  if (!tray) return;
  const ip = backend?.lanIp ?? "127.0.0.1";
  // La IP para la cocina ya está en el menú (clic derecho); el aviso al pasar el ratón es para el cajero.
  tray.setToolTip("VIM POS · Caja en servicio — no la cierres mientras atiendes");
  const items = [];
  if (updateInfo) items.push({ label: `⬇ Actualización v${updateInfo.version} — instalar`, click: () => ofrecerInstalar() }, { type: "separator" });
  items.push(
    { label: `IP de esta caja (para la cocina): ${ip}`, enabled: false },
    { label: "Copiar IP", click: () => clipboard.writeText(ip) },
    { type: "separator" },
    { label: "Abrir caja", click: () => { if (win) { win.show(); win.focus(); } } },
    { label: "Respaldar ahora", click: () => { respaldarAhora().catch(() => {}); } },
    { label: textoUltimoRespaldo(ultimoRespaldoOk()), enabled: false },
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
  try {
    // Dentro del try: una versión que no sea x.y.z lanza aquí (D10) y cae en el diálogo de error.
    const destino = path.join(app.getPath("temp"), nombreInstaladorTemporal(updateInfo.version));
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

/**
 * Sincroniza con la nube: PULL (referencia ↓) + PUSH (ventas ↑). Gated por env; best-effort.
 *
 * Devuelve true si el PUSH llegó a ejecutarse. El ciclo periódico lo usa para decidir si
 * reintenta antes de tiempo: sin este dato, un corte de red dejaba las ventas en tierra hasta
 * el siguiente arranque de la app y nadie se enteraba.
 *
 * `conPull` permite subir sin volver a bajar el catálogo. El PULL reescribe productos, precios
 * y permisos; hacerlo cada 10 minutos es churn innecesario sobre la base de una caja que está
 * cobrando, mientras que subir las ventas cuanto antes sí urge.
 */
/**
 * Token de nube del dispositivo: un login nuevo en cada llamada. Lo usan el latido (cada 10 min) y
 * `tokenDeNubeCacheado`. La consulta de folios lo pedía directo en cada petición; como /__folios
 * está abierto a la LAN sin autenticar, eso dejaba a cualquiera disparar logins contra Supabase
 * Auth (Auditoría integral 30/09/2026, D4): ahora va por el cacheado, con reintento ante un 401.
 *
 * `syncBestEffort` hace este mismo login y NO se refactorizó para usar esta función: allí cada
 * modo de fallo escribe su propio mensaje en el log —sin vincular, credenciales incompletas, login
 * rechazado— y esa granularidad es lo único que permitió diagnosticar la noche que el piloto
 * retuvo 27 ventas. Unificarlas ahorraría diez líneas y costaría el diagnóstico.
 */
async function tokenDeNube() {
  const nube = leerNube();
  if (!nube) return null;
  const { cloudUrl, anon, email, pass } = nube;
  if (!cloudUrl || !anon || !email || !pass) return null;
  try {
    const l = await loginDispositivoNube({ cloudUrl, anon, email, pass, timeoutMs: 10000 });
    if (!l.token) return null;
    recordarCorreoNube(nube, l.email);
    return { cloudUrl, anonKey: anon, deviceToken: l.token };
  } catch {
    return null;
  }
}

/**
 * Latido: le dice a la nube que esta caja está viva y recoge lo que debe obedecer.
 *
 * Se llama en CADA ciclo, aunque no haya nada que subir. Ese era el hueco que la migración 0073
 * dejó escrito: `ultima_conexion` solo se sellaba al subir ventas, así que una caja encendida en
 * un día flojo envejecía en el panel hasta parecer caída.
 *
 * Si falla, NO se toca lo guardado: la caja sigue con la última directiva conocida y sigue
 * vendiendo. Perder ventas por un corte de red sería peor que el problema que esto resuelve.
 */
async function latir() {
  const opts = await tokenDeNube();
  if (!opts) return;   // sin vincular: no hay a quién latir
  // Acuses de avisos que el cajero cerró desde el último latido (ADR 0014, entrega 3).
  const vistos = directivas.vistosPendientes();
  const r = await fetch(`${opts.cloudUrl}/functions/v1/caja-latido`, {
    method: "POST",
    headers: {
      apikey: opts.anonKey,
      Authorization: `Bearer ${opts.deviceToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: app.getVersion(),
      so: `${os.type()} ${os.release()}`,
      avisos_vistos: vistos,
      // Tamaño y escala de la pantalla de la caja (0121): el panel interno los enseña por caja,
      // para diseñar pensando en el monitor real de cada cliente. null si no se pudo leer.
      pantalla: pantallaDeLaCaja(screen, win),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`caja-latido HTTP ${r.status}`);
  const j = await r.json();
  if (j?.directivas) {
    directivas.guardar(j.directivas);
    // El módulo de apps de delivery puede haberse encendido o apagado desde el último latido:
    // reacciona en caliente, sin esperar a un reinicio de la caja.
    sincronizarEspejoConModulo(directivas.leer().directivas);
  }
  // Se limpian DESPUÉS de que la nube confirmó: si el latido falla, se reintentan en el siguiente.
  if (vistos.length > 0) directivas.limpiarVistos(vistos);

  // Si la nube recomienda una versión más nueva se revisa el feed YA, en vez de esperar al
  // chequeo horario: publicar desde el panel y que la caja tarde una hora en enterarse haría
  // que el panel pareciera roto. El flujo posterior es el de siempre (notificación + bandeja),
  // y el manifiesto se sigue leyendo del feed, que es quien trae el sha512 que se verifica.
  const ver = estadoDeVersion(directivas.leer().directivas, app.getVersion());
  if (ver.hayNueva && !updateInfo) revisarActualizacion().catch(() => {});
}

/**
 * Folios que le quedan al negocio, preguntados a la nube en el momento.
 *
 * `aplica:false` cuando la caja no está vinculada o el tenant no tiene fila de saldo: en ese caso
 * el POS no pinta el indicador, en vez de enseñar un cero que asustaría sin motivo a un negocio
 * que ni siquiera contrató facturación.
 */
// D4: /__folios no tiene autenticación y escucha en la LAN. Antes hacía un login a Supabase Auth
// por petición; ahora usa el token cacheado y la respuesta se guarda un minuto (cache-corta.mjs).
const cacheFolios = crearCacheCorta({ ttlMs: 60_000 });
function consultarFolios() {
  return cacheFolios.obtener(() => consultarFoliosNube());
}

async function consultarFoliosNube(reintento = false) {
  const opts = await tokenDeNubeCacheado({ forzar: reintento });
  if (!opts) return { ok: false, aplica: false };
  try {
    const r = await fetch(
      `${opts.cloudUrl}/rest/v1/tenant_folios_saldo?select=saldo_paquetes,folios_base_mensuales,folios_base_consumidos`,
      {
        headers: { apikey: opts.anonKey, Authorization: `Bearer ${opts.deviceToken}` },
        signal: AbortSignal.timeout(10000),
      },
    );
    // Token cacheado caducado: un solo reintento con login nuevo, no uno por petición.
    if (r.status === 401 && !reintento) return consultarFoliosNube(true);
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    // RLS acota la respuesta al tenant del dispositivo, así que viene una fila o ninguna.
    const [f] = await r.json();
    if (!f) return { ok: false, aplica: false };
    return {
      ok: true,
      aplica: true,
      paquetes: Number(f.saldo_paquetes ?? 0),
      base_restante: Number(f.folios_base_mensuales ?? 0) - Number(f.folios_base_consumidos ?? 0),
    };
  } catch (e) {
    return { ok: false, error: e?.message ?? "sin conexión" };
  }
}

async function syncBestEffort({ conPull = true } = {}) {
  // Del env o de lo persistido al vincular la caja (ver vincularConNube).
  const nube = leerNube();
  if (!nube) { console.log("· [sync] omitido (esta caja aún no se ha vinculado con la nube)"); return false; }
  const { cloudUrl, anon, email, pass } = nube;
  if (!cloudUrl || !anon || !email || !pass) { console.log("· [sync] omitido (configuración de nube incompleta)"); return false; }
  // El respaldo detiene el backend unos segundos y deja `backend` en null. Antes eso reventaba aquí
  // con un TypeError, contaba como fallo de la nube y disparaba el backoff. No es un fallo: se
  // omite y el ciclo vuelve a intentar en un minuto. El pool se toma UNA vez, para todo el ciclo.
  const pool = backend?.pool;
  if (!pool || respaldando) {
    // El motivo de VERDAD: durante horas este renglón culpó al respaldo de lo que era un reinicio
    // del watchdog que no terminaba (Knock-Out Obregón, 2 oct 2026).
    const porque = respaldando ? "la base local está detenida por el respaldo"
      : reinicioEnCurso ? "el backend local se está reiniciando"
      : "el backend local no está levantado";
    console.log(`· [sync] omitido (${porque})`);
    return OMITIDO;
  }
  try {
    const l = await loginDispositivoNube({ cloudUrl, anon, email, pass, timeoutMs: 30000 });
    if (!l.token) { console.log("· [sync] omitido (login de dispositivo en la nube falló)"); return false; }
    recordarCorreoNube(nube, l.email);
    const deviceToken = l.token;
    const opts = { cloudUrl, anonKey: anon, deviceToken };
    let pushOk = false;
    try {
      console.log("· [sync] PUSH: subiendo ventas offline…");
      const rs = await pushToCloud(pool, opts, (m) => console.log("· [sync]", m));
      console.log(`· [sync] PUSH OK: ${rs.subidos} ventas, ${rs.movimientos ?? 0} movimientos de inventario`);
      // La bitácora va DESPUÉS y en su propio try: si falla, las ventas ya se subieron y el
      // ciclo debe contarse como exitoso. Perder un reporte de error no justifica un reintento.
      try {
        await subirErrores(pool, opts, (m) => console.log("· [sync]", m));
      } catch (e) { console.log("· [sync] bitácora de errores omitida:", e.message); }
      pushOk = true;
    } catch (e) {
      console.log("· [sync] PUSH omitido:", e.message);
      // Un push que falla NO deja rastro en la nube: la RPC rechaza y no llega a registrar nada,
      // así que el panel no tiene qué mostrar y el único testimonio vive en este log, dentro de
      // la máquina del cliente. Así se perdió una noche entera en el piloto —27 ventas retenidas
      // 16 reintentos— hasta que alguien leyó el log a mano.
      //
      // La bitácora de errores sube por su propio camino (REST directo, no esta RPC), así que
      // este reporte sí llega aunque el push siga rechazado. Se intenta subirla en el acto: si el
      // problema persiste, esperar al próximo ciclo solo retrasa la noticia.
      try {
        await registrarErrorLocal(pool, {
          mensaje: `Sincronización rechazada: ${e.message}`,
          contexto: { fase: "push" },
          version: app.getVersion(),
        });
        await subirErrores(pool, opts, (m) => console.log("· [sync]", m));
      } catch (e2) { console.log("· [sync] no se pudo reportar el fallo:", e2.message); }
    }
    // PULL después del PUSH (ADR 0013): el agotado automático lo decide la nube al recibir los
    // movimientos; si el catálogo bajara antes, traería el estado viejo y lo pisaría hasta el
    // siguiente ciclo. La corrección por pendientes del pull protege las existencias si el push falló.
    if (conPull) {
      try {
        // La versión se lee ANTES de bajar: si el dueño guarda un producto mientras el snapshot
        // viaja, esa versión queda por delante de la que damos por vista y el sondeo vuelve a
        // bajar en un minuto. El error cae del lado de bajar de más, nunca de quedarse corto.
        const version = await leerVersionCatalogo(opts);
        console.log("· [sync] PULL: bajando rebanada del tenant…");
        const rp = await pullFromCloud(pool, opts, (m) => console.log("· [sync]", m));
        console.log(`· [sync] PULL OK: ${Object.keys(rp).length} tablas`);
        sondeo.marcarVista(version);
        await avisarCatalogoNuevo("sync");
      } catch (e) { console.log("· [sync] PULL omitido:", e.message); }
    }
    return pushOk;
  } catch (e) {
    console.log("· [sync] best-effort omitido:", e.message);
    return false;
  }
}

// ── El menú, al minuto ───────────────────────────────────────────────────────
// El catálogo bajaba 1 de cada 6 ciclos (≈1 h): un producto dado de alta en /admin no salía en la
// caja hasta esa hora, o hasta reiniciar la aplicación. Ahora se PREGUNTA cada minuto —una sola
// fecha, ver la migración 0109— y solo se baja cuando de verdad cambió algo. La política del
// sondeo (ritmo, backoff, no solaparse) vive en sondeo-catalogo.mjs, que se prueba sin Electron.

/**
 * Última fecha de cambio del menú del tenant, según la nube.
 *
 * `null` cuando la caja no está vinculada o la nube no contesta: el sondeo lo lee como "no hay
 * novedad" y se queda quieto, que es lo correcto — una caja sin nube no tiene menú nuevo que
 * bajar, y tratarlo como error la pondría a reintentar contra nada.
 *
 * Va por PostgREST y no por una Edge Function a propósito: es una lectura por caja por minuto, y
 * por ahí no cuesta ni invocación ni arranque en frío.
 */
async function leerVersionCatalogo(opts = null) {
  const o = opts ?? (await tokenDeNubeCacheado());
  if (!o) return null;
  try {
    const r = await fetch(`${o.cloudUrl}/rest/v1/rpc/catalogo_version`, {
      method: "POST",
      headers: {
        apikey: o.anonKey,
        Authorization: `Bearer ${o.deviceToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const v = await r.json();
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Le dice a las pantallas que el menú de esta caja cambió, para que lo recarguen sin reiniciar.
 *
 * El NOTIFY viaja por el mismo puente LISTEN→SSE del KDS (kds-stream.mjs), así que también llega
 * a la segunda caja y a la cocina en la LAN. Best-effort: que no se pueda avisar no puede tumbar
 * un PULL que ya se hizo bien — lo peor que pasa es que la pantalla se entere en su próxima carga.
 */
async function avisarCatalogoNuevo(motivo) {
  try {
    await backend?.pool?.query("SELECT pg_notify('vim_catalogo', $1)",
      [JSON.stringify({ motivo, at: Date.now() })]);
  } catch (e) {
    console.log("· [catálogo] no se pudo avisar a las pantallas:", e?.message ?? e);
  }
  // Los anuncios bajaron como lista; aquí se traen las imágenes que falten. Sin esperar: son un
  // adorno y no deben retrasar el aviso del menú.
  bajarAnuncios().catch(() => {});
}

/**
 * Una sola pasada a la vez: dos pulls seguidos no deben bajar la misma imagen dos veces. Pero un
 * pull que llega con una pasada en curso NO se descarta: pide una pasada más al terminar la actual
 * (pasada-unica.mjs), porque ese pull pudo traer anuncios que la pasada en curso ya no verá y,
 * descartado, esperarían un ciclo entero. Nunca lanza; quien llama no la espera.
 */
const bajarAnuncios = crearCoordinadorDePasadas(async () => {
  if (!backend?.pool) return;
  const r = await sincronizarAnuncios({ pool: backend.pool, dir: ANUNCIOS_DIR, cloudUrl: CLOUD_URL, log: (m) => console.log("· [anuncios]", m) });
  if (r.bajados || r.borrados || r.fallidos) console.log(`· [anuncios] ${r.bajados} bajados, ${r.borrados} borrados, ${r.fallidos} fallidos`);
});

/**
 * Baja el catálogo YA, sin esperar al ciclo. Lo usan el sondeo y el botón "Actualizar menú".
 *
 * NO sube ventas: un cambio de menú no tiene por qué arrastrar un push, que es la parte lenta y
 * la que puede fallar. Si el push está atorado, el menú se actualiza igual.
 */
let pullCatalogoEnCurso = null;
async function bajarCatalogoAhora(motivo = "sondeo", version = undefined) {
  // El sondeo no se solapa consigo mismo, pero el BOTÓN puede caer justo encima de él. Dos PULL a
  // la vez escriben las mismas filas y se quedan esperándose por los candados de Postgres, así
  // que quien llega tarde se cuelga del que ya va en camino en vez de abrir otro.
  if (pullCatalogoEnCurso) return pullCatalogoEnCurso;
  pullCatalogoEnCurso = (async () => bajarCatalogo(motivo, version))();
  try {
    return await pullCatalogoEnCurso;
  } finally {
    pullCatalogoEnCurso = null;
  }
}

async function bajarCatalogo(motivo, version) {
  const opts = await tokenDeNubeCacheado();
  if (!opts) { console.log("· [catálogo] omitido (caja sin vincular)"); return false; }
  if (!backend?.pool) { console.log("· [catálogo] omitido (el backend local aún no está listo)"); return false; }
  try {
    // El sondeo ya leyó la versión para decidir que había que bajar: la pasa y no se vuelve a
    // preguntar. El botón no la tiene, así que la lee aquí —siempre ANTES del PULL— para que el
    // sondeo no repita en un minuto lo que este PULL acaba de traer.
    const v = version === undefined ? await leerVersionCatalogo(opts) : version;
    const rp = await pullFromCloud(backend.pool, opts, (m) => console.log("· [catálogo]", m));
    console.log(`· [catálogo] actualizado desde la nube (${Object.keys(rp).length} tablas, por ${motivo})`);
    sondeo.marcarVista(v);
    await avisarCatalogoNuevo(motivo);
    return true;
  } catch (e) {
    console.log("· [catálogo] no se pudo bajar:", e?.message ?? e);
    return false;
  }
}

const sondeo = crearSondeoCatalogo({
  leerVersion: () => leerVersionCatalogo(),
  bajarCatalogo: (version) => bajarCatalogoAhora("sondeo", version),
  log: (m) => console.log("· [catálogo]", m),
});

// ── Ciclo de sincronización ──────────────────────────────────────────────────
// Antes solo se sincronizaba al arrancar la app. Un restaurante que no apaga la computadora
// —lo normal— no volvía a subir una venta en toda la semana: quedaban únicamente en el disco
// local, sin respaldo en la nube y sin aparecer en el panel del dueño.
// La política (ritmo, backoff, no solaparse, cada cuánto toca PULL) vive en sync-ciclo.mjs,
// que se puede probar sin Electron.
const ciclo = crearCicloSync({
  antesDeCadaCiclo: () => latir(),
  ejecutar: ({ conPull }) => syncBestEffort({ conPull }),
  log: (m) => console.log("· [sync]", m),
});

// ── Espejo de pedidos de apps (spec 2026-09-03) ────────────────────────────
// Token de dispositivo con caché corta para el gateway (puente de delivery-accion) y el agente.
let nubeCache = null;
async function tokenDeNubeCacheado({ forzar = false } = {}) {
  // `forzar`: quien recibió un 401 con el token cacheado pide uno nuevo (agente de espejo).
  if (!forzar && nubeCache && Date.now() - nubeCache.at < 20 * 60_000) return nubeCache.opts;
  const opts = await tokenDeNube();
  if (opts) nubeCache = { opts, at: Date.now() };
  return opts;
}
/** La caja de este dispositivo viene en su correo: caja-<uuid>@dispositivos.<dominio>. */
function cajaDeEstaCaja() {
  const email = leerNube()?.email ?? "";
  const m = /^caja-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i.exec(email);
  return m ? m[1].toLowerCase() : null;
}
let espejo = null;
// D6: el espejo vive más que un backend (el perro guardián y "Respaldar ahora" lo reinician y el
// pool viejo queda cerrado). Se le da un pool que resuelve SIEMPRE el del backend vigente.
const poolLocal = poolVigente(() => backend?.pool);
let arranqueSondeo = null;  // temporizador del arranque diferido del sondeo del menú

/** Arranca el ciclo: una sincronización completa ya, y de ahí en adelante cada 10 minutos.
 *  Y el espejo de pedidos de apps cada 10 s (solo si la caja está vinculada a la nube).
 *  Y el sondeo del menú cada minuto, para que un producto nuevo no espere a la hora. */
function iniciarSync() {
  ciclo.iniciar();
  // El sondeo arranca DESPUÉS del primer ciclo a propósito: ese ciclo ya baja el catálogo y deja
  // marcada la versión, así que el primer sondeo no repite el PULL. Un minuto de retraso en
  // arrancarlo no le cuesta nada a nadie y ahorra bajar el menú entero en cada arranque.
  // El handle se guarda para poder cancelarlo: sin eso, cerrar la caja en su primer minuto dejaba
  // este temporizador vivo y el sondeo arrancaba con la app ya apagándose.
  if (arranqueSondeo) clearTimeout(arranqueSondeo);
  arranqueSondeo = setTimeout(() => { arranqueSondeo = null; sondeo.iniciar(); }, 60_000);
  arranqueSondeo?.unref?.();
  if (backend) backend.nube = tokenDeNubeCacheado;
  const cajaId = cajaDeEstaCaja();
  // `efectivos` es lo que manda el latido (resolver_directivas no manda `permitidos`, eso es
  // cosa del admin). Sin latido guardado todavía, `directivas.leer()` devuelve DIRECTIVAS_VACIAS
  // (`modulos: {}`) y `debeSondearApps` responde `false`: el espejo NO arranca "por si acaso" al
  // primer arranque de la caja, que es justo el sondeo que esta entrega vino a quitar. El primer
  // latido decide, y de ahí en adelante manda `sincronizarEspejoConModulo`.
  const { directivas: d } = directivas.leer();
  if (backend?.pool && cajaId && debeSondearApps(d) && !espejo) {
    espejo = crearEspejo({ pool: poolLocal, nube: tokenDeNubeCacheado, cajaId, log: (m) => console.log("· [espejo]", m) });
    espejo.iniciar();
  } else if (!cajaId) {
    console.log("· [espejo] omitido (la caja no está vinculada a la nube)");
  } else if (!debeSondearApps(d)) {
    console.log("· [espejo] omitido (el cliente no tiene el módulo de apps de delivery)");
  }
}

/**
 * Reacciona a un cambio del módulo de apps de delivery tras un latido (ADR 0014, add-on de
 * delivery): si se apagó y hay espejo vivo, lo detiene; si se encendió y no lo hay, lo arranca.
 * Sin esto, apagar el módulo desde el panel no tendría efecto hasta que alguien reiniciara la
 * caja, y encenderlo tendría que esperar lo mismo — cuando lo que promete la entrega es que el
 * latido, cada 10 minutos, basta.
 */
function sincronizarEspejoConModulo(d) {
  const activo = debeSondearApps(d);
  if (!activo && espejo) {
    try { espejo.detener(); } catch { /* */ }
    espejo = null;
    console.log("· [espejo] detenido (el cliente apagó el módulo de apps de delivery)");
  } else if (activo && !espejo) {
    const cajaId = cajaDeEstaCaja();
    if (backend?.pool && cajaId) {
      espejo = crearEspejo({ pool: poolLocal, nube: tokenDeNubeCacheado, cajaId, log: (m) => console.log("· [espejo]", m) });
      espejo.iniciar();
      console.log("· [espejo] iniciado (el cliente encendió el módulo de apps de delivery)");
    }
  }
}

function detenerSync() {
  ciclo.detener();
  if (arranqueSondeo) { clearTimeout(arranqueSondeo); arranqueSondeo = null; }
  sondeo.detener();
  try { espejo?.detener(); } catch { /* */ }
  espejo = null;
}

let cerrando = false;
/** Apagado idempotente: watchdog + UI server + backend (Postgres/PostgREST) + RESPALDO al cerrar. */
async function cerrarTodo() {
  if (cerrando) return;
  cerrando = true;
  try { respaldoDiario?.detener(); } catch { /* */ }
  // Un respaldo a media marcha tiene el backend detenido (`backend` es null) y está por levantarlo:
  // salir sin esperarlo dejaba un Postgres huérfano, vivo sin nadie que lo apague. Se espera; al
  // ver `cerrando` ya no lo levanta.
  let recienRespaldado = false;
  try { watchdog?.stop(); } catch { /* */ } // antes que nada: que no arranque un reinicio ahora
  if (respaldoEnCurso) {
    try { recienRespaldado = (await respaldoEnCurso)?.ok === true; } catch { /* */ }
  }
  // Lo mismo con un reinicio del watchdog a media marcha: si ya está levantando, se le deja
  // terminar para poder apagar lo que levante; si aún no, al ver `cerrando` no levanta nada. Con
  // tope: salir no puede depender de un arranque que no acaba.
  if (reinicioEnCurso) {
    try { await conTope(reinicioEnCurso, 90_000, () => console.error("· [backup] al cerrar: el reinicio del backend no terminó; se sale igual")); } catch { /* */ }
  }
  try { pantallaCliente?.cerrar(); } catch { /* */ }
  try { detenerSync(); } catch { /* */ }
  try { if (uiServer) uiServer.close(); } catch { /* */ }
  try {
    if (backend) {
      const dd = backend.dataDir;
      const bd = backupsDir || path.join(backend.dataRoot, "backups");
      // Con Postgres detenido el pgdata queda consistente para copiar en frío. Si no se pudo
      // confirmar que se detuvo, no se copia: un respaldo en caliente no sirve.
      const parada = await backend.stop();
      if (!parada?.postgresDetenido) console.error("· [backup] al cerrar: no se pudo confirmar que Postgres se detuvo; no se copia");
      else if (dd && bd && !recienRespaldado) copiarYAnotar(dd, bd);
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
  // A la bitácora que VIM sí puede ver. El ruido benigno documentado se filtra dentro.
  if (backend?.pool) {
    registrarErrorLocal(backend.pool, {
      mensaje: causa?.message ?? String(causa ?? "(sin detalle)"),
      stack: causa?.stack ?? null,
      contexto: { origen: "unhandledRejection", rol: ROL },
      version: app.getVersion(),
    }).catch(() => {});
  }
});

// Lo mismo con las excepciones sin capturar. Sin este oyente Electron las enseña en un diálogo
// modal ENCIMA de la caja y no dejan rastro en el log. El caso que lo pidió: cuando Postgres muere,
// sus conexiones emiten 'error'; las conocidas ya tienen oyente (el pool y el LISTEN del KDS), pero
// una que se escape no debe taparle la pantalla al cajero justo cuando el watchdog va a recuperar
// la caja. El proceso sigue, igual que seguía tras el diálogo.
//
// Durante el ARRANQUE sí se avisa en pantalla, como hacía Electron: ahí una excepción suele dejar
// la caja sin abrir (p. ej. el puerto del POS ocupado), y sin diálogo no habría nada que reportar.
process.on("uncaughtException", (causa) => {
  console.error("Excepción no capturada:", causa ?? "(sin detalle)");
  if (!arrancado && esFalloDePermisos(causa)) falloElArranque(causa);
  else if (!arrancado) {
    try { dialog.showErrorBox("VIM POS: error al arrancar", `${causa?.message ?? causa}\n\nDetalle completo del arranque:\n${LOG_PATH}`); } catch { /* */ }
  }
  if (backend?.pool) {
    registrarErrorLocal(backend.pool, {
      mensaje: causa?.message ?? String(causa ?? "(sin detalle)"),
      stack: causa?.stack ?? null,
      contexto: { origen: "uncaughtException", rol: ROL },
      version: app.getVersion(),
    }).catch(() => {});
  }
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
