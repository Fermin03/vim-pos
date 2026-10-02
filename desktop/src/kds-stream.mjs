// Fase 2 · Hub del local — stream de tiempo real del KDS (Server-Sent Events sobre el gateway).
// Una conexión pg dedicada hace LISTEN 'vim_kds'; cada NOTIFY (cambio de estado de cocina) se
// reenvía a los clientes SSE conectados (la pantalla de cocina / 2ª caja en la LAN). SSE porque es
// HTTP simple (atraviesa la LAN sin WebSocket), reconecta solo, y el navegador trae EventSource.
//
// El mismo puente lleva 'vim_catalogo': cuando el escritorio termina de bajar el menú, avisa a las
// pantallas para que lo recarguen sin reiniciar. Va por AQUÍ y no por un stream propio porque una
// segunda conexión SSE (más una tercera conexión pg dedicada, que LISTEN retiene entera) sería
// duplicar toda esta plomería para mandar un evento cada varias horas. Los clientes viejos no se
// rompen: el KDS escucha `event: cocina` y un tipo de evento que no conoce lo ignora.
import pg from "pg";

/** Canal de NOTIFY → nombre del evento SSE que ven las pantallas. */
const CANALES = {
  vim_kds: "cocina",
  vim_catalogo: "catalogo",
};

/** Crea el puente LISTEN→SSE. Devuelve { handleSse(req,res,url), stop() }. */
export async function crearKdsStream({
  pgPort, pgPassword, log = () => {},
  // Inyectable para probar el puente sin Postgres.
  crearCliente = (opciones) => new pg.Client(opciones),
}) {
  // Conexión dedicada: LISTEN retiene la conexión, no puede compartir el pool.
  // pgPassword la genera runtime.mjs por instalación (SEC CN-018) y la pasa backend.mjs. Ya no hay
  // valor por defecto: la clave de fábrica no tiene por qué seguir escrita en el código.
  const client = crearCliente({ host: "127.0.0.1", port: pgPort, user: "postgres", password: pgPassword, database: "vimpos" });
  // Si Postgres muere —el caso para el que existe el watchdog— esta conexión emite 'error'. Sin
  // oyente es una excepción sin capturar en el proceso principal, justo cuando toca recuperarse.
  client.on("error", (e) => log(`stream del KDS: se perdió la conexión a Postgres (${e?.message ?? e})`));
  await client.connect();
  for (const canal of Object.keys(CANALES)) await client.query(`LISTEN ${canal}`);

  const clientes = new Set(); // { res, sucursal }
  let detenido = false;

  client.on("notification", (msg) => {
    const evento = CANALES[msg.channel];
    if (!evento) return;
    let payload = msg.payload;
    let sucursal = null;
    try { sucursal = JSON.parse(msg.payload).sucursal_id; } catch { /* */ }
    for (const c of clientes) {
      // El filtro por sucursal es de la cocina: un cambio de menú es del negocio entero y le
      // toca a todas las pantallas, incluida la segunda caja de otra sucursal en la LAN.
      if (evento === "cocina" && c.sucursal && sucursal && c.sucursal !== sucursal) continue;
      try { c.res.write(`event: ${evento}\ndata: ${payload}\n\n`); } catch { /* cliente cayó */ }
    }
  });

  // Heartbeat: mantiene viva la conexión SSE a través de proxies/NAT de la LAN.
  const ping = setInterval(() => {
    for (const c of clientes) { try { c.res.write(`: ping\n\n`); } catch { /* */ } }
  }, 20000);

  return {
    /**
     * Maneja GET /kds/stream[?sucursal=<uuid>] como SSE.
     * `cors` lo calcula el gateway con su allowlist (SEC CN-004): aquí había un
     * "Access-Control-Allow-Origin: *" propio que se saltaba cualquier control del gateway.
     */
    handleSse(req, res, url, cors = {}) {
      // Un stream que llega cuando el puente ya se detuvo no tendría quién lo alimente ni quién lo
      // cierre: se quedaría abierto para siempre, y con él el gateway que lo sirve (así se colgaba
      // el reinicio del backend). Se rechaza, y sin dejar la conexión para reutilizar.
      if (detenido) {
        res.writeHead(503, { ...cors, "Content-Type": "application/json", "Retry-After": "5", Connection: "close" });
        return res.end(JSON.stringify({ error: "KDS_STREAM_DETENIDO" }));
      }
      const sucursal = url.searchParams.get("sucursal");
      res.writeHead(200, {
        ...cors,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(`event: hola\ndata: {"ok":true}\n\n`);
      const c = { res, sucursal };
      clientes.add(c);
      log(`KDS conectado (${clientes.size} activos)`);
      req.on("close", () => { clientes.delete(c); log(`KDS desconectado (${clientes.size} activos)`); });
    },
    get nClientes() { return clientes.size; },
    async stop() {
      detenido = true;
      clearInterval(ping);
      for (const c of clientes) { try { c.res.end(); } catch { /* */ } }
      try { await client.end(); } catch { /* */ }
    },
  };
}
