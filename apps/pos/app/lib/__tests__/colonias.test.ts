import { describe, expect, it } from "vitest";
import { etiquetaColonia, normalizarColonia, ordenarSugerencias, type Colonia } from "../colonias";

const c = (nombre: string, codigoPostal: string | null = null): Colonia => ({ id: nombre + codigoPostal, nombre, codigoPostal, zona: null });

describe("normalizarColonia", () => {
  it("quita acentos, mayúsculas y espacios de sobra como f_unaccent(lower(btrim()))", () => {
    expect(normalizarColonia("  SAN  José ")).toBe("san  jose");
    expect(normalizarColonia("Peñitas")).toBe("penitas");
  });
});

describe("ordenarSugerencias", () => {
  it("pone primero las que empiezan con lo escrito y corta en 8", () => {
    const lista = ["Barrio de San Juan", "San Juan Bosco", "Arboledas de San Juan", "San Juan de Abajo",
      "a1", "a2", "a3", "a4", "a5"].map((n) => c(n));
    const r = ordenarSugerencias(lista, "san ju");
    expect(r.slice(0, 2).map((x) => x.nombre)).toEqual(["San Juan Bosco", "San Juan de Abajo"]);
    expect(r).toHaveLength(8);
  });
});

describe("etiquetaColonia", () => {
  it("enseña el CP cuando lo hay", () => {
    expect(etiquetaColonia(c("Centro", "37000"))).toBe("Centro · 37000");
    expect(etiquetaColonia(c("Las Joyas"))).toBe("Las Joyas");
  });
});
