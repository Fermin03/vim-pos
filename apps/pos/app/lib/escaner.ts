/**
 * Detector de lector de código de barras USB: pura y sin DOM.
 *
 * El lector se comporta como un teclado que escribe el código muy rápido y cierra con Enter. Una
 * ráfaga válida son al menos `minimo` caracteres con menos de `umbralMs` entre uno y otro; una
 * pausa mayor (o un tiempo que retrocede) descarta lo acumulado. El tiempo lo pone quien llama,
 * para probarlo sin reloj.
 *
 * `enRafaga` avisa que la tecla es del 2º carácter rápido en adelante: quien llama debe tragársela.
 * El 1er carácter no se puede distinguir de un tecleo humano, así que ese SÍ se escapa.
 */
const CLAVE_UMBRAL = "vimpos.escaner.umbralMs";

/** Umbral guardado en localStorage acotado a 20-80 ms; `undefined` si no hay o no es número. */
export function leerUmbral(): number | undefined {
  try {
    const n = Number(localStorage.getItem(CLAVE_UMBRAL));
    return n ? Math.min(80, Math.max(20, n)) : undefined;
  } catch {
    return undefined;
  }
}

export function crearDetectorEscaner({ umbralMs = 35, minimo = 6 }: { umbralMs?: number; minimo?: number }) {
  let buffer = "";
  let ultimo = 0;

  const reiniciar = () => {
    buffer = "";
  };

  return {
    reiniciar,
    tecla({
      key,
      tiempo,
      enCampoAjeno,
    }: {
      key: string;
      tiempo: number;
      enCampoAjeno: boolean;
    }): { codigo: string | null; enRafaga: boolean } {
      // Ese texto es del campo: el detector no se mete.
      if (enCampoAjeno) {
        reiniciar();
        return { codigo: null, enRafaga: false };
      }
      if (key === "Enter") {
        const codigo = buffer.length >= minimo ? buffer : null;
        reiniciar();
        return { codigo, enRafaga: false };
      }
      const dt = tiempo - ultimo;
      if (buffer && (dt < 0 || dt >= umbralMs)) reiniciar();
      const enRafaga = buffer !== "";
      buffer += key;
      ultimo = tiempo;
      return { codigo: null, enRafaga };
    },
  };
}
