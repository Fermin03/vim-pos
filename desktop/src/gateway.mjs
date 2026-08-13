// Fase 1 · Gateway compatible con Supabase (localhost).
// Hace que el POS Next.js funcione SIN TOCAR SU CÓDIGO: mapea las rutas que usa supabase-js
// a los servicios locales. Solo cambia la URL (NEXT_PUBLIC_SUPABASE_URL → este gateway).
//   /auth/v1/token|user|logout   → auth local (device sign-in / refresh)   [reemplaza GoTrue]
//   /functions/v1/pin-login      → pin-login local                          [reemplaza Edge]
//   /rest/v1/*                   → PostgREST (proxy)                         [datos + RPC + RLS]
import http from "node:http";
import os from "node:os";
import { deviceSignIn, refreshSession, getUser, pinLogin, autorizarPin, exigirDispositivo } from "./auth.mjs";

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

/** Hosts que cuentan como "esta máquina": loopback + toda IPv4 propia (la del hub en la LAN). */
function hostsPropios() {
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs ?? []) if (i.family === "IPv4" && !i.internal) hosts.add(i.address);
  }
  return hosts;
}

// La IP de LAN puede cambiar (DHCP) sin reiniciar la caja, así que se recalcula, pero con una
// caché corta: esto corre en cada request y no hace falta tocar el SO cada vez.
let cacheHosts = { at: 0, hosts: new Set() };
function hostsPropiosCacheados() {
  if (Date.now() - cacheHosts.at > 60_000) cacheHosts = { at: Date.now(), hosts: hostsPropios() };
  return cacheHosts.hosts;
}

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
    hostsPropiosCacheados().has(u.hostname) &&
    uiPorts.includes(Number(u.port));
  return permitido ? { ...CORS_BASE, "Access-Control-Allow-Origin": origin } : { ...CORS_BASE };
}

const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => resolve(Buffer.concat(chunks)));
});

const bearer = (req) => (req.headers["authorization"] ?? "").replace(/^Bearer\s+/i, "");

/**
 * Crea (sin arrancar) el gateway HTTP.
 * `backend` = { restPort, secret, pool, kds?, uiPorts? } — uiPorts son los puertos desde los que se
 * sirve el UI (POS y cocina); definen el allowlist de CORS (SEC CN-004).
 */
export function crearGateway(backend) {
  const { restPort, secret, pool, kds, uiPorts = [54360, 54361] } = backend;

  return http.createServer(async (req, res) => {
    const cors = corsPara(req, uiPorts);
    const send = (status, body, extra = {}) => {
      const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body ?? {});
      res.writeHead(status, { "Content-Type": "application/json", ...cors, ...extra });
      res.end(payload);
    };

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
        return kds.handleSse(req, res, url, cors);
      }

      // ── Auth (GoTrue emulado) ──────────────────────────────────────────────
      if (p === "/auth/v1/token") {
        const grant = url.searchParams.get("grant_type");
        const body = JSON.parse((await readBody(req)).toString() || "{}");
        const out = grant === "refresh_token"
          ? await refreshSession(pool, secret, body.refresh_token)
          : await deviceSignIn(pool, secret, body);
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
        const body = JSON.parse((await readBody(req)).toString() || "{}");
        // Una caja solo autentica PINs contra sí misma: si no, un dispositivo del tenant podría
        // provocar bloqueos de empleados en las demás cajas del negocio.
        if (body.caja_id !== disp.cajaId) return send(403, { error: "CAJA_NO_COINCIDE" });
        const out = await pinLogin(pool, secret, body);
        return send(out.error ?? 200, out.body);
      }
      if (p === "/functions/v1/autorizar-pin") {
        const body = JSON.parse((await readBody(req)).toString() || "{}");
        const out = await autorizarPin(pool, secret, bearer(req), body);
        return send(out.error ?? 200, out.body);
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
        const upstream = await fetch(target, { method, headers, body: hasBody ? await readBody(req) : undefined });
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
      return send(500, { error: "GATEWAY_ERROR", detalle: String(e?.message ?? e) });
    }
  });
}
