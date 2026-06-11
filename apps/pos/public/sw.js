// Fase 3 · app-shell offline del POS (PWA). Estrategia conservadora:
//   • Navegaciones: red primero; sin red → shell cacheado ('/').
//   • Estáticos de Next (/_next/static, hasheados e inmutables) y fuentes: cache-first.
//   • NUNCA toca llamadas a Supabase ni peticiones no-GET (los datos viven en Dexie, no aquí).
const CACHE = "vimpos-shell-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add("/")).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Datos (Supabase u otros orígenes de API): no interferir.
  if (url.hostname.endsWith(".supabase.co") || url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    if (url.origin !== self.location.origin) return;
  }

  // Navegaciones → red primero, fallback al shell cacheado.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put("/", copia)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match("/").then((r) => r || Response.error())),
    );
    return;
  }

  // Estáticos inmutables de Next + fuentes → cache-first.
  const esEstatico =
    (url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg" || url.pathname === "/manifest.webmanifest")) ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com";
  if (esEstatico) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((resp) => {
            if (resp.ok) {
              const copia = resp.clone();
              caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
            }
            return resp;
          }),
      ),
    );
  }
});
