// Fase 1 · Preload de Electron. Corre ANTES del POS e inyecta el endpoint del gateway local
// en window, para que el cliente supabase-js del POS apunte a localhost (todo offline).
// Endpoint del gateway local: del argumento del main, o el puerto fijo por defecto.
const urlArg = (process.argv.find((a) => a.startsWith("--vim-url=")) || "").replace("--vim-url=", "") || "http://localhost:54350";
try {
  window.__VIM_SUPABASE_URL = urlArg;
  window.__VIM_SUPABASE_ANON = "local-anon"; // el gateway ignora el apikey; supabase-js exige uno no vacío.
  window.__VIM_DESKTOP = true;
} catch { /* sin window (no debería pasar en el renderer) */ }
