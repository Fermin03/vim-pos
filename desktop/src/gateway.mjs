// Fase 1 · Gateway compatible con Supabase (localhost).
// Hace que el POS Next.js funcione SIN TOCAR SU CÓDIGO: mapea las rutas que usa supabase-js
// a los servicios locales. Solo cambia la URL (NEXT_PUBLIC_SUPABASE_URL → este gateway).
//   /auth/v1/token|user|logout   → auth local (device sign-in / refresh)   [reemplaza GoTrue]
//   /functions/v1/pin-login      → pin-login local                          [reemplaza Edge]
//   /rest/v1/*                   → PostgREST (proxy)                         [datos + RPC + RLS]
import http from "node:http";
import { deviceSignIn, refreshSession, getUser, pinLogin, autorizarPin, exigirDispositivo } from "./auth.mjs";
import { hostsPropiosCacheados, hostPermitido } from "./hosts-propios.mjs";
import { crearLimitador } from "./limitador.mjs";
import { cajaIdDeEmail } from "./dispositivo.mjs";
import { esActividadDeOperacion } from "./respaldo-diario.mjs";
import { sondearPostgrest, explicarError } from "./sonda-postgrest.mjs";
import { conTope } from "./tope.mjs";

/** Lo que /health/deep espera al `SELECT 1`. La sonda de PostgREST lleva el suyo (4 s en total no
 *  caben: el watchdog aborta a los 6 s, y el motivo tiene que llegarle antes). */
const TOPE_SALUD_PG_MS = 1500;

// SEC CN-004 — CORS con allowlist en vez de "*".
//
// El gateway escucha en 0.0.0.0 (hace de hub para el KDS y la 2ª caja). Con "Access-Control-Allow-
// Origin: *" cualquier página web —abierta en la LAN, o desde internet vía DNS rebinding contra
// 127.0.0.1— podía llamarlo Y LEER LA RESPUESTA. Sin ACAO el navegador bloquea la lectura, que es
// justo lo que convierte el resto de la superficie en explotable desde una pestaña cualquiera.
//
// Clientes legítimos: el POS (ui-server, 54360) y la cocina (kds ui-server, 54361), servidos desde
// esta misma máquina o alcanzados por su IP de LAN. Nada más necesita hablar con el gateway.
const CORS_BASE = {
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,prefer,accept,accept-profile,content-profile,range,x-client-info,x-supabase-api-version",
  "Access-Control-Expose-Headers": "content-range,content-profile,range",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin", // la respuesta ya depende del Origin: sin esto un proxy podría cachearla cruzada
};

/**
 * Cabeceras CORS para esta petición. Si el Origin no está permitido NO se emite ACAO: el navegador
 * bloquea la lectura. Sin Origin (fetch del propio escritorio, verify headless, curl) no hace falta
 * ninguna: CORS es un control del navegador, no del servidor.
 */
function corsPara(req, uiPorts) {
  const origin = req.headers["origin"];
  if (!origin) return { ...CORS_BASE };
  let u;
  try { u = new URL(origin); } catch { return { ...CORS_BASE }; }
  const permitido =
    (u.protocol === "http:" || u.protocol === "https:") &&
    hostsPropiosCacheados().has(u.hostname.toLowerCase()) &&
    uiPorts.includes(Number(u.port));
  return permitido ? { ...CORS_BASE, "Access-Control-Allow-Origin": origin } : { ...CORS_BASE };
}

// Auditoría integral 30/09/2026, D4 — tope de cuerpo. readBody juntaba en memoria lo que llegara,
// sin límite, desde cualquier equipo de la LAN y sin autenticar: unos cuantos POST de cientos de MB
// dejaban a la caja sin memoria en plena comida. Los datos (PostgREST) llevan tickets con sus
// partidas y alguna importación: 5 MB sobra. Auth y funciones son JSON de unas líneas.
export const TOPE_CUERPO_DATOS = 5 * 1024 * 1024;
export const TOPE_CUERPO_CORTO = 64 * 1024;

class CuerpoDemasiadoGrande extends Error {}

const readBody = (req, max = TOPE_CUERPO_CORTO) => new Promise((resolve, reject) => {
  const declarado = Number(req.headers["content-length"] ?? 0);
  if (declarado > max) { req.resume(); return reject(new CuerpoDemasiadoGrande()); }
  const chunks = [];
  let total = 0;
  req.on("data", (c) => {
    total += c.length;
    if (total > max) { chunks.length = 0; req.removeAllListeners("data"); req.resume(); reject(new CuerpoDemasiadoGrande()); return; }
    chunks.push(c);
  });
  req.on("end", () => resolve(Buffer.concat(chunks)));
  req.on("error", reject);
});

/** JSON del cuerpo; uno ilegible cuenta como vacío (como antes), no como error 500. */
const leerJson = async (req) => {
  const txt = (await readBody(req)).toString();
  try { return JSON.parse(txt || "{}") ?? {}; } catch { return {}; }
};

// KDS por SSE (D4): tope de conexiones simultáneas. Una cocina y una 2ª caja abren una o dos; 32
// deja holgura para un local grande y corta que un script en el Wi-Fi las acumule hasta agotar
// sockets y memoria del hub.
export const TOPE_CLIENTES_KDS = 32;

/** Lo que lee el cajero si toca la caja justo durante el respaldo. */
export const MENSAJE_RESPALDO = "La caja está haciendo su respaldo diario; intenta en unos segundos.";

/** Lo que lee si una operación llega en el segundo y medio en que el gateway se está cerrando. */
export const MENSAJE_REINICIO = "La caja se está reiniciando; intenta en unos segundos.";

/** Marca que `cerrarServidor` pone en el servidor y que el gateway consulta en cada petición. */
export const CERRANDO = Symbol.for("vim.gateway.cerrando");

/**
 * El gateway "de espera": ocupa el puerto MIENTRAS el backend está detenido por el respaldo.
 *
 * Sin él, el puerto queda cerrado y el POS recibe un fallo de red pelado («Failed to fetch»), que
 * el cajero lee como "se cayó el sistema". Con él, toda petición recibe un 503 con un mensaje que
 * se entiende y que dice qué hacer. Va en `message` —lo que supabase-js enseña de un error de
 * PostgREST— y en `error` / `error_description` —lo que leen el login y las funciones—. Lleva
 * las mismas cabeceras CORS que el gateway de verdad: sin ellas el navegador bloquea la lectura y
 * el POS vuelve a ver solo un fallo de red.
 */
export function crearGatewayDeEspera({ uiPorts = [54360, 54361], mensaje = MENSAJE_RESPALDO } = {}) {
  return http.createServer((req, res) => {
    const cors = corsPara(req, uiPorts);
    req.resume(); // el cuerpo no interesa
    if (!hostPermitido(req.headers.host)) {
      res.writeHead(403, { "Content-Type": "application/json", ...cors });
      return res.end(JSON.stringify({ error: "HOST_NO_PERMITIDO" }));
    }
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(""); }
    res.writeHead(503, { "Content-Type": "application/json", "Retry-After": "5", ...cors });
    res.end(JSON.stringify({ error: "RESPALDO_EN_CURSO", code: "RESPALDO_EN_CURSO", message: mensaje, error_description: mensaje, ok: false }));
  });
}

/**
 * Cierra un servidor HTTP DE VERDAD y sin quedarse esperando.
 *
 * `server.close()` a secas deja de aceptar conexiones nuevas, pero no toca las que Node considera
 * activas: las que tienen una petición en vuelo y las que el navegador abrió sin haber pedido nada
 * todavía. Esas siguen vivas —y siguen atendiendo peticiones NUEVAS—, y `close()` no llama a su
 * callback hasta que se van todas. En la caja eso era una trampa (Knock-Out Obregón, 2 oct 2026):
 * el stream del POS reconectaba a los 3 s por una de esas conexiones, un stream no termina nunca, y
 * el reinicio del backend se quedaba esperando para siempre con el puerto cerrado a conexiones
 * nuevas. El POS veía «Failed to fetch» hasta que alguien reabría la aplicación.
 *
 * Aquí el cierre tiene tres tiempos:
 *   1. deja de aceptar conexiones;
 *   2. durante `graciaMs` deja terminar lo que ya estaba en vuelo (un cobro a medio contestar no se
 *      corta), cerrando cada conexión en cuanto queda libre para que nadie la reutilice;
 *   3. al acabar la gracia corta lo que quede, streams incluidos.
 * Y por si el aviso de cierre no llegara, `topeMs`: quien detiene la caja no puede quedarse colgado.
 */
export function cerrarServidor(server, { graciaMs = 1500, topeMs = graciaMs + 2000 } = {}) {
  return new Promise((resolve) => {
    let barrido = null, corte = null, tope = null;
    const fin = () => {
      clearInterval(barrido); clearTimeout(corte); clearTimeout(tope);
      resolve();
    };
    // El gateway lo mira: lo que empiece a partir de aquí se rechaza, y lo que conteste ya no deja
    // la conexión para reutilizar (ver crearGateway).
    try { server[CERRANDO] = true; } catch { /* un servidor congelado: da igual */ }
    try {
      server.close(fin); // si ya estaba cerrado, el callback llega con el error: cuenta como cerrado
    } catch { return fin(); }
    barrido = setInterval(() => { try { server.closeIdleConnections?.(); } catch { /* */ } }, 50);
    corte = setTimeout(() => { try { server.closeAllConnections?.(); } catch { /* */ } }, graciaMs);
    tope = setTimeout(fin, topeMs);
  });
}

/**
 * `server.listen` como promesa que TAMBIÉN rechaza. Con el callback a secas, un puerto ocupado
 * (EADDRINUSE) sale como evento 'error' sin oyente —excepción sin capturar en el proceso principal—
 * y la promesa del arranque no se resuelve nunca: otro modo de dejar la caja a medio levantar.
 */
export function escuchar(server, puerto, host) {
  return new Promise((resolve, reject) => {
    const alFallar = (e) => reject(Object.assign(new Error(`no se pudo abrir el puerto ${puerto} (${e?.code ?? e?.message ?? e})`), { code: e?.code }));
    server.once("error", alFallar);
    server.listen(puerto, host, () => { server.off("error", alFallar); resolve(); });
  });
}

const bearer = (req) => (req.headers["authorization"] ?? "").replace(/^Bearer\s+/i, "");

/**
 * Crea (sin arrancar) el gateway HTTP.
 * `backend` = { restPort, secret, pool, kds?, uiPorts? } — uiPorts son los puertos desde los que se
 * sirve el UI (POS y cocina); definen el allowlist de CORS (SEC CN-004).
 */
export function crearGateway(backend) {
  const {
    restPort, secret, pool, kds, uiPorts = [54360, 54361],
    // Límite de intentos del login local (D2). Inyectable para probarlo con un reloj falso.
    limitador = crearLimitador(),
    // D4: exigir un token válido en /kds/stream. EventSource no admite cabeceras, así que va en
    // ?access_token=; el POS y la cocina lo mandan con `abrirStreamHub` (packages/kds-core), que
    // además reabre el stream con un token nuevo cuando caduca. Un cliente sin token (un POS web
    // viejo) no rompe nada: se queda sin tiempo real y lo cubre su sondeo. Salida de emergencia:
    // VIM_KDS_STREAM_AUTH=0 lo apaga.
    kdsExigeToken = process.env.VIM_KDS_STREAM_AUTH !== "0",
    topeClientesKds = TOPE_CLIENTES_KDS,
    // Respaldo diario: avisa cuando alguien OPERA la caja (escribe), para no respaldar encima de
    // un cajero. Los sondeos del POS y del KDS (GET) no cuentan. Ver respaldo-diario.mjs.
    alHaberActividad = null,
  } = backend;

  const server = http.createServer(async (req, res) => {
    const cors = corsPara(req, uiPorts);
    // Mientras el gateway se cierra (cerrarServidor), ninguna respuesta deja la conexión lista para
    // reutilizarse: si no, el navegador mete por ahí su siguiente petición y la gracia la corta a medias.
    const alCerrar = () => (server[CERRANDO] ? { Connection: "close" } : {});
    const send = (status, body, extra = {}) => {
      const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body ?? {});
      res.writeHead(status, { "Content-Type": "application/json", ...cors, ...extra, ...alCerrar() });
      res.end(payload);
    };

    // D3 — DNS rebinding: solo se atiende a quien nos llama por un nombre propio (loopback, IP de
    // la LAN, nombre del equipo). Una web que haga resolver su dominio a 127.0.0.1 llega con SU
    // dominio en Host, y aquí se queda. Va antes que todo, OPTIONS incluido.
    if (!hostPermitido(req.headers.host)) return send(403, { error: "HOST_NO_PERMITIDO" });

    // Una petición que EMPIEZA cuando el gateway ya se está cerrando (llegó por una conexión que
    // sobrevivió al cierre) no se atiende: un cobro aceptado ahora se cortaría a la mitad al vencer
    // la gracia y el POS no sabría si se hizo. Mejor un «intenta en unos segundos» limpio.
    if (server[CERRANDO]) {
      req.resume();
      return send(503, { error: "GATEWAY_CERRANDO", code: "GATEWAY_CERRANDO", message: MENSAJE_REINICIO, error_description: MENSAJE_REINICIO, ok: false }, { "Retry-After": "5" });
    }

    try {
      const url = new URL(req.url, "http://localhost");
      const p = url.pathname;
      if (alHaberActividad && esActividadDeOperacion(req.method, p, url.search)) {
        try { alHaberActividad(); } catch { /* un aviso no tumba una venta */ }
      }

      if (req.method === "OPTIONS") {
        // Lista FIJA de headers permitidos. Antes se reflejaba access-control-request-headers tal
        // cual, así que el cliente decidía qué se le permitía mandar — el preflight dejaba de ser
        // un control y pasaba a ser un trámite.
        res.writeHead(204, cors);
        return res.end("");
      }
      if (p === "/health") return send(200, { ok: true });
      // Salud PROFUNDA (Fase 3, watchdog): toca Postgres (pool) y PostgREST. 503 si algo cayó, y
      // con el MOTIVO: el watchdog lo deja en el log. A PostgREST se le hace una lectura mínima,
      // no «/» —que genera el OpenAPI de todo el esquema y tarda segundos— (sonda-postgrest.mjs).
      if (p === "/health/deep") {
        // Con tope propio: el pool es de 4 y lo comparten el sync y el espejo. Sin tope, un pool
        // ocupado se confundía con «el gateway no contesta» (el aborto de 6 s del watchdog).
        try {
          const pg = await conTope(pool.query("SELECT 1"), TOPE_SALUD_PG_MS);
          if (pg.vencio) return send(503, { ok: false, error: `Postgres no contestó en ${TOPE_SALUD_PG_MS} ms` });
        } catch (e) {
          return send(503, { ok: false, error: `Postgres no contestó (${explicarError(e)})` });
        }
        const rest = await sondearPostgrest(restPort);
        if (!rest.ok) return send(503, { ok: false, error: rest.error });
        return send(200, { ok: true, pg: true, rest: true });
      }

      // ── Fase 2 · Hub — stream de cocina en tiempo real (SSE por LAN) ─────────
      if (p === "/kds/stream") {
        if (!kds) return send(503, { error: "KDS_STREAM_NO_DISPONIBLE" });
        if (kdsExigeToken) {
          const token = url.searchParams.get("access_token") || bearer(req);
          const u = await getUser(pool, secret, token);
          if (u.error) return send(401, { error: "NO_AUTH" });
        }
        if ((kds.nClientes ?? 0) >= topeClientesKds) return send(503, { error: "KDS_DEMASIADOS_CLIENTES" }, { "Retry-After": "30" });
        return kds.handleSse(req, res, url, cors);
      }

      // ── Auth (GoTrue emulado) ──────────────────────────────────────────────
      if (p === "/auth/v1/token") {
        const grant = url.searchParams.get("grant_type");
        const body = await leerJson(req);
        if (grant === "refresh_token") {
          const out = await refreshSession(pool, secret, body.refresh_token);
          return send(out.error ?? 200, out.body);
        }
        // D2 — freno por IP y por cuenta. La cuenta se normaliza a su caja: los dos dominios de
        // dispositivo (y el reintento con el alterno que hace el POS) cuentan como la misma.
        const ip = String(req.socket.remoteAddress ?? "");
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const claveCuenta = `cuenta:${cajaIdDeEmail(email) ?? email}`;
        const claveIp = `ip:${ip}`;
        // La caja misma (loopback) no se bloquea por cuenta: si no, un atacante en el Wi-Fi podría
        // dejar al POS de la propia caja sin poder vincularse durante 15 minutos.
        const local = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
        const espera = Math.max(limitador.restante(claveIp), local ? 0 : limitador.restante(claveCuenta));
        if (espera > 0) {
          return send(429, { error: "too_many_requests", error_description: "Demasiados intentos. Espera unos minutos." },
            { "Retry-After": String(Math.ceil(espera / 1000)) });
        }
        const out = await deviceSignIn(pool, secret, body);
        if (out.error) { limitador.fallo(claveIp); limitador.fallo(claveCuenta); } else limitador.exito(claveCuenta);
        return send(out.error ?? 200, out.body);
      }
      if (p === "/auth/v1/user") {
        const out = await getUser(pool, secret, bearer(req));
        return send(out.error ?? 200, out.body);
      }
      if (p === "/auth/v1/logout") return send(204, "");
      if (p.startsWith("/auth/v1/")) return send(200, {}); // settings/otros no-op

      // ── Funciones (Edge emuladas) ──────────────────────────────────────────
      if (p === "/functions/v1/pin-login") {
        // SEC CN-005 — el llamante debe ser el DISPOSITIVO de ESTA caja, como en la nube.
        const disp = await exigirDispositivo(pool, secret, bearer(req));
        if (disp.error) return send(disp.error, disp.body);
        const body = await leerJson(req);
        // Una caja solo autentica PINs contra sí misma: si no, un dispositivo del tenant podría
        // provocar bloqueos de empleados en las demás cajas del negocio.
        if (body.caja_id !== disp.cajaId) return send(403, { error: "CAJA_NO_COINCIDE" });
        const out = await pinLogin(pool, secret, body);
        return send(out.error ?? 200, out.body);
      }
      if (p === "/functions/v1/autorizar-pin") {
        const body = await leerJson(req);
        const out = await autorizarPin(pool, secret, bearer(req), body);
        return send(out.error ?? 200, out.body);
      }
      if (p === "/functions/v1/delivery-accion") {
        // Espejo de apps (spec 2026-09-03): la pantalla del POS actúa igual que en la web; el
        // gateway valida la sesión LOCAL y reenvía a la nube con el token de DISPOSITIVO, que
        // nunca sale al navegador. Sin nube → 503 (la pantalla ya lo explica).
        const u = await getUser(pool, secret, bearer(req));
        if (u.error) return send(u.error, u.body);
        const nube = typeof backend.nube === "function" ? await backend.nube().catch(() => null) : null;
        if (!nube) return send(503, { error: "FUNCION_REQUIERE_NUBE", funcion: "delivery-accion" });
        const cuerpo = (await readBody(req)).toString() || "{}";
        let up;
        try {
          up = await fetch(`${nube.cloudUrl}/functions/v1/delivery-accion`, {
            method: "POST", body: cuerpo,
            headers: { apikey: nube.anonKey, Authorization: `Bearer ${nube.deviceToken}`, "Content-Type": "application/json" },
            signal: AbortSignal.timeout(15000),
          });
        } catch (e) {
          return send(503, { error: "SIN_RED", detalle: String(e?.message ?? e) });
        }
        return send(up.status, await up.text());
      }
      if (p.startsWith("/functions/v1/")) {
        // Otras Edge Functions (timbrar-cfdi, enviar-push…) requieren nube: fallan claro offline.
        return send(503, { error: "FUNCION_REQUIERE_NUBE", funcion: p.replace("/functions/v1/", "") });
      }

      // ── Datos (PostgREST proxy) ────────────────────────────────────────────
      if (p.startsWith("/rest/v1/")) {
        const target = `http://127.0.0.1:${restPort}${p.replace("/rest/v1", "")}${url.search}`; // 127.0.0.1: PostgREST solo IPv4
        const headers = {};
        for (const h of ["authorization", "prefer", "content-type", "accept", "accept-profile", "content-profile", "range"]) {
          if (req.headers[h]) headers[h] = req.headers[h];
        }
        const method = req.method;
        const hasBody = method !== "GET" && method !== "HEAD";
        const upstream = await fetch(target, { method, headers, body: hasBody ? await readBody(req, TOPE_CUERPO_DATOS) : undefined });
        const buf = Buffer.from(await upstream.arrayBuffer());
        const extra = {};
        for (const h of ["content-type", "content-range", "content-profile", "range"]) {
          const v = upstream.headers.get(h);
          if (v) extra[h] = v;
        }
        res.writeHead(upstream.status, { ...cors, ...extra, ...alCerrar() });
        return res.end(buf);
      }

      return send(404, { error: "NO_ENCONTRADO", path: p });
    } catch (e) {
      if (e instanceof CuerpoDemasiadoGrande) return send(413, { error: "CUERPO_DEMASIADO_GRANDE" }, { Connection: "close" });
      return send(500, { error: "GATEWAY_ERROR", detalle: String(e?.message ?? e) });
    }
  });
  return server;
}
