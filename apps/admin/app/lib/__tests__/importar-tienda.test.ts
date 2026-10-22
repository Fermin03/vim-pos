import { describe, expect, it } from "vitest";
import { PLANTILLA_TIENDA, parsearCsvTienda } from "../importar-tienda";

describe("CSV de tienda", () => {
  it("la plantilla se lee sin errores", () => {
    const r = parsearCsvTienda(PLANTILLA_TIENDA, true);
    expect(r.errores).toEqual([]);
    expect(r.filas.length).toBeGreaterThan(0);
  });
  it("variantes, producto suelto, precios con $ y separadores distintos", () => {
    const r = parsearCsvTienda(
      "Categoría;Producto;Ejes;Valores;SKU;Código de barras;Precio;Costo;Existencia\n" +
      "Playeras;\"Polo, clásica\";Talla|Color;M|Negra;POL-M;;$349.00;150;5\n" +
      "\n" +
      "Accesorios;Gorra;;;GOR-1;4006381333931;249;;\n", false);
    expect(r.errores).toEqual([]);
    expect(r.filas[0]).toMatchObject({ linea: 2, producto: "Polo, clásica", ejes: ["Talla", "Color"],
      valores: { Talla: "M", Color: "Negra" }, sku: "POL-M", precio: 349, costo: 150, existencia: 5, generar_codigo: false });
    expect(r.filas[1]).toMatchObject({ linea: 4, ejes: [], valores: {}, codigo_barras: "4006381333931", costo: null, existencia: null });
  });
  it("errores por renglón con su número", () => {
    const r = parsearCsvTienda(
      "Categoría,Producto,Ejes,Valores,SKU,Código de barras,Precio,Costo,Existencia\n" +
      "Playeras,Polo,Talla|Color,M,POL-M,,349,,\n" +       // valores no cuadran con ejes
      "Playeras,Polo,Talla,G,,,349,,\n" +                  // sin SKU
      "Playeras,Polo,Talla,CH,POL-CH,123,349,,\n" +        // código que no es EAN-13 → sí se acepta como texto
      "Playeras,Polo,Talla,XG,POL-XG,,abc,,\n" +           // precio
      "Playeras,Polo,Talla,XL,pol-ch,,349,,\n", true);     // SKU repetido en el archivo (sin importar mayúsculas)
    expect(r.errores.map((e) => e.linea)).toEqual([2, 3, 5, 6]);
    expect(r.filas.map((f) => f.sku)).toEqual(["POL-CH"]);
  });
  it("rechaza la coma decimal y acepta la de miles", () => {
    const r = parsearCsvTienda(
      "Categoría,Producto,Ejes,Valores,SKU,Código de barras,Precio,Costo,Existencia\n" +
      "Ropa,Polo,,,A,,\"349,50\",,\n" +
      "Ropa,Saco,,,B,,\"1,299.50\",,\n", false);
    expect(r.errores).toEqual([{ linea: 2, motivo: "Usa punto decimal (349.50)" }]);
    expect(r.filas[0]).toMatchObject({ sku: "B", precio: 1299.5 });
  });
  it("detecta los códigos que Excel pasó a notación científica", () => {
    const r = parsearCsvTienda(
      "Categoría,Producto,Ejes,Valores,SKU,Código de barras,Precio,Costo,Existencia\n" +
      "Ropa,Polo,,,A,7.50123E+12,349,,\n" +
      "Ropa,Saco,,,1.2e5,,349,,\n" +
      "Ropa,Gorra,,,C,7501234567890,349,,\n", false);
    expect(r.errores.map((e) => e.linea)).toEqual([2, 3]);
    expect(r.errores[0]!.motivo).toMatch(/notación científica/);
    expect(r.filas.map((f) => f.sku)).toEqual(["C"]);
  });
  it("los números solo aceptan dígitos, comas de miles y punto decimal", () => {
    const r = parsearCsvTienda(
      "Categoría,Producto,Ejes,Valores,SKU,Código de barras,Precio,Costo,Existencia\n" +
      "Ropa,A,,,A,,1e5,,\n" +
      "Ropa,B,,,B,,0x10,,\n" +
      "Ropa,C,,,C,,Infinity,,\n" +
      "Ropa,D,,,D,,100,1e2,\n" +
      "Ropa,E,,,E,,\"12,345.5\",.5,3\n", false);
    expect(r.errores.map((e) => e.linea)).toEqual([2, 3, 4, 5]);
    expect(r.filas[0]).toMatchObject({ precio: 12345.5, costo: 0.5, existencia: 3 });
  });
});

describe("CSV de tienda: columna Unidad", () => {
  const enc = "Categoría,Producto,Ejes,Valores,SKU,Código de barras,Precio,Unidad,Costo,Existencia\n";
  it("válida (con acentos y mayúsculas), vacía y sin columna", () => {
    const r = parsearCsvTienda(enc + "Frutas,Manzana,,,MAN,,40,KG,20,10\nTelas,Manta,,,MTA,,60,M,25,4\nFrutas,Pera,,,PER,,30,,12,3\n", false);
    expect(r.errores).toEqual([]);
    expect(r.filas.map((f) => f.unidad)).toEqual(["kg", "m", undefined]);
    expect(r.filas[0]).toMatchObject({ precio: 40, costo: 20, existencia: 10 });
    const vieja = parsearCsvTienda("Categoría,Producto,Ejes,Valores,SKU,Código de barras,Precio,Costo,Existencia\nA,B,,,S1,,5,2,7\n", false);
    expect(vieja.filas[0]).toMatchObject({ precio: 5, costo: 2, existencia: 7 });
    expect(vieja.filas[0]!.unidad).toBeUndefined();
  });
  it("unidad inválida: error con su línea", () => {
    const r = parsearCsvTienda(enc + "Frutas,Manzana,,,MAN,,40,libra,20,10\n", false);
    expect(r.filas).toEqual([]);
    expect(r.errores).toEqual([{ linea: 2, motivo: expect.stringContaining("Unidad inválida") }]);
  });
});
