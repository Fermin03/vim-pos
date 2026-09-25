import { describe, it, expect } from "vitest";
import { limpiarPrecio } from "../numeros";

describe("limpiarPrecio", () => {
  it("un solo punto y dos decimales como mucho (antes pasaba «1.2.3»)", () => {
    expect(limpiarPrecio("1.2.3")).toBe("1.23");
    expect(limpiarPrecio("120.555")).toBe("120.55");
    expect(limpiarPrecio(".5")).toBe("0.5");
    expect(limpiarPrecio("$1,250")).toBe("1250");
  });
  it("el signo menos solo donde se permite", () => {
    expect(limpiarPrecio("-5")).toBe("5");
    expect(limpiarPrecio("-5.50", { negativo: true })).toBe("-5.50");
  });
});
