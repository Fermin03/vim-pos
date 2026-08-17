// Política de sincronización periódica de la caja.
//
// Vive fuera de main.mjs porque ahí no se puede probar: ese módulo importa Electron. Aquí no
// hay dependencias — el trabajo real se inyecta como `ejecutar`, igual que los temporizadores —,
// así que el comportamiento (ritmo, backoff, no solaparse, cada cuántos ciclos toca PULL) se
// verifica con relojes falsos y sin levantar la app.

export const SYNC_CADA_MS = 10 * 60 * 1000;   // ritmo normal
export const SYNC_REINTENTO_MS = 60 * 1000;   // primer reintento tras un fallo
export const SYNC_PULL_CADA = 6;              // 1 de cada 6 ciclos (≈1 h) baja el catálogo

/**
 * Cuánto esperar hasta el siguiente intento.
 *
 * Sin fallos, el ritmo normal. Con fallos, backoff exponencial 1→2→4→8 min hasta toparse con el
 * ritmo normal: reintentar cada minuto contra una nube caída solo llena el log, y esperar los
 * 10 completos deja ventas sin subir de más cuando el corte fue de un instante.
 */
export function esperaSiguiente(fallosSeguidos, { cadaMs = SYNC_CADA_MS, reintentoMs = SYNC_REINTENTO_MS } = {}) {
  if (fallosSeguidos <= 0) return cadaMs;
  return Math.min(cadaMs, reintentoMs * 2 ** (fallosSeguidos - 1));
}

/** ¿A este ciclo le toca bajar el catálogo, o solo subir ventas? */
export function tocaPull(nCiclo, cada = SYNC_PULL_CADA) {
  return nCiclo % cada === 0;
}

/**
 * Crea el ciclo. `ejecutar({ conPull })` debe devolver true si el PUSH llegó a completarse;
 * cualquier otra cosa (false, excepción) cuenta como fallo y dispara el backoff.
 */
export function crearCicloSync({
  ejecutar,
  cadaMs = SYNC_CADA_MS,
  reintentoMs = SYNC_REINTENTO_MS,
  pullCada = SYNC_PULL_CADA,
  log = () => {},
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  let timer = null;
  let enCurso = false;
  let detenido = false;
  let fallos = 0;
  let ciclos = 0;
  // Último resultado, para que la caja pueda MOSTRARLE al cajero si sus ventas están subiendo.
  // Sin esto solo lo sabe el log, que nadie abre.
  let ultimoOkIso = null;
  let ultimoIntentoIso = null;

  function programar(ms) {
    if (timer) clearTimeoutFn(timer);
    timer = null;
    if (detenido) return; // apagando: no re-armar
    timer = setTimeoutFn(() => { tick().catch(() => {}); }, ms);
    timer?.unref?.(); // un temporizador pendiente no debe impedir que la app cierre
  }

  async function tick() {
    if (detenido) return;
    // Sin solaparse: con mala red un ciclo puede tardar más que el intervalo, y dos pushes a la
    // vez competirían por marcar los mismos tickets como subidos.
    if (enCurso) { programar(cadaMs); return; }
    enCurso = true;
    let ok = false;
    try {
      ok = (await ejecutar({ conPull: tocaPull(ciclos, pullCada) })) === true;
      ciclos++;
    } catch (e) {
      log(`ciclo falló: ${e?.message ?? e}`);
    } finally {
      enCurso = false;
    }
    ultimoIntentoIso = new Date().toISOString();
    if (ok) ultimoOkIso = ultimoIntentoIso;
    fallos = ok ? 0 : fallos + 1;
    const espera = esperaSiguiente(fallos, { cadaMs, reintentoMs });
    if (!ok) log(`reintento en ${Math.round(espera / 60000)} min (fallo ${fallos})`);
    programar(espera);
  }

  return {
    /** Sincroniza ya y deja el ciclo corriendo. */
    iniciar() { detenido = false; tick().catch(() => {}); },
    detener() { detenido = true; if (timer) clearTimeoutFn(timer); timer = null; },
    /** Estado para diagnóstico y para la barra del POS. */
    estado() {
      return {
        fallos, ciclos, enCurso, detenido, armado: timer !== null,
        ultimaSincronizacion: ultimoOkIso,
        ultimoIntento: ultimoIntentoIso,
        sincronizando: enCurso,
      };
    },
  };
}
