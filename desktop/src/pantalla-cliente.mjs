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
  // Un monitor mal escrito solo pierde el monitor. Tirar también el `modo` volvía a encender una
  // pantalla que alguien había apagado a propósito.
  const displayId = Number.isFinite(crudo.displayId) ? crudo.displayId : null;
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

/** Reaperturas tras una muerte inesperada que se toleran dentro de `VENTANA_REAPERTURAS_MS`. */
export const MAX_REAPERTURAS = 5;
export const VENTANA_REAPERTURAS_MS = 60_000;

/**
 * Abre, mueve y cierra la ventana del cliente según los monitores conectados.
 *
 * Electron entra inyectado (`screen`, `BrowserWindow`, `powerSaveBlocker`) para poder probar las
 * decisiones sin un monitor de verdad; el reloj (`ahora`), para probar el tope de reaperturas sin
 * esperar un minuto.
 */
export function crearPantallaCliente({ screen, BrowserWindow, powerSaveBlocker, archivo, url, ventanaCaja, proteger, log = () => {}, esperaMs = 300, ahora = () => Date.now() }) {
  let config = leerConfig(archivo);
  let ventana = null;
  let destino = null;      // el display donde está abierta
  let bloqueo = null;      // id de powerSaveBlocker
  let pendiente = null;    // temporizador del antirrebote
  let cerrada = false;
  let reaperturas = [];    // cuándo se reabrió tras cada muerte inesperada (ver `trasMuerte`)

  /**
   * La caja está en la bandeja: su ventana existe pero no se ve. Minimizada cuenta como visible
   * (Windows la sigue reportando así), y sin ventana no se puede saber, así que no se asume oculta.
   *
   * La caja casi nunca se cierra de verdad: vive en la bandeja. Sin esta regla la pantalla del
   * cliente y su bloqueo de suspensión se quedaban arriba para siempre, y una cuenta abierta podía
   * seguir a la vista con la caja escondida.
   */
  function cajaOculta() {
    const caja = ventanaCaja?.();
    try { return !!caja && !caja.isDestroyed() && caja.isVisible() === false; } catch { return false; }
  }

  function idDeLaCaja() {
    const caja = ventanaCaja?.();
    try {
      if (caja && !caja.isDestroyed()) return screen.getDisplayMatching(caja.getBounds()).id;
    } catch { /* cae al principal */ }
    return screen.getPrimaryDisplay().id;
  }

  function soltarBloqueo() {
    if (bloqueo !== null) { try { powerSaveBlocker.stop(bloqueo); } catch { /* */ } bloqueo = null; }
  }

  function cerrarVentana() {
    const v = ventana;
    ventana = null;
    destino = null;
    soltarBloqueo();
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
          soltarBloqueo();
          trasMuerte();
        }
      });
      // Si el renderer muere, se vuelve a abrir: una pantalla negra frente al cliente no se arregla sola.
      v.webContents.on("render-process-gone", () => { if (ventana === v) { cerrarVentana(); trasMuerte(); } });
      // Una ventana que no cargó no se queda «abierta» con el bloqueo tomado: se cierra y se
      // reintenta con el mismo tope que cualquier otra muerte. Si ya no es la ventana vigente
      // (la cerramos nosotros a media carga), el rechazo no dice nada y se ignora.
      v.loadURL(url).catch((e) => {
        if (ventana !== v) return;
        log(`no cargó: ${e?.message ?? e}`);
        cerrarVentana();
        trasMuerte();
      });
      ventana = v;
      destino = display;
      try { bloqueo = powerSaveBlocker.start("prevent-display-sleep"); } catch (e) { log(`no se pudo bloquear pantalla: ${e?.message ?? e}`); bloqueo = null; }
      log(`abierta en el monitor ${display.id} (${b.width}×${b.height})`);
    } catch (e) {
      log(`error al abrir ventana: ${e?.message ?? e}`);
      if (v && !v.isDestroyed()) v.destroy();
      ventana = null;
      destino = null;
      soltarBloqueo();
    }
  }

  function evaluar() {
    if (cerrada) return;
    let elegido = null;
    try { elegido = elegirMonitor(screen.getAllDisplays(), idDeLaCaja(), config); } catch (e) { log(`no se pudieron leer los monitores: ${e?.message ?? e}`); }
    if (cajaOculta()) { if (ventana) { cerrarVentana(); log("cerrada: la caja está en la bandeja"); } return; }
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

  /**
   * La ventana murió sin que la cerráramos. Se reabre, pero no para siempre: una que muere nada más
   * abrir se recreaba cada 300 ms sin fin y llenaba `vim-pos.log`. Pasado el tope se deja en paz
   * hasta que algo cambie (`reevaluar`, `configurar`), que es cuando tiene sentido volver a probar.
   */
  function trasMuerte() {
    const t = ahora();
    reaperturas = reaperturas.filter((antes) => t - antes < VENTANA_REAPERTURAS_MS);
    if (reaperturas.length >= MAX_REAPERTURAS) {
      log(`se dejó de reabrir: murió ${MAX_REAPERTURAS + 1} veces en menos de un minuto. Se vuelve a intentar al cambiar los monitores, la caja o el ajuste.`);
      return;
    }
    reaperturas.push(t);
    programar();
  }

  /** Algo cambió afuera (monitores, la ventana de la caja): se evalúa de nuevo, con la cuenta de reaperturas en cero. */
  function reevaluar() {
    reaperturas = [];
    programar();
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
    iniciar() { for (const e of EVENTOS) screen.on(e, reevaluar); evaluar(); },
    evaluar,
    reevaluar,
    estado,
    configurar(cambio) {
      reaperturas = [];
      config = normalizarConfig(cambio);
      try { guardarConfig(archivo, config); } catch (e) { log(`no se pudo guardar la configuración: ${e?.message ?? e}`); }
      evaluar();
      return estado();
    },
    cerrar() {
      cerrada = true;
      clearTimeout(pendiente);
      for (const e of EVENTOS) { try { screen.removeListener(e, reevaluar); } catch { /* */ } }
      cerrarVentana();
    },
  };
}
