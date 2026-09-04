import { describe, it, expect } from "vitest";
import { convertirCantidad, costoReceta, margen, precioSinIva, type UnidadDetalle } from "../recetas";

const KG: UnidadDetalle = { id: "u-kg", codigo: "KG", nombre: "Kilogramo", simbolo: "kg", dimension: "MASA" };
const G: UnidadDetalle = { id: "u-g", codigo: "G", nombre: "Gramo", simbolo: "g", dimension: "MASA" };
const OZ: UnidadDetalle = { id: "u-oz", codigo: "OZ", nombre: "Onza", simbolo: "oz", dimension: "MASA" };
const ML: UnidadDetalle = { id: "u-ml", codigo: "ML", nombre: "Mililitro", simbolo: "ml", dimension: "VOLUMEN" };
const CAJA: UnidadDetalle = { id: "u-caja", codigo: "CAJ", nombre: "Caja", simbolo: "caja", dimension: "CANTIDAD" };
const PZA: UnidadDetalle = { id: "u-pza", codigo: "PZA", nombre: "Pieza", simbolo: "pza", dimension: "CANTIDAD" };

describe("convertirCantidad", () => {
  it("misma unidad → identidad", () => {
    expect(convertirCantidad(3, G, G, [])).toBe(3);
  });
  it("kg → g usa la tabla del sistema aunque el tenant no tenga conversiones", () => {
    expect(convertirCantidad(1.5, KG, G, [])).toBe(1500);
  });
  it("g → kg (inversa del sistema)", () => {
    expect(convertirCantidad(250, G, KG, [])).toBe(0.25);
  });
  it("oz → g con 3 decimales", () => {
    expect(convertirCantidad(2, OZ, G, [])).toBe(56.699);
  });
  it("conversión del tenant gana sobre la del sistema", () => {
    expect(convertirCantidad(1, KG, G, [{ origenId: "u-kg", destinoId: "u-g", factor: 999 }])).toBe(999);
  });
  it("conversión del tenant inversa", () => {
    expect(convertirCantidad(12, PZA, CAJA, [{ origenId: "u-caja", destinoId: "u-pza", factor: 12 }])).toBe(1);
  });
  it("dimensión distinta → error que dice qué hacer", () => {
    expect(() => convertirCantidad(1, ML, G, [])).toThrow("No hay conversión de ml a g; captura la cantidad en g");
  });
  it("misma dimensión sin conversión conocida → error", () => {
    expect(() => convertirCantidad(1, CAJA, PZA, [])).toThrow("No hay conversión de caja a pza; captura la cantidad en pza");
  });
});

describe("costoReceta y margen", () => {
  it("suma cantidad × costo unitario", () => {
    expect(costoReceta([{ cantidad: 150, costoUnitario: 0.18 }, { cantidad: 1, costoUnitario: 4 }])).toBe(31);
  });
  it("margen en pesos y porcentaje sobre el precio", () => {
    expect(margen(100, 31)).toEqual({ pesos: 69, porcentaje: 0.69 });
  });
  it("precio cero → porcentaje null", () => {
    expect(margen(0, 5)).toEqual({ pesos: -5, porcentaje: null });
  });
  it("precioSinIva quita el IVA incluido y respeta el precio neto", () => {
    expect(precioSinIva(116, 16, true)).toBe(100);
    expect(precioSinIva(100, 16, false)).toBe(100);
  });
  it("precioSinIva con tasa cero (producto exento) no cambia el precio", () => {
    expect(precioSinIva(100, 0, true)).toBe(100);
  });
});
