// Fase 1 · Servidor local del UI del POS (export estático).
// Sirve desktop/pos-ui/ (el `out/` de Next) por http://localhost para que la UI viva OFFLINE
// junto con los datos. Sirve la CSP por cabecera (en export, next.config.headers() no aplica).
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

// Misma política que el POS web (CN-003); connect-src ya permite localhost (gateway) y Supabase (sync).
const CSP = [
  "default-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in http://localhost:* ws://localhost:* https://fonts.googleapis.com https://fonts.gstatic.com",
].join("; ");

/** Arranca el servidor del UI sobre `dir` (el pos-ui/). Devuelve el http.Server. */
export async function startUiServer(dir, port) {
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
      res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Security-Policy": CSP });
      res.end(data);
    } catch (e) {
      res.writeHead(500); res.end(String(e?.message ?? e));
    }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return server;
}
