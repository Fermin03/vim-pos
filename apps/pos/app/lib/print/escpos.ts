import type { Bloque, PrintJob } from "./tipos";

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

function cols(ancho: 58 | 80): number {
  return ancho === 80 ? 48 : 32; // Font A
}

/** Quita acentos y normaliza signos a ASCII imprimible (code page pendiente de hardware). */
function ascii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacríticos combinados
    .replace(/[−–—]/g, "-") // − – —  → -
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7e]/g, "?"); // cualquier otro no-ASCII
}

function bytesDe(s: string): number[] {
  return Array.from(ascii(s), (c) => c.charCodeAt(0) & 0xff);
}

function fila(izq: string, der: string, ancho: 58 | 80): number[] {
  const n = cols(ancho);
  let l = ascii(izq);
  const r = ascii(der);
  if (l.length + r.length + 1 > n) l = l.slice(0, Math.max(0, n - r.length - 1));
  const gap = Math.max(1, n - l.length - r.length);
  return bytesDe(l + " ".repeat(gap) + r);
}

function qr(valor: string): number[] {
  const data = ascii(valor);
  const out: number[] = [];
  // GS ( k — model 2
  out.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
  // tamaño del módulo = 6
  out.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06);
  // nivel de corrección = M
  out.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
  // almacenar datos
  const len = data.length + 3;
  out.push(GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, ...bytesDe(valor));
  // imprimir
  out.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
  return out;
}

function bloqueABytes(bl: Bloque, ancho: 58 | 80): number[] {
  switch (bl.t) {
    case "texto": {
      const out: number[] = [];
      out.push(ESC, 0x61, bl.align === "centro" ? 1 : bl.align === "der" ? 2 : 0);
      const sz = bl.size === 3 ? 0x22 : bl.size === 2 ? 0x11 : 0x00;
      out.push(GS, 0x21, sz);
      out.push(ESC, 0x45, bl.bold ? 1 : 0);
      out.push(...bytesDe(bl.valor));
      // reset a normal/izquierda ANTES del salto (si no, contamina la línea siguiente)
      out.push(GS, 0x21, 0x00, ESC, 0x45, 0x00, ESC, 0x61, 0x00);
      out.push(LF);
      return out;
    }
    case "fila":
      return [...fila(bl.izq, bl.der, ancho), LF];
    case "separador":
      return [...bytesDe((bl.estilo === "solido" ? "=" : "-").repeat(cols(ancho))), LF];
    case "qr": {
      const out: number[] = [ESC, 0x61, 1]; // centro
      out.push(...qr(bl.valor), LF);
      out.push(ESC, 0x61, 0);
      return out;
    }
    case "corte":
      return [LF, LF, LF, GS, 0x56, 66, 0]; // alimenta y corta (parcial)
  }
}

/** Traduce un PrintJob a bytes ESC/POS. Función PURA (no envía nada). */
export function jobAEscpos(job: PrintJob): Uint8Array {
  const out: number[] = [ESC, 0x40]; // init
  for (const bl of job.bloques) out.push(...bloqueABytes(bl, job.ancho));
  return Uint8Array.from(out);
}
