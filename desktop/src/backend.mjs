// Fase 1/2 · Arranque del backend local completo (runtime + gateway + stream KDS).
// Lo usa el proceso main de Electron y el verify headless. En modo Hub (Fase 2) el gateway
// escucha en la LAN para que la pantalla de cocina / 2ª caja se conecten a la caja-servidor.
import os from "node:os";
import { startLocalBackend } from "./runtime.mjs";
import { crearGateway, cerrarServidor, escuchar } from "./gateway.mjs";
import { crearKdsStream } from "./kds-stream.mjs";
import { conTope } from "./tope.mjs";

/** IPv4 de la LAN real (para que el KDS sepa a qué caja-hub conectarse). Evita adaptadores
 *  virtuales (Hyper-V/WSL/VMware/Docker — típicamente 172.x host-only que otra PC NO alcanza) y
 *  prefiere una dirección privada de LAN casera/PyME (192.168.x, luego 10.x). */
function ipLan() {
  const cands = [];
  for (const [nombre, ifs] of Object.entries(os.networkInterfaces())) {
    for (const i of ifs ?? []) {
      if (i.family !== "IPv4" || i.internal) continue;
      const virtual = /vethernet|virtual|vmware|virtualbox|hyper-?v|wsl|docker|loopback|default switch|tailscale|zerotier/i.test(nombre);
      cands.push({ addr: i.address, virtual });
    }
  }
  const puntaje = (c) => (c.virtual ? 0 : 4) + (c.addr.startsWith("192.168.") ? 2 : 0) + (c.addr.startsWith("10.") ? 1 : 0);
  cands.sort((a, b) => puntaje(b) - puntaje(a));
  return cands[0]?.addr ?? "127.0.0.1";
}

export async function startBackend(opts = {}) {
  const gatewayPort = opts.gatewayPort ?? 54350;
  const host = opts.host ?? "0.0.0.0"; // Hub: escuchar en toda la LAN (no solo localhost).
  const log = opts.log ?? (() => {});
  const backend = await startLocalBackend({ ...opts, log });

  // Fase 2 — puente de tiempo real del KDS (LISTEN 'vim_kds' → SSE).
  let kds;
  try {
    kds = await crearKdsStream({ pgPort: backend.pgPort, pgPassword: backend.pgPassword, log });
  } catch (e) {
    try { await backend.stop(); } catch { /* */ } // que no quede un Postgres sin dueño
    throw e;
  }

  // SEC CN-004 — puertos desde los que se sirve el UI (POS 54360 / cocina 54361). Definen qué
  // orígenes reciben cabeceras CORS: cualquier otro puede llamar al gateway pero no leer la
  // respuesta. Los valores coinciden con UI_PORT / KDS_UI_PORT de main.mjs.
  const uiPorts = opts.uiPorts ?? [54360, 54361];
  const lan = ipLan();
  const resultado = {
    ...backend,
    kds,
    gatewayPort,
    lanIp: lan,
    url: `http://localhost:${gatewayPort}`,
    lanUrl: `http://${lan}:${gatewayPort}`,
    // Proveedor del token de nube del dispositivo (puente de delivery-accion). Puede venir en las
    // opciones o asignarse después (`backend.nube = …`): el gateway lo lee en cada petición.
    nube: opts.nube ?? null,
    /** Devuelve `{ postgresDetenido }`. Ver `detenerBackend`. */
    stop: () => detenerBackend({ kds, gateway, runtime: backend, log }),
  };
  const gateway = crearGateway(opcionesGateway(resultado, { kds, uiPorts, alHaberActividad: opts.alHaberActividad ?? null }));
  try {
    await escuchar(gateway, gatewayPort, host);
  } catch (e) {
    // Sin gateway no hay backend que devolver: que tampoco quede un Postgres sin dueño.
    try { await detenerBackend({ kds, gateway: null, runtime: backend, log }); } catch { /* */ }
    throw e;
  }
  log(`Gateway Supabase-compat en http://localhost:${gatewayPort}`);
  if (host === "0.0.0.0" && lan !== "127.0.0.1") log(`Hub en la LAN: http://${lan}:${gatewayPort} (KDS/2ª caja se conectan aquí)`);
  return resultado;
}

/**
 * Detiene el backend entero. NINGÚN paso puede quedarse esperando: quien llama (el watchdog, el
 * respaldo, salir de la app) deja `backend` en null mientras tanto, y una parada colgada es una
 * caja sin backend para siempre. Pasó en Knock-Out Obregón (2 oct 2026): el cierre del gateway
 * esperaba a un stream que había reconectado y no terminaba nunca.
 *
 * El orden importa:
 *   1. El puente del KDS deja de aceptar streams y termina los abiertos (lo hace en el acto; lo
 *      que tarda es cerrar su conexión LISTEN, y eso se espera aparte y con tope).
 *   2. El gateway deja de atender, con su gracia para lo que estaba en vuelo (`cerrarServidor`).
 *   3. SOLO ENTONCES PostgREST y Postgres: mientras el gateway atienda, la base tiene que estar.
 *      Un refresco de sesión que cayera sobre un Postgres ya detenido contestaría 500, y el POS
 *      tomaría ese 500 como «sesión inválida» y pediría vincular la caja de nuevo.
 *
 * Devuelve `{ postgresDetenido }` (lo que diga el runtime): el respaldo copia el pgdata en frío y
 * no puede hacerlo si Postgres sigue vivo. Exportada para probarla con dobles.
 */
export async function detenerBackend({ kds, gateway, runtime, log = () => {}, topeKdsMs = 3000, graciaMs }) {
  let finKds = Promise.resolve();
  try {
    finKds = conTope(Promise.resolve(kds?.stop?.()), topeKdsMs, () => log("parada: el stream del KDS no cerró a tiempo; se sigue"));
    finKds.catch(() => {}); // se espera más abajo; aquí solo se evita un rechazo sin dueño
  } catch { /* un stop() que revienta al llamarlo no detiene la parada */ }
  if (gateway) await cerrarServidor(gateway, graciaMs === undefined ? {} : { graciaMs });
  try { await finKds; } catch { /* */ }
  let resultado = null;
  try { resultado = await runtime.stop(); } catch (e) { log(`parada: el runtime no se detuvo limpio (${e?.message ?? e})`); }
  return { postgresDetenido: resultado?.postgresDetenido === true };
}

/**
 * Lo que recibe el gateway. `nube` NO se copia: se lee del objeto vivo que devuelve startBackend.
 *
 * Auditoría integral 30/09/2026, D5. Antes se pasaba una copia (`{ ...backend, kds, uiPorts }`) y
 * main.mjs asignaba `backend.nube` sobre OTRO objeto, el devuelto; el gateway nunca lo veía y
 * `delivery-accion` contestaba siempre 503 FUNCION_REQUIERE_NUBE: aceptar o pausar un pedido de
 * Uber desde el POS fallaba aunque hubiera internet. Exportada para probarla.
 */
export function opcionesGateway(vivo, extra = {}) {
  return {
    restPort: vivo.restPort, secret: vivo.secret, pool: vivo.pool, ...extra,
    nube: (o) => (typeof vivo.nube === "function" ? vivo.nube(o) : Promise.resolve(null)),
  };
}

// Ejecutado directo (`npm run backend`): arranca y se queda vivo.
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("src/backend.mjs")) {
  const b = await startBackend({ log: (m) => console.log("·", m) });
  console.log(`\n✅ Backend local listo. Caja: ${b.url} · Hub LAN: ${b.lanUrl}`);
  process.on("SIGINT", async () => { await b.stop(); process.exit(0); });
}
