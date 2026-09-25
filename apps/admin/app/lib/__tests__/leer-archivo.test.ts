// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { crc32, libroXlsx } from "../excel";
import { decodificarTexto, xlsxATexto } from "../leer-archivo";

/** Un ZIP de un archivo, comprimido con deflate (como los guarda Excel). */
function zipDeflate(archivos: Record<string, string>): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let o = 0;
  for (const [nombre, texto] of Object.entries(archivos)) {
    const datos = enc.encode(texto);
    const comp = new Uint8Array(deflateRawSync(datos));
    const n = enc.encode(nombre);
    const l = new Uint8Array(30 + n.length);
    const lv = new DataView(l.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(14, crc32(datos), true);
    lv.setUint32(18, comp.length, true);
    lv.setUint32(22, datos.length, true);
    lv.setUint16(26, n.length, true);
    l.set(n, 30);
    const c = new Uint8Array(46 + n.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc32(datos), true);
    cv.setUint32(20, comp.length, true);
    cv.setUint32(24, datos.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, o, true);
    c.set(n, 46);
    partes.push(l, comp);
    centrales.push(c);
    o += l.length + comp.length;
  }
  const tam = centrales.reduce((s, x) => s + x.length, 0);
  const fin = new Uint8Array(22);
  const fv = new DataView(fin.buffer);
  fv.setUint32(0, 0x06054b50, true);
  fv.setUint16(8, centrales.length, true);
  fv.setUint16(10, centrales.length, true);
  fv.setUint32(12, tam, true);
  fv.setUint32(16, o, true);
  const todo = [...partes, ...centrales, fin];
  const out = new Uint8Array(todo.reduce((s, x) => s + x.length, 0));
  let k = 0;
  for (const p of todo) {
    out.set(p, k);
    k += p.length;
  }
  return out;
}

describe("leer un .xlsx", () => {
  it("lee de vuelta el que genera el admin (texto en línea, sin comprimir)", async () => {
    const bytes = libroXlsx({
      nombre: "Menú",
      preambulo: [],
      encabezados: ["Categoría", "Producto", "Precio"],
      filas: [[{ valor: "Hamburguesas" }, { valor: "Clásica ñ" }, { valor: 120, tipo: "mxn" }]],
    });
    expect(await xlsxATexto(bytes)).toBe("Categoría\tProducto\tPrecio\nHamburguesas\tClásica ñ\t120");
  });

  it("lee uno comprimido con textos compartidos y celdas vacías, como los de Excel", async () => {
    const bytes = zipDeflate({
      "xl/sharedStrings.xml": `<sst xmlns="x"><si><t>Categoría</t></si><si><t>Producto</t></si><si><r><t>Papas</t></r><r><t xml:space="preserve"> gajo</t></r></si></sst>`,
      "xl/worksheets/sheet1.xml": `<worksheet xmlns="x"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="C2" t="s"><v>2</v></c><c r="D2"><v>55</v></c></row></sheetData></worksheet>`,
    });
    expect(await xlsxATexto(bytes)).toBe("Categoría\t\tProducto\n\t\tPapas gajo\t55");
  });
});

describe("decodificarTexto", () => {
  it("UTF-8 sin la marca de orden", () => {
    expect(decodificarTexto(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Café")]))).toBe("Café");
  });
  it("un CSV de Excel en Windows (Latin-1) no sale con signos raros", () => {
    expect(decodificarTexto(new Uint8Array([0x43, 0x61, 0x66, 0xe9]))).toBe("Café");
  });
});
