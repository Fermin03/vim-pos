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
  } = backend;

  return http.createServer(async (req, res) => {
    const cors = corsPara(req, uiPorts);
    const send = (status, body, extra = {}) => {
      const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body ?? {});
      res.writeHead(status, { "Content-Type": "application/json", ...cors, ...extra });
      res.end(payload);
    };

    // D3 — DNS rebinding: solo se atiende a quien nos llama por un nombre propio (loopback, IP de
    // la LAN, nombre del equipo). Una web que haga resolver su dominio a 127.0.0.1 llega con SU
    // dominio en Host, y aquí se queda. Va antes que todo, OPTIONS incluido.
    if (!hostPermitido(req.headers.host)) return send(403, { error: "HOST_NO_PERMITIDO" });

    try {
      const url = new URL(req.url, "http://localhost");
      const p = url.pathname;

      if (req.method === "OPTIONS") {
        // Lista FIJA de headers permitidos. Antes se reflejaba access-control-request-headers tal
        // cual, así que el cliente decidía qué se le permitía mandar — el preflight dejaba de ser
        // un control y pasaba a ser un trámite.
        res.writeHead(204, cors);
        return res.end("");
      }
      if (p === "/health") return send(200, { ok: true });
      // Salud PROFUNDA (Fase 3, watchdog): toca Postgres (pool) y PostgREST. 503 si algo cayó.
      if (p === "/health/deep") {
        try {
          await pool.query("SELECT 1");
          const r = await fetch(`http://127.0.0.1:${restPort}/`, { signal: AbortSignal.timeout(4000) });
          if (!r.ok) throw new Error(`postgrest ${r.status}`);
          return send(200, { ok: true, pg: true, rest: true });
        } catch (e) {
          return send(503, { ok: false, error: String(e?.message ?? e) });
        }
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
        res.writeHead(upstream.status, { ...cors, ...extra });
        return res.end(buf);
      }

      return send(404, { error: "NO_ENCONTRADO", path: p });
    } catch (e) {
      if (e instanceof CuerpoDemasiadoGrande) return send(413, { error: "CUERPO_DEMASIADO_GRANDE" }, { Connection: "close" });
      return send(500, { error: "GATEWAY_ERROR", detalle: String(e?.message ?? e) });
    }
  });
}
