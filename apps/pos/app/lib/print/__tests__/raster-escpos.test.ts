import { describe, it, expect } from "vitest";
import { jobAEscpos } from "../escpos";
import type { PrintJob } from "../tipos";

/**
 * El logo se manda a la térmica con GS v 0 (imagen de trama). Si las cabeceras van mal, la
 * impresora interpreta los BYTES DE LA IMAGEN como comandos: salen metros de basura y hay que
 * apagarla. Por eso se fija aquí el formato exacto en vez de confiar en probarlo con hardware.
 */
describe("bloque raster → ESC/POS", () => {
  // 16×2 puntos = 2 bytes por fila, 4 bytes de datos.
  const datos = new Uint8Array([0b10000000, 0b00000001, 0b11111111, 0b00000000]);
  const job: PrintJob = {
    tipo: "TICKET", ancho: 80, destino: "CAJA",
    bloques: [{ t: "raster", ancho: 16, alto: 2, datos, align: "centro" }],
  };

  it("emite GS v 0 con el ancho en BYTES y el alto en puntos, little-endian", () => {
    const out = Array.from(jobAEscpos(job));
    const i = out.findIndex((_, k) => out[k] === 0x1d && out[k + 1] === 0x76 && out[k + 2] === 0x30);
    expect(i).toBeGreaterThan(-1);
    expect(out[i + 3]).toBe(0x00); // m = 0, densidad normal
    expect(out[i + 4]).toBe(2);    // xL: 16 puntos / 8 = 2 bytes
    expect(out[i + 5]).toBe(0);    // xH
    expect(out[i + 6]).toBe(2);    // yL: alto en puntos
    expect(out[i + 7]).toBe(0);    // yH
    expect(out.slice(i + 8, i + 12)).toEqual([0b10000000, 0b00000001, 0b11111111, 0b00000000]);
  });

  it("centra la imagen y devuelve la alineación a la izquierda después", () => {
    const out = Array.from(jobAEscpos(job));
    const i = out.findIndex((_, k) => out[k] === 0x1b && out[k + 1] === 0x61 && out[k + 2] === 0x01);
    expect(i).toBeGreaterThan(-1); // ESC a 1 = centrado, antes de la imagen
    // ...y al final vuelve a ESC a 0, para que el texto siguiente no herede el centrado.
    const fin = out.length - 3;
    expect(out.slice(fin)).toEqual([0x1b, 0x61, 0x00]);
  });

  it("un alto mayor a 255 se parte bien en dos bytes (logo alto en papel de 80mm)", () => {
    const alto = 300; // > 255: obliga a usar yH
    const grande: PrintJob = {
      ...job,
      bloques: [{ t: "raster", ancho: 8, alto, datos: new Uint8Array(alto) }],
    };
    const out = Array.from(jobAEscpos(grande));
    const i = out.findIndex((_, k) => out[k] === 0x1d && out[k + 1] === 0x76 && out[k + 2] === 0x30);
    expect(out[i + 6]).toBe(300 & 0xff);        // yL = 44
    expect(out[i + 7]).toBe((300 >> 8) & 0xff); // yH = 1
  });
});
