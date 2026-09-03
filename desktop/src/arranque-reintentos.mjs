// Arranque de Postgres con reintentos y con motivo (bug "Boot falló: undefined").
//
// embedded-postgres rechaza SIN motivo cuando postgres.exe muere antes de decir "ready to accept
// connections": puerto ocupado por un postgres anterior que aún no lo suelta, candado
// postmaster.pid, memoria compartida en uso, antivirus que lo retrasa. Todas se quitan solas en
// segundos, y por eso "a la segunda o tercera sí abre". Aquí se hace ese reintento por el cajero,
// limpiando entre intentos, y si aun así falla el error dice QUÉ escribió Postgres.
// Puro (sin Electron ni Postgres): se prueba con node --test.

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
