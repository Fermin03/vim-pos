// Puertos: uno que el sistema acaba de dar por libre, y saber si otro ya tiene dueño.
//
// `puertoLibre` nació para las pruebas; el arranque de la caja lo usa junto con `puertoOcupado`
// para no poner a PostgREST en un puerto donde ya escucha alguien (ver runtime.mjs).
//
// `startUiServer` necesita saber su puerto ANTES de escuchar (lo usa para comprobar el Origin de
// las peticiones que escriben), así que no se le puede pasar 0 como a los demás servidores de
// prueba. Antes cada archivo adivinaba uno en una ventana de 30 a 150 puertos, y las ventanas se
// solapaban entre archivos que corren en paralelo: el CI salía en rojo con EADDRINUSE sin que
// hubiera nada roto (7 oct 2026). Y cuando dos pruebas seguidas caían en el mismo puerto, `fetch`
// reusaba la conexión del servidor anterior, ya cerrado: ECONNRESET.
import net from "node:net";

/**
 * Pide un puerto al sistema, lo suelta y lo devuelve.
 *
 * ponytail: entre soltarlo y usarlo otro proceso podría tomarlo. El sistema reparte entre miles,
 * así que no pasa en la práctica; si un día pasa, que `startUiServer` acepte 0 y lea su puerto.
 */
export function puertoLibre(host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, host, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/**
 * ¿Hay alguien escuchando ya en ese puerto? Se pregunta intentando enlazarlo: un enlace normal
 * falla aunque el otro proceso haya puesto SO_REUSEADDR (medido con PostgREST en Windows).
 * Hay que preguntar por la MISMA dirección: en Windows 0.0.0.0 y 127.0.0.1 conviven sin error.
 */
export function puertoOcupado(puerto, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(true));
    s.listen(puerto, host, () => s.close(() => resolve(false)));
  });
}
