import { test, mock } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { rmSync, writeFileSync } from "node:fs";
import { CONFIG_INICIAL, normalizarConfig, leerConfig, guardarConfig, elegirMonitor, crearPantallaCliente } from "./pantalla-cliente.mjs";

const A = { id: 1 }, B = { id: 2 }, C = { id: 3 };

test("con un solo monitor no hay pantalla del cliente", () => {
  assert.equal(elegirMonitor([A], 1, CONFIG_INICIAL), null);
});

test("con dos monitores toma el que no es el de la caja, sin configurar nada", () => {
  assert.equal(elegirMonitor([A, B], 1, CONFIG_INICIAL), B);
  assert.equal(elegirMonitor([A, B], 2, CONFIG_INICIAL), A);
});

test("con tres respeta el monitor elegido", () => {
  assert.equal(elegirMonitor([A, B, C], 1, { modo: "auto", displayId: 3 }), C);
});

test("si el elegido se desconectó, cae al primero disponible", () => {
  assert.equal(elegirMonitor([A, B], 1, { modo: "auto", displayId: 3 }), B);
});

test("nunca elige el monitor de la caja aunque esté configurado", () => {
  assert.equal(elegirMonitor([A, B], 1, { modo: "auto", displayId: 1 }), B);
});

test("apagada no abre nada aunque haya monitor", () => {
  assert.equal(elegirMonitor([A, B], 1, { modo: "apagada", displayId: null }), null);
});

test("una configuración rota se lee como la inicial", () => {
  assert.deepEqual(normalizarConfig(null), CONFIG_INICIAL);
  assert.deepEqual(normalizarConfig({ modo: "kiosco", displayId: "2" }), CONFIG_INICIAL);
  assert.deepEqual(normalizarConfig({ modo: "apagada", displayId: 7 }), { modo: "apagada", displayId: 7 });
});

test("guarda y vuelve a leer; sin archivo o con basura da la inicial", () => {
  const archivo = path.join(os.tmpdir(), `vim-pc-${process.pid}-${Date.now()}.json`);
  try {
    assert.deepEqual(leerConfig(archivo), CONFIG_INICIAL);
    guardarConfig(archivo, { modo: "apagada", displayId: 5 });
    assert.deepEqual(leerConfig(archivo), { modo: "apagada", displayId: 5 });
    writeFileSync(archivo, "{no es json");
    assert.deepEqual(leerConfig(archivo), CONFIG_INICIAL);
  } finally {
    rmSync(archivo, { force: true });
  }
});

/** Electron de mentira: lo justo para ver qué ventana se abre, dónde y con qué opciones. */
function electronFalso(lista, idCaja) {
  const creadas = [];
  const oyentes = {};
  class Ventana {
    constructor(o) { this.o = o; this.destruida = false; this.ev = {}; this.webContentsHandlers = {}; creadas.push(this); }
    webContents = { on: () => {} };
    once(e, f) { this.ev[e] = f; if (e === "ready-to-show") { f(); } }
    on(e, f) { this.ev[e] = f; }
    loadURL(u) { this.url = u; return Promise.resolve(); }
    setMenuBarVisibility() {}
    showInactive() { this.mostrada = true; }
    isDestroyed() { return this.destruida; }
    destroy() { this.destruida = true; this.ev.closed?.(); }
  }
  // Enganchar webContents.on para capturar handlers
  const OriginalVentana = Ventana;
  class VentanaConHandlers extends OriginalVentana {
    constructor(o) {
      super(o);
      this.webContents = { on: (e, f) => { this.webContentsHandlers[e] = f; } };
    }
  }
  const estado = { lista, idCaja, bloqueos: 0 };
  const screen = {
    getAllDisplays: () => estado.lista,
    getDisplayMatching: () => estado.lista.find((d) => d.id === estado.idCaja),
    getPrimaryDisplay: () => estado.lista[0],
    on: (e, f) => { oyentes[e] = f; },
    removeListener: (e) => { delete oyentes[e]; },
  };
  const powerSaveBlocker = { start: () => { estado.bloqueos++; return estado.bloqueos; }, stop: () => { estado.bloqueos--; }, isStarted: () => true };
  const caja = { isDestroyed: () => false, getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }) };
  return { creadas, oyentes, estado, screen, powerSaveBlocker, BrowserWindow: VentanaConHandlers, ventanaCaja: () => caja };
}

const D1 = { id: 1, label: "", bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
const D2 = { id: 2, label: "HDMI", bounds: { x: 1920, y: 0, width: 1024, height: 768 } };

function montar(lista, idCaja = 1) {
  const f = electronFalso(lista, idCaja);
  const archivo = path.join(os.tmpdir(), `vim-pc-ctl-${process.pid}-${Math.random()}.json`);
  const pc = crearPantallaCliente({ ...f, archivo, url: "http://localhost:54360/?cliente", esperaMs: 0 });
  return { ...f, pc, archivo };
}

test("con dos monitores abre sola, sin marco, a pantalla completa y sin robar el foco", () => {
  const { pc, creadas, estado, archivo } = montar([D1, D2]);
  try {
    pc.iniciar();
    assert.equal(creadas.length, 1);
    const o = creadas[0].o;
    assert.equal(o.frame, false);
    assert.equal(o.fullscreen, true);
    assert.equal(o.focusable, false);
    assert.equal(o.skipTaskbar, true);
    assert.deepEqual([o.x, o.y, o.width, o.height], [1920, 0, 1024, 768]);
    assert.equal(o.webPreferences.preload, undefined, "sin preload: esta ventana no puede apagar la caja");
    assert.equal(creadas[0].url, "http://localhost:54360/?cliente");
    assert.equal(estado.bloqueos, 1, "el monitor no se duerme mientras esté abierta");
    assert.equal(pc.estado().abierta, true);
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});

test("con un monitor no abre nada", () => {
  const { pc, creadas, archivo } = montar([D1]);
  try {
    pc.iniciar();
    assert.equal(creadas.length, 0);
    assert.equal(pc.estado().abierta, false);
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});

test("desconectar el monitor la cierra; reconectarlo la reabre", () => {
  const { pc, creadas, estado, archivo } = montar([D1, D2]);
  try {
    pc.iniciar();
    estado.lista = [D1];
    pc.evaluar();
    assert.equal(creadas[0].destruida, true);
    assert.equal(estado.bloqueos, 0);
    estado.lista = [D1, D2];
    pc.evaluar();
    assert.equal(creadas.length, 2);
    assert.equal(creadas[1].destruida, false);
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});

test("evaluar dos veces sin cambios no abre una segunda ventana", () => {
  const { pc, creadas, archivo } = montar([D1, D2]);
  try {
    pc.iniciar();
    pc.evaluar();
    assert.equal(creadas.length, 1);
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});

test("apagarla desde el ajuste la cierra y se queda guardado", () => {
  const { pc, creadas, archivo } = montar([D1, D2]);
  try {
    pc.iniciar();
    const e = pc.configurar({ modo: "apagada", displayId: null });
    assert.equal(e.abierta, false);
    assert.equal(creadas[0].destruida, true);
    assert.deepEqual(leerConfig(archivo), { modo: "apagada", displayId: null });
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});

test("el estado lista los monitores y marca el de la caja", () => {
  const { pc, archivo } = montar([D1, D2]);
  try {
    pc.iniciar();
    assert.deepEqual(pc.estado().monitores, [
      { id: 1, etiqueta: "Monitor 1", ancho: 1920, alto: 1080, esDeLaCaja: true },
      { id: 2, etiqueta: "HDMI", ancho: 1024, alto: 768, esDeLaCaja: false },
    ]);
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});

test("iniciar registra los tres eventos de monitor", () => {
  const { pc, oyentes, archivo } = montar([D1, D2]);
  try {
    assert.equal(oyentes["display-added"], undefined);
    assert.equal(oyentes["display-removed"], undefined);
    assert.equal(oyentes["display-metrics-changed"], undefined);
    pc.iniciar();
    assert.equal(typeof oyentes["display-added"], "function");
    assert.equal(typeof oyentes["display-removed"], "function");
    assert.equal(typeof oyentes["display-metrics-changed"], "function");
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});

test("cerrar limpia todos los eventos de monitor", () => {
  const { pc, oyentes, archivo } = montar([D1, D2]);
  try {
    pc.iniciar();
    assert.equal(typeof oyentes["display-added"], "function");
    pc.cerrar();
    assert.equal(oyentes["display-added"], undefined);
    assert.equal(oyentes["display-removed"], undefined);
    assert.equal(oyentes["display-metrics-changed"], undefined);
  } finally { rmSync(archivo, { force: true }); }
});

test("ready-to-show dispara showInactive", () => {
  const { pc, creadas, archivo } = montar([D1, D2]);
  try {
    pc.iniciar();
    assert.equal(creadas[0].mostrada, true);
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});

test("cierre inesperado libera el bloqueador y reabre", () => {
  const { pc, creadas, estado, archivo } = montar([D1, D2]);
  try {
    pc.iniciar();
    assert.equal(creadas.length, 1);
    const v1 = creadas[0];
    assert.equal(estado.bloqueos, 1);
    // Cierre inesperado: simular que el window manager destruyó la ventana desde afuera
    // (no pasó por nuestro cerrarVentana)
    v1.destroy();
    // Con esperaMs: 0, se reabre inmediatamente, así que el bloqueador se libera y se toma otro
    assert.equal(creadas.length, 2, "reabierta tras cierre inesperado");
    assert.equal(v1.destruida, true, "ventana antigua destruida");
    assert.equal(estado.bloqueos, 1, "bloqueador activo en nueva ventana");
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});

test("render-process-gone cierra y reabre la ventana", () => {
  const { pc, creadas, archivo } = montar([D1, D2]);
  try {
    pc.iniciar();
    assert.equal(creadas.length, 1);
    const v = creadas[0];
    // Simular crash del renderer
    v.webContentsHandlers["render-process-gone"]?.();
    assert.equal(v.destruida, true, "ventana destruida");
    assert.equal(creadas.length, 2, "reabierta tras crash");
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});

test("cambio de bounds en el monitor causa reapertura", () => {
  // Usar display fresh (no el D2 compartido) para que cambiar bounds sea detectable
  const D2_fresh = { id: 2, label: "HDMI", bounds: { x: 1920, y: 0, width: 1024, height: 768 } };
  const monitores = [D1, D2_fresh];
  const { pc, creadas, estado, archivo } = montar(monitores);
  const logs = [];
  try {
    pc.iniciar();
    assert.equal(creadas.length, 1);
    const v1 = creadas[0];
    // Cambiar bounds del segundo monitor a un objeto diferente
    // IMPORTANTE: reemplazar el objeto display completamente, no solo su propiedad bounds
    estado.lista[1] = { id: 2, label: "HDMI", bounds: { x: 1920, y: 0, width: 1280, height: 720 } };
    pc.evaluar();
    assert.equal(v1.destruida, true, "ventana anterior destruida");
    assert.equal(creadas.length, 2, "nueva ventana creada");
    assert.deepEqual([creadas[1].o.width, creadas[1].o.height], [1280, 720], "con nuevas dimensiones");
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});

test("debounce de eventos de monitor", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const f = electronFalso([D1, D2], 1);
    const archivo = path.join(os.tmpdir(), `vim-pc-ctl-${process.pid}-${Math.random()}.json`);
    const pc = crearPantallaCliente({ ...f, archivo, url: "http://localhost:54360/?cliente", esperaMs: 300 });
    try {
      pc.iniciar();
      const countBefore = f.creadas.length; // 1 window abierta al iniciar
      // Desconectar para que la siguiente evaluación no tenga nada que hacer
      f.estado.lista = [D1];
      pc.evaluar(); // esto cierra la ventana
      // Disparar múltiples eventos sin esperar
      f.oyentes["display-added"]?.();
      f.oyentes["display-removed"]?.();
      f.oyentes["display-added"]?.();
      assert.equal(f.creadas.length, countBefore, "no se abrió aún (esperando debounce)");
      // Avanzar el tiempo
      mock.timers.tick(300);
      // Después del debounce, debería evaluar de nuevo, pero con un solo monitor no abre nada
      assert.equal(f.creadas.length, countBefore, "sin segundo monitor, no abre");
    } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
  } finally { mock.timers.reset(); }
});

test("error al crear BrowserWindow no tira excepción al iniciar", () => {
  class VentanaError {
    constructor() { throw new Error("no se pudo crear ventana"); }
  }
  const f = electronFalso([D1, D2], 1);
  f.BrowserWindow = VentanaError;
  const archivo = path.join(os.tmpdir(), `vim-pc-ctl-${process.pid}-${Math.random()}.json`);
  const pc = crearPantallaCliente({ ...f, archivo, url: "http://localhost:54360/?cliente", esperaMs: 0 });
  try {
    pc.iniciar(); // no debe lanzar
    assert.equal(pc.estado().abierta, false);
    assert.equal(f.estado.bloqueos, 0, "sin bloqueadores");
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});

test("error en loadURL no deja ventana huérfana", () => {
  class VentanaConErrorEnLoad {
    constructor(o) { this.o = o; this.ev = {}; this.webContentsHandlers = {}; }
    webContents = { on: () => {} };
    once(e, f) { this.ev[e] = f; }
    on(e, f) { this.ev[e] = f; }
    loadURL() { throw new Error("no se pudo cargar URL"); }
    setMenuBarVisibility() {}
    showInactive() {}
    isDestroyed() { return this.destruida; }
    destroy() { this.destruida = true; }
  }
  const f = electronFalso([D1, D2], 1);
  f.BrowserWindow = VentanaConErrorEnLoad;
  const archivo = path.join(os.tmpdir(), `vim-pc-ctl-${process.pid}-${Math.random()}.json`);
  const pc = crearPantallaCliente({ ...f, archivo, url: "http://localhost:54360/?cliente", esperaMs: 0 });
  try {
    pc.iniciar(); // no debe lanzar
    assert.equal(pc.estado().abierta, false);
    assert.equal(f.estado.bloqueos, 0, "sin bloqueadores");
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});
