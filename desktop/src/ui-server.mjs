// Fase 1/2 · Servidor del UI del POS (export estático), servido por LAN desde la caja-hub.
// Sirve desktop/pos-ui/ y AUTO-CONFIGURA el endpoint: inyecta en el HTML un script que apunta el
// gateway a `location.hostname:GATEWAY` — así funciona igual en Electron (localhost) y en un
// navegador de cocina/2ª caja que carga desde la LAN (http://<ip-hub>:UI). Sin teclear nada.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".webp": "image/webp",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".txt": "text/plain",
  ".webmanifest": "application/manifest+json", ".map": "application/json",
};

/** CSP por-request: el KDS/2ª caja conecta al gateway del MISMO host que sirvió el UI. Sin esto
 *  (connect-src) el navegador bloquearía http://<ip-hub>:GATEWAY. Mantiene localhost + Supabase. */
function cspFor(host) {
  const hostname = String(host || "").split(":")[0] || "localhost";
  const lan = hostname && hostname !== "localhost" && hostname !== "127.0.0.1" ? ` http://${hostname}:* ws://${hostname}:*` : "";
  return [
    "default-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-inline'",
    `connect-src 'self' https://*.supabase.co https://*.supabase.in http://localhost:* ws://localhost:*${lan} https://fonts.googleapis.com https://fonts.gstatic.com`,
  ].join("; ");
}

/** Script que auto-configura el endpoint del gateway desde la URL con la que el navegador llegó. */
function configScript(gatewayPort) {
  return `<script>(function(){var l=location;window.__VIM_SUPABASE_URL=l.protocol+"//"+l.hostname+":${gatewayPort}";window.__VIM_SUPABASE_ANON="local-anon";window.__VIM_DESKTOP=true;})();</script>`;
}

/** Arranca el servidor del UI. host '0.0.0.0' = accesible por la LAN (modo hub). */
export async function startUiServer(dir, port, gatewayPort = 54350, host = "0.0.0.0") {
  const inject = configScript(gatewayPort);
  const server = http.createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (rel === "/" || rel === "") rel = "/index.html";
      let file = path.normalize(path.join(dir, rel));
      if (!file.startsWith(dir)) { res.writeHead(403); return res.end("forbidden"); } // anti path-traversal
      let data;
      try {
        const s = await stat(file);
        if (s.isDirectory()) file = path.join(file, "index.html");
        data = await readFile(file);
      } catch {
        data = await readFile(path.join(dir, "index.html")); // SPA fallback
        file = "index.html";
      }
      const ext = path.extname(file).toLowerCase();
      // En el HTML: inyectar el auto-config ANTES del bundle (para que window.__VIM_* exista al cargar).
      if (ext === ".html") {
        const html = data.toString("utf8");
        const out = html.includes("<head>") ? html.replace("<head>", "<head>" + inject) : inject + html;
        res.writeHead(200, { "Content-Type": MIME[".html"], "Content-Security-Policy": cspFor(req.headers.host) });
        return res.end(out);
      }
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Content-Security-Policy": cspFor(req.headers.host) });
      res.end(data);
    } catch (e) {
      res.writeHead(500); res.end(String(e?.message ?? e));
    }
  });
  await new Promise((r) => server.listen(port, host, r));
  return server;
}
