import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAlmacenDirectivas, estadoDeVersion, normalizar, DIRECTIVAS_VACIAS } from "./directivas.mjs";

/** fs falso en memoria: la prueba no toca disco. */
function fsFalso(inicial = null) {
  let contenido = inicial;
  return {
    existsSync: () => contenido !== null,
    readFileSync: () => {
      if (contenido === null) throw new Error("ENOENT");
      return contenido;
    },
    writeFileSync: (_p, txt) => { contenido = txt; },
    get contenido() { return contenido; },
  };
}

test("sin archivo devuelve directivas vacías que NO bloquean", () => {
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs: fsFalso() });
  const { directivas, recibidoIso } = a.leer();
  assert.equal(directivas.acceso.bloqueado, false);
  assert.equal(recibidoIso, null);
});

test("un archivo corrupto se trata como ausencia, no como bloqueo", () => {
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs: fsFalso("{no es json") });
  assert.equal(a.leer().directivas.acceso.bloqueado, false);
});

test("guarda y devuelve lo guardado, con la hora de recepción", () => {
  const fs = fsFalso();
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs, ahora: () => "2026-09-05T12:00:00.000Z" });
  a.guardar({
    acceso: { estado: "SUSPENDIDO", bloqueado: true, bloquea_desde: null, mensaje: "Paga" },
    modulos: { kds: true },
  });
  const { directivas, recibidoIso } = a.leer();
  assert.equal(directivas.acceso.bloqueado, true);
  assert.equal(directivas.acceso.mensaje, "Paga");
  assert.equal(directivas.modulos.kds, true);
  assert.equal(recibidoIso, "2026-09-05T12:00:00.000Z");
});

test("un fallo al escribir no revienta la app", () => {
  const fs = fsFalso();
  fs.writeFileSync = () => { throw new Error("disco lleno"); };
  const avisos = [];
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs, log: (m) => avisos.push(m) });
  a.guardar({ acceso: { bloqueado: true } });   // no debe lanzar
  assert.equal(avisos.length, 1);
});

test("normalizar rellena lo que la nube no mandó", () => {
  const d = normalizar({ acceso: { bloqueado: true } });
  assert.equal(d.acceso.bloqueado, true);
  assert.deepEqual(d.modulos, {});
  assert.deepEqual(d.avisos, []);
});

test("normalizar nunca inventa un bloqueo con basura", () => {
  assert.equal(normalizar(null).acceso.bloqueado, false);
  assert.equal(normalizar({ acceso: { bloqueado: "sí" } }).acceso.bloqueado, false);
  assert.equal(normalizar({ acceso: { bloqueado: 1 } }).acceso.bloqueado, false);
  assert.deepEqual(normalizar(undefined), DIRECTIVAS_VACIAS);
});

// ── Cola de acuses de avisos (ADR 0014, entrega 3) ──────────────────────────

/** Un almacén con un aviso ya recibido, que es la precondición para poder acusarlo. */
function conAviso(id) {
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs: fsFalso() });
  a.guardar({ acceso: { bloqueado: false }, avisos: [{ id, nivel: "info", titulo: "T", cuerpo: "C" }] });
  return a;
}

test("guarda los acuses pendientes junto a las directivas", () => {
  const a = conAviso("11111111-0000-0000-0000-0000000000f0");
  a.marcarVisto("11111111-0000-0000-0000-0000000000f0");
  a.marcarVisto("11111111-0000-0000-0000-0000000000f0"); // repetido: no duplica
  assert.deepEqual(a.vistosPendientes(), ["11111111-0000-0000-0000-0000000000f0"]);
});

test("no se puede acusar un aviso que esta caja no recibió", () => {
  // Cierra el pre-acuse: alguien en la LAN no puede suprimir un aviso antes de que llegue.
  const a = conAviso("11111111-0000-0000-0000-0000000000f0");
  a.marcarVisto("99999999-9999-9999-9999-999999999999");
  assert.deepEqual(a.vistosPendientes(), []);
});

test("los acuses sobreviven a una directiva nueva", () => {
  const a = conAviso("11111111-0000-0000-0000-0000000000f0");
  a.marcarVisto("11111111-0000-0000-0000-0000000000f0");
  a.guardar({ acceso: { bloqueado: false }, avisos: [] });
  assert.deepEqual(a.vistosPendientes(), ["11111111-0000-0000-0000-0000000000f0"]);
  assert.equal(a.leer().directivas.acceso.bloqueado, false);
});

test("limpiarVistos borra solo lo ya reportado", () => {
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs: fsFalso() });
  a.guardar({ acceso: {}, avisos: [
    { id: "aaaa1111-0000-0000-0000-0000000000f0" }, { id: "bbbb2222-0000-0000-0000-0000000000f0" },
  ] });
  a.marcarVisto("aaaa1111-0000-0000-0000-0000000000f0");
  a.marcarVisto("bbbb2222-0000-0000-0000-0000000000f0");
  a.limpiarVistos(["aaaa1111-0000-0000-0000-0000000000f0"]);
  assert.deepEqual(a.vistosPendientes(), ["bbbb2222-0000-0000-0000-0000000000f0"]);
});

test("un id que no es uuid se descarta", () => {
  const a = conAviso("11111111-0000-0000-0000-0000000000f0");
  a.marcarVisto("no-es-uuid");
  a.marcarVisto(null);
  assert.deepEqual(a.vistosPendientes(), []);
});

test("sin archivo no hay acuses pendientes y no revienta", () => {
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs: fsFalso() });
  assert.deepEqual(a.vistosPendientes(), []);
});

// ── Versión (ADR 0014, entrega 4) ─────────────────────────────────────────────
// Es la única directiva que la caja resuelve SOLA, comparando con la versión instalada. Por eso
// se prueba a conciencia: aquí un fallo no muestra un aviso de más, deja a un negocio sin cobrar.

const conVersion = (v) => ({ acceso: { bloqueado: false }, version: v });

test("sin bloque de versión no hay nada que hacer", () => {
  const r = estadoDeVersion(normalizar(conVersion({})), "0.4.61");
  assert.equal(r.hayNueva, false);
  assert.equal(r.bloqueaPorVersion, false);
});

test("una recomendada más nueva se anuncia con su url y su hash", () => {
  const r = estadoDeVersion(normalizar(conVersion({ recomendada: "0.4.62", url: "u", sha512: "s" })), "0.4.61");
  assert.equal(r.hayNueva, true);
  assert.equal(r.recomendada, "0.4.62");
  assert.equal(r.url, "u");
  assert.equal(r.sha512, "s");
});

test("una recomendada igual o vieja no se anuncia", () => {
  assert.equal(estadoDeVersion(normalizar(conVersion({ recomendada: "0.4.61" })), "0.4.61").hayNueva, false);
  assert.equal(estadoDeVersion(normalizar(conVersion({ recomendada: "0.4.60" })), "0.4.61").hayNueva, false);
});

test("compara por número, no por texto: 0.4.9 es MENOR que 0.4.61", () => {
  assert.equal(estadoDeVersion(normalizar(conVersion({ recomendada: "0.4.9" })), "0.4.61").hayNueva, false);
  assert.equal(estadoDeVersion(normalizar(conVersion({ recomendada: "0.4.61" })), "0.4.9").hayNueva, true);
});

test("por debajo de la mínima bloquea SOLO si la nube lo encendió", () => {
  const bajo = { minima: "0.4.62", bloquea_bajo_minima: true };
  assert.equal(estadoDeVersion(normalizar(conVersion(bajo)), "0.4.61").bloqueaPorVersion, true);
  const apagado = { minima: "0.4.62", bloquea_bajo_minima: false };
  assert.equal(estadoDeVersion(normalizar(conVersion(apagado)), "0.4.61").bloqueaPorVersion, false);
});

test("estando al día o por encima de la mínima nunca bloquea", () => {
  const v = { minima: "0.4.60", bloquea_bajo_minima: true };
  assert.equal(estadoDeVersion(normalizar(conVersion(v)), "0.4.61").bloqueaPorVersion, false);
  assert.equal(estadoDeVersion(normalizar(conVersion({ minima: "0.4.61", bloquea_bajo_minima: true })), "0.4.61").bloqueaPorVersion, false);
});

test("sin directivas no bloquea: la falta de datos nunca deja a una caja sin vender", () => {
  assert.equal(estadoDeVersion(DIRECTIVAS_VACIAS, "0.4.61").bloqueaPorVersion, false);
  assert.equal(estadoDeVersion(undefined, "0.4.61").bloqueaPorVersion, false);
  assert.equal(estadoDeVersion(null, null).bloqueaPorVersion, false);
});

test("un `bloquea_bajo_minima` que no es booleano no bloquea", () => {
  // Mismo criterio que `acceso.bloqueado`: solo `true` de verdad manda.
  const raro = { minima: "0.4.62", bloquea_bajo_minima: "true" };
  assert.equal(estadoDeVersion(normalizar(conVersion(raro)), "0.4.61").bloqueaPorVersion, false);
});

test("una mínima con basura por versión no bloquea", () => {
  const raro = { minima: "no-es-una-version", bloquea_bajo_minima: true };
  assert.equal(estadoDeVersion(normalizar(conVersion(raro)), "0.4.61").bloqueaPorVersion, false);
});
