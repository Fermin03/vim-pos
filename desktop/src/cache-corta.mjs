// Caché de una sola respuesta con vida corta, que además junta las peticiones simultáneas.
//
// Auditoría integral 30/09/2026, D4. GET /__folios (ui-server, sin autenticar y abierto a la LAN)
// hacía en CADA petición un login de dispositivo contra Supabase Auth —hasta dos, por el reintento
// con el dominio alterno— y luego la consulta. Un script en el Wi-Fi del restaurante bastaba para
// agotar el rate limit de Auth de la IP pública del local, y con él el sync de ventas de la caja.
// Con esto la nube se consulta como mucho una vez por `ttlMs`, pida quien pida.

/** crearCacheCorta({ ttlMs, ahora }) → { obtener(fn), invalidar() } */
export function crearCacheCorta({ ttlMs = 60_000, ahora = () => Date.now() } = {}) {
  let valor = null;      // { v, at }
  let enCurso = null;    // promesa en vuelo: los que llegan mientras tanto esperan la misma
  return {
    async obtener(fn) {
      if (valor && ahora() - valor.at < ttlMs) return valor.v;
      if (enCurso) return enCurso;
      enCurso = (async () => {
        try {
          const v = await fn();
          valor = { v, at: ahora() };
          return v;
        } finally {
          enCurso = null;
        }
      })();
      return enCurso;
    },
    invalidar() { valor = null; },
  };
}
