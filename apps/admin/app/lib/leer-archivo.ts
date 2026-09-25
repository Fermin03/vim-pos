/**
 * El texto de un archivo de menú: .csv / .txt tal cual, y .xlsx convertido a renglones separados
 * por tabulador (el importador ya entiende coma, punto y coma y tabulador).
 *
 * Antes la importación solo aceptaba pegar texto; varios POS exportan su menú a Excel (Square,
 * por ejemplo) y pegar desde una hoja en el celular no es realista. El .xlsx se lee sin
 * librerías: es un ZIP con XML, y el navegador trae el descompresor (DecompressionStream).
 */

/** UTF-8; si trae caracteres inválidos, es un CSV guardado por Excel en Windows (Latin-1). */
export function decodificarTexto(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const texto = utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
  return texto.replace(/^﻿/, "");
}

type Entrada = { metodo: number; tamComprimido: number; inicioDatos: number };

function entradasZip(b: Uint8Array): Map<string, Entrada> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // El cierre del directorio central está al final (puede traer un comentario detrás).
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65_535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("El archivo no es un Excel válido (.xlsx).");
  const total = v.getUint16(fin + 10, true);
  let o = v.getUint32(fin + 16, true);
  const dec = new TextDecoder();
  const mapa = new Map<string, Entrada>();
  for (let k = 0; k < total; k++) {
    if (v.getUint32(o, true) !== 0x02014b50) break;
    const metodo = v.getUint16(o + 10, true);
    const tamComprimido = v.getUint32(o + 20, true);
    const lenNombre = v.getUint16(o + 28, true);
    const lenExtra = v.getUint16(o + 30, true);
    const lenComentario = v.getUint16(o + 32, true);
    const local = v.getUint32(o + 42, true);
    const nombre = dec.decode(b.subarray(o + 46, o + 46 + lenNombre));
    const inicioDatos = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    mapa.set(nombre, { metodo, tamComprimido, inicioDatos });
    o += 46 + lenNombre + lenExtra + lenComentario;
  }
  return mapa;
}

async function contenido(b: Uint8Array, e: Entrada): Promise<string> {
  const crudo = b.subarray(e.inicioDatos, e.inicioDatos + e.tamComprimido);
  if (e.metodo === 0) return new TextDecoder().decode(crudo);
  if (e.metodo !== 8) throw new Error("Ese Excel usa una compresión que no se puede leer aquí.");
  const flujo = new ReadableStream<BufferSource>({
    start(c) {
      c.enqueue(crudo.slice());
      c.close();
    },
  }).pipeThrough(new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(await new Response(flujo).arrayBuffer());
}

/** "B" → 1, "AA" → 26 */
function indiceColumna(ref: string): number {
  const letras = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

const textoDe = (el: Element) => [...el.getElementsByTagName("t")].map((t) => t.textContent ?? "").join("");

/** La primera hoja del libro, como renglones separados por tabulador. */
export async function xlsxATexto(bytes: Uint8Array): Promise<string> {
  const zip = entradasZip(bytes);
  const hojaNombre =
    (zip.has("xl/worksheets/sheet1.xml") ? "xl/worksheets/sheet1.xml" : [...zip.keys()].find((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n))) ?? null;
  if (!hojaNombre) throw new Error("El Excel no trae ninguna hoja.");
  const parser = new DOMParser();
  const compartidas: string[] = [];
  const ss = zip.get("xl/sharedStrings.xml");
  if (ss) {
    const doc = parser.parseFromString(await contenido(bytes, ss), "application/xml");
    for (const si of doc.getElementsByTagName("si")) compartidas.push(textoDe(si));
  }
  const hoja = parser.parseFromString(await contenido(bytes, zip.get(hojaNombre)!), "application/xml");
  const renglones: string[] = [];
  for (const row of hoja.getElementsByTagName("row")) {
    const celdas: string[] = [];
    for (const c of row.getElementsByTagName("c")) {
      const i = indiceColumna(c.getAttribute("r") ?? "");
      const tipo = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      let valor = tipo === "s" ? (compartidas[Number(v)] ?? "") : tipo === "inlineStr" ? textoDe(c) : v;
      // Un tabulador o salto dentro de una celda partiría la fila en el importador.
      valor = valor.replace(/[\t\r\n]+/g, " ").trim();
      celdas[i] = valor;
    }
    const linea = Array.from(celdas, (x) => x ?? "").join("\t");
    if (linea.trim()) renglones.push(linea);
  }
  return renglones.join("\n");
}

export async function textoDeArchivo(archivo: File): Promise<string> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  if (/\.xlsx$/i.test(archivo.name)) return xlsxATexto(bytes);
  if (/\.xls$/i.test(archivo.name)) throw new Error("Ese es el formato viejo de Excel (.xls). Ábrelo y guárdalo como .xlsx o .csv.");
  return decodificarTexto(bytes);
}
