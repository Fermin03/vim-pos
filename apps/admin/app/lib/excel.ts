/**
 * Un .xlsx de una hoja, sin dependencias.
 *
 * Un .xlsx es un ZIP con unos cuantos XML. Se arma aquí a mano —ZIP sin comprimir (método
 * «store») y SpreadsheetML mínimo— para no meter una librería de cientos de KB al admin por una
 * hoja de reporte. Las cifras van como NÚMEROS con formato (pesos, miles, porcentaje), no como
 * texto: el dueño puede sumar, filtrar y hacer tablas dinámicas sin limpiar nada.
 *
 * Se descartó el CSV: Excel lo abre con la codificación y el separador de la región, y en
 * equipos configurados de otra forma los acentos o las columnas salen rotos.
 */

export type TipoCelda = "texto" | "mxn" | "entero" | "pct" | "decimal" | "fecha";

export type Celda = { valor: string | number | null; tipo?: TipoCelda; negrita?: boolean };

export type Hoja = {
  /** Nombre de la pestaña (Excel admite 31 caracteres y prohíbe []:*?/\). */
  nombre: string;
  /** Renglones de encabezado sobre la tabla: título, rango, resumen. */
  preambulo: Celda[][];
  encabezados: string[];
  filas: Celda[][];
  /** Fila de totales, en negritas. */
  totales?: Celda[];
  /** Ancho aproximado de cada columna, en caracteres. */
  anchos?: number[];
};

// ── Estilos (índices de cellXfs en styles.xml) ──────────────────────────────────────────────
const ESTILO: Record<TipoCelda, [normal: number, negrita: number]> = {
  texto: [0, 1],
  mxn: [2, 6],
  entero: [3, 7],
  pct: [4, 8],
  fecha: [5, 1],
  decimal: [9, 10],
};

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy"/><numFmt numFmtId="167" formatCode="0.0"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
</styleSheet>`;

function xml(s: string): string {
  // Fuera los caracteres de control que XML 1.0 no admite: un nombre de producto con uno de
  // esos rompía el archivo entero ("Excel encontró contenido que no pudo leer").
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A, B, …, Z, AA, AB… */
export function letraColumna(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "2026-09-25" → número de serie de Excel (días desde el 30-dic-1899). */
export function serieExcel(fecha: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return null;
  return Math.round((Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

function celdaXml(c: Celda, ref: string): string {
  const tipo = c.tipo ?? "texto";
  const s = ESTILO[tipo][c.negrita ? 1 : 0];
  if (c.valor === null || c.valor === "") return "";
  if (tipo === "fecha" && typeof c.valor === "string") {
    const n = serieExcel(c.valor);
    if (n !== null) return `<c r="${ref}" s="${s}"><v>${n}</v></c>`;
  }
  if (typeof c.valor === "number" && tipo !== "texto") {
    if (!Number.isFinite(c.valor)) return "";
    // El porcentaje llega de 0 a 100 (como se ve en pantalla) y Excel lo quiere de 0 a 1.
    const v = tipo === "pct" ? c.valor / 100 : c.valor;
    return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${xml(String(c.valor))}</t></is></c>`;
}

function hojaXml(h: Hoja): string {
  const renglones: Celda[][] = [
    ...h.preambulo,
    ...(h.preambulo.length ? [[]] : []),
    h.encabezados.map((t) => ({ valor: t, negrita: true })),
    ...h.filas,
    ...(h.totales ? [h.totales.map((c) => ({ ...c, negrita: true }))] : []),
  ];
  const filaEncabezado = h.preambulo.length ? h.preambulo.length + 2 : 1;
  const rows = renglones
    .map((r, i) => `<row r="${i + 1}">${r.map((c, j) => celdaXml(c, `${letraColumna(j)}${i + 1}`)).join("")}</row>`)
    .join("");
  const cols = h.anchos?.length
    ? `<cols>${h.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(6, Math.min(60, w))}" customWidth="1"/>`).join("")}</cols>`
    : "";
  // Encabezado de la tabla fijo al desplazarse.
  const pane = `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${filaEncabezado}" topLeftCell="A${filaEncabezado + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

export function nombreHoja(s: string): string {
  return s.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Reporte";
}

// ── ZIP «store» ──────────────────────────────────────────────────────────────────────────────
let TABLA_CRC: Uint32Array | null = null;
export function crc32(datos: Uint8Array): number {
  if (!TABLA_CRC) {
    TABLA_CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLA_CRC[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < datos.length; i++) crc = TABLA_CRC[(crc ^ datos[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(archivos: { nombre: string; datos: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locales: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let desplazamiento = 0;
  // Fecha fija (1-ene-2026 00:00): el contenido no depende de cuándo se descargó.
  const hora = 0;
  const fecha = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const crc = crc32(a.datos);
    const local = new Uint8Array(30 + nombre.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true); // nombres en UTF-8
    v.setUint16(8, 0, true); // sin comprimir
    v.setUint16(10, hora, true);
    v.setUint16(12, fecha, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, a.datos.length, true);
    v.setUint32(22, a.datos.length, true);
    v.setUint16(26, nombre.length, true);
    v.setUint16(28, 0, true);
    local.set(nombre, 30);

    const central = new Uint8Array(46 + nombre.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, fecha, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, a.datos.length, true);
    c.setUint32(24, a.datos.length, true);
    c.setUint16(28, nombre.length, true);
    c.setUint32(42, desplazamiento, true);
    central.set(nombre, 46);

    locales.push(local, a.datos);
    centrales.push(central);
    desplazamiento += local.length + a.datos.length;
  }

  const tamCentral = centrales.reduce((s, x) => s + x.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, archivos.length, true);
  f.setUint16(10, archivos.length, true);
  f.setUint32(12, tamCentral, true);
  f.setUint32(16, desplazamiento, true);

  const partes = [...locales, ...centrales, fin];
  const salida = new Uint8Array(partes.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const p of partes) {
    salida.set(p, o);
    o += p.length;
  }
  return salida;
}

/** Los bytes del .xlsx. */
export function libroXlsx(h: Hoja): Uint8Array {
  const enc = new TextEncoder();
  const R = "http://schemas.openxmlformats.org";
  const archivos: [string, string][] = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="${R}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${R}/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${R}/spreadsheetml/2006/main" xmlns:r="${R}/officeDocument/2006/relationships"><sheets><sheet name="${xml(nombreHoja(h.nombre))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${R}/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${R}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", hojaXml(h)],
  ];
  return zip(archivos.map(([nombre, contenido]) => ({ nombre, datos: enc.encode(contenido) })));
}

/** Descarga el libro en el navegador. */
export function descargarXlsx(h: Hoja, archivo: string): void {
  const bytes = libroXlsx(h);
  const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = archivo.endsWith(".xlsx") ? archivo : `${archivo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari necesita que la URL siga viva un momento después del clic.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
