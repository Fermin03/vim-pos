import { describe, it, expect } from "vitest";
import { coloniaSchema, filtroBusqueda, mensajeSiembra } from "../colonias";

describe("mensajeSiembra", () => {
  it("dice cuántas se cargaron y cuántas heredaron zona", () => {
    expect(mensajeSiembra({ insertadas: 812, heredadas: 37 })).toBe("Se cargaron 812 colonias; 37 ya tienen zona por tus domicilios.");
  });
  it("sin herencia, no menciona zonas", () => {
    expect(mensajeSiembra({ insertadas: 5, heredadas: 0 })).toBe("Se cargaron 5 colonias.");
  });
  it("singular", () => {
    expect(mensajeSiembra({ insertadas: 1, heredadas: 1 })).toBe("Se cargó 1 colonia; 1 ya tiene zona por tus domicilios.");
  });
  it("sin nuevas", () => {
    expect(mensajeSiembra({ insertadas: 0, heredadas: 0 })).toBe("No había colonias nuevas.");
  });
});

describe("coloniaSchema", () => {
  it("acepta nombre y CP opcional", () => {
    expect(coloniaSchema.safeParse({ nombre: "Centro" }).success).toBe(true);
    expect(coloniaSchema.safeParse({ nombre: "Centro", codigoPostal: "" }).success).toBe(true);
    expect(coloniaSchema.safeParse({ nombre: "Centro", codigoPostal: "37000" }).success).toBe(true);
  });
  it("rechaza nombre corto o largo y CP mal formado", () => {
    expect(coloniaSchema.safeParse({ nombre: "A" }).success).toBe(false);
    expect(coloniaSchema.safeParse({ nombre: "x".repeat(151) }).success).toBe(false);
    expect(coloniaSchema.safeParse({ nombre: "Centro", codigoPostal: "3700" }).success).toBe(false);
  });
});

describe("filtroBusqueda", () => {
  it("normaliza y escapa los comodines", () => {
    expect(filtroBusqueda("  San JOSÉ%")).toBe("%san jose\\%%");
  });
});
