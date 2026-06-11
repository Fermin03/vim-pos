/**
 * Fase 3 · empaquetado nativo del POS (Capacitor, modo "remote shell").
 * La app nativa carga pos.vimpos.com.mx; el offline lo dan el service worker
 * (app-shell) + Dexie (outbox/cache), igual que en la PWA. Build: ver
 * docs/RUNBOOK-CAPACITOR.md (requiere Android Studio en la máquina local).
 * (Sin import de tipos: @capacitor/cli se instala hasta el build nativo.)
 */
const config = {
  appId: "mx.com.vimpos.pos",
  appName: "VIM POS",
  webDir: "public", // requerido por el CLI; el contenido real viene de server.url
  server: {
    url: "https://pos.vimpos.com.mx",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
