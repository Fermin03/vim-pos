import { test } from "node:test";
import assert from "node:assert/strict";
import { crearCoordinadorDePasadas } from "./pasada-unica.mjs";

/** Una pasada que termina cuando el test lo decide. */
function pasadaManual() {
  const pasadas = [];
  const fn = () => new Promise((resolve, reject) => { pasadas.push({ resolve, reject }); });
  return { fn, pasadas };
}
const tick = () => new Promise((r) => setImmediate(r));

test("sin pasada en curso, arranca una de inmediato", async () => {
  const { fn, pasadas } = pasadaManual();
  const pedir = crearCoordinadorDePasadas(fn);
  const p = pedir();
  assert.equal(pasadas.length, 1);
  pasadas[0].resolve();
  await p;
  await tick();
  assert.equal(pasadas.length, 1, "nada pendiente: no corre otra");
});

test("varias llamadas durante una pasada provocan exactamente UNA pasada más", async () => {
  const { fn, pasadas } = pasadaManual();
  const pedir = crearCoordinadorDePasadas(fn);
  const p1 = pedir();
  pedir(); pedir(); pedir();
  assert.equal(pasadas.length, 1, "no se abre una pasada paralela");
  pasadas[0].resolve();
  await tick();
  assert.equal(pasadas.length, 2, "la pasada extra arrancó al terminar la primera");
  pedir(); // llega durante la extra: pide otra más
  pasadas[1].resolve();
  await tick();
  assert.equal(pasadas.length, 3);
  pasadas[2].resolve();
  await p1;
  await tick();
  assert.equal(pasadas.length, 3, "y ahí se detiene");
});

test("la promesa que se devuelve cubre también la pasada extra", async () => {
  const { fn, pasadas } = pasadaManual();
  const pedir = crearCoordinadorDePasadas(fn);
  let fin = false;
  const p = pedir().then(() => { fin = true; });
  pedir();
  pasadas[0].resolve();
  await tick();
  assert.equal(fin, false, "aún corre la extra");
  pasadas[1].resolve();
  await p;
  assert.equal(fin, true);
});

test("una pasada que rechaza no deja el coordinador atorado y nunca lanza", async () => {
  const { fn, pasadas } = pasadaManual();
  const pedir = crearCoordinadorDePasadas(fn);
  const p = pedir();
  pedir();
  pasadas[0].reject(new Error("se cayó"));
  await tick();
  assert.equal(pasadas.length, 2, "la pendiente corre aunque la anterior haya fallado");
  pasadas[1].reject(new Error("otra vez"));
  await p; // no lanza
  await pedir_despues(pedir, pasadas);
});

async function pedir_despues(pedir, pasadas) {
  const antes = pasadas.length;
  const p = pedir();
  assert.equal(pasadas.length, antes + 1, "ya no está atorado: arranca de inmediato");
  pasadas[antes].resolve();
  await p;
}

test("una pasada que lanza de forma síncrona tampoco atora", async () => {
  let n = 0;
  const pedir = crearCoordinadorDePasadas(() => { n++; throw new Error("síncrono"); });
  await pedir();
  await pedir();
  assert.equal(n, 2);
});
