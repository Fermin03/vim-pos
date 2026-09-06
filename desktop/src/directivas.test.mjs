import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAlmacenDirectivas, normalizar, DIRECTIVAS_VACIAS } from "./directivas.mjs";

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

test("guarda los acuses pendientes junto a las directivas", () => {
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs: fsFalso() });
  a.marcarVisto("11111111-0000-0000-0000-0000000000f0");
  a.marcarVisto("11111111-0000-0000-0000-0000000000f0"); // repetido: no duplica
  assert.deepEqual(a.vistosPendientes(), ["11111111-0000-0000-0000-0000000000f0"]);
});

test("los acuses sobreviven a una directiva nueva", () => {
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs: fsFalso() });
  a.marcarVisto("11111111-0000-0000-0000-0000000000f0");
  a.guardar({ acceso: { bloqueado: false }, avisos: [] });
  assert.deepEqual(a.vistosPendientes(), ["11111111-0000-0000-0000-0000000000f0"]);
  assert.equal(a.leer().directivas.acceso.bloqueado, false);
});

test("limpiarVistos borra solo lo ya reportado", () => {
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs: fsFalso() });
  a.marcarVisto("aaaa1111-0000-0000-0000-0000000000f0");
  a.marcarVisto("bbbb2222-0000-0000-0000-0000000000f0");
  a.limpiarVistos(["aaaa1111-0000-0000-0000-0000000000f0"]);
  assert.deepEqual(a.vistosPendientes(), ["bbbb2222-0000-0000-0000-0000000000f0"]);
});

test("un id que no es uuid se descarta", () => {
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs: fsFalso() });
  a.marcarVisto("no-es-uuid");
  a.marcarVisto(null);
  assert.deepEqual(a.vistosPendientes(), []);
});

test("sin archivo no hay acuses pendientes y no revienta", () => {
  const a = crearAlmacenDirectivas({ archivo: "d.json", fs: fsFalso() });
  assert.deepEqual(a.vistosPendientes(), []);
});
