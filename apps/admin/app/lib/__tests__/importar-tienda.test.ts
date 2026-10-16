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
});
