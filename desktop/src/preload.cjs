// Preload de Electron. Con contextIsolation:true (endurecimiento, remediación Fase 4.1) el preload
// y la página viven en mundos JS separados: NO se puede pasar config con `window.X = ...` (eso solo
// tocaría el mundo aislado). Se usa contextBridge.exposeInMainWorld, que sí publica el valor como
// window.__VIM_* en la página. El POS lo lee igual (apps/pos/app/lib/supabase.ts).
//
// En la caja empaquetada el POS carga desde el ui-server local, que ADEMÁS inyecta estos globals con
// un <script> inline (contexto de página). Ese inline y este preload coinciden en el valor para la
// propia ventana; el inline es el que sirve a los clientes de la LAN (2ª caja / KDS), que no tienen
// preload. Redundancia intencional: robustez si algún día se carga una página sin inyección inline.
const { contextBridge } = require("electron");

const urlArg =
  (process.argv.find((a) => a.startsWith("--vim-url=")) || "").replace("--vim-url=", "") ||
  "http://localhost:54350";

try {
  contextBridge.exposeInMainWorld("__VIM_SUPABASE_URL", urlArg);
  contextBridge.exposeInMainWorld("__VIM_SUPABASE_ANON", "local-anon"); // el gateway ignora el apikey; supabase-js exige uno no vacío.
  contextBridge.exposeInMainWorld("__VIM_DESKTOP", true);
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("preload: no se pudo exponer la config", e?.message);
}
