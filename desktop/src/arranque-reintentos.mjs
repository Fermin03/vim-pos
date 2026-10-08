// Arranque de Postgres con reintentos y con motivo (bug "Boot falló: undefined").
//
// embedded-postgres rechaza SIN motivo cuando postgres.exe muere antes de decir "ready to accept
// connections": puerto ocupado por un postgres anterior que aún no lo suelta, candado
// postmaster.pid, memoria compartida en uso, antivirus que lo retrasa. Todas se quitan solas en
// segundos, y por eso "a la segunda o tercera sí abre". Aquí se hace ese reintento por el cajero,
// limpiando entre intentos, y si aun así falla el error dice QUÉ escribió Postgres.
// Puro (sin Electron ni Postgres): se prueba con node --test.

import { explicarError } from "./sonda-postgrest.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Guarda las últimas líneas que escribe Postgres para poder explicar un fallo. */
export function crearCapturaDeLog(max = 12) {
  const lineas = [];
  return {
    onLog(mensaje) {
      for (const l of String(mensaje ?? "").split("\n")) {
        const t = l.trim();
        if (!t) continue;
        lineas.push(t);
        if (lineas.length > max) lineas.shift();
      }
    },
    texto() { return lineas.join("\n"); },
    vaciar() { lineas.length = 0; },
  };
}

/** Traduce lo que escribió Postgres a una causa corta y accionable (o null si no se reconoce). */
export function diagnosticar(salida) {
  const s = String(salida ?? "");
  if (/could not bind|Address already in use|already in use/i.test(s)) return "el puerto de Postgres sigue ocupado por un proceso anterior";
  if (/lock file .*postmaster\.pid.* already exists|Is another postmaster/i.test(s)) return "otro Postgres tiene el candado de la base de datos";
  if (/pre-existing shared memory block/i.test(s)) return "la memoria compartida de un Postgres anterior sigue en uso";
  if (/permission denied|Permission denied|EPERM|EACCES/i.test(s)) return "permisos insuficientes sobre la carpeta de datos";
  if (/could not create|No space left/i.test(s)) return "no hay espacio en disco";
  return null;
}

/**
 * arrancarConReintentos({ arrancar, limpiar, captura, intentos = 3, esperaMs = 3000, log })
 *   arrancar: () => Promise<void>   (database.start())
 *   limpiar:  (intento) => void     (matar huérfanos / liberar puerto) — se llama ANTES de cada reintento
 * Resuelve cuando Postgres arranca; lanza Error con motivo y las últimas líneas de Postgres si no.
 */
export async function arrancarConReintentos({ arrancar, limpiar = () => {}, captura, intentos = 3, esperaMs = 3000, log = () => {} }) {
  let ultimaSalida = "";
  for (let intento = 1; intento <= intentos; intento++) {
    captura?.vaciar?.();
    try {
      await arrancar();
      if (intento > 1) log(`Postgres arrancó al intento ${intento}`);
      return { intentos: intento };
    } catch (e) {
      ultimaSalida = captura?.texto?.() ?? "";
      const motivo = diagnosticar(ultimaSalida) ?? (e instanceof Error && e.message ? e.message : "Postgres se cerró antes de estar listo");
      log(`Postgres no arrancó (intento ${intento}/${intentos}): ${motivo}`);
      if (intento === intentos) break;
      await wait(esperaMs);
      try { limpiar(intento); } catch (err) { log(`limpieza entre intentos falló: ${err?.message ?? err}`); }
    }
  }
  const motivo = diagnosticar(ultimaSalida) ?? "Postgres se cerró antes de estar listo";
  const detalle = ultimaSalida ? `\n\nÚltimas líneas de Postgres:\n${ultimaSalida}` : "";
  throw new Error(`No se pudo iniciar la base de datos local tras ${intentos} intentos: ${motivo}.${detalle}`);
}

// ── PostgREST ───────────────────────────────────────────────────────────────────────────────
//
// El otro «no abre a la primera» (cinco veces en el log de una caja, ago–oct 2026): Postgres
// arranca bien, PostgREST escribe «Starting» y «API server listening»… y deja de existir, sin
// error y sin que Windows registre una caída. La caja no se enteraba: sondeaba 60 s a un proceso
// muerto, decía «PostgREST no respondió» y se cerraba. Abrirla otra vez siempre funcionó.
// No se sabe todavía qué lo termina; por eso aquí se hace lo que hacía el cajero —volver a
// arrancar— y se deja escrito cómo murió, que es el dato que faltó para saberlo.

const describirSalida = (s) => (s.signal ? `señal ${s.signal}` : `código ${s.code}`);
const resumir = (sondeos) => Object.entries(sondeos).map(([k, n]) => `${k} ×${n}`).join(", ") || "sin sondeos";

/**
 * Espera a que PostgREST conteste, sin esperar a ciegas.
 *   sondear: () => Promise<{ ok, status }>   (el GET «/» de siempre; puede lanzar)
 *   salida:   () => null | { code, signal }   (null mientras el proceso viva)
 *   baseViva: () => boolean                   (¿sigue existiendo Postgres?)
 * Devuelve `{ listo: true }` o `{ listo: false, motivo, detalle, sondeos }` con motivo:
 *   "salio"       el proceso se cerró: se dice en el acto, con su código
 *   "sin-base"    el que dejó de existir fue Postgres: PostgREST contestaría 503 el minuto entero
 *   "mudo"        sigue ahí pero no contestó ni una petición
 *   "sin-esquema" contesta y Postgres vive, pero no terminó de cargar el esquema: repetir no ayuda
 */
export async function esperarPostgrest({ sondear, salida = () => null, baseViva = () => true, vueltas = 120, cadaMs = 500, espera = wait }) {
  const sondeos = {};
  let contesto = false;
  const seCerro = (s) => ({ listo: false, motivo: "salio", salida: s, sondeos, detalle: `PostgREST se cerró solo (${describirSalida(s)}) tras ${resumir(sondeos)}` });
  for (let i = 0; i < vueltas; i++) {
    const s = salida();
    if (s) return seCerro(s);
    if (!baseViva()) return { listo: false, motivo: "sin-base", sondeos, detalle: `Postgres dejó de existir mientras PostgREST arrancaba (${resumir(sondeos)})` };
    let clave;
    try {
      const r = await sondear();
      if (r.ok) return { listo: true, sondeos };
      contesto = true;
      clave = `HTTP ${r.status}`;
    } catch (e) { clave = explicarError(e); }
    sondeos[clave] = (sondeos[clave] ?? 0) + 1;
    await espera(cadaMs);
  }
  const s = salida();
  if (s) return seCerro(s);
  return contesto
    ? { listo: false, motivo: "sin-esquema", sondeos, detalle: `PostgREST contesta pero no terminó de cargar el esquema (${resumir(sondeos)})` }
    : { listo: false, motivo: "mudo", sondeos, detalle: `PostgREST no contestó ninguna petición (${resumir(sondeos)})` };
}

/**
 * Repite el arranque del backend cuando el error dice que repetir sirve (`e.reintentable`): es lo
 * que hacía el cajero al abrir la app otra vez. Cualquier otro error sale a la primera.
 *   arrancar: (intento) => Promise<backend>
 */
export async function reintentarBackend(arrancar, { intentos = 3, esperaMs = 3000, log = () => {}, espera = wait } = {}) {
  for (let intento = 1; ; intento++) {
    try {
      const backend = await arrancar(intento);
      if (intento > 1) log(`el backend arrancó al intento ${intento}`);
      return backend;
    } catch (e) {
      if (!e?.reintentable || intento >= intentos) throw e;
      // El mensaje entero, con lo último que escribió PostgREST: es la pista de por qué murió.
      log(`el backend no arrancó (intento ${intento}/${intentos}), se vuelve a intentar: ${String(e.message).trim().replace(/\s*\n\s*/g, " ⏎ ")}`);
      await espera(esperaMs);
    }
  }
}
