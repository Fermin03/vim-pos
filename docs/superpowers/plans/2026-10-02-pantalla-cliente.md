# Pantalla del cliente (entrega 1) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la caja de escritorio detecte sola un segundo monitor y abra en él, a pantalla completa y sin bordes, una vista para el cliente con los artículos y el total de la cuenta en captura.

**Architecture:** El proceso principal de Electron vigila los monitores y abre una segunda ventana sin marco que carga el mismo POS con `?cliente`. La caja (`home-pos.tsx`) publica por `BroadcastChannel` un mensaje ya limpio (`VistaCliente`); la vista solo dibuja lo que recibe y no lee la base ni inicia sesión. En reposo muestra logo y nombre del negocio; el carrusel de anuncios es la entrega 2 y tiene su propio plan.

**Tech Stack:** Electron 43 (`screen`, `BrowserWindow`, `powerSaveBlocker`), Node `node:test`, Next 15 (export estático), React 19, Zod 3, Vitest 3, Tailwind con los tokens de `@vim/ui`.

**Spec:** `docs/superpowers/specs/2026-10-02-pantalla-cliente-design.md`

## Global Constraints

- Rama `feat/pantalla-cliente` desde `main`. No se trabaja en `main`.
- Sin migraciones en esta entrega. Sin cambios al sync.
- Solo rol caja. El rol cocina no abre pantalla del cliente.
- Ventana: `frame: false`, `fullscreen: true`, `focusable: false`, `skipTaskbar: true`, sin preload.
- Canal: `BroadcastChannel("vim-pantalla-cliente")`, mensajes con `v: 1`, validados con Zod en quien recibe.
- La caja republica cada 5 s si no está en reposo; la vista vuelve a reposo tras 15 s de silencio.
- Nunca se publica `notaCocina`, `notaOrden`, `nombreCuenta`, `clienteDomicilio`, `clienteCuenta` ni datos del cajero. El mensaje se arma campo por campo.
- Dinero: `number` redondeado con `redondearCentavos` (`apps/pos/app/lib/dinero.ts`), como en `carrito.ts` y `cobro.ts`. Formato con `fmtMxn` (`apps/pos/app/lib/turno.ts`).
- Sin `any`: `unknown` + Zod. Español en el dominio. Archivos `kebab-case`.
- Cuando una tarea dice «agregar al final» de un archivo de pruebas, los `import` nuevos van arriba, con los demás.
- No correr `next build` con el dev server arriba (comparten `.next`). Para tipos: `pnpm --filter @vim/pos typecheck`.
- No publicar instalador ni tocar `latest.json` dentro de este plan. Publicar pasa por la lista de `desktop/RUNBOOK.md` y el visto bueno de Fermín.
- La caja instalada de Fermín ocupa los puertos 54350 y 54360. Las pruebas manuales usan 54450 y 54460.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `desktop/src/pantalla-cliente.mjs` (nuevo) | Elegir monitor, guardar configuración local, abrir y cerrar la ventana. |
| `desktop/src/pantalla-cliente.test.mjs` (nuevo) | Pruebas de lo anterior con Electron falso. |
| `desktop/src/ui-server.mjs` | Ruta `/__pantalla-cliente` (GET y POST). |
| `desktop/src/ui-server-pantalla-cliente.test.mjs` (nuevo) | Pruebas de la ruta. |
| `desktop/src/main.mjs` | Crear el controlador en `bootCaja`, cerrarlo en `cerrarTodo`. |
| `apps/pos/app/lib/pantalla-cliente/vista.ts` (nuevo) | Tipos, esquemas Zod y `construirVista`. |
| `apps/pos/app/lib/pantalla-cliente/canal.ts` (nuevo) | Publicador sobre el canal. |
| `apps/pos/app/lib/pantalla-cliente/ajuste.ts` (nuevo) | Cliente HTTP de `/__pantalla-cliente`. |
| `apps/pos/app/lib/__tests__/pantalla-cliente.test.ts` (nuevo) | Pruebas de `vista.ts` y `canal.ts`. |
| `apps/pos/app/components/use-publicar-pantalla-cliente.ts` (nuevo) | Hook que conecta `home-pos.tsx` con el publicador. |
| `apps/pos/app/components/pantalla-cliente.tsx` (nuevo) | La vista que ve el cliente. |
| `apps/pos/app/components/ajuste-pantalla-cliente.tsx` (nuevo) | Apartado de ajuste dentro del modal de impresoras. |
| `apps/pos/app/components/home-pos.tsx` | Una llamada al hook. |
| `apps/pos/app/components/modal-config-impresora.tsx` | Montar el apartado de ajuste. |
| `apps/pos/app/page.tsx` | Modo `?cliente`. |
| `desktop/scripts/arnes-pantalla-cliente.mjs` (nuevo) | Levantar backend y UI en puertos de prueba. |
| `docs/decisiones/0026-…md`, `docs/diseno/pantalla-cliente.md`, `desktop/RUNBOOK.md` | Documentación. |

---

### Task 0: Rama y documentos

**Files:**
- Add: `docs/superpowers/specs/2026-10-02-pantalla-cliente-design.md`, `docs/superpowers/plans/2026-10-02-pantalla-cliente.md`

- [ ] **Step 1: Crear la rama y subir spec y plan**

```bash
git checkout main && git pull
git checkout -b feat/pantalla-cliente
git add docs/superpowers/specs/2026-10-02-pantalla-cliente-design.md docs/superpowers/plans/2026-10-02-pantalla-cliente.md
git commit -m "docs: spec y plan de la pantalla del cliente"
```

Antes de cada tarea siguiente, confirmar con `git branch --show-current` que la rama sigue siendo `feat/pantalla-cliente`: otras sesiones han cambiado de rama en este checkout.

---

### Task 1: Elegir monitor y configuración local

**Files:**
- Create: `desktop/src/pantalla-cliente.mjs`
- Test: `desktop/src/pantalla-cliente.test.mjs`

**Interfaces:**
- Produces:
  - `CONFIG_INICIAL: { modo: "auto", displayId: null }`
  - `normalizarConfig(crudo: unknown): { modo: "auto" | "apagada", displayId: number | null }`
  - `leerConfig(archivo: string)` y `guardarConfig(archivo: string, config)` con la misma forma
  - `elegirMonitor(monitores: Array<{ id: number }>, idCaja: number, config): { id: number } | null`

- [ ] **Step 1: Escribir las pruebas**

`desktop/src/pantalla-cliente.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { rmSync, writeFileSync } from "node:fs";
import { CONFIG_INICIAL, normalizarConfig, leerConfig, guardarConfig, elegirMonitor } from "./pantalla-cliente.mjs";

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
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test desktop/src/pantalla-cliente.test.mjs`
Expected: FAIL, `Cannot find module ... pantalla-cliente.mjs`.

- [ ] **Step 3: Implementar**

`desktop/src/pantalla-cliente.mjs`:

```js
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
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test desktop/src/pantalla-cliente.test.mjs`
Expected: 8 pruebas, todas PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/pantalla-cliente.mjs desktop/src/pantalla-cliente.test.mjs
git commit -m "feat(escritorio): elegir el monitor de la pantalla del cliente"
```

---

### Task 2: Controlador de la ventana

**Files:**
- Modify: `desktop/src/pantalla-cliente.mjs`
- Modify: `desktop/src/pantalla-cliente.test.mjs`

**Interfaces:**
- Consumes: `elegirMonitor`, `leerConfig`, `guardarConfig`, `normalizarConfig` (Task 1).
- Produces: `crearPantallaCliente(opts)` con
  - `opts`: `{ screen, BrowserWindow, powerSaveBlocker, archivo: string, url: string, ventanaCaja: () => BrowserWindow | null, proteger?: (w) => void, log?: (m: string) => void, esperaMs?: number }`
  - devuelve `{ iniciar(): void, evaluar(): void, estado(): Estado, configurar(cambio): Estado, cerrar(): void }`
  - `Estado = { disponible: true, modo, displayId, abierta: boolean, monitores: Array<{ id, etiqueta, ancho, alto, esDeLaCaja }> }`

- [ ] **Step 1: Agregar las pruebas**

Al final de `desktop/src/pantalla-cliente.test.mjs`:

```js
import { crearPantallaCliente } from "./pantalla-cliente.mjs";

/** Electron de mentira: lo justo para ver qué ventana se abre, dónde y con qué opciones. */
function electronFalso(lista, idCaja) {
  const creadas = [];
  const oyentes = {};
  class Ventana {
    constructor(o) { this.o = o; this.destruida = false; this.ev = {}; creadas.push(this); }
    webContents = { on() {} };
    once(e, f) { this.ev[e] = f; }
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
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test desktop/src/pantalla-cliente.test.mjs`
Expected: FAIL, `crearPantallaCliente` no es un export.

- [ ] **Step 3: Implementar**

Agregar al final de `desktop/src/pantalla-cliente.mjs`:

```js
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
    const b = display.bounds;
    const v = new BrowserWindow({
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
    v.on("closed", () => { if (ventana === v) { ventana = null; destino = null; } });
    // Si el renderer muere, se vuelve a abrir: una pantalla negra frente al cliente no se arregla sola.
    v.webContents.on("render-process-gone", () => { if (ventana === v) { cerrarVentana(); programar(); } });
    v.loadURL(url).catch((e) => log(`no cargó: ${e?.message ?? e}`));
    ventana = v;
    destino = display;
    try { bloqueo = powerSaveBlocker.start("prevent-display-sleep"); } catch { bloqueo = null; }
    log(`abierta en el monitor ${display.id} (${b.width}×${b.height})`);
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
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test desktop/src/pantalla-cliente.test.mjs`
Expected: 14 pruebas, todas PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/pantalla-cliente.mjs desktop/src/pantalla-cliente.test.mjs
git commit -m "feat(escritorio): ventana del cliente que se abre sola en el segundo monitor"
```

---

### Task 3: Ruta `/__pantalla-cliente` en el ui-server

**Files:**
- Modify: `desktop/src/ui-server.mjs` (insertar justo antes del bloque `// CAJA: relay de impresión RAW`, hoy en la línea ~325)
- Test: `desktop/src/ui-server-pantalla-cliente.test.mjs`

**Interfaces:**
- Consumes: `opts.pantallaCliente?: () => Estado`, `opts.onPantallaCliente?: (cambio: { modo, displayId }) => Estado`.
- Produces: `GET /__pantalla-cliente` → `Estado` o `{ disponible: false }`. `POST /__pantalla-cliente` con `{ modo, displayId }` → `{ ok: true, ...Estado }`. Ambas solo desde la propia máquina.

- [ ] **Step 1: Escribir las pruebas**

`desktop/src/ui-server-pantalla-cliente.test.mjs`:

```js
// La ruta del ajuste de la pantalla del cliente. Mueve una ventana en la computadora de la caja,
// así que solo la propia caja puede usarla: ni la segunda caja de la LAN ni una web cualquiera.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startUiServer } from "./ui-server.mjs";

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pos-ui");
const ESTADO = { disponible: true, modo: "auto", displayId: null, abierta: true, monitores: [] };

async function conServidor(opts, fn) {
  const port = 54950 + Math.floor(Math.random() * 40);
  const server = await startUiServer(UI_DIR, port, 54350, "127.0.0.1", opts);
  const base = `http://127.0.0.1:${port}/__pantalla-cliente`;
  const origen = { Origin: `http://127.0.0.1:${port}` };
  try { await fn({ base, origen }); } finally { await new Promise((r) => server.close(r)); }
}

test("GET devuelve el estado que da el proceso principal", async () => {
  await conServidor({ pantallaCliente: () => ESTADO }, async ({ base }) => {
    const r = await fetch(base);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), ESTADO);
  });
});

test("sin controlador (POS sin escritorio) dice que no está disponible", async () => {
  await conServidor({}, async ({ base }) => {
    assert.deepEqual(await (await fetch(base)).json(), { disponible: false });
  });
});

test("POST guarda el cambio y devuelve el estado nuevo", async () => {
  let recibido = null;
  const opts = { onPantallaCliente: (c) => { recibido = c; return { ...ESTADO, modo: "apagada", abierta: false }; } };
  await conServidor(opts, async ({ base, origen }) => {
    const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", ...origen }, body: JSON.stringify({ modo: "apagada", displayId: null }) });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.modo, "apagada");
    assert.deepEqual(recibido, { modo: "apagada", displayId: null });
  });
});

test("una web ajena no puede mover la pantalla", async () => {
  let veces = 0;
  await conServidor({ onPantallaCliente: () => { veces++; return ESTADO; } }, async ({ base }) => {
    const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://sitio-cualquiera.example" }, body: "{}" });
    assert.equal(r.status, 403);
    assert.equal(veces, 0);
  });
});

test("un cuerpo que no es JSON se rechaza sin tocar nada", async () => {
  let veces = 0;
  await conServidor({ onPantallaCliente: () => { veces++; return ESTADO; } }, async ({ base, origen }) => {
    const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", ...origen }, body: "{roto" });
    assert.equal(r.status, 400);
    assert.equal(veces, 0);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test desktop/src/ui-server-pantalla-cliente.test.mjs`
Expected: FAIL. El GET cae al respaldo de la SPA y no devuelve el JSON esperado.

- [ ] **Step 3: Implementar**

En `desktop/src/ui-server.mjs`, justo antes del comentario `// CAJA: relay de impresión RAW.`:

```js
      // CAJA: ajuste de la pantalla del cliente (el segundo monitor). Solo desde la propia caja,
      // lectura incluida: la lista de monitores es de ESTA computadora y a la segunda caja de la
      // LAN no le dice nada; y el POST mueve una ventana frente al cliente.
      if (!kds && req.url.startsWith("/__pantalla-cliente") && (req.method === "GET" || req.method === "POST")) {
        if (!LOCALES.has(req.socket.remoteAddress ?? "")) {
          res.writeHead(403, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "Solo desde la caja." }));
        }
        if (req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          return res.end(JSON.stringify(opts.pantallaCliente ? opts.pantallaCliente() : { disponible: false }));
        }
        if (!mismaProcedencia(req, port)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "Origen no permitido." }));
        }
        const body = await leerCuerpo(req);
        if (body === null) return responder413(res);
        let cambio;
        try { cambio = JSON.parse(body || "{}"); } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "Cuerpo inválido." }));
        }
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        try {
          const estado = opts.onPantallaCliente?.(cambio);
          return res.end(JSON.stringify(estado ? { ok: true, ...estado } : { ok: false, disponible: false }));
        } catch (e) {
          return res.end(JSON.stringify({ ok: false, error: e?.message ?? "No se pudo guardar" }));
        }
      }
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test desktop/src/ui-server-pantalla-cliente.test.mjs desktop/src/ui-server.test.mjs`
Expected: todas PASS, incluidas las que ya existían.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/ui-server.mjs desktop/src/ui-server-pantalla-cliente.test.mjs
git commit -m "feat(escritorio): ruta local para el ajuste de la pantalla del cliente"
```

---

### Task 4: Conectar el controlador en `main.mjs`

**Files:**
- Modify: `desktop/src/main.mjs` (import en la línea 7 y 25; `crearVentana` 253-284; `bootCaja` 286-353; `cerrarTodo` ~1058)

**Interfaces:**
- Consumes: `crearPantallaCliente` (Task 2); `opts.pantallaCliente` y `opts.onPantallaCliente` (Task 3).
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Sacar la protección de navegación a una función**

`crearVentana` aplica dos cosas a la ventana: bloquea `window.open` y limita la navegación. La ventana del cliente necesita lo mismo. En `main.mjs`, reemplazar dentro de `crearVentana` desde `const permitidos = origenesDe(origenes);` hasta `w.webContents.on("will-redirect", frenar);` por `protegerNavegacion(w, origenes);`, y agregar encima de `crearVentana`:

```js
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
```

- [ ] **Step 2: Imports y variable**

En el import de `electron` (línea 7) agregar `powerSaveBlocker`. Junto al import de `./pantalla.mjs` (línea 25):

```js
import { crearPantallaCliente } from "./pantalla-cliente.mjs";
```

Junto a `let watchdog;` (línea ~104):

```js
let pantallaCliente = null;   // segunda ventana, de cara al cliente (pantalla-cliente.mjs)
```

- [ ] **Step 3: Pasar los ganchos al ui-server**

En `bootCaja`, dentro del objeto de opciones de `startUiServer`, después de `avisoVisto: (id) => directivas.marcarVisto(id),`:

```js
      pantallaCliente: () => pantallaCliente?.estado() ?? { disponible: false },
      onPantallaCliente: (cambio) => pantallaCliente?.configurar(cambio) ?? null,
```

- [ ] **Step 4: Crear el controlador después de cargar la caja**

En `bootCaja`, los orígenes permitidos de la caja están escritos en línea al llamar a `crearVentana`. Sacarlos a una constante para reusarlos:

```js
  const origenesCaja = [
    `http://localhost:${UI_PORT}`, `http://127.0.0.1:${UI_PORT}`,
    process.env.VIM_POS_URL, "https://pos.vimpos.com.mx",
  ];
  win = crearVentana([`--vim-url=${backend.url}`], origenesCaja);
```

Y justo después de `await win.loadURL(posUrl);`:

```js
  // Pantalla del cliente: se abre sola si hay un segundo monitor. Va DESPUÉS de cargar la caja
  // para que la ventana principal ya tenga su monitor decidido, y carga el mismo POS (mismo origen
  // que la caja: es lo que deja a las dos ventanas hablarse por BroadcastChannel).
  pantallaCliente = crearPantallaCliente({
    screen, BrowserWindow, powerSaveBlocker,
    archivo: path.join(CONFIG_DIR, "pantalla-cliente.json"),
    url: `${posUrl.replace(/\/+$/, "")}/?cliente`,
    ventanaCaja: () => win,
    proteger: (w) => protegerNavegacion(w, origenesCaja),
    log: (m) => console.log("· [pantalla-cliente]", m),
  });
  pantallaCliente.iniciar();
```

- [ ] **Step 5: Cerrarla al salir**

En `cerrarTodo`, antes de `try { detenerSync(); } catch { /* */ }`:

```js
  try { pantallaCliente?.cerrar(); } catch { /* */ }
```

- [ ] **Step 6: Verificar**

Run: `node --check desktop/src/main.mjs && node --test desktop/src/*.test.mjs`
Expected: sin errores de sintaxis y todas las pruebas del escritorio en PASS.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/main.mjs
git commit -m "feat(escritorio): la caja abre la pantalla del cliente al arrancar"
```

---

### Task 5: `construirVista` y esquemas del mensaje

**Files:**
- Create: `apps/pos/app/lib/pantalla-cliente/vista.ts`
- Test: `apps/pos/app/lib/__tests__/pantalla-cliente.test.ts`

**Interfaces:**
- Consumes: `EstadoCarrito`, `LineaCarrito`, `totalLinea`, `calcularTotalesDisplay` de `apps/pos/app/lib/carrito.ts`.
- Produces:
  - `type RenglonCliente = { id: string; cantidad: number; nombre: string; detalle: string[]; importe: number }`
  - `type VistaCliente` (unión por `fase`: `reposo` | `cuenta` | `cobro` | `pagado`)
  - `type Negocio = { nombre: string; logoUrl: string | null }`
  - `type MensajePantalla` (unión por `tipo`: `estado` | `negocio` | `hola`)
  - `type EntradaVista = { carrito: EstadoCarrito; totalAutoritativo: number | null; cobro: { total: number } | null; pagado: { total: number | null; cambio: number } | null }`
  - `construirVista(e: EntradaVista): VistaCliente`
  - `leerMensaje(dato: unknown): MensajePantalla | null`

- [ ] **Step 1: Escribir las pruebas**

`apps/pos/app/lib/__tests__/pantalla-cliente.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { estadoInicial, type EstadoCarrito, type LineaCarrito } from "../carrito";
import type { Producto } from "../catalogo";
import { construirVista, leerMensaje, type EntradaVista } from "../pantalla-cliente/vista";

function producto(nombre: string, precio: number): Producto {
  return {
    id: `p-${nombre}`, nombre, descripcion: null, precio_base_mxn: precio, categoria_id: "c1", agotado: false,
    esCombo: false, sku: null, tasaIva: 16, ivaIncluido: true, claveSat: null, unidadSat: null, categoriaNombre: null,
  };
}

function linea(id: string, nombre: string, precio: number, cantidad = 1, extra: Partial<LineaCarrito> = {}): LineaCarrito {
  return { clientId: id, producto: producto(nombre, precio), cantidad, modificadores: [], notaCocina: null, ...extra };
}

function entrada(carrito: Partial<EstadoCarrito>, resto: Partial<EntradaVista> = {}): EntradaVista {
  return { carrito: { ...estadoInicial, ...carrito }, totalAutoritativo: null, cobro: null, pagado: null, ...resto };
}

describe("construirVista", () => {
  it("sin líneas está en reposo", () => {
    expect(construirVista(entrada({}))).toEqual({ fase: "reposo" });
  });

  it("con líneas muestra renglones e importe, y el total que ve el cajero", () => {
    const v = construirVista(entrada({ lineas: [linea("a", "Hamburguesa", 120, 2), linea("b", "Refresco", 35)] }));
    expect(v).toEqual({
      fase: "cuenta",
      renglones: [
        { id: "a", cantidad: 2, nombre: "Hamburguesa", detalle: [], importe: 240 },
        { id: "b", cantidad: 1, nombre: "Refresco", detalle: [], importe: 35 },
      ],
      envio: null,
      total: 275,
    });
  });

  it("los modificadores salen como texto, con su cantidad si es más de uno", () => {
    const l = linea("a", "Hamburguesa", 100, 1, {
      modificadores: [
        { opcionId: "o1", grupoNombre: "Extras", opcionNombre: "Tocino", precioExtra: 15, cantidad: 2 },
        { opcionId: "o2", grupoNombre: "Término", opcionNombre: "Tres cuartos", precioExtra: 0, cantidad: 1 },
      ],
    });
    const v = construirVista(entrada({ lineas: [l] }));
    expect(v.fase === "cuenta" && v.renglones[0]).toEqual({ id: "a", cantidad: 1, nombre: "Hamburguesa", detalle: ["2× Tocino", "Tres cuartos"], importe: 130 });
  });

  it("un combo lista sus componentes y usa su precio congelado", () => {
    const papas = producto("Papas", 40);
    const l = linea("a", "Combo Clásico", 0, 1, {
      combo: {
        def: { producto: producto("Combo Clásico", 0), slots: [] },
        precioUnitario: 150,
        componentes: [
          { grupoId: "g1", grupoNombre: "Acompañamiento", producto: papas, cantidad: 1, modificadores: [{ opcionId: "o9", grupoNombre: "Tamaño", opcionNombre: "Grandes", precioExtra: 10, cantidad: 1 }], notaCocina: "bien doradas", clientId: "h1" },
        ],
      },
    });
    const v = construirVista(entrada({ lineas: [l] }));
    expect(v.fase === "cuenta" && v.renglones[0]).toEqual({ id: "a", cantidad: 1, nombre: "Combo Clásico", detalle: ["Papas (Grandes)"], importe: 160 });
  });

  it("el envío va aparte y entra en el total", () => {
    const v = construirVista(entrada({ modoServicio: "DELIVERY_PROPIO", lineas: [linea("a", "Pizza", 200)], envio: { zonaId: "z1", nombre: "Centro", costoMxn: 30 } }));
    expect(v).toMatchObject({ fase: "cuenta", envio: { nombre: "Centro", importe: 30 }, total: 230 });
  });

  it("con cuenta guardada manda el total de la base, que ya trae descuentos", () => {
    const v = construirVista(entrada({ lineas: [linea("a", "Pizza", 200)] }, { totalAutoritativo: 180 }));
    expect(v).toMatchObject({ fase: "cuenta", total: 180 });
  });

  it("al cobrar muestra solo el total a pagar", () => {
    const v = construirVista(entrada({ lineas: [linea("a", "Pizza", 200)] }, { cobro: { total: 200 } }));
    expect(v).toEqual({ fase: "cobro", total: 200 });
  });

  it("cobrado manda sobre todo lo demás y lleva el cambio", () => {
    const v = construirVista(entrada({}, { pagado: { total: 200, cambio: 300 }, cobro: { total: 200 } }));
    expect(v).toEqual({ fase: "pagado", total: 200, cambio: 300 });
  });

  it("no deja pasar ningún dato privado", () => {
    const carrito = {
      ...estadoInicial,
      modoServicio: "DELIVERY_PROPIO",
      lineas: [linea("a", "Pizza", 200, 1, { notaCocina: "NOTA-COCINA-SECRETA" })],
      notaOrden: "NOTA-ORDEN-SECRETA",
      nombreCuenta: "NOMBRE-CUENTA-SECRETO",
      clienteDomicilio: { clienteId: "c1", nombre: "CLIENTE-SECRETO", telefono: "4771234567", direccion: "CALLE-SECRETA 12" },
      clienteCuenta: { clienteId: "c2", nombre: "OTRO-CLIENTE-SECRETO", telefono: "4777654321" },
    } as unknown as EstadoCarrito;
    const texto = JSON.stringify(construirVista({ carrito, totalAutoritativo: null, cobro: null, pagado: null }));
    for (const secreto of ["SECRET", "4771234567", "4777654321"]) expect(texto).not.toContain(secreto);
  });
});

describe("leerMensaje", () => {
  it("acepta los tres mensajes del canal", () => {
    expect(leerMensaje({ tipo: "hola", v: 1 })).toEqual({ tipo: "hola", v: 1 });
    expect(leerMensaje({ tipo: "negocio", v: 1, nombre: "Knock-Out", logoUrl: null })).toEqual({ tipo: "negocio", v: 1, nombre: "Knock-Out", logoUrl: null });
    expect(leerMensaje({ tipo: "estado", v: 1, vista: { fase: "cobro", total: 99.5 } })).toEqual({ tipo: "estado", v: 1, vista: { fase: "cobro", total: 99.5 } });
  });

  it("ignora lo que no entiende", () => {
    expect(leerMensaje(null)).toBeNull();
    expect(leerMensaje({ tipo: "estado", v: 2, vista: { fase: "reposo" } })).toBeNull();
    expect(leerMensaje({ tipo: "estado", v: 1, vista: { fase: "cuenta", renglones: "x", envio: null, total: 1 } })).toBeNull();
    expect(leerMensaje({ tipo: "estado", v: 1, vista: { fase: "cobro", total: Number.NaN } })).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `pnpm --filter @vim/pos test -- pantalla-cliente`
Expected: FAIL, no existe `../pantalla-cliente/vista`.

- [ ] **Step 3: Implementar**

`apps/pos/app/lib/pantalla-cliente/vista.ts`:

```ts
/**
 * Lo que la caja le manda a la pantalla del cliente (el segundo monitor).
 *
 * `construirVista` es la ÚNICA puerta entre el estado de la venta y lo que ve el cliente. Arma el
 * mensaje campo por campo en vez de copiar objetos del carrito: el carrito lleva notas de cocina,
 * el nombre y la dirección de quien pide a domicilio, y nada de eso puede acabar en un monitor
 * girado hacia el mostrador porque alguien agregó un campo nuevo al carrito.
 */
import { z } from "zod";
import { calcularTotalesDisplay, totalLinea, type EstadoCarrito, type LineaCarrito, type ModificadorSel } from "../carrito";

const dinero = z.number().finite();

const esquemaRenglon = z.object({
  id: z.string(),
  cantidad: z.number().positive(),
  nombre: z.string(),
  detalle: z.array(z.string()),
  importe: dinero,
});

export const esquemaVista = z.discriminatedUnion("fase", [
  z.object({ fase: z.literal("reposo") }),
  z.object({
    fase: z.literal("cuenta"),
    renglones: z.array(esquemaRenglon),
    envio: z.object({ nombre: z.string(), importe: dinero }).nullable(),
    total: dinero,
  }),
  z.object({ fase: z.literal("cobro"), total: dinero }),
  z.object({ fase: z.literal("pagado"), total: dinero.nullable(), cambio: dinero }),
]);

const esquemaMensaje = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("estado"), v: z.literal(1), vista: esquemaVista }),
  z.object({ tipo: z.literal("negocio"), v: z.literal(1), nombre: z.string(), logoUrl: z.string().nullable() }),
  z.object({ tipo: z.literal("hola"), v: z.literal(1) }),
]);

export type RenglonCliente = z.infer<typeof esquemaRenglon>;
export type VistaCliente = z.infer<typeof esquemaVista>;
export type MensajePantalla = z.infer<typeof esquemaMensaje>;
export type Negocio = { nombre: string; logoUrl: string | null };

/** Valida lo que llega por el canal. Un mensaje que no se entiende se ignora: null. */
export function leerMensaje(dato: unknown): MensajePantalla | null {
  const r = esquemaMensaje.safeParse(dato);
  return r.success ? r.data : null;
}

export type EntradaVista = {
  carrito: EstadoCarrito;
  /** Total de la base cuando la cuenta ya está guardada (trae descuentos y promociones); si no, null. */
  totalAutoritativo: number | null;
  /** El modal de cobro está abierto. */
  cobro: { total: number } | null;
  /** Se acaba de cobrar ("Cobro completado" en pantalla). */
  pagado: { total: number | null; cambio: number } | null;
};

const textoMod = (m: ModificadorSel): string => (m.cantidad > 1 ? `${m.cantidad}× ${m.opcionNombre}` : m.opcionNombre);

function detalleDe(l: LineaCarrito): string[] {
  const propios = l.modificadores.map(textoMod);
  if (!l.combo) return propios;
  const hijos = l.combo.componentes.map((c) => {
    const base = c.cantidad > 1 ? `${c.cantidad}× ${c.producto.nombre}` : c.producto.nombre;
    return c.modificadores.length > 0 ? `${base} (${c.modificadores.map(textoMod).join(", ")})` : base;
  });
  return [...hijos, ...propios];
}

export function construirVista(e: EntradaVista): VistaCliente {
  if (e.pagado) return { fase: "pagado", total: e.pagado.total, cambio: e.pagado.cambio };
  if (e.cobro) return { fase: "cobro", total: e.cobro.total };
  const { lineas, envio } = e.carrito;
  if (lineas.length === 0) return { fase: "reposo" };
  const envioMxn = envio?.costoMxn ?? 0;
  return {
    fase: "cuenta",
    renglones: lineas.map((l) => ({ id: l.clientId, cantidad: l.cantidad, nombre: l.producto.nombre, detalle: detalleDe(l), importe: totalLinea(l) })),
    envio: envio ? { nombre: envio.nombre, importe: envio.costoMxn } : null,
    // El mismo número que el cajero ve en el costado (`SidebarTicket`: totalConDescuento ?? totales.total).
    total: e.totalAutoritativo ?? calcularTotalesDisplay(lineas, 16, envioMxn).total,
  };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `pnpm --filter @vim/pos test -- pantalla-cliente`
Expected: 11 pruebas, todas PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pos/app/lib/pantalla-cliente/vista.ts apps/pos/app/lib/__tests__/pantalla-cliente.test.ts
git commit -m "feat(pos): construir lo que ve el cliente a partir de la venta"
```

---

### Task 6: Publicador y enganche en la caja

**Files:**
- Create: `apps/pos/app/lib/pantalla-cliente/canal.ts`
- Create: `apps/pos/app/components/use-publicar-pantalla-cliente.ts`
- Modify: `apps/pos/app/lib/__tests__/pantalla-cliente.test.ts`
- Modify: `apps/pos/app/components/home-pos.tsx` (después de la línea 295, donde se declara `itemsPersistidos`; todo el estado que usa ya existe ahí)

**Interfaces:**
- Consumes: `VistaCliente`, `Negocio`, `EntradaVista`, `construirVista`, `leerMensaje` (Task 5).
- Produces:
  - `NOMBRE_CANAL = "vim-pantalla-cliente"`, `LATIDO_MS = 5000`, `SILENCIO_MS = 15000`
  - `type Canal = { postMessage(m: unknown): void; onmessage: ((e: { data: unknown }) => void) | null; close(): void }`
  - `abrirCanal(): Canal | null`
  - `crearPublicador(canal: Canal, negocio: () => Negocio): { anunciar(): void; publicar(v: VistaCliente): void; latir(): void; cerrar(): void }`
  - `usePublicarPantallaCliente(entrada: EntradaVista, negocio: Negocio): void`

- [ ] **Step 1: Agregar las pruebas del publicador**

Al final de `apps/pos/app/lib/__tests__/pantalla-cliente.test.ts`:

```ts
import { crearPublicador, type Canal } from "../pantalla-cliente/canal";

function canalFalso() {
  const enviados: unknown[] = [];
  const canal: Canal & { cerrado: boolean } = {
    cerrado: false,
    onmessage: null,
    postMessage: (m) => { enviados.push(m); },
    close() { this.cerrado = true; },
  };
  return { canal, enviados };
}

const NEGOCIO = { nombre: "Knock-Out", logoUrl: null };

describe("crearPublicador", () => {
  it("al saludar la pantalla, le manda el negocio y el estado actual", () => {
    const { canal, enviados } = canalFalso();
    const p = crearPublicador(canal, () => NEGOCIO);
    p.publicar({ fase: "cobro", total: 50 });
    enviados.length = 0;
    canal.onmessage?.({ data: { tipo: "hola", v: 1 } });
    expect(enviados).toEqual([
      { tipo: "negocio", v: 1, nombre: "Knock-Out", logoUrl: null },
      { tipo: "estado", v: 1, vista: { fase: "cobro", total: 50 } },
    ]);
  });

  it("ignora mensajes que no son un saludo", () => {
    const { canal, enviados } = canalFalso();
    crearPublicador(canal, () => NEGOCIO);
    canal.onmessage?.({ data: { tipo: "estado", v: 1, vista: { fase: "reposo" } } });
    canal.onmessage?.({ data: "basura" });
    expect(enviados).toEqual([]);
  });

  it("late solo si hay algo en pantalla", () => {
    const { canal, enviados } = canalFalso();
    const p = crearPublicador(canal, () => NEGOCIO);
    p.latir();
    expect(enviados).toEqual([]);
    p.publicar({ fase: "cobro", total: 50 });
    p.latir();
    expect(enviados).toHaveLength(2);
  });

  it("al cerrar deja la pantalla en reposo", () => {
    const { canal, enviados } = canalFalso();
    const p = crearPublicador(canal, () => NEGOCIO);
    p.publicar({ fase: "cobro", total: 50 });
    p.cerrar();
    expect(enviados.at(-1)).toEqual({ tipo: "estado", v: 1, vista: { fase: "reposo" } });
    expect(canal.cerrado).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `pnpm --filter @vim/pos test -- pantalla-cliente`
Expected: FAIL, no existe `../pantalla-cliente/canal`.

- [ ] **Step 3: Implementar el canal**

`apps/pos/app/lib/pantalla-cliente/canal.ts`:

```ts
/**
 * El canal entre la caja y la pantalla del cliente.
 *
 * Es un `BroadcastChannel`: las dos ventanas son el mismo POS, en la misma computadora y con el
 * mismo origen, así que se hablan directo. No pasa por la base (la cuenta en captura vive solo en
 * memoria) ni por la red.
 */
import { leerMensaje, type Negocio, type VistaCliente } from "./vista";

export const NOMBRE_CANAL = "vim-pantalla-cliente";
/** Cada cuánto repite la caja su estado mientras hay algo en pantalla. */
export const LATIDO_MS = 5000;
/** Silencio tras el que la pantalla vuelve a reposo: una caja colgada no deja una cuenta vieja a la vista. */
export const SILENCIO_MS = 15000;

/** Lo que se usa de `BroadcastChannel`, para poder probar sin navegador. */
export type Canal = {
  postMessage(m: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  close(): void;
};

export function abrirCanal(): Canal | null {
  if (typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(NOMBRE_CANAL) as unknown as Canal;
}

export function crearPublicador(canal: Canal, negocio: () => Negocio) {
  let ultima: VistaCliente = { fase: "reposo" };
  const enviarEstado = () => canal.postMessage({ tipo: "estado", v: 1, vista: ultima });
  const anunciar = () => { const n = negocio(); canal.postMessage({ tipo: "negocio", v: 1, nombre: n.nombre, logoUrl: n.logoUrl }); };

  // La pantalla saluda al abrirse (o al recargarse): se le pone al día.
  canal.onmessage = (e) => {
    if (leerMensaje(e.data)?.tipo !== "hola") return;
    anunciar();
    enviarEstado();
  };

  return {
    anunciar,
    publicar(vista: VistaCliente) { ultima = vista; enviarEstado(); },
    latir() { if (ultima.fase !== "reposo") enviarEstado(); },
    cerrar() {
      ultima = { fase: "reposo" };
      enviarEstado();
      canal.onmessage = null;
      canal.close();
    },
  };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `pnpm --filter @vim/pos test -- pantalla-cliente`
Expected: 15 pruebas, todas PASS.

- [ ] **Step 5: Escribir el hook**

`apps/pos/app/components/use-publicar-pantalla-cliente.ts`:

```ts
"use client";
import { useEffect, useRef } from "react";
import { abrirCanal, crearPublicador, LATIDO_MS } from "../lib/pantalla-cliente/canal";
import { construirVista, type EntradaVista, type Negocio, type VistaCliente } from "../lib/pantalla-cliente/vista";

/**
 * Publica a la pantalla del cliente lo que la caja tiene en la venta. Si no hay segunda pantalla
 * nadie escucha y no pasa nada: publicar no cuesta y no depende de saber si está abierta.
 */
export function usePublicarPantallaCliente(entrada: EntradaVista, negocio: Negocio): void {
  const publicador = useRef<ReturnType<typeof crearPublicador> | null>(null);
  const negocioRef = useRef(negocio);
  negocioRef.current = negocio;

  useEffect(() => {
    const canal = abrirCanal();
    if (!canal) return;
    const p = crearPublicador(canal, () => negocioRef.current);
    publicador.current = p;
    p.anunciar();
    const id = setInterval(() => p.latir(), LATIDO_MS);
    return () => { clearInterval(id); p.cerrar(); publicador.current = null; };
  }, []);

  // La vista se compara por su texto: el carrito cambia de identidad en cada render aunque el
  // cliente no vaya a ver nada distinto, y no hay por qué mandar el mismo mensaje dos veces.
  const clave = JSON.stringify(construirVista(entrada));
  useEffect(() => {
    publicador.current?.publicar(JSON.parse(clave) as VistaCliente);
  }, [clave]);
}
```

- [ ] **Step 6: Llamarlo desde `home-pos.tsx`**

Agregar el import junto a los demás de `./` (cerca de la línea 39):

```ts
import { usePublicarPantallaCliente } from "./use-publicar-pantalla-cliente";
```

Y después de la declaración de `itemsPersistidos` (línea ~295), donde `carrito`, `ticketBd`, `ticketIncompleto`, `totalesCobro` y `confirmacion` ya existen:

```ts
  // Pantalla del cliente (segundo monitor). `totalAutoritativo` es la MISMA condición que recibe
  // SidebarTicket en `totalConDescuento`: el cliente tiene que ver el número que ve el cajero.
  usePublicarPantallaCliente(
    {
      carrito,
      totalAutoritativo: ticketBd && !ticketIncompleto ? ticketBd.total : null,
      cobro: totalesCobro ? { total: totalesCobro.total } : null,
      pagado: confirmacion ? { total: confirmacion.total, cambio: confirmacion.cambio } : null,
    },
    { nombre: caja.negocioNombre, logoUrl: caja.logoUrl },
  );
```

Verificar con `grep -n "totalConDescuento=" apps/pos/app/components/home-pos.tsx` que la condición del costado sigue siendo `ticketBd && !ticketIncompleto ? ticketBd.total : undefined`. Si cambió, usar la que esté.

- [ ] **Step 7: Verificar tipos y pruebas**

Run: `pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test`
Expected: sin errores de tipos; toda la suite en PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/pos/app/lib/pantalla-cliente/canal.ts apps/pos/app/components/use-publicar-pantalla-cliente.ts apps/pos/app/components/home-pos.tsx apps/pos/app/lib/__tests__/pantalla-cliente.test.ts
git commit -m "feat(pos): la caja publica la cuenta a la pantalla del cliente"
```

---

### Task 7: La vista del cliente y el modo `?cliente`

**Files:**
- Create: `apps/pos/app/components/pantalla-cliente.tsx`
- Modify: `apps/pos/app/page.tsx`
- Create: `docs/diseno/pantalla-cliente.md`

**Interfaces:**
- Consumes: `abrirCanal`, `SILENCIO_MS` (Task 6); `leerMensaje`, `VistaCliente`, `Negocio`, `RenglonCliente` (Task 5); `fmtMxn` de `apps/pos/app/lib/turno.ts`.
- Produces: `PantallaCliente()` (componente sin props), montado cuando la URL trae `?cliente`.

Antes de escribir CSS: leer `docs/diseno/nucleo.md` y `docs/diseno/pos.md`, y cargar las skills `emil-design-eng` e `impeccable`. El código de abajo es la estructura y el comportamiento; el acabado visual se ajusta con esas guías sin cambiar el comportamiento. No inventar colores: solo tokens de `packages/ui/tokens.css`.

- [ ] **Step 1: Escribir el componente**

`apps/pos/app/components/pantalla-cliente.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { abrirCanal, SILENCIO_MS } from "../lib/pantalla-cliente/canal";
import { leerMensaje, type Negocio, type RenglonCliente, type VistaCliente } from "../lib/pantalla-cliente/vista";
import { fmtMxn } from "../lib/turno";

/** El negocio se recuerda entre arranques: por la mañana, antes de que entre el cajero, nadie
 *  publica nada y la pantalla igual tiene que enseñar el logo. */
const CLAVE_NEGOCIO = "vim.pantalla-cliente.negocio";

function negocioGuardado(): Negocio | null {
  try {
    const n: unknown = JSON.parse(localStorage.getItem(CLAVE_NEGOCIO) ?? "null");
    if (n && typeof n === "object" && "nombre" in n && typeof n.nombre === "string") {
      const logoUrl = "logoUrl" in n && typeof n.logoUrl === "string" ? n.logoUrl : null;
      return { nombre: n.nombre, logoUrl };
    }
  } catch { /* sin almacenamiento o con basura: se espera al saludo de la caja */ }
  return null;
}

/**
 * Lo que ve el cliente en el segundo monitor. Solo dibuja lo que la caja le publica: no inicia
 * sesión ni lee la base.
 */
export function PantallaCliente() {
  const [vista, setVista] = useState<VistaCliente>({ fase: "reposo" });
  const [negocio, setNegocio] = useState<Negocio | null>(null);

  useEffect(() => {
    setNegocio(negocioGuardado());
    const canal = abrirCanal();
    if (!canal) return;
    let silencio: ReturnType<typeof setTimeout> | undefined;
    canal.onmessage = (e) => {
      const m = leerMensaje(e.data);
      if (!m) return; // lo que no se entiende se ignora; queda lo último válido
      if (m.tipo === "negocio") {
        const n = { nombre: m.nombre, logoUrl: m.logoUrl };
        setNegocio(n);
        try { localStorage.setItem(CLAVE_NEGOCIO, JSON.stringify(n)); } catch { /* */ }
        return;
      }
      if (m.tipo !== "estado") return;
      setVista(m.vista);
      clearTimeout(silencio);
      // Si la caja se cuelga o se recarga a media cuenta, deja de latir: a los 15 s se vuelve a
      // reposo para no dejarle la cuenta de un cliente al siguiente.
      if (m.vista.fase !== "reposo") silencio = setTimeout(() => setVista({ fase: "reposo" }), SILENCIO_MS);
    };
    canal.postMessage({ tipo: "hola", v: 1 });
    return () => { clearTimeout(silencio); canal.onmessage = null; canal.close(); };
  }, []);

  return (
    <main className="flex h-screen w-screen cursor-none select-none flex-col overflow-hidden bg-bg text-ink" data-fase={vista.fase}>
      {vista.fase === "reposo" && <Reposo negocio={negocio} />}
      {vista.fase === "cuenta" && <Cuenta renglones={vista.renglones} envio={vista.envio} total={vista.total} />}
      {vista.fase === "cobro" && <Monto titulo="Total a pagar" monto={vista.total} />}
      {vista.fase === "pagado" && (
        vista.cambio > 0
          ? <Monto titulo="¡Gracias!" subtitulo="Su cambio" monto={vista.cambio} />
          : <Monto titulo="¡Gracias!" subtitulo="Vuelva pronto" monto={null} />
      )}
    </main>
  );
}

function Reposo({ negocio }: { negocio: Negocio | null }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-[4vmin] p-[6vmin] text-center">
      {negocio?.logoUrl && <img src={negocio.logoUrl} alt="" className="max-h-[40vmin] max-w-[60vmin] object-contain" />}
      {negocio && <h1 className="font-display text-[7vmin] font-semibold leading-tight">{negocio.nombre}</h1>}
    </section>
  );
}

function Monto({ titulo, subtitulo, monto }: { titulo: string; subtitulo?: string; monto: number | null }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-[3vmin] p-[6vmin] text-center">
      <h1 className="font-display text-[7vmin] font-semibold leading-tight">{titulo}</h1>
      {subtitulo && <p className="text-[4vmin] text-ink-2">{subtitulo}</p>}
      {monto !== null && <p className="font-display text-[16vmin] font-semibold leading-none tabular-nums">{fmtMxn(monto)}</p>}
    </section>
  );
}

function Cuenta({ renglones, envio, total }: { renglones: RenglonCliente[]; envio: { nombre: string; importe: number } | null; total: number }) {
  const fin = useRef<HTMLLIElement | null>(null);
  // El último artículo agregado siempre queda a la vista, aunque la lista ya no quepa.
  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [renglones.length, envio]);

  return (
    <>
      <ul className="flex-1 overflow-hidden px-[5vmin] pt-[4vmin]">
        {renglones.map((r) => (
          <li key={r.id} className="flex items-baseline gap-[2.5vmin] border-b border-line py-[2vmin] text-[4vmin]">
            <span className="w-[8vmin] shrink-0 text-right tabular-nums text-ink-2">{r.cantidad}×</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{r.nombre}</span>
              {r.detalle.length > 0 && <span className="block text-[2.8vmin] text-ink-2">{r.detalle.join(" · ")}</span>}
            </span>
            <span className="shrink-0 tabular-nums">{fmtMxn(r.importe)}</span>
          </li>
        ))}
        {envio && (
          <li className="flex items-baseline gap-[2.5vmin] border-b border-line py-[2vmin] text-[4vmin]">
            <span className="w-[8vmin] shrink-0" />
            <span className="min-w-0 flex-1 text-ink-2">Envío · {envio.nombre}</span>
            <span className="shrink-0 tabular-nums">{fmtMxn(envio.importe)}</span>
          </li>
        )}
        <li ref={fin} aria-hidden className="h-[2vmin]" />
      </ul>
      <footer className="flex items-baseline justify-between border-t border-line-strong bg-surface px-[5vmin] py-[3.5vmin]">
        <span className="text-[5vmin] text-ink-2">Total</span>
        <span className="font-display text-[11vmin] font-semibold leading-none tabular-nums">{fmtMxn(total)}</span>
      </footer>
    </>
  );
}
```

Los tamaños van en `vmin` a propósito: el monitor del cliente puede ser horizontal, vertical o casi cuadrado, y así la vista se acomoda sin puntos de corte.

Verificar que `bg-bg`, `text-ink-2`, `border-line`, `border-line-strong`, `bg-surface` y `font-display` existen en el preset (`grep -n "ink-2\|line-strong\|surface\|display" packages/config/tailwind-preset.*`). Si alguna tiene otro nombre, usar el del preset.

- [ ] **Step 2: Montarla con `?cliente`**

En `apps/pos/app/page.tsx`, agregar el import:

```ts
import { PantallaCliente } from "./components/pantalla-cliente";
```

Renombrar `export default function Page()` a `function PaginaPos()` y agregar al final del archivo:

```tsx
/**
 * Pantalla del cliente: el escritorio abre esta misma página con `?cliente` en el segundo monitor.
 * Es otra página en todo menos en el archivo: no inicia sesión, no lee directivas y no puede quedar
 * detrás de la puerta de acceso de la caja.
 *
 * El modo se decide tras montar y no al cargar el módulo: la página es un export estático, y el
 * HTML generado no sabe de la URL; decidirlo antes daría un desajuste de hidratación.
 */
export default function Page() {
  const [modo, setModo] = useState<"pos" | "cliente" | null>(null);
  useEffect(() => {
    setModo(new URLSearchParams(window.location.search).has("cliente") ? "cliente" : "pos");
  }, []);
  if (modo === null) return <main className="h-screen bg-bg" />;
  return modo === "cliente" ? <PantallaCliente /> : <PaginaPos />;
}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos lint`
Expected: sin errores.

- [ ] **Step 4: Escribir el documento de diseño**

`docs/diseno/pantalla-cliente.md`, con la misma estructura de encabezados que `docs/diseno/kds.md`, y este contenido mínimo:

```markdown
# Pantalla del cliente

Segundo monitor de la caja, de cara al mostrador. La ve alguien de pie, a un metro o más, que no
la toca. Comparte la marca de `nucleo.md`.

## Reglas

- **Se lee de lejos.** Todo el tamaño va en `vmin`: el monitor puede ser horizontal, vertical o casi
  cuadrado. Nada mide en píxeles fijos.
- **Un solo número manda.** En la cuenta, el total; al cobrar, el total a pagar; al terminar, el
  cambio. Es lo más grande de la pantalla en cada fase.
- **No se toca.** Sin cursor, sin selección, sin botones, sin scroll manual. La lista se desplaza
  sola para dejar a la vista el último artículo.
- **No dice nada privado.** Ni notas de cocina, ni nombre, teléfono o dirección del cliente, ni
  nombre del cajero. Esto se garantiza en `construirVista`, no aquí.
- **El total es el del cajero.** Mismo número que el costado de la caja, siempre.

## Fases

| Fase | Qué muestra |
|---|---|
| Reposo | Logo y nombre del negocio. Con anuncios (entrega 2), el carrusel. |
| Cuenta | Renglones (cantidad, nombre, detalle, importe), envío si aplica, total fijo abajo. |
| Cobro | «Total a pagar» y el monto. |
| Pagado | «¡Gracias!» y el cambio; sin cambio, «Vuelva pronto». |

## Movimiento

Solo fundido entre fases y entrada suave del renglón nuevo, con `--ease-out`. Con
`prefers-reduced-motion`, sin movimiento.
```

- [ ] **Step 5: Commit**

```bash
git add apps/pos/app/components/pantalla-cliente.tsx apps/pos/app/page.tsx docs/diseno/pantalla-cliente.md
git commit -m "feat(pos): vista del cliente en el modo ?cliente"
```

---

### Task 8: Ajuste en el POS

**Files:**
- Create: `apps/pos/app/lib/pantalla-cliente/ajuste.ts`
- Create: `apps/pos/app/components/ajuste-pantalla-cliente.tsx`
- Modify: `apps/pos/app/components/modal-config-impresora.tsx:105` (después del párrafo «Las impresoras son por dispositivo…»)
- Modify: `apps/pos/app/lib/__tests__/pantalla-cliente.test.ts`

**Interfaces:**
- Consumes: ruta `/__pantalla-cliente` (Task 3).
- Produces:
  - `type AjustePantalla = { disponible: boolean; modo: "auto" | "apagada"; displayId: number | null; abierta: boolean; monitores: Array<{ id: number; etiqueta: string; ancho: number; alto: number; esDeLaCaja: boolean }> }`
  - `leerAjustePantalla(): Promise<AjustePantalla | null>`
  - `guardarAjustePantalla(cambio: { modo: "auto" | "apagada"; displayId: number | null }): Promise<AjustePantalla | null>`
  - `textoEstadoPantalla(a: AjustePantalla): string`
  - `AjustePantallaCliente()` (componente sin props)

- [ ] **Step 1: Agregar las pruebas del texto de estado**

Al final de `apps/pos/app/lib/__tests__/pantalla-cliente.test.ts`:

```ts
import { textoEstadoPantalla, type AjustePantalla } from "../pantalla-cliente/ajuste";

const M1 = { id: 1, etiqueta: "Monitor 1", ancho: 1920, alto: 1080, esDeLaCaja: true };
const M2 = { id: 2, etiqueta: "HDMI", ancho: 1024, alto: 768, esDeLaCaja: false };
const base: AjustePantalla = { disponible: true, modo: "auto", displayId: null, abierta: false, monitores: [M1] };

describe("textoEstadoPantalla", () => {
  it("sin segundo monitor lo dice", () => {
    expect(textoEstadoPantalla(base)).toBe("No hay un segundo monitor conectado.");
  });
  it("abierta dice en cuál", () => {
    expect(textoEstadoPantalla({ ...base, abierta: true, monitores: [M1, M2] })).toBe("Abierta en HDMI (1024×768).");
  });
  it("apagada lo dice aunque haya monitor", () => {
    expect(textoEstadoPantalla({ ...base, modo: "apagada", monitores: [M1, M2] })).toBe("Apagada.");
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `pnpm --filter @vim/pos test -- pantalla-cliente`
Expected: FAIL, no existe `../pantalla-cliente/ajuste`.

- [ ] **Step 3: Implementar el cliente HTTP**

`apps/pos/app/lib/pantalla-cliente/ajuste.ts`:

```ts
/**
 * Ajuste de la pantalla del cliente, servido por el escritorio en `/__pantalla-cliente`.
 * Se guarda en la computadora de la caja, no en la nube: qué monitor es cuál es cosa de cada equipo.
 */
import { z } from "zod";

const esquema = z.object({
  disponible: z.literal(true),
  modo: z.enum(["auto", "apagada"]),
  displayId: z.number().nullable(),
  abierta: z.boolean(),
  monitores: z.array(z.object({ id: z.number(), etiqueta: z.string(), ancho: z.number(), alto: z.number(), esDeLaCaja: z.boolean() })),
});

export type AjustePantalla = z.infer<typeof esquema>;

async function interpretar(r: Response): Promise<AjustePantalla | null> {
  if (!r.ok) return null;
  const p = esquema.safeParse(await r.json());
  return p.success ? p.data : null;
}

/** null = no hay escritorio (POS web, segunda caja de la LAN) o no contestó. */
export async function leerAjustePantalla(): Promise<AjustePantalla | null> {
  try { return await interpretar(await fetch("/__pantalla-cliente", { cache: "no-store" })); } catch { return null; }
}

export async function guardarAjustePantalla(cambio: { modo: "auto" | "apagada"; displayId: number | null }): Promise<AjustePantalla | null> {
  try {
    return await interpretar(await fetch("/__pantalla-cliente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambio) }));
  } catch { return null; }
}

export function textoEstadoPantalla(a: AjustePantalla): string {
  if (a.modo === "apagada") return "Apagada.";
  const otros = a.monitores.filter((m) => !m.esDeLaCaja);
  if (otros.length === 0) return "No hay un segundo monitor conectado.";
  if (!a.abierta) return "Hay un segundo monitor, pero la pantalla no se abrió.";
  const m = otros.find((o) => o.id === a.displayId) ?? otros[0]!;
  return `Abierta en ${m.etiqueta} (${m.ancho}×${m.alto}).`;
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `pnpm --filter @vim/pos test -- pantalla-cliente`
Expected: 18 pruebas, todas PASS.

- [ ] **Step 5: Escribir el apartado**

`apps/pos/app/components/ajuste-pantalla-cliente.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { guardarAjustePantalla, leerAjustePantalla, textoEstadoPantalla, type AjustePantalla } from "../lib/pantalla-cliente/ajuste";

/**
 * Apartado «Pantalla del cliente» del modal de impresoras. La pantalla se abre sola al detectar
 * un segundo monitor; esto es solo la salida para quien usa ese monitor en otra cosa, y el
 * selector para quien tiene más de dos.
 *
 * No se pinta si no hay escritorio: en el POS web o en la segunda caja de la LAN no hay ventana
 * que abrir.
 */
export function AjustePantallaCliente() {
  const [ajuste, setAjuste] = useState<AjustePantalla | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;
    leerAjustePantalla().then((a) => { if (vivo) setAjuste(a); });
    return () => { vivo = false; };
  }, []);

  if (!ajuste) return null;
  const candidatos = ajuste.monitores.filter((m) => !m.esDeLaCaja);

  async function cambiar(cambio: { modo: "auto" | "apagada"; displayId: number | null }) {
    setFallo(false);
    const nuevo = await guardarAjustePantalla(cambio);
    if (nuevo) setAjuste(nuevo); else setFallo(true);
  }

  return (
    <section className="mb-4 flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded border border-line p-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-13 font-semibold text-ink">Pantalla del cliente</h3>
        <p className="text-13 text-ink-3">{textoEstadoPantalla(ajuste)}</p>
        {fallo && <p className="text-13 text-danger">No se pudo guardar el cambio.</p>}
      </div>
      {candidatos.length > 1 && ajuste.modo === "auto" && (
        <select
          aria-label="Monitor de la pantalla del cliente"
          className="h-11 rounded border border-line-strong px-3 text-sm"
          value={ajuste.displayId ?? candidatos[0]!.id}
          onChange={(e) => void cambiar({ modo: "auto", displayId: Number(e.target.value) })}
        >
          {candidatos.map((m) => <option key={m.id} value={m.id}>{m.etiqueta} ({m.ancho}×{m.alto})</option>)}
        </select>
      )}
      <label className="flex h-11 cursor-pointer items-center gap-2 text-13 text-ink-2">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={ajuste.modo === "auto"}
          onChange={(e) => void cambiar({ modo: e.target.checked ? "auto" : "apagada", displayId: ajuste.displayId })}
        />
        Encendida
      </label>
    </section>
  );
}
```

- [ ] **Step 6: Montarlo en el modal de impresoras**

En `apps/pos/app/components/modal-config-impresora.tsx`, agregar el import:

```ts
import { AjustePantallaCliente } from "./ajuste-pantalla-cliente";
```

Cambiar el título del modal de `"Impresoras de esta caja"` a `"Impresoras y pantallas de esta caja"`, y justo después del párrafo de la línea 105 (`Las impresoras son por dispositivo: se guardan solo en esta caja.`) agregar:

```tsx
      <AjustePantallaCliente />
```

Buscar con `grep -rn "Impresoras de esta caja\|Impresora" apps/pos/app/components/*.tsx` la entrada del menú general que abre este modal; si dice «Impresoras», cambiarla a «Impresoras y pantallas» para que el ajuste se pueda encontrar.

- [ ] **Step 7: Verificar tipos**

Run: `pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos lint`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add apps/pos/app/lib/pantalla-cliente/ajuste.ts apps/pos/app/components/ajuste-pantalla-cliente.tsx apps/pos/app/components/modal-config-impresora.tsx apps/pos/app/lib/__tests__/pantalla-cliente.test.ts
git commit -m "feat(pos): ajuste de la pantalla del cliente en la caja"
```

Incluir en el `git add` cualquier otro archivo tocado al renombrar la entrada del menú.

---

### Task 9: Verificación de punta a punta en el navegador

**Files:**
- Create: `desktop/scripts/arnes-pantalla-cliente.mjs`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: evidencia (capturas) de las cuatro fases y del regreso a reposo.

El dev server no sirve aquí: no inyecta `__VIM_DESKTOP` ni las rutas `/__*`. Se levanta el POS empaquetado sin Electron. La caja instalada de Fermín ocupa 54350 y 54360, por eso el arnés usa 54450 y 54460.

- [ ] **Step 1: Escribir el arnés**

`desktop/scripts/arnes-pantalla-cliente.mjs`:

```js
// Levanta backend + UI del POS empaquetado en puertos de prueba, sin Electron, para verificar la
// pantalla del cliente con dos pestañas del navegador:
//   http://localhost:54460            (la caja)
//   http://localhost:54460/?cliente   (la pantalla del cliente)
// La ventana automática y los monitores son de Electron y se prueban en el instalador.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBackend } from "../src/backend.mjs";
import { startUiServer } from "../src/ui-server.mjs";

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pos-ui");
const GATEWAY = 54450;
const UI = 54460;

// Monitores de mentira, para ver el apartado de ajuste con datos.
let estado = {
  disponible: true, modo: "auto", displayId: null, abierta: true,
  monitores: [
    { id: 1, etiqueta: "Monitor 1", ancho: 1920, alto: 1080, esDeLaCaja: true },
    { id: 2, etiqueta: "HDMI", ancho: 1024, alto: 768, esDeLaCaja: false },
  ],
};

const backend = await startBackend({ gatewayPort: GATEWAY, host: "127.0.0.1", uiPorts: [UI], log: (m) => console.log("· [backend]", m) });
const ui = await startUiServer(UI_DIR, UI, GATEWAY, "127.0.0.1", {
  estadoSync: () => ({ disponible: true, vinculada: false }),
  pantallaCliente: () => estado,
  onPantallaCliente: (c) => { estado = { ...estado, modo: c.modo, displayId: c.displayId, abierta: c.modo === "auto" }; return estado; },
});
console.log(`listo: http://localhost:${UI}  ·  http://localhost:${UI}/?cliente`);

process.on("SIGINT", async () => { ui.close(); await backend.stop(); process.exit(0); });
```

Si `startBackend` rechaza alguna opción, las vigentes están en `desktop/src/verify-hub.mjs`.

- [ ] **Step 2: Construir la UI y levantar el arnés**

Con el dev server del POS apagado (comparten `.next`):

```bash
cd desktop && npm run build:ui
```

Tarda unos minutos. Después, en segundo plano y sin `| head` (cierra el pipe y mata el proceso):

```bash
node desktop/scripts/arnes-pantalla-cliente.mjs
```

Expected: `listo: http://localhost:54460 · http://localhost:54460/?cliente`.

- [ ] **Step 3: Recorrer el flujo con dos pestañas**

En el panel del navegador, con viewport fijo (`resize_window` 1280×900):

1. Pestaña A: `http://localhost:54460`. Vincular con el dispositivo del seed (`caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.mx`; la contraseña está en `supabase/seed.sql`), entrar con María.
2. Pestaña B: `http://localhost:54460/?cliente`.

Comprobar en B, con `read_page` y captura, cada punto:

| Acción en A | Lo que debe verse en B |
|---|---|
| Recién entrado, sin artículos | Logo y nombre del negocio. |
| Agregar un producto | El renglón con cantidad, nombre e importe; el total. |
| Agregar uno con modificadores | El detalle debajo del nombre. |
| Subir la cantidad, luego quitar un renglón | Importe, total y lista se actualizan. |
| Ponerle nota de cocina a un renglón | La nota **no** aparece. |
| Abrir Cobrar | «Total a pagar» y el monto del costado de A. |
| Cobrar en efectivo con más dinero | «¡Gracias!», «Su cambio» y el mismo cambio que A. |
| Esperar 5 s | Reposo. |
| Con artículos en A, recargar B | B vuelve a mostrar la cuenta (saludo). |
| Con artículos en A, cerrar la pestaña A | B vuelve a reposo en menos de 20 s. |

Además, en A: abrir el modal de impresoras y comprobar que aparece «Pantalla del cliente — Abierta en HDMI (1024×768).», y que desmarcar «Encendida» cambia el texto a «Apagada.».

Repetir la fase de cuenta con B en 768×1024 (vertical) y en 1280×1024 (casi cuadrada): nada se corta ni se encima.

- [ ] **Step 4: Limpiar**

Detener el arnés localizando el proceso por puerto desde PowerShell (`Get-NetTCPConnection -LocalPort 54460`, verificar `CommandLine`, `Stop-Process -Id`). No tocar el proceso «VIM POS» de la caja instalada. Si el recorrido dejó tickets en el `pgdata` de desarrollo, borrarlos: ese fixture lo comparten otras recetas.

- [ ] **Step 5: Commit**

```bash
git add desktop/scripts/arnes-pantalla-cliente.mjs
git commit -m "test(escritorio): arnés para probar la pantalla del cliente en el navegador"
```

---

### Task 10: ADR, RUNBOOK y prueba en el instalador

**Files:**
- Create: `docs/decisiones/0026-la-pantalla-del-cliente-se-enciende-sola.md`
- Modify: `docs/decisiones/README.md` (agregar la 0026 al índice, con el formato de las demás)
- Modify: `desktop/RUNBOOK.md`
- Modify: `docs/especificacion/flujos/01-FLUJOS-COMUNES-CORE.md:2504` (nota de que el ADR 0026 supera esa fila)

- [ ] **Step 1: Escribir el ADR**

Con los mismos encabezados que `docs/decisiones/0025-el-inventario-se-cierra-por-plan-sin-tocar-la-venta.md`, y este contenido:

- **Contexto:** la especificación (flujos comunes §28.2.bis) preveía un «Display al cliente» como módulo opcional que el dueño activa en el admin. La cuenta en captura vive solo en memoria de la caja hasta que se envía o cobra.
- **Decisión:**
  1. No es un módulo ni tiene candado de plan: se abre sola al detectar un segundo monitor en la computadora de la caja. La única configuración es local (apagarla o elegir monitor), como la impresora.
  2. La caja publica la cuenta a la pantalla por `BroadcastChannel`; no se guarda la cuenta en la base mientras se captura.
  3. Lo que se publica se arma campo por campo en `construirVista`; nada del carrito se copia tal cual.
  4. Los anuncios (entrega 2) vivirán en un almacén con copia local en la caja, no dentro del snapshot del sync.
- **Consecuencias:** funciona sin internet y sin tocar la ruta crítica de la venta. No sirve para una tablet por red: ahí haría falta SSE desde el ui-server, que queda fuera. El POS en navegador no tiene ventana automática.
- **Supera:** la fila «Display al cliente» de §28.2.bis.

- [ ] **Step 2: Agregar al RUNBOOK cómo probar con dos monitores**

Sección nueva en `desktop/RUNBOOK.md`, «Pantalla del cliente», con esta lista para cada instalador que toque `pantalla-cliente.mjs` o `pantalla-cliente.tsx`:

```markdown
## Pantalla del cliente

Solo se puede probar de verdad con dos monitores y el instalador (o `npm start` en `desktop/`).

- [ ] Con dos monitores, al abrir la caja la pantalla del cliente aparece sola en el segundo.
- [ ] Ocupa todo el monitor: sin marco, sin barra de título, sin barra de tareas encima.
- [ ] No aparece en la barra de tareas ni en Alt+Tab.
- [ ] Al escribir o escanear, el foco sigue en la caja.
- [ ] Desconectar el segundo monitor: la caja sigue igual. Reconectar: la pantalla vuelve sola.
- [ ] Capturar, cobrar y ver el cambio: las dos pantallas coinciden en el total y en el cambio.
- [ ] En el modal de impresoras, apagarla la cierra; encenderla la reabre. Sigue apagada tras reiniciar.
- [ ] Cerrar la caja a la bandeja: la pantalla del cliente queda en reposo. «Salir» la cierra.
- [ ] Con un solo monitor: nada cambia respecto a la versión anterior.
- [ ] El monitor del cliente no se apaga solo tras varios minutos sin uso.

El registro queda en `vim-pos.log` con la etiqueta `[pantalla-cliente]`.
```

- [ ] **Step 3: Suite completa**

Run: `pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test && node --test desktop/src/*.test.mjs`
Expected: todo en PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/decisiones docs/especificacion/flujos/01-FLUJOS-COMUNES-CORE.md desktop/RUNBOOK.md
git commit -m "docs: ADR 0026 y lista de prueba de la pantalla del cliente"
```

- [ ] **Step 5: Parar aquí**

No abrir PR, no empaquetar y no publicar sin que Fermín lo pida. Entregarle:

- Las capturas de la Task 9.
- La lista del RUNBOOK, que solo se puede pasar con dos monitores: la pasa él o se pasa con él.
- Lo que incluiría el instalador (solo caja; sin migración; sin cambios en la web).

La entrega 2 (anuncios) tiene su propio plan y se escribe cuando esta esté publicada.
