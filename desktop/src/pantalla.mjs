// La pantalla donde corre la caja, para el latido (migración 0121).
//
// La interfaz tiene que verse bien tanto en 1920×1080 como en la pantalla casi cuadrada de
// Knock-Out, y sin esto no había forma de saber qué pantalla tiene cada cliente sin preguntarle.
//
// Electron da el tamaño en píxeles independientes del dispositivo (`size`) y la escala de Windows
// (`scaleFactor`). Se reportan los píxeles FÍSICOS —los que dice la configuración de pantalla de
// Windows y los que el cliente reconoce— más la escala por separado: 1280×1024 al 125 % se
// comporta como 1024×819 para la interfaz, y el diseño necesita los dos datos.

/**
 * @param {{ size: { width: number, height: number }, scaleFactor: number } | null | undefined} display
 * @returns {{ ancho: number, alto: number, escala: number } | null}
 */
export function describirPantalla(display) {
  if (!display?.size || !Number.isFinite(display.scaleFactor) || display.scaleFactor <= 0) return null;
  const escala = Math.round(display.scaleFactor * 100) / 100;
  const ancho = Math.round(display.size.width * display.scaleFactor);
  const alto = Math.round(display.size.height * display.scaleFactor);
  if (!(ancho > 0 && alto > 0)) return null;
  return { ancho, alto, escala };
}

/**
 * La pantalla de la ventana de la caja; si no hay ventana todavía, la principal.
 * @param {import("electron").Screen} screen
 * @param {import("electron").BrowserWindow | null | undefined} ventana
 */
export function pantallaDeLaCaja(screen, ventana) {
  try {
    const display = ventana && !ventana.isDestroyed()
      ? screen.getDisplayMatching(ventana.getBounds())
      : screen.getPrimaryDisplay();
    return describirPantalla(display);
  } catch {
    // Un fallo aquí no debe costar el latido, que es lo que mantiene viva la señal de la caja.
    return null;
  }
}
