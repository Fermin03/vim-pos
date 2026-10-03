// El watchdog reinicia el backend cuando su salud falla varias veces seguidas. Estas pruebas salen
// del incidente de Knock-Out Obregón (2 oct 2026): la salud daba falso positivo en esa PC, el
// watchdog reiniciaba un backend sano cada minuto —sin decir por qué— y la caja quedó inservible.
import test from "node:test";
import assert from "node:assert/strict";
import { crearWatchdog, umbralDeReinicio, umbralTrasReinicioFallido } from "./watchdog.mjs";

const sano = () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
const enfermo = (error = "PostgREST no contestó en 4000 ms") => ({ ok: false, status: 503, json: async () => ({ ok: false, error }) });

/** Watchdog con la salud guionizada y sin temporizador: las pruebas llaman a `tick()` a mano. */
function montar({ salud, alReiniciar = async () => {}, ...resto } = {}) {
  const lineas = [];
  const reportes = [];
  let reinicios = 0;
  const wd = crearWatchdog({
    url: "http://gateway", intervaloMs: 3_600_000, fallosParaReiniciar: 3,
    fetchImpl: async () => salud(),
    alReiniciar: async () => { reinicios++; await alReiniciar(reinicios); },
    reportar: (mensaje, contexto) => { reportes.push({ mensaje, contexto }); },
    log: (m) => lineas.push(m),
    ...resto,
  });
  return { wd, lineas, reportes, reinicios: () => reinicios };
}

test("watchdog: cada fallo deja en el log POR QUÉ falló", async () => {
  const respuestas = [enfermo("PostgREST contestó 503 (PGRST002)"), () => { throw Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } }); }];
  const { wd, lineas } = montar({ salud: () => { const r = respuestas.shift(); return typeof r === "function" ? r() : r; } });
  try {
    await wd.tick();
    await wd.tick();
    assert.match(lineas[0], /FALLÓ \(1\/3\): PostgREST contestó 503 \(PGRST002\)/);
    assert.match(lineas[1], /FALLÓ \(2\/3\): .*ECONNREFUSED/);
  } finally { wd.stop(); }
});

test("watchdog: tres fallos seguidos reinician; un OK entre medias limpia la cuenta", async () => {
  const guion = [enfermo(), enfermo(), sano(), enfermo(), enfermo(), enfermo()];
  const { wd, lineas, reinicios } = montar({ salud: () => guion.shift() });
  try {
    for (let i = 0; i < 5; i++) await wd.tick();
    assert.equal(reinicios(), 0, "dos fallos, un OK y dos fallos no son tres seguidos");
    assert.ok(lineas.some((l) => /OK de nuevo/.test(l)));
    await wd.tick();
    assert.equal(reinicios(), 1);
    assert.ok(lineas.some((l) => /reiniciado por el watchdog/.test(l)));
  } finally { wd.stop(); }
});

test("watchdog: si reiniciar NO cura la salud, no reinicia en bucle — espera el doble cada vez y avisa a VIM una vez", async () => {
  // Obregón: la salud falla SIEMPRE, antes y después de cada reinicio.
  const { wd, lineas, reportes, reinicios } = montar({ salud: () => enfermo() });
  try {
    const cuando = [];
    for (let tick = 1; tick <= 60; tick++) { // 60 ticks = 20 minutos
      const antes = reinicios();
      await wd.tick();
      if (reinicios() > antes) cuando.push(tick);
    }
    // Antes: un reinicio cada 3 ticks (20 en 20 minutos). Ahora: a los 3, y luego tras 6, 12 y 24 más.
    assert.deepEqual(cuando, [3, 9, 21, 45]);
    assert.equal(reportes.length, 1, "un aviso por racha, no uno por reinicio");
    assert.match(reportes[0].mensaje, /reinici.* y la salud sigue fallando/i);
    assert.match(reportes[0].mensaje, /PostgREST no contestó en 4000 ms/);
    assert.equal(reportes[0].contexto.origen, "watchdog");
    assert.ok(lineas.some((l) => /FALLÓ \(1\/6\)/.test(l)), "el log dice el umbral vigente");
  } finally { wd.stop(); }
});

test("watchdog: cuando la salud vuelve de verdad (un minuto sano), el umbral regresa a lo normal", async () => {
  let mal = true;
  const { wd, reportes, reinicios } = montar({ salud: () => (mal ? enfermo() : sano()) });
  try {
    for (let i = 0; i < 9; i++) await wd.tick(); // reinicios en los ticks 3 y 9
    assert.equal(reinicios(), 2);
    assert.equal(reportes.length, 1);
    mal = false; for (let i = 0; i < 3; i++) await wd.tick(); // tres revisiones buenas seguidas
    mal = true;
    for (let i = 0; i < 3; i++) await wd.tick();
    assert.equal(reinicios(), 3, "tras sanar bastan otra vez 3 fallos");
  } finally { wd.stop(); }
});

test("watchdog: un OK suelto justo después de reiniciar no borra la racha (si vuelve a fallar, reiniciar no curaba)", async () => {
  // El backend recién levantado pasa una revisión y al minuto vuelve a fallar.
  const guion = [];
  for (let ciclo = 0; ciclo < 6; ciclo++) guion.push(enfermo(), enfermo(), enfermo(), sano());
  const { wd, reinicios, reportes } = montar({ salud: () => guion.shift() ?? enfermo() });
  try {
    for (let i = 0; i < 24; i++) await wd.tick();
    // Con «un OK lo borra todo» serían 6 reinicios (uno cada 4 ticks, como en Obregón). Así: el de
    // los 3 fallos, y el siguiente ya pide 6 seguidos — los OK sueltos no los dejan juntar.
    assert.ok(reinicios() <= 2, `reinició ${reinicios()} veces en 8 minutos`);
    assert.ok(reportes.length <= 1);
  } finally { wd.stop(); }
});

test("watchdog: un aviso a VIM que no vuelve nunca no deja al watchdog parado", async () => {
  // Con un Postgres que no contesta, escribir el aviso en la base local tampoco vuelve.
  const { wd, reinicios, lineas } = montar({ salud: () => enfermo(), reportar: () => new Promise(() => {}) });
  try {
    for (let i = 0; i < 21; i++) await wd.tick(); // reinicios en 3, 9 (aquí sale el aviso) y 21
    assert.equal(reinicios(), 3, "tras el aviso sigue revisando y reiniciando");
    assert.ok(!lineas.some((l) => /sigue en curso/.test(l)));
  } finally { wd.stop(); }
});

test("watchdog: si la caja pasó varios intentos sin backend, al volver se avisa a VIM cuánto fue", async () => {
  let n = 0;
  let reloj = 0;
  const { wd, reportes } = montar({
    salud: () => enfermo("gateway inalcanzable (ECONNREFUSED)"),
    alReiniciar: async () => { n++; if (n <= 3) throw new Error("PostgREST no respondió."); },
    ahora: () => reloj,
  });
  try {
    for (let i = 0; i < 10; i++) { reloj += 20_000; await wd.tick(); } // fallan en 3, 4 y 6; termina en 10
    assert.equal(n, 4);
    const aviso = reportes.find((r) => r.contexto.tipo === "reinicios-fallidos");
    assert.ok(aviso, "sin backend no había dónde escribirlo; al volver, sí");
    assert.match(aviso.mensaje, /unos 2 min sin backend: 3 reinicios seguidos no terminaron \(PostgREST no respondió\.\)/);
    assert.equal(aviso.contexto.intentos, 3);
  } finally { wd.stop(); }
});

test("watchdog: un reinicio que REVIENTA deja la caja sin backend — se reintenta pronto (1, 2, 4, 6 fallos), no al minuto", async () => {
  const { wd, lineas, reportes, reinicios } = montar({
    salud: () => enfermo("gateway inalcanzable (ECONNREFUSED)"),
    alReiniciar: async () => { throw new Error("PostgREST no respondió."); },
  });
  try {
    const cuando = [];
    for (let tick = 1; tick <= 22; tick++) {
      const antes = reinicios();
      await wd.tick();
      if (reinicios() > antes) cuando.push(tick);
    }
    // El primero a los 3 fallos de siempre; los siguientes al fallo 1, luego 2, 4 y de ahí cada 6.
    assert.deepEqual(cuando, [3, 4, 6, 10, 16, 22]);
    assert.ok(lineas.some((l) => /no pudo reiniciar el backend: PostgREST no respondió/.test(l)));
    assert.equal(reportes.length, 0, "sin backend no hay bitácora donde escribir");
  } finally { wd.stop(); }
});

test("watchdog: un reinicio que por fin termina vuelve a la cuenta normal", async () => {
  let n = 0;
  const { wd, reinicios } = montar({
    salud: () => enfermo(),
    alReiniciar: async () => { n++; if (n === 1) throw new Error("PostgREST no respondió."); },
  });
  try {
    for (let i = 0; i < 4; i++) await wd.tick(); // tick 3: revienta · tick 4: termina
    assert.equal(reinicios(), 2);
    for (let i = 0; i < 5; i++) await wd.tick(); // ticks 5-9: tras uno que terminó sin curar, hacen falta 6
    assert.equal(reinicios(), 2);
    await wd.tick();                              // tick 10
    assert.equal(reinicios(), 3);
  } finally { wd.stop(); }
});

test("watchdog: no solapa una revisión con un reinicio en curso, y si el reinicio se eterniza lo dice", async () => {
  let soltar;
  let reloj = 0;
  const { wd, lineas, reinicios } = montar({
    salud: () => enfermo(),
    alReiniciar: () => new Promise((r) => { soltar = r; }),
    ahora: () => reloj,
  });
  try {
    await wd.tick(); await wd.tick();
    const tercero = wd.tick(); // dispara el reinicio, que no termina
    await new Promise((r) => setImmediate(r));
    assert.equal(reinicios(), 1);
    reloj = 30_000; await wd.tick();
    assert.ok(!lineas.some((l) => /sigue en curso/.test(l)), "medio minuto es normal: no se dice nada");
    reloj = 200_000; await wd.tick();
    assert.equal(reinicios(), 1, "no se lanza otro reinicio encima");
    assert.ok(lineas.some((l) => /el reinicio del backend sigue en curso desde hace 200 s/.test(l)));
    soltar(); await tercero;
  } finally { wd.stop(); }
});

test("watchdog: en pausa (respaldo) no revisa, y un resultado que llega ya en pausa se descarta", async () => {
  let llamadas = 0;
  let soltar;
  const { wd, lineas } = montar({ salud: () => { llamadas++; return new Promise((r) => { soltar = () => r(enfermo()); }); } });
  try {
    const enVuelo = wd.tick();       // la revisión sale…
    wd.pausar();                     // …y entra el respaldo, que detiene el backend a propósito
    soltar(); await enVuelo;
    assert.equal(lineas.length, 0, "ese fallo es del respaldo, no del backend");
    await wd.tick();
    assert.equal(llamadas, 1, "en pausa ni se pregunta");
  } finally { wd.stop(); }
});

test("watchdog: reanudar tras un respaldo deja la cuenta limpia (no hereda una espera larga)", async () => {
  const { wd, reinicios } = montar({ salud: () => enfermo() });
  try {
    for (let i = 0; i < 9; i++) await wd.tick(); // dos reinicios sin sanar: el siguiente pediría 12 fallos
    assert.equal(reinicios(), 2);
    wd.pausar(); wd.reanudar();                   // el respaldo levantó un backend nuevo
    for (let i = 0; i < 3; i++) await wd.tick();
    assert.equal(reinicios(), 3, "tras el respaldo bastan otra vez 3 fallos");
  } finally { wd.stop(); }
});

test("umbrales: 3, 6, 12… con techo; y 1, 2, 4, 6 cuando el reinicio no terminó", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 20].map((n) => umbralDeReinicio(3, n, 90)), [3, 6, 12, 24, 48, 90, 90, 90]);
  assert.deepEqual([1, 2, 3, 4, 5, 40].map((n) => umbralTrasReinicioFallido(3, n)), [1, 2, 4, 6, 6, 6]);
});
