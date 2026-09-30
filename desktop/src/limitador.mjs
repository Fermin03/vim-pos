// Límite de intentos fallidos en memoria (Auditoría integral 30/09/2026, D2).
//
// El login local (/auth/v1/token) escucha en la LAN y comparaba contraseñas sin freno: se podía
// probar en bucle desde el Wi-Fi del restaurante. Esto no sustituye a que solo entren cuentas de
// DISPOSITIVO (auth.mjs), lo complementa: aunque la contraseña de una caja sea larga y aleatoria,
// un endpoint de contraseñas no debe dejar probar mil por minuto.
//
// En memoria a propósito: si la caja se reinicia el contador vuelve a cero, y eso está bien — un
// atacante no controla cuándo se reinicia la caja, y persistir esto sería escribir en disco por
// cada intento fallido.

export const INTENTOS_MAX = 10;
export const VENTANA_MS = 5 * 60_000;
export const BLOQUEO_MS = 15 * 60_000;
const MAX_CLAVES = 10_000; // tope de memoria: un barrido de IPs/correos no puede crecer sin fin

/**
 * crearLimitador({ max, ventanaMs, bloqueoMs, ahora }) → { restante(clave), fallo(clave), exito(clave) }
 *  - restante: ms que le quedan de bloqueo a esa clave (0 = puede intentar).
 *  - fallo: cuenta un fallo; al llegar a `max` dentro de `ventanaMs`, bloquea `bloqueoMs`.
 *  - exito: borra el historial de la clave.
 */
export function crearLimitador({ max = INTENTOS_MAX, ventanaMs = VENTANA_MS, bloqueoMs = BLOQUEO_MS, ahora = () => Date.now() } = {}) {
  const claves = new Map(); // clave → { fallos: number[], hasta: number }

  function limpiar(t) {
    if (claves.size < MAX_CLAVES) return;
    for (const [k, v] of claves) {
      if (v.hasta <= t && v.fallos.every((f) => t - f > ventanaMs)) claves.delete(k);
    }
    // Si aun así está lleno (barrido activo), se sacrifica lo más viejo: el Map guarda orden de alta.
    while (claves.size >= MAX_CLAVES) claves.delete(claves.keys().next().value);
  }

  return {
    restante(clave) {
      const e = claves.get(clave);
      if (!e) return 0;
      return Math.max(0, e.hasta - ahora());
    },
    fallo(clave) {
      const t = ahora();
      limpiar(t);
      const e = claves.get(clave) ?? { fallos: [], hasta: 0 };
      e.fallos = e.fallos.filter((f) => t - f < ventanaMs);
      e.fallos.push(t);
      if (e.fallos.length >= max) { e.hasta = t + bloqueoMs; e.fallos = []; }
      claves.set(clave, e);
    },
    exito(clave) { claves.delete(clave); },
    get tamano() { return claves.size; },
  };
}
