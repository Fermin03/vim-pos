import { describe, it, expect } from "vitest";
import { factorSugerido, resolverLinea, totales, type LineaCaptura } from "../compras";
import type { UnidadDetalle } from "../recetas";

const CAJA: UnidadDetalle = { id: "u-caja", codigo: "CAJ", nombre: "Caja", simbolo: "caja", dimension: "CANTIDAD" };
const PZA: UnidadDetalle = { id: "u-pza", codigo: "PZA", nombre: "Pieza", simbolo: "pza", dimension: "CANTIDAD" };
const KG: UnidadDetalle = { id: "u-kg", codigo: "KG", nombre: "Kilogramo", simbolo: "kg", dimension: "MASA" };
const G: UnidadDetalle = { id: "u-g", codigo: "G", nombre: "Gramo", simbolo: "g", dimension: "MASA" };

const base: LineaCaptura = { insumoId: "i1", descripcionOrigen: "PAN CAJA 12", cantidadCapturada: 2, unidadCapturadaId: "u-caja", factor: 12, importeSinIva: 300, claveOrigen: "PB-12", omitir: false };

describe("resolverLinea", () => {
  it("convierte por factor y calcula costo por unidad del insumo", () => {
    expect(resolverLinea(base)).toMatchObject({ cantidad: 24, costoUnitario: 12.5, importe: 300 });
  });
  it("redondea costo a 6 decimales y cantidad a 3", () => {
    const r = resolverLinea({ ...base, cantidadCapturada: 1, factor: 3, importeSinIva: 10 });
    expect(r.cantidad).toBe(3);
    expect(r.costoUnitario).toBe(3.333333);
  });
});

describe("totales", () => {
  const lineas = [resolverLinea(base), resolverLinea({ ...base, insumoId: "i2", importeSinIva: 60, factor: 1, cantidadCapturada: 24 })];
  it("IVA 16 % cuando no viene del XML", () => {
    expect(totales(lineas, null)).toEqual({ subtotal: 360, iva: 57.6, total: 417.6 });
  });
  it("respeta el IVA del XML", () => {
    expect(totales(lineas, 48)).toEqual({ subtotal: 360, iva: 48, total: 408 });
  });
});

describe("factorSugerido", () => {
  it("misma unidad → 1", () => expect(factorSugerido(PZA, PZA, [])).toBe(1));
  it("kg → g del sistema → 1000", () => expect(factorSugerido(KG, G, [])).toBe(1000));
  it("caja → pza sin conversión → null (el usuario lo captura)", () => expect(factorSugerido(CAJA, PZA, [])).toBeNull());
  it("unidad desconocida → null", () => expect(factorSugerido(undefined, PZA, [])).toBeNull());
});
