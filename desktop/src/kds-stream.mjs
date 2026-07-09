// Fase 2 · Hub del local — stream de tiempo real del KDS (Server-Sent Events sobre el gateway).
// Una conexión pg dedicada hace LISTEN 'vim_kds'; cada NOTIFY (cambio de estado de cocina) se
// reenvía a los clientes SSE conectados (la pantalla de cocina / 2ª caja en la LAN). SSE porque es
// HTTP simple (atraviesa la LAN sin WebSocket), reconecta solo, y el navegador trae EventSource.
import pg from "pg";

/** Crea el puente LISTEN→SSE. Devuelve { handleSse(req,res,url), stop() }. */
export async function crearKdsStream({ pgPort, log = () => {} }) {
  // Conexión dedicada: LISTEN retiene la conexión, no puede compartir el pool.
  const client = new pg.Client({ host: "127.0.0.1", port: pgPort, user: "postgres", password: "postgres", database: "vimpos" });
  await client.connect();
  await client.query("LISTEN vim_kds");

  const clientes = new Set(); // { res, sucursal }

  client.on("notification", (msg) => {
    let payload = msg.payload;
    let sucursal = null;
    try { sucursal = JSON.parse(msg.payload).sucursal_id; } catch { /* */ }
    for (const c of clientes) {
      if (c.sucursal && sucursal && c.sucursal !== sucursal) continue; // filtro por sucursal
      try { c.res.write(`event: cocina\ndata: ${payload}\n\n`); } catch { /* cliente cayó */ }
    }
  });

  // Heartbeat: mantiene viva la conexión SSE a través de proxies/NAT de la LAN.
  const ping = setInterval(() => {
    for (const c of clientes) { try { c.res.write(`: ping\n\n`); } catch { /* */ } }
  }, 20000);

  return {
    /** Maneja GET /kds/stream[?sucursal=<uuid>] como SSE. */
    handleSse(req, res, url) {
      const sucursal = url.searchParams.get("sucursal");
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
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
      clearInterval(ping);
      for (const c of clientes) { try { c.res.end(); } catch { /* */ } }
      try { await client.end(); } catch { /* */ }
    },
  };
}
