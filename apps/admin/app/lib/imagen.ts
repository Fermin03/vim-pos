"use client";

/**
 * Reescala una imagen del usuario a un data URI manejable, en el navegador.
 *
 * El logo se guarda embebido en la fila del tenant (ver `guardarLogoNegocio`) y esa fila
 * viaja en CADA snapshot de sync hacia las cajas, así que subir el archivo original —que
 * suele ser un PNG de varios MB exportado de Canva— saldría caro en cada sincronización.
 * Aquí se reduce a `ladoMax` px y se recomprime antes de tocar la red.
 *
 * Se conserva la transparencia (PNG) porque un logo sobre fondo blanco recortado se ve mal
 * en la pantalla oscura del POS; si el PNG resultante no entra en el tope, se cae a JPEG
 * con fondo blanco, que comprime mucho mejor las fotos.
 */
export async function reescalarImagen(
  archivo: File,
  { ladoMax = 512, maxBytes = 524288 }: { ladoMax?: number; maxBytes?: number } = {},
): Promise<string> {
  if (!archivo.type.startsWith("image/")) throw new Error("El archivo no es una imagen.");

  const bitmap = await crearBitmap(archivo);
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen en este navegador.");
  ctx.drawImage(bitmap, 0, 0, w, h);

  const png = canvas.toDataURL("image/png");
  if (png.length <= maxBytes) return png;

  // Demasiado pesado como PNG (foto, degradados): a JPEG sobre blanco, bajando calidad
  // hasta que entre. El blanco es el fondo real del ticket impreso.
  const conFondo = document.createElement("canvas");
  conFondo.width = w;
  conFondo.height = h;
  const ctx2 = conFondo.getContext("2d");
  if (!ctx2) throw new Error("No se pudo procesar la imagen en este navegador.");
  ctx2.fillStyle = "#FFFFFF";
  ctx2.fillRect(0, 0, w, h);
  ctx2.drawImage(bitmap, 0, 0, w, h);

  for (const calidad of [0.85, 0.7, 0.55, 0.4]) {
    const jpeg = conFondo.toDataURL("image/jpeg", calidad);
    if (jpeg.length <= maxBytes) return jpeg;
  }
  throw new Error("La imagen es demasiado pesada. Usa uno más simple o de menor resolución.");
}

/** createImageBitmap con respaldo por <img> (Safari viejo no lo trae para todos los tipos). */
async function crearBitmap(archivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(archivo);
    } catch {
      /* formato no soportado por el decodificador: se intenta con <img> */
    }
  }
  const url = URL.createObjectURL(archivo);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo leer la imagen."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
