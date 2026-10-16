import { describe, expect, it } from "vitest";
import { digitoEan13, esEan13, modulosEan13, normalizarEan } from "../codigo-barras";

describe("EAN-13", () => {
  it("dígito verificador", () => {
    expect(digitoEan13("400638133393")).toBe("1");
    expect(digitoEan13("200000000001")).toBe("5"); // 2·1 + 1·3 = 5 → (10 − 5) % 10
  });
  it("valida y normaliza", () => {
    expect(esEan13("4006381333931")).toBe(true);
    expect(esEan13("4006381333932")).toBe(false);
    expect(normalizarEan(" 4006381333931 ")).toBe("4006381333931");
    expect(normalizarEan("036000291452")).toBe("0036000291452"); // UPC-A
    expect(normalizarEan("POL-M-NEG")).toBeNull();
  });
  it("95 módulos con guardas en los extremos y al centro", () => {
    const m = modulosEan13("4006381333931");
    expect(m).toHaveLength(95);
    expect(m.slice(0, 3)).toBe("101");
    expect(m.slice(45, 50)).toBe("01010");
    expect(m.slice(92)).toBe("101");
  });
});
