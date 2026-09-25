import { describe, it, expect } from "vitest";
import { crc32, letraColumna, libroXlsx, nombreHoja, serieExcel } from "../excel";
import { filaTotales, formatear, hojaDeReporte, nombreArchivo, ordenar, type Columna } from "../reporte-tabla";

/** Lee un ZIP sin comprimir: nombre → contenido, comprobando el CRC de cada archivo. */
function leerZip(bytes: Uint8Array): Map<string, string> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const out = new Map<string, string>();
  let o = 0;
  while (v.getUint32(o, true) === 0x04034b50) {
    expect(v.getUint16(o + 8, true)).toBe(0); // store
    const crc = v.getUint32(o + 14, true);
    const tam = v.getUint32(o + 18, true);
    const lenNombre = v.getUint16(o + 26, true);
    const nombre = dec.decode(bytes.subarray(o + 30, o + 30 + lenNombre));
    const datos = bytes.subarray(o + 30 + lenNombre, o + 30 + lenNombre + tam);
    expect(crc32(datos)).toBe(crc);
    out.set(nombre, dec.decode(datos));
    o += 30 + lenNombre + tam;
  }
  // Tras los archivos viene el directorio central y, al final, su cierre.
  expect(v.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  expect(v.getUint16(bytes.length - 22 + 10, true)).toBe(out.size);
  return out;
}

type Fila = { nombre: string; unidades: number; total: number; pct: number };
const columnas: Columna<Fila>[] = [
  { id: "nombre", titulo: "Producto", valor: (f) => f.nombre },
  { id: "unidades", titulo: "Unidades", tipo: "entero", valor: (f) => f.unidades, total: "suma" },
  { id: "total", titulo: "Venta", tipo: "mxn", valor: (f) => f.total, total: "suma" },
  { id: "pct", titulo: "% del total", tipo: "pct", valor: (f) => f.pct },
];
const filas: Fila[] = [
  { nombre: "Hamburguesa <doble> & papas", unidades: 3, total: 450.5, pct: 75 },
  { nombre: "Refresco", unidades: 10, total: 150, pct: 25 },
];

describe("CRC-32", () => {
  it("coincide con el valor de referencia", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("libroXlsx", () => {
  const hoja = hojaDeReporte({ titulo: "Ventas por producto", rango: { desde: "2026-09-01", hasta: "2026-09-25" }, cifras: [{ etiqueta: "Venta total", valor: 600.5, tipo: "mxn" }], columnas, filas });
  const zip = leerZip(libroXlsx(hoja));

  it("trae las seis partes de un .xlsx", () => {
    expect([...zip.keys()].sort()).toEqual(
      ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"].sort(),
    );
  });

  const hojaXml = zip.get("xl/worksheets/sheet1.xml")!;

  it("escapa el texto y guarda las cifras como números con formato", () => {
    expect(hojaXml).toContain("Hamburguesa &lt;doble&gt; &amp; papas");
    expect(hojaXml).toMatch(/<c r="C\d+" s="2"><v>450.5<\/v><\/c>/); // pesos
    expect(hojaXml).toMatch(/<c r="D\d+" s="4"><v>0.75<\/v><\/c>/); // 75 % → 0.75
  });

  it("pone la fila de totales en negritas, con la suma", () => {
    expect(hojaXml).toMatch(/<c r="A\d+" t="inlineStr" s="1"><is><t xml:space="preserve">Total<\/t>/);
    expect(hojaXml).toMatch(/<c r="B\d+" s="7"><v>13<\/v><\/c>/);
    expect(hojaXml).toMatch(/<c r="C\d+" s="6"><v>600.5<\/v><\/c>/);
  });

  it("fija el encabezado de la tabla (título, rango, 1 cifra, blanco → fila 5)", () => {
    expect(hojaXml).toContain('<pane ySplit="5" topLeftCell="A6"');
    expect(hojaXml).toMatch(/<row r="5"><c r="A5" t="inlineStr" s="1"><is><t xml:space="preserve">Producto/);
  });

  it("quita caracteres de control que romperían el archivo", () => {
    const h = hojaDeReporte({ titulo: "X", columnas, filas: [{ nombre: "a\u0007b", unidades: 1, total: 1, pct: 1 }] });
    const x = leerZip(libroXlsx(h)).get("xl/worksheets/sheet1.xml")!;
    expect(x).toContain(">ab<");
  });
});

describe("utilidades", () => {
  it("columnas A…Z, AA", () => {
    expect([0, 25, 26, 27].map(letraColumna)).toEqual(["A", "Z", "AA", "AB"]);
  });
  it("fecha → serie de Excel", () => {
    expect(serieExcel("1900-01-01")).toBe(2);
    expect(serieExcel("2026-09-25")).toBe(46290);
  });
  it("nombre de pestaña válido", () => {
    expect(nombreHoja("Ventas: por producto / categoría [2026]")).toBe("Ventas  por producto   categorí");
  });
  it("nombre de archivo sin acentos", () => {
    expect(nombreArchivo("Ventas por categoría", { desde: "2026-09-01", hasta: "2026-09-25" })).toBe("ventas-por-categoria_2026-09-01_2026-09-25");
  });
});

describe("tabla de reporte", () => {
  it("un solo criterio de decimales", () => {
    expect(formatear(50, "pct")).toBe("50.0%");
    expect(formatear(33.333, "pct")).toBe("33.3%");
    expect(formatear(1234567, "entero")).toBe("1,234,567");
    expect(formatear(null, "mxn")).toBe("—");
  });
  it("ordena números y textos, vacíos al final", () => {
    const f = [...filas, { nombre: "", unidades: 5, total: 0, pct: 0 }];
    expect(ordenar(f, columnas, { id: "unidades", dir: "desc" }).map((x) => x.unidades)).toEqual([10, 5, 3]);
    expect(ordenar(f, columnas, { id: "nombre", dir: "asc" }).map((x) => x.nombre)).toEqual(["Hamburguesa <doble> & papas", "Refresco", ""]);
  });
  it("totales: 'Total' en la primera columna y la suma donde se pide", () => {
    expect(filaTotales(columnas, filas)).toEqual(["Total", 13, 600.5, null]);
  });
});
