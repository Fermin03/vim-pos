/**
 * Detector de lector de código de barras USB: pura y sin DOM.
 *
 * El lector se comporta como un teclado que escribe el código muy rápido y cierra con Enter. Una
 * ráfaga válida son al menos `minimo` caracteres con menos de `umbralMs` entre uno y otro; una
 * pausa mayor descarta lo acumulado. El tiempo lo pone quien llama, para probarlo sin reloj.
 */
export function crearDetectorEscaner({ umbralMs = 35, minimo = 6 }: { umbralMs?: number; minimo?: number }) {
  let buffer = "";
  let ultimo = 0;

  const reiniciar = () => {
    buffer = "";
  };

  return {
    reiniciar,
    tecla({ key, tiempo, enCampoAjeno }: { key: string; tiempo: number; enCampoAjeno: boolean }): string | null {
      // Ese texto es del campo: el detector no se mete.
      if (enCampoAjeno) {
        reiniciar();
        return null;
      }
      if (key === "Enter") {
        const codigo = buffer.length >= minimo ? buffer : null;
        reiniciar();
        return codigo;
      }
      if (buffer && tiempo - ultimo >= umbralMs) reiniciar();
      buffer += key;
      ultimo = tiempo;
      return null;
    },
  };
}
