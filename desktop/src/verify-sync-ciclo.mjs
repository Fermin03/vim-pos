// Verifica la política del ciclo de sincronización (sync-ciclo.mjs) con reloj falso.
// No levanta Postgres ni Electron: solo comprueba CUÁNDO se sincroniza y con qué backoff.
//   node src/verify-sync-ciclo.mjs

import assert from "node:assert/strict";
import { crearCicloSync, esperaSiguiente, tocaPull } from "./sync-ciclo.mjs";

const MIN = 60 * 1000;
let fallidas = 0;

function prueba(nombre, fn) {
  try { fn(); console.log(`  ✓ ${nombre}`); }
  catch (e) { fallidas++; console.error(`  ✗ ${nombre}\n    ${e.message}`); }
}

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
        await Promise.resolve();
      }
      ahora = fin;
    },
    get pendientes() { return pend.size; },
  };
}

console.log("Política de espera:");
prueba("sin fallos, el ritmo normal de 10 min", () => {
  assert.equal(esperaSiguiente(0), 10 * MIN);
});
prueba("con fallos hace backoff 1, 2, 4, 8 y se topa en 10 min", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((f) => esperaSiguiente(f) / MIN), [1, 2, 4, 8, 10, 10]);
});
prueba("el PULL toca 1 de cada 6 ciclos", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((n) => tocaPull(n)), [true, false, false, false, false, false, true, false]);
});

console.log("Ciclo con reloj falso:");

await (async () => {
  const reloj = relojFalso();
  const llamadas = [];
  const c = crearCicloSync({
    ejecutar: async ({ conPull }) => { llamadas.push({ conPull }); return true; },
    setTimeoutFn: reloj.setTimeoutFn, clearTimeoutFn: reloj.clearTimeoutFn,
  });
  c.iniciar();
  await Promise.resolve();
  await reloj.avanzar(31 * MIN); // 3 intervalos más

  prueba("sincroniza al arrancar y luego cada 10 min", () => {
    assert.equal(llamadas.length, 4, `esperaba 4 sincronizaciones, hubo ${llamadas.length}`);
  });
  prueba("el arranque baja catálogo y los siguientes solo suben ventas", () => {
    assert.deepEqual(llamadas.map((l) => l.conPull), [true, false, false, false]);
  });
  c.detener();
})();

await (async () => {
  const reloj = relojFalso();
  let intentos = 0;
  const c = crearCicloSync({
    // Falla las 3 primeras veces (nube caída), luego se recupera.
    ejecutar: async () => { intentos++; return intentos > 3; },
    setTimeoutFn: reloj.setTimeoutFn, clearTimeoutFn: reloj.clearTimeoutFn,
  });
  c.iniciar();
  await Promise.resolve();

  await reloj.avanzar(1 * MIN);
  prueba("tras fallar reintenta al minuto, no a los 10", () => assert.equal(intentos, 2));
  await reloj.avanzar(2 * MIN);
  prueba("segundo fallo: espera 2 min", () => assert.equal(intentos, 3));
  await reloj.avanzar(4 * MIN);
  prueba("tercer fallo: espera 4 min y ya se recupera", () => assert.equal(intentos, 4));
  await reloj.avanzar(9 * MIN);
  prueba("recuperado, no reintenta antes de los 10 min", () => assert.equal(intentos, 4));
  await reloj.avanzar(2 * MIN);
  prueba("y vuelve al ritmo normal", () => assert.equal(intentos, 5));
  c.detener();
})();

await (async () => {
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
  await Promise.resolve();
  c.iniciar();                 // segundo disparo con el primero todavía en vuelo
  await Promise.resolve();
  prueba("nunca se solapan dos sincronizaciones", () => assert.equal(solapes, 0));
  liberar?.();
  await Promise.resolve();
  c.detener();
})();

await (async () => {
  const reloj = relojFalso();
  let veces = 0;
  const c = crearCicloSync({
    ejecutar: async () => { veces++; return true; },
    setTimeoutFn: reloj.setTimeoutFn, clearTimeoutFn: reloj.clearTimeoutFn,
  });
  c.iniciar();
  await Promise.resolve();
  const tras = veces;
  c.detener();
  await reloj.avanzar(60 * MIN);
  prueba("al detener no queda nada armado ni vuelve a correr", () => {
    assert.equal(veces, tras, "siguió sincronizando después de detener");
    assert.equal(reloj.pendientes, 0, "quedaron temporizadores vivos");
  });
})();

await (async () => {
  const reloj = relojFalso();
  let veces = 0;
  const c = crearCicloSync({
    // Una excepción cuenta como fallo, no tumba el ciclo.
    ejecutar: async () => { veces++; if (veces === 1) throw new Error("red caída"); return true; },
    setTimeoutFn: reloj.setTimeoutFn, clearTimeoutFn: reloj.clearTimeoutFn,
  });
  c.iniciar();
  await Promise.resolve();
  await reloj.avanzar(1 * MIN);
  prueba("una excepción no mata el ciclo: reintenta", () => assert.equal(veces, 2));
  c.detener();
})();

console.log(fallidas === 0 ? "\nTodo OK" : `\n${fallidas} prueba(s) fallaron`);
process.exit(fallidas === 0 ? 0 : 1);
