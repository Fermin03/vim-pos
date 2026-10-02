// Esperar algo «como mucho» un rato.
//
// Detener la caja son varios pasos que esperan a otro: que el stream cierre, que el pool suelte sus
// conexiones, que postgres.exe avise de que salió. Cualquiera de ellos puede no avisar nunca —un
// Postgres que ya estaba muerto no vuelve a emitir 'exit'— y quien espera sin tope se queda colgado
// con la caja a medio apagar: ni detenida ni levantada. Con tope, el paso se da por perdido, se
// anota y se sigue; el arranque siguiente ya barre lo que haya quedado vivo (runtime.mjs).

/**
 * Espera a `promesa` como mucho `ms`.
 *
 * @returns {Promise<{ vencio: boolean, valor?: unknown }>} `vencio: true` si se acabó el tiempo.
 *   Si `promesa` rechaza antes del tope, el rechazo sube tal cual.
 */
export function conTope(promesa, ms, alVencer = () => {}) {
  let reloj = null;
  const tope = new Promise((resolve) => {
    reloj = setTimeout(() => {
      try { alVencer(); } catch { /* el aviso no puede tumbar la parada */ }
      resolve({ vencio: true });
    }, ms);
  });
  const hecho = Promise.resolve(promesa).then((valor) => ({ vencio: false, valor }));
  return Promise.race([hecho, tope]).finally(() => clearTimeout(reloj));
}
