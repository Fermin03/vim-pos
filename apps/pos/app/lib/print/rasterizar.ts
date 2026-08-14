"use client";
import type { Bloque } from "./tipos";

/** Puntos de ancho útil del papel. Son los valores estándar de las térmicas de 58 y 80 mm. */
const PUNTOS_PAPEL: Record<58 | 80, number> = { 58: 384, 80: 576 };

/**
 * Convierte una imagen (data URI) en un bloque raster listo para ESC/POS.
 *
 * Una térmica no entiende PNG: imprime mapas de bits de 1 bit por punto. Aquí se reescala al
 * ancho objetivo, se pasa a monocromo y se empaqueta como espera el comando GS v 0.
 *
 * El umbral es fijo (no hay difuminado): un logo es plano —trazos y bloques de color— y el
 * difuminado lo llenaría de puntos sueltos que en papel térmico se ven sucios. Para fotos sería
 * al revés, pero un ticket no lleva fotos.
 *
 * Devuelve null si la imagen no se puede leer: el ticket debe salir igual, sin logo, antes que
 * fallar el cobro por un adorno.
 */
export async function rasterizarImagen(
  dataUri: string,
  ancho: 58 | 80,
  { fraccionDelAncho = 0.5 }: { fraccionDelAncho?: number } = {},
): Promise<Bloque | null> {
  if (typeof document === "undefined") return null;
  try {
    const img = await cargar(dataUri);
    const anchoNativo = img.naturalWidth;
    const altoNativo = img.naturalHeight;
    if (!anchoNativo || !altoNativo) return null;

    // Ancho objetivo en puntos, múltiplo de 8 (cada byte del raster son 8 puntos).
    const objetivo = Math.min(PUNTOS_PAPEL[ancho], Math.round(PUNTOS_PAPEL[ancho] * fraccionDelAncho));
    const w = Math.max(8, Math.floor(objetivo / 8) * 8);
    const h = Math.max(1, Math.round((altoNativo / anchoNativo) * w));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    // Fondo blanco: un PNG transparente sobre canvas vacío da alfa 0, que sin esto se
    // interpretaría como negro y saldría un rectángulo sólido.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const { data } = ctx.getImageData(0, 0, w, h);
    const bytesPorFila = w / 8;
    const datos = new Uint8Array(bytesPorFila * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // Luminancia percibida; el alfa ya viene compuesto contra el blanco de arriba.
        const lum = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
        if (lum < 160) {
          // 1 = punto negro. MSB primero dentro de cada byte.
          datos[y * bytesPorFila + (x >> 3)]! |= 0x80 >> (x & 7);
        }
      }
    }
    return { t: "raster", ancho: w, alto: h, datos, align: "centro" };
  } catch {
    return null;
  }
}

function cargar(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("imagen ilegible"));
    img.src = src;
  });
}
