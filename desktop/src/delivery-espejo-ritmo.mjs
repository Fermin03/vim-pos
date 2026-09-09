// Ritmo del espejo de pedidos de apps, del lado de la caja.
//
// El servidor decide cada cuánto preguntar (`_shared/delivery/espejo-cadencia.ts`) y aquí se
// obedece, pero nunca a ciegas: la cadencia se acota a un rango sano, un fallo dispara backoff y
// toda espera lleva ruido. Sin ese ruido, la flota entera queda sincronizada —todas las cajas
// arrancaron su ciclo cuando volvió la nube— y cada sondeo llega en coro.
//
// Vive fuera de delivery-espejo.mjs porque ahí hay I/O (fetch y Postgres). Aquí no hay nada:
// se prueba con relojes y azar inyectados, igual que sync-ciclo.mjs.

/** Ni obedecer un "pregunta cada milisegundo" ni un "vuelve mañana" de un servidor equivocado. */
export const MIN_MS = 5_000;
export const MAX_MS = 600_000;
/** Lo que se usa si el servidor no dice nada: el ritmo de siempre, por si la nube es más vieja que la caja. */
export const CADENCIA_POR_DEFECTO = 10_000;
/** Con trabajo pendiente la caja no se duerme más que esto, diga lo que diga el servidor. */
export const PENDIENTE_MS = 10_000;
/** Techo del backoff. Más allá, una nube que ya volvió tardaría demasiado en notarse. */
export const TOPE_BACKOFF_MS = 300_000;
/** ±10% de ruido en cada espera. */
export const JITTER = 0.1;

/** La cadencia que mandó el servidor, acotada. Cualquier cosa que no sea un número usable → default. */
export function cadenciaAceptada(valor, porDefecto = CADENCIA_POR_DEFECTO) {
  const n = typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
  return Math.min(MAX_MS, Math.max(MIN_MS, n));
}

/**
 * Cuánto esperar hasta el siguiente sondeo.
 *
 * @param cadencia  la que ya pasó por `cadenciaAceptada`.
 * @param fallos    sondeos seguidos que fallaron.
 * @param pendiente la caja tiene trabajo propio a medias (un ticket por crear, una acción por
 *                  reintentar). Eso lo sabe ella, no el servidor, y manda sobre el reposo.
 * @param aleatorio inyectable para poder probar el jitter.
 */
export function esperaEspejo({ cadencia, fallos = 0, pendiente = false, aleatorio = Math.random }) {
  const base = pendiente ? Math.min(cadencia, PENDIENTE_MS) : cadencia;
  const conBackoff = fallos > 0 ? Math.min(TOPE_BACKOFF_MS, base * 2 ** fallos) : base;
  return Math.round(conBackoff * (1 + (aleatorio() * 2 - 1) * JITTER));
}
