// Fase 2 · service worker del admin — SOLO Web Push (sin cache offline; el admin es online).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let datos = { titulo: "VIM POS", cuerpo: "", url: "/" };
  try { datos = { ...datos, ...e.data.json() }; } catch { /* payload no-JSON */ }
  e.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: datos.url },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
      const w = ws.find((x) => "focus" in x);
      if (w) { w.navigate(url); return w.focus(); }
      return self.clients.openWindow(url);
    }),
  );
});
