// Pruebas del sondeo del menú.
//
// Lo que el CI tiene que proteger en cada commit: que preguntar sea barato (no se baja el
// catálogo si nada cambió), que un cambio SÍ lo baje, que un PULL fallido se reintente en vez de
// darse por bueno, y que una nube caída no ponga la caja a preguntar cada minuto para siempre.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearSondeoCatalogo, esperaSondeo, SONDEO_CADA_MS, SONDEO_TOPE_MS } from "./sondeo-catalogo.mjs";

/** Temporizadores inertes: el sondeo corre su primer tick y no se re-arma solo. */
const sinTimers = { setTimeoutFn: () => ({ unref() {} }), clearTimeoutFn: () => {} };

/** Deja correr las microtareas del tick. */
const asentar = () => new Promise((r) => setImmediate(r));

test("si la versión no cambió, no se baja el catálogo", async () => {
  let pulls = 0;
  const sondeo = crearSondeoCatalogo({
    leerVersion: async () => "2026-09-06T10:00:00Z",
    bajarCatalogo: async () => { pulls++; return true; },
    ...sinTimers,
  });
  sondeo.marcarVista("2026-09-06T10:00:00Z"); // el arranque ya lo bajó
  sondeo.iniciar();
  await asentar();
  sondeo.detener();
  assert.equal(pulls, 0, "preguntar es barato: no se baja nada si nada cambió");
});

test("un cambio en la nube baja el catálogo una sola vez", async () => {
  let pulls = 0;
  let version = "v1";
  const sondeo = crearSondeoCatalogo({
    leerVersion: async () => version,
    bajarCatalogo: async () => { pulls++; return true; },
    ...sinTimers,
  });
  sondeo.marcarVista("v1");
  sondeo.iniciar();
  await asentar();
  assert.equal(pulls, 0);

  version = "v2"; // el dueño dio de alta un producto
  sondeo.iniciar();
  await asentar();
  assert.equal(pulls, 1, "bajó el catálogo");

  sondeo.iniciar(); // y en el siguiente sondeo, con la misma versión, ya no
  await asentar();
  sondeo.detener();
  assert.equal(pulls, 1, "no vuelve a bajar lo mismo");
});

test("sin versión previa se baja el catálogo: la caja pudo arrancar sin red", async () => {
  let pulls = 0;
  const sondeo = crearSondeoCatalogo({
    leerVersion: async () => "v1",
    bajarCatalogo: async () => { pulls++; return true; },
    ...sinTimers,
  });
  sondeo.iniciar(); // sin marcarVista: nadie confirmó que la copia local esté al día
  await asentar();
  sondeo.detener();
  assert.equal(pulls, 1);
});

test("un PULL fallido NO se da por visto: se reintenta", async () => {
  let pulls = 0;
  const sondeo = crearSondeoCatalogo({
    leerVersion: async () => "v2",
    bajarCatalogo: async () => { pulls++; return false; }, // la nube rechazó el snapshot
    ...sinTimers,
  });
  sondeo.marcarVista("v1");
  sondeo.iniciar();
  await asentar();
  sondeo.iniciar();
  await asentar();
  sondeo.detener();
  assert.equal(pulls, 2, "se volvió a intentar en el siguiente sondeo");
  assert.equal(sondeo.estado().ultimaVista, "v1", "la versión rota no quedó marcada como vista");
});

test("una caja sin vincular no dispara nada ni cuenta como fallo", async () => {
  let pulls = 0;
  const sondeo = crearSondeoCatalogo({
    leerVersion: async () => null, // sin nube a quién preguntar
    bajarCatalogo: async () => { pulls++; return true; },
    ...sinTimers,
  });
  sondeo.iniciar();
  await asentar();
  sondeo.detener();
  assert.equal(pulls, 0);
  assert.equal(sondeo.estado().fallos, 0, "no hay nube, no hay fallo: no debe entrar en backoff");
});

test("el sondeo no se solapa consigo mismo", async () => {
  let enVuelo = 0;
  let maxSimultaneos = 0;
  const sondeo = crearSondeoCatalogo({
    leerVersion: async () => `v${Date.now()}`,
    bajarCatalogo: async () => {
      enVuelo++;
      maxSimultaneos = Math.max(maxSimultaneos, enVuelo);
      await new Promise((r) => setImmediate(r));
      enVuelo--;
      return true;
    },
    ...sinTimers,
  });
  sondeo.iniciar();
  sondeo.iniciar(); // un segundo tick mientras el primero sigue bajando
  await asentar();
  await asentar();
  sondeo.detener();
  assert.equal(maxSimultaneos, 1, "dos PULL a la vez se pisarían escribiendo las mismas filas");
});

test("la nube caída entra en backoff hasta el techo, no pregunta cada minuto", () => {
  assert.equal(esperaSondeo(0), SONDEO_CADA_MS, "sin fallos, el ritmo normal");
  assert.equal(esperaSondeo(1), 2 * 60_000);
  assert.equal(esperaSondeo(2), 4 * 60_000);
  assert.equal(esperaSondeo(3), 8 * 60_000);
  assert.equal(esperaSondeo(4), SONDEO_TOPE_MS, "se topa a los 10 min");
  assert.equal(esperaSondeo(99), SONDEO_TOPE_MS, "y ahí se queda");
});

test("cerrar la app a media descarga no deja el sondeo re-armándose", async () => {
  let armados = 0;
  let terminarPull;
  const sondeo = crearSondeoCatalogo({
    leerVersion: async () => "v1",
    bajarCatalogo: () => new Promise((r) => { terminarPull = r; }),
    setTimeoutFn: () => { armados++; return { unref() {} }; },
    clearTimeoutFn: () => {},
  });
  sondeo.iniciar();
  await asentar();       // el tick se quedó esperando a que baje el catálogo
  sondeo.detener();      // …y ahí el usuario cierra la caja
  terminarPull(true);
  await asentar();
  assert.equal(armados, 0, "el tick que terminó después de detener() no volvió a programarse");
});
