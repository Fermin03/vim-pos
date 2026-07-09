// Fase 1/2 · Arranque del backend local completo (runtime + gateway + stream KDS).
// Lo usa el proceso main de Electron y el verify headless. En modo Hub (Fase 2) el gateway
// escucha en la LAN para que la pantalla de cocina / 2ª caja se conecten a la caja-servidor.
import os from "node:os";
import { startLocalBackend } from "./runtime.mjs";
import { crearGateway } from "./gateway.mjs";
import { crearKdsStream } from "./kds-stream.mjs";

/** IPv4 de la LAN (para que el KDS sepa a qué caja-hub conectarse). */
function ipLan() {
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs ?? []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return "127.0.0.1";
}

export async function startBackend(opts = {}) {
  const gatewayPort = opts.gatewayPort ?? 54350;
  const host = opts.host ?? "0.0.0.0"; // Hub: escuchar en toda la LAN (no solo localhost).
  const log = opts.log ?? (() => {});
  const backend = await startLocalBackend({ ...opts, log });

  // Fase 2 — puente de tiempo real del KDS (LISTEN 'vim_kds' → SSE).
  const kds = await crearKdsStream({ pgPort: backend.pgPort, log });

  const gateway = crearGateway({ ...backend, kds });
  await new Promise((resolve) => gateway.listen(gatewayPort, host, resolve));
  const lan = ipLan();
  log(`Gateway Supabase-compat en http://localhost:${gatewayPort}`);
  if (host === "0.0.0.0" && lan !== "127.0.0.1") log(`Hub en la LAN: http://${lan}:${gatewayPort} (KDS/2ª caja se conectan aquí)`);

  return {
    ...backend,
    kds,
    gatewayPort,
    lanIp: lan,
    url: `http://localhost:${gatewayPort}`,
    lanUrl: `http://${lan}:${gatewayPort}`,
    stop: async () => {
      try { await kds.stop(); } catch { /* */ }
      await new Promise((r) => gateway.close(r));
      await backend.stop();
    },
  };
}

// Ejecutado directo (`npm run backend`): arranca y se queda vivo.
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("src/backend.mjs")) {
  const b = await startBackend({ log: (m) => console.log("·", m) });
  console.log(`\n✅ Backend local listo. Caja: ${b.url} · Hub LAN: ${b.lanUrl}`);
  process.on("SIGINT", async () => { await b.stop(); process.exit(0); });
}
