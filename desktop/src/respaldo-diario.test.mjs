// Pruebas del respaldo diario. Sin Postgres ni Electron: la política es pura y el temporizador
// recibe todo inyectado. Lo único real es una carpeta temporal para el archivo de estado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ARCHIVO_ESTADO, DIAS_PARA_AVISAR, HORAS_ENTRE_RESPALDOS, MIN_ENTRE_REINTENTOS, MIN_SIN_ACTIVIDAD,
  crearRespaldoDiario, debeRespaldar, diasSinRespaldo, esActividadDeOperacion, fechaDeCarpeta,
  guardarEstado, leerEstado, textoUltimoRespaldo,
} from "./respaldo-diario.mjs";
import { respaldar, listarRespaldos } from "./backup.mjs";

const MIN = 60_000, HORA = 60 * MIN, DIA = 24 * HORA;
const AHORA = new Date(2026, 8, 30, 3, 12, 0).getTime(); // 30 sep 2026, 03:12 hora de la caja
const iso = (t) => new Date(t).toISOString();
/** Caja quieta: sin turno, sin actividad reciente, nada en curso. */
const quieta = { turnoAbierto: false, ultimaActividad: AHORA - 2 * HORA, ocupado: false };

// ── debeRespaldar ────────────────────────────────────────────────────────────────────────────

test("caja quieta y sin respaldo previo: respalda", () => {
  assert.deepEqual(debeRespaldar({ ahora: AHORA, ultimoOk: null, ...quieta }), { respaldar: true, motivo: "toca" });
});

test("ya respaldó hace menos de 20 horas: no repite, aunque la caja esté quieta", () => {
  assert.equal(HORAS_ENTRE_RESPALDOS, 20);
  const d = debeRespaldar({ ahora: AHORA, ultimoOk: iso(AHORA - 19 * HORA - 59 * MIN), ...quieta });
  assert.deepEqual(d, { respaldar: false, motivo: "al-dia" });
});

test("a las 20 horas del último ya toca otra vez", () => {
  assert.equal(debeRespaldar({ ahora: AHORA, ultimoOk: iso(AHORA - 20 * HORA), ...quieta }).respaldar, true);
});

test("NUNCA con un turno abierto, por viejo que sea el último respaldo", () => {
  const d = debeRespaldar({ ahora: AHORA, ultimoOk: iso(AHORA - 30 * DIA), ...quieta, turnoAbierto: true });
  assert.deepEqual(d, { respaldar: false, motivo: "turno-abierto" });
});

test("si no se pudo saber si hay turno abierto, no se arriesga", () => {
  const d = debeRespaldar({ ahora: AHORA, ultimoOk: null, ...quieta, turnoAbierto: null });
  assert.deepEqual(d, { respaldar: false, motivo: "sin-dato-de-turno" });
});

test("alguien operó la caja hace menos de 10 minutos: espera", () => {
  assert.equal(MIN_SIN_ACTIVIDAD, 10);
  const d = debeRespaldar({ ahora: AHORA, ultimoOk: null, ...quieta, ultimaActividad: AHORA - 9 * MIN - 59_000 });
  assert.deepEqual(d, { respaldar: false, motivo: "actividad-reciente" });
});

test("a los 10 minutos justos sin actividad ya puede", () => {
  assert.equal(debeRespaldar({ ahora: AHORA, ultimoOk: null, ...quieta, ultimaActividad: AHORA - 10 * MIN }).respaldar, true);
});

test("con una sincronización, actualización u otro respaldo en curso: espera", () => {
  assert.deepEqual(debeRespaldar({ ahora: AHORA, ultimoOk: null, ...quieta, ocupado: true }), { respaldar: false, motivo: "ocupado" });
});

test("el día se fue con turno abierto: en la primera ventana quieta del día siguiente SÍ respalda", () => {
  // Último respaldo: anteayer 23:10. Ayer el turno no se cerró. Hoy 03:12, ya cerrado y quieto.
  const ultimoOk = iso(new Date(2026, 8, 28, 23, 10).getTime());
  assert.equal(debeRespaldar({ ahora: AHORA, ultimoOk, ...quieta, turnoAbierto: true }).respaldar, false);
  assert.equal(debeRespaldar({ ahora: AHORA, ultimoOk, ...quieta }).respaldar, true);
});

test("tras un intento fallido no reintenta antes de una hora (cada intento detiene Postgres)", () => {
  assert.equal(MIN_ENTRE_REINTENTOS, 60);
  const base = { ahora: AHORA, ultimoOk: iso(AHORA - 3 * DIA), ...quieta };
  assert.deepEqual(debeRespaldar({ ...base, ultimoFallo: iso(AHORA - 30 * MIN) }), { respaldar: false, motivo: "reintento-pendiente" });
  assert.equal(debeRespaldar({ ...base, ultimoFallo: iso(AHORA - 61 * MIN) }).respaldar, true);
});

test("un fallo ANTERIOR al último respaldo bueno ya no frena nada", () => {
  const d = debeRespaldar({ ahora: AHORA, ultimoOk: iso(AHORA - 21 * HORA), ultimoFallo: iso(AHORA - 22 * HORA), ...quieta });
  assert.equal(d.respaldar, true);
});

test("una fecha ilegible en el estado se trata como «sin respaldo»", () => {
  assert.equal(debeRespaldar({ ahora: AHORA, ultimoOk: "ayer", ...quieta }).respaldar, true);
});

// ── diasSinRespaldo ──────────────────────────────────────────────────────────────────────────

test("avisa a VIM a partir de 3 días sin respaldo, no antes", () => {
  assert.equal(DIAS_PARA_AVISAR, 3);
  assert.equal(diasSinRespaldo({ ahora: AHORA, ultimoOk: iso(AHORA - 2 * DIA - 23 * HORA) }), null);
  assert.equal(diasSinRespaldo({ ahora: AHORA, ultimoOk: iso(AHORA - 3 * DIA) }), 3);
  assert.equal(diasSinRespaldo({ ahora: AHORA, ultimoOk: iso(AHORA - 9 * DIA - HORA) }), 9);
});

test("el aviso de atraso sale una vez al día, no cada 15 minutos", () => {
  const base = { ahora: AHORA, ultimoOk: iso(AHORA - 5 * DIA) };
  assert.equal(diasSinRespaldo({ ...base, ultimoAviso: iso(AHORA - 2 * HORA) }), null);
  assert.equal(diasSinRespaldo({ ...base, ultimoAviso: iso(AHORA - 25 * HORA) }), 5);
});

test("una caja recién instalada cuenta el atraso desde que se instaló, no desde nunca", () => {
  assert.equal(diasSinRespaldo({ ahora: AHORA, ultimoOk: null, desde: iso(AHORA - HORA) }), null);
  assert.equal(diasSinRespaldo({ ahora: AHORA, ultimoOk: null, desde: iso(AHORA - 4 * DIA) }), 4);
  assert.equal(diasSinRespaldo({ ahora: AHORA, ultimoOk: null, desde: null }), null);
});

// ── La bandeja ───────────────────────────────────────────────────────────────────────────────

test("el renglón de la bandeja: hoy, ayer, otro día, otro año y nunca", () => {
  assert.equal(textoUltimoRespaldo(iso(AHORA), AHORA + 5 * HORA), "Último respaldo: hoy 03:12");
  assert.equal(textoUltimoRespaldo(iso(new Date(2026, 8, 29, 23, 10).getTime()), AHORA), "Último respaldo: ayer 23:10");
  assert.equal(textoUltimoRespaldo(iso(new Date(2026, 8, 24, 23, 5).getTime()), AHORA), "Último respaldo: 24 sep 23:05");
  assert.equal(textoUltimoRespaldo(iso(new Date(2025, 11, 31, 1, 0).getTime()), AHORA), "Último respaldo: 31 dic 2025 01:00");
  assert.equal(textoUltimoRespaldo(null, AHORA), "Último respaldo: ninguno todavía");
});

// ── Qué cuenta como «alguien está usando la caja» ────────────────────────────────────────────

test("los sondeos del POS y del KDS (GET) no cuentan como actividad", () => {
  assert.equal(esActividadDeOperacion("GET", "/rest/v1/tickets", "?select=id"), false);
  assert.equal(esActividadDeOperacion("HEAD", "/rest/v1/", ""), false);
  assert.equal(esActividadDeOperacion("OPTIONS", "/rest/v1/rpc/aplicar_pago", ""), false);
  assert.equal(esActividadDeOperacion("GET", "/health/deep", ""), false);
  assert.equal(esActividadDeOperacion("GET", "/kds/stream", ""), false);
});

test("vender, cobrar y entrar con PIN sí", () => {
  assert.equal(esActividadDeOperacion("POST", "/rest/v1/rpc/abrir_ticket", ""), true);
  assert.equal(esActividadDeOperacion("POST", "/rest/v1/rpc/aplicar_pago", ""), true);
  assert.equal(esActividadDeOperacion("PATCH", "/rest/v1/mesas", "?id=eq.1"), true);
  assert.equal(esActividadDeOperacion("POST", "/functions/v1/pin-login", ""), true);
  assert.equal(esActividadDeOperacion("POST", "/auth/v1/token", "?grant_type=password"), true);
});

test("el refresco de sesión lo hace la app sola: no cuenta", () => {
  assert.equal(esActividadDeOperacion("POST", "/auth/v1/token", "?grant_type=refresh_token"), false);
  assert.equal(esActividadDeOperacion("POST", "/auth/v1/logout", ""), false);
});

// ── Estado en disco ──────────────────────────────────────────────────────────────────────────

function conCarpeta(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "vim-respaldo-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("guardarEstado mezcla y leerEstado devuelve lo guardado", () => conCarpeta((dir) => {
  const bd = path.join(dir, "backups"); // todavía no existe: guardar la crea
  assert.deepEqual(leerEstado(bd), { desde: null, ultimoOk: null, ultimoFallo: null, ultimoError: null, ultimoAviso: null });
  guardarEstado(bd, { desde: "2026-09-01T00:00:00.000Z" });
  guardarEstado(bd, { ultimoOk: "2026-09-30T09:12:00.000Z" });
  assert.deepEqual(JSON.parse(readFileSync(path.join(bd, ARCHIVO_ESTADO), "utf8")), {
    desde: "2026-09-01T00:00:00.000Z", ultimoOk: "2026-09-30T09:12:00.000Z", ultimoFallo: null, ultimoError: null, ultimoAviso: null,
  });
}));

test("sin archivo de estado, el último respaldo se deduce de la carpeta más nueva", () => conCarpeta((dir) => {
  mkdirSync(path.join(dir, "pgdata-2026-09-28_23-10-00"));
  mkdirSync(path.join(dir, "pgdata-2026-09-29_23-05-30"));
  mkdirSync(path.join(dir, "pgdata-2026-09-30_01-00-00.parcial")); // una copia a medias no cuenta
  assert.equal(leerEstado(dir).ultimoOk, new Date(2026, 8, 29, 23, 5, 30).toISOString());
}));

test("un archivo de estado corrupto no rompe nada", () => conCarpeta((dir) => {
  writeFileSync(path.join(dir, ARCHIVO_ESTADO), "{ esto no es json");
  assert.equal(leerEstado(dir).ultimoOk, null);
  assert.equal(fechaDeCarpeta("pgdata-basura"), null);
}));

test("la rotación conserva 7 copias y NO borra el archivo de estado", () => conCarpeta((dir) => {
  const data = path.join(dir, "pgdata"), bd = path.join(dir, "backups");
  mkdirSync(data);
  writeFileSync(path.join(data, "PG_VERSION"), "17");
  mkdirSync(bd);
  for (let d = 20; d <= 28; d++) mkdirSync(path.join(bd, `pgdata-2026-09-${d}_23-00-00`)); // 9 viejas
  guardarEstado(bd, { ultimoOk: "2026-09-28T05:00:00.000Z" });
  const dest = respaldar(data, bd, 7);
  assert.ok(dest, "el respaldo se creó");
  const quedan = listarRespaldos(bd).map((r) => r.nombre);
  assert.equal(quedan.length, 7);
  assert.equal(quedan[0], path.basename(dest), "la más nueva es la recién hecha");
  assert.ok(!quedan.includes("pgdata-2026-09-20_23-00-00"), "las más viejas se purgaron");
  assert.equal(leerEstado(bd).ultimoOk, "2026-09-28T05:00:00.000Z", "el estado sigue ahí");
}));

// ── El temporizador, con todo inyectado ──────────────────────────────────────────────────────

function armar({ ctx = quieta, estado = {}, resultado = { ok: true }, ahora = AHORA } = {}) {
  const mem = { desde: iso(AHORA - 30 * DIA), ultimoOk: null, ultimoFallo: null, ultimoError: null, ultimoAviso: null, ...estado };
  const llamadas = { respaldos: 0, reportes: [], cambios: 0 };
  const r = crearRespaldoDiario({
    contexto: async () => (typeof ctx === "function" ? ctx() : ctx),
    respaldar: async () => {
      llamadas.respaldos++;
      const res = typeof resultado === "function" ? resultado() : resultado;
      // Lo que hace main.mjs (copiarYAnotar): el resultado queda en el estado.
      if (res.ok) mem.ultimoOk = iso(ahora); else { mem.ultimoFallo = iso(ahora); mem.ultimoError = res.error; }
      return res;
    },
    leerEstado: () => ({ ...mem }),
    guardarEstado: (c) => Object.assign(mem, c),
    reportar: async (mensaje, contexto) => { llamadas.reportes.push({ mensaje, contexto }); },
    alCambiar: () => { llamadas.cambios++; },
    ahora: () => ahora,
  });
  return { r, mem, llamadas };
}

test("revisión con la caja quieta: respalda una vez y la siguiente revisión ya no", async () => {
  const { r, llamadas } = armar({ estado: { ultimoOk: iso(AHORA - 26 * HORA) } });
  assert.equal((await r.revisar()).respaldar, true);
  assert.equal((await r.revisar()).motivo, "al-dia");
  assert.equal(llamadas.respaldos, 1);
  assert.equal(llamadas.reportes.length, 0);
  assert.equal(llamadas.cambios, 2, "refresca la bandeja en cada revisión");
});

test("con turno abierto no llama al respaldo, y a los 3 días se lo reporta a VIM una sola vez", async () => {
  const { r, llamadas, mem } = armar({ ctx: { ...quieta, turnoAbierto: true }, estado: { ultimoOk: iso(AHORA - 4 * DIA) } });
  await r.revisar();
  await r.revisar();
  assert.equal(llamadas.respaldos, 0);
  assert.equal(llamadas.reportes.length, 1);
  assert.match(llamadas.reportes[0].mensaje, /lleva 4 días sin respaldo local \(hay un turno abierto/);
  assert.deepEqual(llamadas.reportes[0].contexto, { origen: "respaldo-diario", tipo: "atraso", dias: 4, motivo: "turno-abierto" });
  assert.ok(mem.ultimoAviso);
});

test("un respaldo que falla se reporta con su motivo", async () => {
  const { r, llamadas } = armar({ estado: { ultimoOk: iso(AHORA - DIA) }, resultado: { ok: false, error: "ENOSPC: no space left on device" } });
  await r.revisar();
  assert.equal(llamadas.respaldos, 1);
  assert.equal(llamadas.reportes.length, 1);
  assert.match(llamadas.reportes[0].mensaje, /Respaldo diario de la caja falló: ENOSPC/);
  assert.equal(llamadas.reportes[0].contexto.tipo, "fallo");
  // Y no machaca: la siguiente revisión espera el reintento.
  assert.equal((await r.revisar()).motivo, "reintento-pendiente");
  assert.equal(llamadas.respaldos, 1);
});

test("si el respaldo lanza, se trata como fallo y la revisión no revienta", async () => {
  const { r, llamadas } = armar({ resultado: () => { throw new Error("EBUSY"); } });
  await assert.doesNotReject(r.revisar());
  assert.match(llamadas.reportes[0].mensaje, /EBUSY/);
});

test("si no se puede leer el contexto (la base no contesta), no respalda", async () => {
  const { r, llamadas } = armar({ ctx: () => { throw new Error("pool cerrado"); } });
  assert.equal((await r.revisar()).motivo, "sin-dato-de-turno");
  assert.equal(llamadas.respaldos, 0);
});

test("la primera revisión en una caja anota desde cuándo se cuenta", async () => {
  const { r, mem } = armar({ ctx: { ...quieta, turnoAbierto: true }, estado: { desde: null } });
  await r.revisar();
  assert.equal(mem.desde, iso(AHORA));
});
