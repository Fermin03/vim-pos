// Pruebas del gancho de latido del ciclo (ADR 0014, entrega 2).
//
// La política de espera y el backoff se verifican en `verify-sync-ciclo.mjs` con reloj falso;
// aquí va lo que el CI tiene que proteger en cada commit: que el latido corra SIEMPRE y que su
// fallo no contamine al ciclo. Si un latido caído contara como fallo, una nube intermitente
// dispararía el backoff y retrasaría la subida de ventas, que es exactamente lo contrario de
// lo que queremos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearCicloSync } from "./sync-ciclo.mjs";

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
