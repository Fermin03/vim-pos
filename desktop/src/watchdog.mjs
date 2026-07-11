// Fase 3 · Watchdog del backend de la caja. Hace ping periódico a la salud del gateway (que a su
// vez toca Postgres + PostgREST); si falla varias veces seguidas, dispara un reinicio del backend.
// Así la caja se auto-recupera si Postgres/PostgREST se caen, sin intervención.
export function crearWatchdog({ url, intervaloMs = 20000, fallosParaReiniciar = 3, alReiniciar, log = () => {} }) {
  let fallos = 0;
  let ocupado = false; // no solapar chequeos con un reinicio en curso
  let pausado = false; // durante un respaldo manual (stop→copia→start) no hay que reiniciar
  let timer = null;

  async function tick() {
    if (ocupado || pausado) return;
    let ok = false;
    // Salud PROFUNDA: /health/deep toca Postgres + PostgREST (no un ok estático).
    try { ok = (await fetch(`${url}/health/deep`, { signal: AbortSignal.timeout(6000) })).ok; } catch { ok = false; }
    if (ok) {
      if (fallos > 0) log("salud del backend OK de nuevo");
      fallos = 0;
      return;
    }
    fallos++;
    log(`salud del backend FALLÓ (${fallos}/${fallosParaReiniciar})`);
    if (fallos >= fallosParaReiniciar) {
      ocupado = true;
      fallos = 0;
      try {
        await alReiniciar();
        log("backend reiniciado por el watchdog ✓");
      } catch (e) {
        log(`el watchdog no pudo reiniciar el backend: ${e.message}`);
      } finally {
        ocupado = false;
      }
    }
  }

  timer = setInterval(tick, intervaloMs);
  return {
    stop: () => { if (timer) { clearInterval(timer); timer = null; } },
    pausar: () => { pausado = true; fallos = 0; },
    reanudar: () => { pausado = false; fallos = 0; },
  };
}
