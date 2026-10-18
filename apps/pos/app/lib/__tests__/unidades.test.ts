import { describe, it, expect } from "vitest";
import { aGranel, fmtCantidad, precioConUnidad, unidadDeVenta, unidadDesdeSat } from "../unidades";

describe("unidades de venta", () => {
  it("la tabla completa", () => {
    expect([undefined, null, "UNIDAD", "PESO", "LONGITUD", "VOLUMEN"].map((t) => {
      const u = unidadDeVenta(t as Parameters<typeof unidadDeVenta>[0]);
      return [u.abrev, u.decimales, u.titulo];
    })).toEqual([
      ["pz", 0, "Piezas"], ["pz", 0, "Piezas"], ["pz", 0, "Piezas"],
      ["kg", 3, "Peso"], ["m", 2, "Metros"], ["l", 2, "Litros"],
    ]);
  });
  it("desde la clave SAT; lo que no tiene unidad (E48 o nada) es pieza", () => {
    expect(["H87", "KGM", "MTR", "LTR", "E48", null].map((c) => unidadDesdeSat(c).abrev)).toEqual(["pz", "kg", "m", "l", "pz", "pz"]);
  });
  it("fmtCantidad con los decimales de su unidad", () => {
    expect(fmtCantidad(1.25, "PESO")).toBe("1.250 kg");
    expect(fmtCantidad(7.5, "LONGITUD")).toBe("7.50 m");
    expect(fmtCantidad(2, "VOLUMEN")).toBe("2.00 l");
    expect(fmtCantidad(2, "UNIDAD")).toBe("2");
    expect(fmtCantidad(2, undefined)).toBe("2");
  });
  it("solo kilo, metro y litro van a granel", () => {
    expect([undefined, "UNIDAD", "PESO", "LONGITUD", "VOLUMEN"].map((t) => aGranel(t as Parameters<typeof aGranel>[0]))).toEqual([false, false, true, true, true]);
  });
  it("precio con unidad: una pieza se ve como siempre", () => {
    expect(precioConUnidad("$28.00", "PESO")).toBe("$28.00/kg");
    expect(precioConUnidad("$28.00", "UNIDAD")).toBe("$28.00");
  });
});
