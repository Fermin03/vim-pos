// Fase 1 · Gateway compatible con Supabase (localhost).
// Hace que el POS Next.js funcione SIN TOCAR SU CÓDIGO: mapea las rutas que usa supabase-js
// a los servicios locales. Solo cambia la URL (NEXT_PUBLIC_SUPABASE_URL → este gateway).
//   /auth/v1/token|user|logout   → auth local (device sign-in / refresh)   [reemplaza GoTrue]
//   /functions/v1/pin-login      → pin-login local                          [reemplaza Edge]
//   /rest/v1/*                   → PostgREST (proxy)                         [datos + RPC + RLS]
import http from "node:http";
import { deviceSignIn, refreshSession, getUser, pinLogin, autorizarPin } from "./auth.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,prefer,accept,accept-profile,content-profile,range,x-client-info,x-supabase-api-version",
  "Access-Control-Expose-Headers": "content-range,content-profile,range",
  "Access-Control-Max-Age": "86400",
};

const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => resolve(Buffer.concat(chunks)));
});

const send = (res, status, body, extra = {}) => {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body ?? {});
  res.writeHead(status, { "Content-Type": "application/json", ...CORS, ...extra });
  res.end(payload);
};

const bearer = (req) => (req.headers["authorization"] ?? "").replace(/^Bearer\s+/i, "");

/** Crea (sin arrancar) el gateway HTTP. `backend` = { restPort, secret, pool, kds? }. */
export function crearGateway(backend) {
  const { restPort, secret, pool, kds } = backend;

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const p = url.pathname;

      if (req.method === "OPTIONS") {
        // Reflejar los headers que pide el preflight (supabase-js manda x-supabase-api-version,
        // x-client-info, etc.). Así el gateway nunca rompe por un header nuevo del cliente.
        const pedidos = req.headers["access-control-request-headers"];
        res.writeHead(204, { ...CORS, ...(pedidos ? { "Access-Control-Allow-Headers": pedidos } : {}) });
        return res.end("");
      }
      if (p === "/health") return send(res, 200, { ok: true });

      // ── Fase 2 · Hub — stream de cocina en tiempo real (SSE por LAN) ─────────
      if (p === "/kds/stream") {
        if (!kds) return send(res, 503, { error: "KDS_STREAM_NO_DISPONIBLE" });
        return kds.handleSse(req, res, url);
      }

      // ── Auth (GoTrue emulado) ──────────────────────────────────────────────
      if (p === "/auth/v1/token") {
        const grant = url.searchParams.get("grant_type");
        const body = JSON.parse((await readBody(req)).toString() || "{}");
        const out = grant === "refresh_token"
          ? await refreshSession(pool, secret, body.refresh_token)
          : await deviceSignIn(pool, secret, body);
        return send(res, out.error ?? 200, out.body);
      }
      if (p === "/auth/v1/user") {
        const out = await getUser(pool, secret, bearer(req));
        return send(res, out.error ?? 200, out.body);
      }
      if (p === "/auth/v1/logout") return send(res, 204, "");
      if (p.startsWith("/auth/v1/")) return send(res, 200, {}); // settings/otros no-op

      // ── Funciones (Edge emuladas) ──────────────────────────────────────────
      if (p === "/functions/v1/pin-login") {
        const body = JSON.parse((await readBody(req)).toString() || "{}");
        const out = await pinLogin(pool, secret, body);
        return send(res, out.error ?? 200, out.body);
      }
      if (p === "/functions/v1/autorizar-pin") {
        const body = JSON.parse((await readBody(req)).toString() || "{}");
        const out = await autorizarPin(pool, secret, bearer(req), body);
        return send(res, out.error ?? 200, out.body);
      }
      if (p.startsWith("/functions/v1/")) {
        // Otras Edge Functions (timbrar-cfdi, enviar-push…) requieren nube: fallan claro offline.
        return send(res, 503, { error: "FUNCION_REQUIERE_NUBE", funcion: p.replace("/functions/v1/", "") });
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
        res.writeHead(upstream.status, { ...CORS, ...extra });
        return res.end(buf);
      }

      return send(res, 404, { error: "NO_ENCONTRADO", path: p });
    } catch (e) {
      return send(res, 500, { error: "GATEWAY_ERROR", detalle: String(e?.message ?? e) });
    }
  });
}
