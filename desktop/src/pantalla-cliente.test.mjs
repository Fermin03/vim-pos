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
    constructor(o) {
      this.o = o;
      this.destruida = false;
      this.ev = {};
      this.webContentsHandlers = {};
      this.webContents = { on: (e, f) => { this.webContentsHandlers[e] = f; } };
      creadas.push(this);
    }
    once(e, f) { this.ev[e] = f; if (e === "ready-to-show") { f(); } }
    on(e, f) { this.ev[e] = f; }
    loadURL(u) { this.url = u; return Promise.resolve(); }
    setMenuBarVisibility() {}
    showInactive() { this.mostrada = true; }
    isDestroyed() { return this.destruida; }
    destroy() { this.destruida = true; this.ev.closed?.(); }
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
  return { creadas, oyentes, estado, screen, powerSaveBlocker, BrowserWindow: Ventana, ventanaCaja: () => caja };
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

test("cierre inesperado con monitor desaparecido no reabre", () => {
  const { pc, creadas, estado, archivo } = montar([D1, D2]);
  try {
    pc.iniciar();
    assert.equal(creadas.length, 1);
    const v1 = creadas[0];
    assert.equal(estado.bloqueos, 1);
    // Desaparece el monitor externo
    estado.lista = [D1];
    // Cierre inesperado (OS cerró la ventana)
    v1.destroy();
    // El bloqueador debe liberarse
    assert.equal(estado.bloqueos, 0, "bloqueador liberado");
    // No debe reabrir porque no hay segundo monitor
    assert.equal(creadas.length, 1, "no reabierta (monitor desaparecido)");
    assert.equal(pc.estado().abierta, false);
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
      assert.equal(f.creadas.length, 1);
      assert.equal(f.creadas[0].destruida, false);
      // Desconectar el segundo monitor
      f.estado.lista = [D1];
      // Disparar múltiples eventos sin esperar (el burst que Windows genera)
      f.oyentes["display-removed"]();
      f.oyentes["display-removed"]();
      f.oyentes["display-removed"]();
      // La ventana debe seguir abierta (esperando debounce)
      assert.equal(f.creadas[0].destruida, false, "ventana aún abierta antes de debounce");
      // Avanzar 299ms (aún no cierra)
      mock.timers.tick(299);
      assert.equal(f.creadas[0].destruida, false, "ventana aún abierta después de 299ms");
      // Avanzar 1ms más (total 300ms)
      mock.timers.tick(1);
      assert.equal(f.creadas[0].destruida, true, "ventana destruida después de debounce");
      assert.equal(pc.estado().abierta, false);
      assert.equal(f.estado.bloqueos, 0, "bloqueador liberado");
      // Reconectar el monitor
      f.estado.lista = [D1, D2];
      f.oyentes["display-added"]();
      f.oyentes["display-added"]();
      // Sin esperar, aún no se reabre (esperando debounce)
      assert.equal(f.creadas.length, 1);
      // Avanzar el debounce
      mock.timers.tick(300);
      assert.equal(f.creadas.length, 2, "exactamente una ventana nueva (burst coalesced)");
      assert.equal(f.creadas[1].destruida, false);
    } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
  } finally { mock.timers.reset(); }
});

test("error en loadURL no deja ventana huérfana", () => {
  const f = electronFalso([D1, D2], 1);
  const creadas = f.creadas;
  class VentanaConErrorEnLoad {
    constructor(o) {
      this.o = o;
      this.destruida = false;
      this.ev = {};
      this.webContentsHandlers = {};
      this.webContents = { on: (e, h) => { this.webContentsHandlers[e] = h; } };
      creadas.push(this);
    }
    once(e, f) { this.ev[e] = f; }
    on(e, f) { this.ev[e] = f; }
    loadURL() { throw new Error("no se pudo cargar URL"); }
    setMenuBarVisibility() {}
    showInactive() {}
    isDestroyed() { return this.destruida; }
    destroy() { this.destruida = true; }
  }
  f.BrowserWindow = VentanaConErrorEnLoad;
  const archivo = path.join(os.tmpdir(), `vim-pc-ctl-${process.pid}-${Math.random()}.json`);
  const pc = crearPantallaCliente({ ...f, archivo, url: "http://localhost:54360/?cliente", esperaMs: 0 });
  try {
    pc.iniciar(); // no debe lanzar
    assert.equal(f.creadas.length, 1, "ventana fue creada");
    assert.equal(f.creadas[0].destruida, true, "ventana huérfana fue destruida");
    assert.equal(pc.estado().abierta, false);
    assert.equal(f.estado.bloqueos, 0, "sin bloqueadores");
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});

test("error en proteger no deja ventana huérfana", () => {
  const f = electronFalso([D1, D2], 1);
  const archivo = path.join(os.tmpdir(), `vim-pc-ctl-${process.pid}-${Math.random()}.json`);
  const pc = crearPantallaCliente({
    ...f, archivo, url: "http://localhost:54360/?cliente", esperaMs: 0,
    proteger: () => { throw new Error("proteger falló"); }
  });
  try {
    pc.iniciar(); // no debe lanzar
    assert.equal(f.creadas.length, 1, "ventana fue creada");
    assert.equal(f.creadas[0].destruida, true, "ventana huérfana fue destruida");
    assert.equal(pc.estado().abierta, false);
    assert.equal(f.estado.bloqueos, 0, "sin bloqueadores");
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});

test("una ráfaga de eventos se funde en una sola evaluación", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const f = electronFalso([D1, D2], 1);
    const archivo = path.join(os.tmpdir(), `vim-pc-ctl-${process.pid}-${Math.random()}.json`);
    const pc = crearPantallaCliente({ ...f, archivo, url: "http://localhost:54360/?cliente", esperaMs: 300 });
    try {
      pc.iniciar();
      assert.equal(f.creadas.length, 1);
      // Contar llamadas a getAllDisplays para probar que se evalúa una sola vez
      let lecturas = 0;
      const original = f.screen.getAllDisplays;
      f.screen.getAllDisplays = () => { lecturas++; return original(); };
      // Desconectar el monitor
      f.estado.lista = [D1];
      // Primera ráfaga de eventos
      f.oyentes["display-removed"]();
      mock.timers.tick(200);
      // Segunda ráfaga mientras el temporizador aún está en marcha
      f.oyentes["display-removed"]();
      mock.timers.tick(200);
      // La ventana aún debe estar abierta (el primer timer fue cancelado por el segundo)
      assert.equal(f.creadas[0].destruida, false, "ventana aún abierta después de 400ms (debounce no expiró)");
      assert.equal(lecturas, 0, "no se ha evaluado aún (temporizador pendiente)");
      // Avanzar el resto del debounce (300ms total desde el último evento)
      mock.timers.tick(100);
      // Ahora debe estar destruida (100ms adicional = 300ms total)
      assert.equal(f.creadas[0].destruida, true, "ventana destruida después del debounce");
      assert.equal(lecturas, 1, "exactamente una evaluación para toda la ráfaga");
    } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
  } finally { mock.timers.reset(); }
});

test("error al crear BrowserWindow no tira excepción al iniciar", () => {
  const logs = [];
  const f = electronFalso([D1, D2], 1);
  class VentanaError {
    constructor() { throw new Error("no se pudo crear ventana"); }
  }
  f.BrowserWindow = VentanaError;
  const archivo = path.join(os.tmpdir(), `vim-pc-ctl-${process.pid}-${Math.random()}.json`);
  const pc = crearPantallaCliente({
    ...f, archivo, url: "http://localhost:54360/?cliente", esperaMs: 0,
    log: (msg) => logs.push(msg)
  });
  try {
    assert.doesNotThrow(() => pc.iniciar());
    assert.equal(pc.estado().abierta, false);
    assert.equal(f.estado.bloqueos, 0, "sin bloqueadores");
    assert.equal(logs.length, 1, "exactamente un log de error");
    assert.match(logs[0], /error al abrir ventana/, "el log menciona el error de ventana");
  } finally { pc.cerrar(); rmSync(archivo, { force: true }); }
});
