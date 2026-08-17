// Humo de la capa Electron: comprueba que TODAS las APIs que usa la caja siguen existiendo y
// funcionando en la versión instalada. Pensado para saltos de versión mayor, donde lo que se
// rompe no es la lógica sino una API que cambió de firma o desapareció.
//
//   npx electron src/verify-electron.mjs
//
// No levanta Postgres ni PostgREST a propósito: sus puertos son fijos (54329/54331) y un
// proceso huérfano de una prueba dejaría la caja de verdad sin poder arrancar.

import { app, BrowserWindow, Tray, Menu, nativeImage, clipboard, Notification, dialog, shell, safeStorage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let fallidas = 0;

// Asíncrona a propósito: varias comprobaciones esperan al renderer. Con una versión sólo
// síncrona, un fallo dentro de un `async` se convertía en promesa rechazada sin capturar y la
// prueba se imprimía como OK — validando nada.
async function prueba(nombre, fn) {
  try {
    const detalle = await fn();
    console.log(`  OK   ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  } catch (e) {
    fallidas++;
    console.error(`  FALLA ${nombre}: ${e?.message ?? e}`);
  }
}

app.whenReady().then(async () => {
  console.log(`Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`);
  console.log("APIs que usa la caja:");

  await prueba("app.getPath(userData/temp/exe)", () => {
    const u = app.getPath("userData");
    if (!u) throw new Error("userData vacío");
    app.getPath("temp"); app.getPath("exe");
    return u;
  });

  await prueba("app.isPackaged / requestSingleInstanceLock", () => {
    if (typeof app.isPackaged !== "boolean") throw new Error("isPackaged no es booleano");
    if (typeof app.requestSingleInstanceLock !== "function") throw new Error("falta requestSingleInstanceLock");
    return `isPackaged=${app.isPackaged}`;
  });

  let win;
  await prueba("BrowserWindow con contextIsolation + preload", () => {
    const preload = path.join(__dirname, "preload.cjs");
    if (!existsSync(preload)) throw new Error("no se encontró preload.cjs");
    win = new BrowserWindow({
      show: false,
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: false },
    });
    return "creada oculta";
  });

  await prueba("carga una página y ejecuta JS en ella", async () => {
    await win.loadURL("data:text/html,<h1 id=t>VIM</h1>");
    const t = await win.webContents.executeJavaScript("document.getElementById('t').textContent");
    if (t !== "VIM") throw new Error(`el DOM devolvió "${t}"`);
    return "el renderer responde";
  });

  await prueba("el preload expone los globals al mundo de la página", async () => {
    const v = await win.webContents.executeJavaScript("window.__VIM_DESKTOP === true && typeof window.__VIM_SUPABASE_URL === 'string'");
    if (v !== true) throw new Error("contextBridge no publicó __VIM_* en la página");
    return "contextBridge OK";
  });

  await prueba("nativeImage + Tray + Menu (systray de la caja)", () => {
    const icono = path.join(__dirname, "..", "build", "tray.png");
    if (!existsSync(icono)) throw new Error("falta build/tray.png");
    const img = nativeImage.createFromPath(icono);
    if (img.isEmpty()) throw new Error("el icono se leyó vacío");
    const tray = new Tray(img);
    tray.setContextMenu(Menu.buildFromTemplate([{ label: "Salir", click: () => {} }]));
    tray.destroy();
    return `${img.getSize().width}x${img.getSize().height}`;
  });

  await prueba("safeStorage (cifra la config de nube de la caja)", () => {
    const disponible = safeStorage.isEncryptionAvailable();
    if (!disponible) return "no disponible en este entorno (la app cae a texto plano)";
    const cifrado = safeStorage.encryptString("prueba-vim");
    const claro = safeStorage.decryptString(cifrado);
    if (claro !== "prueba-vim") throw new Error("el descifrado no coincide");
    return "cifra y descifra";
  });

  await prueba("clipboard", () => {
    clipboard.writeText("vim-pos-verify");
    if (clipboard.readText() !== "vim-pos-verify") throw new Error("no leyó lo que escribió");
    return "lee y escribe";
  });

  await prueba("Notification", () => `soportadas=${Notification.isSupported()}`);

  await prueba("dialog y shell siguen expuestos", () => {
    if (typeof dialog.showMessageBox !== "function") throw new Error("falta dialog.showMessageBox");
    if (typeof shell.openPath !== "function") throw new Error("falta shell.openPath");
    return "showMessageBox / openPath";
  });

  try { win?.destroy(); } catch { /* */ }
  console.log(fallidas === 0 ? "\nTodo OK" : `\n${fallidas} comprobación(es) fallaron`);
  app.exit(fallidas === 0 ? 0 : 1);
});
