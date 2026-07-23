// Fase 1/2 · Servidor del UI (export estático) servido localmente por Electron.
//
// Dos modos:
//  • CAJA (por defecto): sirve pos-ui/ y AUTO-CONFIGURA el gateway a `location.hostname:GATEWAY`
//    → funciona igual en Electron (localhost) y en un navegador de la LAN (http://<ip-hub>:UI).
//  • COCINA (opts.kds): sirve kds-ui/ como CLIENTE DELGADO del hub. El gateway es REMOTO (la caja),
//    así que se inyecta una URL FIJA del hub. Si aún no está configurada, sirve una pantalla de
//    setup para teclear la IP de la caja una sola vez (persistida por opts.onSetHub).
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

/** connect-src del CSP. host = de dónde cargó el UI (para la caja-hub); hubHost = el hub remoto
 *  (para la cocina). Sin esto el navegador bloquearía el gateway por LAN. */
function csp(host, hubHost) {
  const hostname = String(host || "").split(":")[0] || "localhost";
  const lan = hostname && hostname !== "localhost" && hostname !== "127.0.0.1" ? ` http://${hostname}:* ws://${hostname}:*` : "";
  const hub = hubHost ? ` http://${hubHost}:* ws://${hubHost}:*` : "";
  return [
    "default-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-inline'",
    // 127.0.0.1 va explícito: para el navegador NO es lo mismo que localhost, y el gateway se
    // inyecta con el hostname con el que se abrió la página. Sin esto, abrir el POS por
    // 127.0.0.1 bloquea toda llamada al backend y el login falla con "Failed to fetch"
    // (que en pantalla se lee como "credenciales incorrectas").
    `connect-src 'self' https://*.supabase.co https://*.supabase.in http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*${lan}${hub} https://fonts.googleapis.com https://fonts.gstatic.com`,
  ].join("; ");
}

/** CAJA: auto-config del gateway desde la URL con la que el navegador llegó. */
function scriptCaja(gatewayPort) {
  return `<script>(function(){var l=location;window.__VIM_SUPABASE_URL=l.protocol+"//"+l.hostname+":${gatewayPort}";window.__VIM_SUPABASE_ANON="local-anon";window.__VIM_DESKTOP=true;})();</script>`;
}

/** COCINA: gateway FIJO al hub remoto (la caja). */
function scriptCocina(hubUrl) {
  return `<script>window.__VIM_SUPABASE_URL=${JSON.stringify(hubUrl)};window.__VIM_SUPABASE_ANON="local-anon";window.__VIM_DESKTOP=true;</script>`;
}

const hostDe = (url) => { try { return new URL(url).hostname; } catch { return ""; } };

/** Pantalla de setup (COCINA sin hub configurado): teclear la URL/IP de la caja una vez. */
function paginaSetup(errorPrevio) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conectar a la caja</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;font-family:system-ui,Segoe UI,sans-serif;background:#1A1A1E;color:#F0F0EC;display:flex;min-height:100vh;align-items:center;justify-content:center}
.card{width:100%;max-width:420px;padding:32px 28px;text-align:center}.mark{width:44px;height:44px;border-radius:12px;background:#fff;color:#16161A;font-weight:800;font-size:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
h1{font-size:20px;margin:0 0 6px}p{color:#A0A0A6;font-size:14px;margin:0 0 22px}
input{width:100%;height:46px;border-radius:8px;border:1px solid #3A3A42;background:#242429;color:#fff;padding:0 12px;font-size:15px;outline:none}
input:focus{outline:2px solid #fff}button{width:100%;height:48px;margin-top:12px;border:0;border-radius:8px;background:#2E7D52;color:#fff;font-weight:700;font-size:15px;cursor:pointer}button:disabled{opacity:.6}
.err{color:#FF8080;font-size:13px;margin-top:10px;min-height:16px}.hint{color:#6E6E74;font-size:12px;margin-top:14px}
</style></head><body><div class="card">
<div class="mark">V</div><h1>Conectar a la caja</h1>
<p>Escribe la dirección de la caja principal (el hub) en tu red. La ves al abrir VIM POS en la caja.</p>
<form id="f"><input id="ip" inputmode="decimal" autocomplete="off" placeholder="192.168.1.50" />
<button id="b" type="submit">Conectar</button><div class="err" id="e">${errorPrevio || ""}</div></form>
<div class="hint">Solo el número (ej. 192.168.1.50) o la URL completa. Puerto por defecto 54350.</div>
</div><script>
var f=document.getElementById('f'),ip=document.getElementById('ip'),b=document.getElementById('b'),e=document.getElementById('e');
f.addEventListener('submit',async function(ev){ev.preventDefault();e.textContent='';b.disabled=true;b.textContent='Conectando…';
var v=ip.value.trim();if(!v){e.textContent='Escribe la IP de la caja.';b.disabled=false;b.textContent='Conectar';return;}
try{var r=await fetch('/__set-hub',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ip:v})});var j=await r.json();
if(j.ok){location.href='/';}else{e.textContent=j.error||'No se pudo conectar con la caja.';b.disabled=false;b.textContent='Conectar';}}
catch(err){e.textContent='No se pudo conectar con la caja.';b.disabled=false;b.textContent='Conectar';}});
ip.focus();</script></body></html>`;
}

/** Normaliza lo tecleado a una URL de gateway: "192.168.1.5" → "http://192.168.1.5:54350". */
function normalizarHub(entrada, puertoDefault = 54350) {
  let v = String(entrada || "").trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = "http://" + v;
  try {
    const u = new URL(v);
    if (!u.port) u.port = String(puertoDefault);
    return `${u.protocol}//${u.hostname}:${u.port}`;
  } catch {
    return null;
  }
}

/**
 * Arranca el servidor del UI. host '0.0.0.0' = accesible por la LAN (modo caja-hub).
 * opts.kds=true → modo COCINA (cliente delgado): opts.hub (URL inicial o null) + opts.onSetHub(url)
 * para persistir la IP tecleada en el setup.
 */
/** Direcciones que cuentan como "la propia máquina" (IPv4, IPv6 y IPv4 mapeada en IPv6). */
const LOCALES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export async function startUiServer(dir, port, gatewayPort = 54350, host = "0.0.0.0", opts = {}) {
  const kds = !!opts.kds;
  let hub = opts.hub || null; // COCINA: gateway remoto (mutable; lo fija el setup)

  const server = http.createServer(async (req, res) => {
    try {
      // COCINA: recibir la IP del hub desde la pantalla de setup.
      if (kds && req.method === "POST" && req.url.startsWith("/__set-hub")) {
        let body = "";
        for await (const chunk of req) body += chunk;
        let url = null;
        try { url = normalizarHub(JSON.parse(body || "{}").ip, gatewayPort); } catch { /* */ }
        if (!url) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: "Dirección inválida." })); }
        // Verificar que la caja responde antes de guardar.
        const ok = await fetch(`${url}/health`, { signal: AbortSignal.timeout(4000) }).then((r) => r.ok).catch(() => false);
        if (!ok) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: "La caja no responde en esa dirección. Revisa la IP y que VIM POS esté abierto en la caja." })); }
        hub = url;
        try { opts.onSetHub?.(url); } catch { /* */ }
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true }));
      }

      // CAJA: el menú del POS pide un chequeo de actualización. Solo desde la propia caja: el
      // servidor escucha en la LAN y esto abre diálogos modales sobre la pantalla de cobro.
      if (!kds && req.method === "POST" && req.url.startsWith("/__actualizar")) {
        res.writeHead(LOCALES.has(req.socket.remoteAddress ?? "") ? 200 : 403, { "Content-Type": "application/json" });
        if (!LOCALES.has(req.socket.remoteAddress ?? "")) return res.end(JSON.stringify({ ok: false, error: "Solo desde la caja." }));
        try {
          const r = await opts.onActualizar?.();
          return res.end(JSON.stringify({ ok: true, ...(r ?? { estado: "no-disponible" }) }));
        } catch (e) {
          return res.end(JSON.stringify({ ok: false, error: e?.message ?? "No se pudo revisar" }));
        }
      }

      // CAJA: relay de impresión RAW. El navegador no abre sockets TCP; el main sí. La UI arma los
      // bytes ESC/POS y los manda aquí; el main los escribe a la impresora en ip:9100. Solo local.
      if (!kds && req.method === "POST" && req.url.startsWith("/__imprimir")) {
        if (!LOCALES.has(req.socket.remoteAddress ?? "")) {
          res.writeHead(403, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "Solo desde la caja." }));
        }
        let body = "";
        for await (const chunk of req) body += chunk;
        let p = {};
        try { p = JSON.parse(body || "{}"); } catch { /* */ }
        res.writeHead(200, { "Content-Type": "application/json" });
        try {
          const r = await opts.onImprimir?.(p);
          return res.end(JSON.stringify(r ?? { ok: false, motivo: "ERROR" }));
        } catch (e) {
          return res.end(JSON.stringify({ ok: false, motivo: "ERROR", error: e?.message }));
        }
      }

      // CAJA: alta de la caja contra la nube (valida credenciales del dispositivo y baja el
      // tenant al Postgres local). Lo hace el main porque el navegador no puede escribir en la BD.
      if (!kds && req.method === "POST" && req.url.startsWith("/__vincular-nube")) {
        if (!LOCALES.has(req.socket.remoteAddress ?? "")) {
          res.writeHead(403, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: "Solo desde la caja." }));
        }
        let body = "";
        for await (const chunk of req) body += chunk;
        let p = {};
        try { p = JSON.parse(body || "{}"); } catch { /* */ }
        res.writeHead(200, { "Content-Type": "application/json" });
        try {
          const r = await opts.onVincularNube?.(p);
          return res.end(JSON.stringify(r ?? { ok: false, error: "No disponible." }));
        } catch (e) {
          return res.end(JSON.stringify({ ok: false, error: e?.message ?? "Falló el alta" }));
        }
      }

      let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (rel === "/" || rel === "") rel = "/index.html";
      let file = path.normalize(path.join(dir, rel));
      if (!file.startsWith(dir)) { res.writeHead(403); return res.end("forbidden"); } // anti path-traversal

      // COCINA sin hub configurado → pantalla de setup para CUALQUIER ruta HTML.
      if (kds && !hub && (rel === "/index.html" || rel.endsWith(".html"))) {
        res.writeHead(200, { "Content-Type": MIME[".html"], "Content-Security-Policy": csp(req.headers.host, null) });
        return res.end(paginaSetup(null));
      }

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
      const hubHost = kds && hub ? hostDe(hub) : null;
      // En el HTML: inyectar el config ANTES del bundle (para que window.__VIM_* exista al cargar).
      if (ext === ".html") {
        const inject = kds ? scriptCocina(hub) : scriptCaja(gatewayPort);
        const html = data.toString("utf8");
        const out = html.includes("<head>") ? html.replace("<head>", "<head>" + inject) : inject + html;
        res.writeHead(200, { "Content-Type": MIME[".html"], "Content-Security-Policy": csp(req.headers.host, hubHost) });
        return res.end(out);
      }
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Content-Security-Policy": csp(req.headers.host, hubHost) });
      res.end(data);
    } catch (e) {
      res.writeHead(500); res.end(String(e?.message ?? e));
    }
  });
  // COCINA sirve solo local (no hace de hub); CAJA en 0.0.0.0 para la LAN.
  await new Promise((r) => server.listen(port, kds ? "127.0.0.1" : host, r));
  return server;
}
