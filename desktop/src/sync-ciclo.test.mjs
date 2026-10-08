// Pruebas del ciclo de sincronización, sin Postgres ni Electron.
//
// Primero el gancho de latido (ADR 0014, entrega 2): que corra SIEMPRE y que su fallo no contamine
// al ciclo. Si un latido caído contara como fallo, una nube intermitente dispararía el backoff y
// retrasaría la subida de ventas, que es exactamente lo contrario de lo que queremos.
// Después, con reloj falso, CUÁNDO se sincroniza y con qué backoff.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearCicloSync, esperaSiguiente, tocaPull, OMITIDO } from "./sync-ciclo.mjs";

/** Temporizadores inertes: el ciclo corre su primer tick y no se re-arma solo. */
const sinTimers = { setTimeoutFn: () => ({ unref() {} }), clearTimeoutFn: () => {} };

/** Deja correr las microtareas del tick. */
const asentar = () => new Promise((r) => setImmediate(r));

test("el latido corre en cada ciclo, incluso cuando el push falla", async () => {
  let latidos = 0;
  const ciclo = crearCicloSync({
    antesDeCadaCiclo: async () => { latidos++; },
    ejecutar: async () => false, // el push falla siempre
    ...sinTimers,
  });
  ciclo.iniciar();
  await asentar();
  ciclo.detener();
  assert.equal(latidos, 1, "el latido corrió aunque el push fallara");
});

test("un latido que revienta no cuenta como fallo del ciclo ni frena el push", async () => {
  let pushes = 0;
  const ciclo = crearCicloSync({
    antesDeCadaCiclo: async () => { throw new Error("sin red"); },
    ejecutar: async () => { pushes++; return true; },
    ...sinTimers,
  });
  ciclo.iniciar();
  await asentar();
  ciclo.detener();
  assert.equal(pushes, 1, "el push corrió igual");
  assert.equal(ciclo.estado().fallos, 0, "el ciclo se contó como exitoso");
});

test("el latido va ANTES del push: la caja reporta que está viva aunque el push tarde", async () => {
  const orden = [];
  const ciclo = crearCicloSync({
    antesDeCadaCiclo: async () => { orden.push("latido"); },
    ejecutar: async () => { orden.push("push"); return true; },
    ...sinTimers,
  });
  ciclo.iniciar();
  await asentar();
  ciclo.detener();
  assert.deepEqual(orden, ["latido", "push"]);
});

test("sin gancho de latido el ciclo sigue funcionando igual", async () => {
  let pushes = 0;
  const ciclo = crearCicloSync({ ejecutar: async () => { pushes++; return true; }, ...sinTimers });
  ciclo.iniciar();
  await asentar();
  ciclo.detener();
  assert.equal(pushes, 1);
});

test("un ciclo OMITIDO (la base está detenida por el respaldo) no cuenta como fallo ni dispara el backoff", async () => {
  const esperas = [];
  const ciclo = crearCicloSync({
    ejecutar: async () => OMITIDO,
    setTimeoutFn: (_fn, ms) => { esperas.push(ms); return { unref() {} }; },
    clearTimeoutFn: () => {},
    cadaMs: 600_000, reintentoMs: 60_000,
  });
  ciclo.iniciar();
  await asentar();
  assert.equal(ciclo.estado().fallos, 0);
  assert.equal(ciclo.estado().ciclos, 0, "tampoco consume el turno del PULL");
  assert.deepEqual(esperas, [60_000], "vuelve a intentar pronto, sin esperar el ciclo entero");
});

// ── Ritmo y backoff, con reloj falso ─────────────────────────────────────────────────────────

const MIN = 60 * 1000;

/** Reloj falso: ejecuta los temporizadores vencidos al avanzar el tiempo. */
function relojFalso() {
  let ahora = 0;
  let seq = 0;
  const pend = new Map();
  return {
    setTimeoutFn: (fn, ms) => { const id = ++seq; pend.set(id, { fn, at: ahora + ms }); return { id, unref() {} }; },
    clearTimeoutFn: (t) => { if (t) pend.delete(t.id); },
    async avanzar(ms) {
      const fin = ahora + ms;
      for (;;) {
        const listo = [...pend.entries()].filter(([, v]) => v.at <= fin).sort((a, b) => a[1].at - b[1].at)[0];
        if (!listo) break;
        const [id, { fn, at }] = listo;
        pend.delete(id);
        ahora = at;
        await fn();
        // Drena la cola de microtareas del tick completo. Un solo `Promise.resolve()` alcanzaba
        // mientras `tick()` tuviera un único `await`; al sumarse el latido (ADR 0014) el tick
        // quedaba a medias y las pruebas de ritmo fallaban por el arnés, no por el ciclo.
        await asentar();
      }
      ahora = fin;
    },
    get pendientes() { return pend.size; },
  };
}

test("política de espera: 10 min sin fallos; backoff 1, 2, 4, 8 con tope en 10; el PULL toca 1 de cada 6 ciclos", () => {
  assert.equal(esperaSiguiente(0), 10 * MIN);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((f) => esperaSiguiente(f) / MIN), [1, 2, 4, 8, 10, 10]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((n) => tocaPull(n)), [true, false, false, false, false, false, true, false]);
});

test("sincroniza al arrancar y luego cada 10 min; solo el arranque baja catálogo", async () => {
  const reloj = relojFalso();
  const llamadas = [];
  const c = crearCicloSync({
    ejecutar: async ({ conPull }) => { llamadas.push({ conPull }); return true; },
    setTimeoutFn: reloj.setTimeoutFn, clearTimeoutFn: reloj.clearTimeoutFn,
  });
  c.iniciar();
  await asentar();
  await reloj.avanzar(31 * MIN); // 3 intervalos más
  c.detener();
  assert.deepEqual(llamadas.map((l) => l.conPull), [true, false, false, false]);
});

test("nube caída: reintenta al minuto, a los 2 y a los 4, y al recuperarse vuelve a los 10 min", async () => {
  const reloj = relojFalso();
  let intentos = 0;
  const c = crearCicloSync({
    // Falla las 3 primeras veces (nube caída), luego se recupera.
    ejecutar: async () => { intentos++; return intentos > 3; },
    setTimeoutFn: reloj.setTimeoutFn, clearTimeoutFn: reloj.clearTimeoutFn,
  });
  c.iniciar();
  await asentar();

  await reloj.avanzar(1 * MIN);
  assert.equal(intentos, 2, "tras fallar reintenta al minuto, no a los 10");
  await reloj.avanzar(2 * MIN);
  assert.equal(intentos, 3, "segundo fallo: espera 2 min");
  await reloj.avanzar(4 * MIN);
  assert.equal(intentos, 4, "tercer fallo: espera 4 min y ya se recupera");
  await reloj.avanzar(9 * MIN);
  assert.equal(intentos, 4, "recuperado, no reintenta antes de los 10 min");
  await reloj.avanzar(2 * MIN);
  assert.equal(intentos, 5, "y vuelve al ritmo normal");
  c.detener();
});

test("nunca se solapan dos sincronizaciones", async () => {
  // El ciclo normal nunca reprograma hasta terminar, así que el solape solo puede venir de un
  // disparo externo: hoy un segundo iniciar(), mañana un botón de "sincronizar ahora". Dos
  // pushes a la vez competirían por marcar los mismos tickets como subidos.
  const reloj = relojFalso();
  let enVuelo = 0, solapes = 0;
  let liberar;
  const c = crearCicloSync({
    ejecutar: async () => {
      enVuelo++;
      if (enVuelo > 1) solapes++;
      await new Promise((r) => { liberar = r; });
      enVuelo--;
      return true;
    },
    setTimeoutFn: reloj.setTimeoutFn, clearTimeoutFn: reloj.clearTimeoutFn,
  });
  c.iniciar();
  await asentar();
  c.iniciar();                 // segundo disparo con el primero todavía en vuelo
  await asentar();
  assert.equal(solapes, 0);
  liberar?.();
  await asentar();
  c.detener();
});

test("al detener no queda nada armado ni vuelve a correr", async () => {
  const reloj = relojFalso();
  let veces = 0;
  const c = crearCicloSync({
    ejecutar: async () => { veces++; return true; },
    setTimeoutFn: reloj.setTimeoutFn, clearTimeoutFn: reloj.clearTimeoutFn,
  });
  c.iniciar();
  await asentar();
  const tras = veces;
  c.detener();
  await reloj.avanzar(60 * MIN);
  assert.equal(veces, tras, "siguió sincronizando después de detener");
  assert.equal(reloj.pendientes, 0, "quedaron temporizadores vivos");
});

test("una excepción no mata el ciclo: cuenta como fallo y reintenta", async () => {
  const reloj = relojFalso();
  let veces = 0;
  const c = crearCicloSync({
    ejecutar: async () => { veces++; if (veces === 1) throw new Error("red caída"); return true; },
    setTimeoutFn: reloj.setTimeoutFn, clearTimeoutFn: reloj.clearTimeoutFn,
  });
  c.iniciar();
  await asentar();
  await reloj.avanzar(1 * MIN);
  assert.equal(veces, 2);
  c.detener();
});
