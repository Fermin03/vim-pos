// Fase 3 · Watchdog del backend de la caja. Hace ping periódico a la salud del gateway (que a su
// vez toca Postgres + PostgREST); si falla varias veces seguidas, dispara un reinicio del backend.
// Así la caja se auto-recupera si Postgres/PostgREST se caen, sin intervención.
//
// Reiniciar es una medida fuerte: la caja se queda sin backend unos segundos y Postgres se detiene
// a la fuerza. Vale la pena si lo cura; si NO lo cura, repetirlo cada minuto solo empeora las
// cosas. Pasó en Knock-Out Obregón (2 oct 2026): la revisión de salud daba falso positivo en esa
// PC y el watchdog reinició un backend sano decenas de veces, sin decir nunca por qué. De ahí
// salen tres reglas de este módulo:
//   · cada fallo deja en el log su MOTIVO;
//   · si un reinicio no devuelve la salud, el siguiente espera el doble (3, 6, 12… fallos), hasta
//     un techo: la caja sigue atendiendo entre intento e intento;
//   · al segundo reinicio seguido sin sanar se avisa a VIM (bitácora de errores), una vez por racha.
// Y lo contrario: si el reinicio NO TERMINÓ (reventó a medio levantar), la caja está sin backend y
// esperar otro minuto entero no ayuda a nadie. Se reintenta al siguiente fallo, y luego a los 2, 4
// y 6: rápido al principio, sin machacar una PC que no consigue arrancar.
//
// Lo que NO hace: soltar un reinicio que tarda. Mientras uno está en curso no se lanza otro (dos
// arranques sobre el mismo pgdata se matan entre sí); que termine lo garantizan los topes de la
// parada (backend.mjs). Si se eterniza, el log lo dice.

/** Revisiones buenas seguidas para dar por cerrada una racha de reinicios. */
export const OKS_PARA_OLVIDAR = 3;

/** Fallos seguidos que hacen falta para reiniciar, tras `sinSanar` reinicios que no curaron nada. */
export function umbralDeReinicio(base, sinSanar, techo) {
  return Math.min(techo, base * 2 ** Math.min(sinSanar, 30));
}

/** Lo mismo cuando los últimos `fallidos` reinicios ni siquiera terminaron: 1, 2, 4… hasta 2×base. */
export function umbralTrasReinicioFallido(base, fallidos) {
  return Math.min(base * 2, 2 ** Math.min(fallidos - 1, 30));
}

export function crearWatchdog({
  url, intervaloMs = 20000, fallosParaReiniciar = 3, alReiniciar, log = () => {},
  // Techo del umbral: 90 fallos = 30 minutos entre reinicios, con el intervalo por defecto.
  techoDeFallos = 90,
  // A la bitácora que VIM sí ve (errores_app). Nunca debe tumbar al watchdog.
  reportar = () => {},
  // Inyectables para probarlo sin red ni reloj.
  fetchImpl = fetch, ahora = () => Date.now(),
}) {
  let fallos = 0;
  let ocupado = false; // no solapar chequeos con un reinicio en curso
  let ocupadoDesde = 0;
  let avisoDeDemora = 0;
  let pausado = false; // durante un respaldo manual (stop→copia→start) no hay que reiniciar
  let sinSanar = 0;    // reinicios seguidos que terminaron bien y aun así la salud no volvió
  let fallidos = 0;    // reinicios seguidos que no terminaron (la caja quedó sin backend)
  let fallidosDesde = 0;
  let ultimoErrorDeReinicio = "";
  let oksSeguidos = 0;
  let timer = null;
  const limpiar = () => { fallos = 0; sinSanar = 0; fallidos = 0; fallidosDesde = 0; oksSeguidos = 0; };
  // El aviso a VIM NUNCA se espera: escribe en la base local, y con un Postgres que no contesta esa
  // escritura no vuelve. Esperarla dentro del reinicio dejaba al watchdog «ocupado» para siempre.
  const avisar = (mensaje, contexto) => {
    try { Promise.resolve(reportar(mensaje, contexto)).catch(() => {}); } catch { /* el aviso no puede tumbar al watchdog */ }
  };

  /** Salud PROFUNDA: /health/deep toca Postgres + PostgREST (no un ok estático) y dice qué falló. */
  async function revisar() {
    try {
      const r = await fetchImpl(`${url}/health/deep`, { signal: AbortSignal.timeout(6000) });
      if (r.ok) return { ok: true };
      let motivo = `el gateway contestó ${r.status}`;
      try { const cuerpo = await r.json(); if (cuerpo?.error) motivo = String(cuerpo.error); } catch { /* sin cuerpo legible */ }
      return { ok: false, motivo };
    } catch (e) {
      const vencio = e?.name === "TimeoutError" || e?.name === "AbortError";
      return { ok: false, motivo: vencio ? "el gateway no contestó en 6 s" : `gateway inalcanzable (${e?.cause?.code ?? e?.message ?? e})` };
    }
  }

  async function tick() {
    if (pausado) return;
    if (ocupado) {
      // Un reinicio normal tarda segundos. Si lleva minutos, que conste: la caja está sin backend.
      const t = ahora();
      if (t - ocupadoDesde >= 120_000 && t - avisoDeDemora >= 60_000) {
        avisoDeDemora = t;
        log(`el reinicio del backend sigue en curso desde hace ${Math.round((t - ocupadoDesde) / 1000)} s`);
      }
      return;
    }
    const { ok, motivo } = await revisar();
    // El respaldo detiene el backend a propósito: un fallo que llega ya en pausa es suyo.
    if (pausado || ocupado) return;
    if (ok) {
      if (oksSeguidos === 0 && (fallos > 0 || sinSanar > 0 || fallidos > 0)) log("salud del backend OK de nuevo");
      fallos = 0;
      oksSeguidos++;
      // Un OK suelto justo después de reiniciar no prueba que el reinicio curara algo: un backend
      // recién levantado y sin carga pasa la revisión y al minuto vuelve a fallar. La racha se
      // olvida tras OKS_PARA_OLVIDAR revisiones buenas seguidas (un minuto, con el intervalo normal).
      if (oksSeguidos >= OKS_PARA_OLVIDAR) { sinSanar = 0; fallidos = 0; fallidosDesde = 0; }
      return;
    }
    oksSeguidos = 0;
    fallos++;
    const umbral = fallidos > 0
      ? umbralTrasReinicioFallido(fallosParaReiniciar, fallidos)
      : umbralDeReinicio(fallosParaReiniciar, sinSanar, techoDeFallos);
    log(`salud del backend FALLÓ (${fallos}/${umbral}): ${motivo}`);
    if (fallos < umbral) return;

    ocupado = true;
    ocupadoDesde = ahora();
    avisoDeDemora = 0;
    fallos = 0;
    try {
      await alReiniciar();
      log("backend reiniciado por el watchdog ✓");
      // La caja estuvo sin backend varios intentos seguidos: ahora que hay base donde escribirlo,
      // que VIM se entere (mientras no la había, el aviso no tenía dónde quedar).
      if (fallidos >= 2) {
        const min = Math.max(1, Math.round((ahora() - fallidosDesde) / 60_000));
        avisar(`La caja estuvo unos ${min} min sin backend: ${fallidos} reinicios seguidos no terminaron (${ultimoErrorDeReinicio})`,
          { origen: "watchdog", tipo: "reinicios-fallidos", intentos: fallidos, minutos: min });
      }
      fallidos = 0;
      fallidosDesde = 0;
      // Si la salud vuelve, los OK lo ponen en cero. Si no vuelve, reiniciar no era el remedio: el
      // próximo intento espera el doble.
      sinSanar++;
      if (sinSanar === 2) {
        log("dos reinicios seguidos y la salud sigue fallando: se espacian los siguientes y se avisa a VIM");
        avisar(`El watchdog reinició el backend de la caja y la salud sigue fallando: ${motivo}`, { origen: "watchdog", tipo: "no-sana", motivo });
      }
    } catch (e) {
      // El reinicio no terminó: la caja está SIN backend. No se alarga la espera; se reintenta pronto.
      if (fallidos === 0) fallidosDesde = ahora();
      fallidos++;
      ultimoErrorDeReinicio = e?.message ?? String(e);
      log(`el watchdog no pudo reiniciar el backend: ${ultimoErrorDeReinicio}`);
    } finally {
      ocupado = false;
    }
  }

  timer = setInterval(() => { tick().catch((e) => log(`revisión de salud falló: ${e?.message ?? e}`)); }, intervaloMs);
  return {
    stop: () => { if (timer) { clearInterval(timer); timer = null; } },
    // El respaldo levanta un backend nuevo: lo que se contara del anterior ya no dice nada.
    pausar: () => { pausado = true; limpiar(); },
    reanudar: () => { pausado = false; limpiar(); },
    /** Una revisión ahora (lo que hace el temporizador). Expuesto para las pruebas. */
    tick,
  };
}
