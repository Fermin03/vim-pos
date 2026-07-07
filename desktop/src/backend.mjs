// Fase 1 · Arranque del backend local completo (runtime + gateway).
// Lo usa el proceso main de Electron y el verify headless. Deja todo escuchando en localhost.
import { startLocalBackend } from "./runtime.mjs";
import { crearGateway } from "./gateway.mjs";

export async function startBackend(opts = {}) {
  const gatewayPort = opts.gatewayPort ?? 54350;
  const log = opts.log ?? (() => {});
  const backend = await startLocalBackend({ ...opts, log });
  const gateway = crearGateway(backend);
  await new Promise((resolve) => gateway.listen(gatewayPort, resolve));
  log(`Gateway Supabase-compat en http://localhost:${gatewayPort}`);
  return {
    ...backend,
    gatewayPort,
    url: `http://localhost:${gatewayPort}`,
    stop: async () => { await new Promise((r) => gateway.close(r)); await backend.stop(); },
  };
}

// Ejecutado directo (`npm run backend`): arranca y se queda vivo.
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("src/backend.mjs")) {
  const b = await startBackend({ log: (m) => console.log("·", m) });
  console.log(`\n✅ Backend local listo. Apunta el POS a: ${b.url}`);
  process.on("SIGINT", async () => { await b.stop(); process.exit(0); });
}
