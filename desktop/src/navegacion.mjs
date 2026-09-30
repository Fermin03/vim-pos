// Endurecimiento de la ventana de Electron (Auditoría integral 30/09/2026, D9).
//
// La ventana de la caja solo debe mostrar el POS (o la cocina) servido por esta misma máquina, o el
// POS desplegado como respaldo cuando no hay pos-ui/ empaquetado. Si un enlace, un redirect o un
// script inyectado la mandara a otro sitio, ese sitio heredaría el preload (__VIM_SALIR, la URL del
// gateway) y la confianza del cajero en "la pantalla de la caja".

/** Orígenes (protocolo+host+puerto) de una lista de URLs; las ilegibles se ignoran. */
export function origenesDe(urls) {
  const s = new Set();
  for (const u of urls) {
    try { if (u) s.add(new URL(u).origin); } catch { /* ignorar */ }
  }
  return s;
}

/** ¿Se permite navegar la ventana a `url`? Solo a los orígenes dados. */
export function navegacionPermitida(url, origenes) {
  try { return origenes.has(new URL(url).origin); } catch { return false; }
}

/** ¿Una ventana nueva pedida por la página se puede abrir fuera, en el navegador del sistema? */
export function abrirFueraPermitido(url) {
  try { return new URL(url).protocol === "https:"; } catch { return false; }
}
