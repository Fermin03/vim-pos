// Pantalla del cliente: el segundo monitor, de cara al mostrador, que enseña la cuenta en captura.
//
// La caja la abre SOLA en cuanto hay un segundo monitor conectado: un restaurantero no va a entrar
// a un menú a elegir pantallas, y lo normal es que solo haya una candidata. La configuración local
// existe para los dos casos que la detección no puede adivinar: quien usa el segundo monitor para
// otra cosa (apagada) y quien tiene tres (cuál).
//
// Es local por la misma razón que la impresora: el hardware es de cada computadora.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const CONFIG_INICIAL = Object.freeze({ modo: "auto", displayId: null });

/** @returns {{ modo: "auto" | "apagada", displayId: number | null }} */
export function normalizarConfig(crudo) {
  if (!crudo || typeof crudo !== "object") return { ...CONFIG_INICIAL };
  if (crudo.modo !== "auto" && crudo.modo !== "apagada") return { ...CONFIG_INICIAL };
  const displayId = Number.isFinite(crudo.displayId) ? crudo.displayId : null;
  if (crudo.displayId != null && displayId === null) return { ...CONFIG_INICIAL };
  return { modo: crudo.modo, displayId };
}

export function leerConfig(archivo) {
  try { return normalizarConfig(JSON.parse(readFileSync(archivo, "utf8"))); } catch { return { ...CONFIG_INICIAL }; }
}

export function guardarConfig(archivo, config) {
  mkdirSync(path.dirname(archivo), { recursive: true });
  writeFileSync(archivo, JSON.stringify(normalizarConfig(config), null, 2));
}

/**
 * El monitor donde va la pantalla del cliente, o null si no debe abrirse. Función PURA.
 * El de la caja nunca es candidato: taparle la venta al cajero es peor que no tener pantalla.
 */
export function elegirMonitor(monitores, idCaja, config) {
  if (config.modo === "apagada") return null;
  const otros = monitores.filter((m) => m.id !== idCaja);
  if (otros.length === 0) return null;
  return otros.find((m) => m.id === config.displayId) ?? otros[0];
}

const EVENTOS = ["display-added", "display-removed", "display-metrics-changed"];

const mismos = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/**
 * Abre, mueve y cierra la ventana del cliente según los monitores conectados.
 *
 * Electron entra inyectado (`screen`, `BrowserWindow`, `powerSaveBlocker`) para poder probar las
 * decisiones sin un monitor de verdad.
 */
export function crearPantallaCliente({ screen, BrowserWindow, powerSaveBlocker, archivo, url, ventanaCaja, proteger, log = () => {}, esperaMs = 300 }) {
  let config = leerConfig(archivo);
  let ventana = null;
  let destino = null;      // el display donde está abierta
  let bloqueo = null;      // id de powerSaveBlocker
  let pendiente = null;    // temporizador del antirrebote
  let cerrada = false;

  function idDeLaCaja() {
    const caja = ventanaCaja?.();
    try {
      if (caja && !caja.isDestroyed()) return screen.getDisplayMatching(caja.getBounds()).id;
    } catch { /* cae al principal */ }
    return screen.getPrimaryDisplay().id;
  }

  function cerrarVentana() {
    const v = ventana;
    ventana = null;
    destino = null;
    if (bloqueo !== null) { try { powerSaveBlocker.stop(bloqueo); } catch { /* */ } bloqueo = null; }
    if (v && !v.isDestroyed()) v.destroy();
  }

  function abrir(display) {
    let v = null;
    try {
      const b = display.bounds;
      v = new BrowserWindow({
        x: b.x, y: b.y, width: b.width, height: b.height,
        frame: false, fullscreen: true, show: false, backgroundColor: "#16161a",
        // El teclado y el lector de códigos son de la caja: esta ventana nunca recibe el foco, y por
        // eso tampoco se puede cerrar con Alt+F4 ni perder con Alt+Tab.
        focusable: false, skipTaskbar: true, autoHideMenuBar: true,
        // Sin preload a propósito: el preload expone `__VIM_SALIR`, y la pantalla que mira el cliente
        // no debe poder apagar la caja. La configuración la inyecta el ui-server en el HTML.
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      v.setMenuBarVisibility(false);
      proteger?.(v);
      v.once("ready-to-show", () => v.showInactive());
      v.on("closed", () => {
        // Un cierre inesperado: no fue nuestro cerrarVentana
        if (ventana === v) {
          ventana = null;
          destino = null;
          if (bloqueo !== null) { try { powerSaveBlocker.stop(bloqueo); } catch { /* */ } bloqueo = null; }
          programar();
        }
      });
      // Si el renderer muere, se vuelve a abrir: una pantalla negra frente al cliente no se arregla sola.
      v.webContents.on("render-process-gone", () => { if (ventana === v) { cerrarVentana(); programar(); } });
      v.loadURL(url).catch((e) => log(`no cargó: ${e?.message ?? e}`));
      ventana = v;
      destino = display;
      try { bloqueo = powerSaveBlocker.start("prevent-display-sleep"); } catch (e) { log(`no se pudo bloquear pantalla: ${e?.message ?? e}`); bloqueo = null; }
      log(`abierta en el monitor ${display.id} (${b.width}×${b.height})`);
    } catch (e) {
      log(`error al abrir ventana: ${e?.message ?? e}`);
      if (v && !v.isDestroyed()) v.destroy();
      ventana = null;
      destino = null;
      bloqueo = null;
    }
  }

  function evaluar() {
    if (cerrada) return;
    let elegido = null;
    try { elegido = elegirMonitor(screen.getAllDisplays(), idDeLaCaja(), config); } catch (e) { log(`no se pudieron leer los monitores: ${e?.message ?? e}`); }
    if (!elegido) { if (ventana) { cerrarVentana(); log("cerrada: no hay segundo monitor o está apagada"); } return; }
    if (ventana && !ventana.isDestroyed() && destino?.id === elegido.id && mismos(destino.bounds, elegido.bounds)) return;
    cerrarVentana();
    abrir(elegido);
  }

  // Windows dispara estos eventos en ráfaga al conectar un monitor; se espera a que se asiente.
  function programar() {
    if (cerrada) return;
    if (esperaMs <= 0) return evaluar();
    clearTimeout(pendiente);
    pendiente = setTimeout(evaluar, esperaMs);
  }

  function estado() {
    let monitores = [];
    try {
      const caja = idDeLaCaja();
      monitores = screen.getAllDisplays().map((d, i) => ({
        id: d.id, etiqueta: d.label || `Monitor ${i + 1}`, ancho: d.bounds.width, alto: d.bounds.height, esDeLaCaja: d.id === caja,
      }));
    } catch { /* sin monitores legibles: lista vacía */ }
    return { disponible: true, modo: config.modo, displayId: config.displayId, abierta: !!ventana && !ventana.isDestroyed(), monitores };
  }

  return {
    iniciar() { for (const e of EVENTOS) screen.on(e, programar); evaluar(); },
    evaluar,
    estado,
    configurar(cambio) {
      config = normalizarConfig(cambio);
      try { guardarConfig(archivo, config); } catch (e) { log(`no se pudo guardar la configuración: ${e?.message ?? e}`); }
      evaluar();
      return estado();
    },
    cerrar() {
      cerrada = true;
      clearTimeout(pendiente);
      for (const e of EVENTOS) { try { screen.removeListener(e, programar); } catch { /* */ } }
      cerrarVentana();
    },
  };
}
