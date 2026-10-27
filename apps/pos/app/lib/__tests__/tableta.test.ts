import { describe, expect, it } from "vitest";
import { anchoLayout } from "../tableta";
import { calcularRejilla, CELDA_TABLETA } from "../rejilla";

describe("anchoLayout", () => {
  it("una tableta de 11\" se dibuja a 1024 acostada y conserva la escala de pie", () => {
    expect(anchoLayout(1280, 800, false)).toBe(1024);
    expect(anchoLayout(800, 1280, true)).toBe(640);
  });

  it("el iPad reporta siempre el ancho vertical y sale igual", () => {
    expect(anchoLayout(820, 1180, false)).toBe(1024);
    expect(anchoLayout(820, 1180, true)).toBe(712);
  });

  it("un celular o una tableta chica no se toca", () => {
    expect(anchoLayout(390, 844, true)).toBeNull();
    expect(anchoLayout(1024, 768, false)).toBeNull();
  });
});

describe("rejilla en tableta", () => {
  it("con 40 productos pagina antes de bajar del piso táctil", () => {
    const r = calcularRejilla({ ancho: 700, alto: 420, total: 40, medidas: CELDA_TABLETA });
    expect(r.anchoFicha).toBeGreaterThanOrEqual(132);
    expect(r.altoFicha).toBeGreaterThanOrEqual(104);
    expect(r.paginas).toBeGreaterThan(1);
  });
});
