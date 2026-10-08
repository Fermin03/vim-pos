// Solo para las pruebas: un puerto que el sistema acaba de dar por libre.
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
