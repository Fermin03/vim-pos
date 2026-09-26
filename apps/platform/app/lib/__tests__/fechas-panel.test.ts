import { describe, it, expect } from "vitest";
import { compararVersiones, finDelDiaMx, haceMinutos } from "../fechas-panel";

describe("finDelDiaMx", () => {
  it("el día elegido termina a las 23:59:59 de México, no a las 18:00 del día anterior", () => {
    expect(finDelDiaMx("2026-09-30")).toBe("2026-10-01T05:59:59.000Z");
  });
  it("rechaza lo que no es una fecha", () => {
    expect(() => finDelDiaMx("30/09/2026")).toThrow();
  });
});

describe("compararVersiones", () => {
  it("compara por números, no como texto", () => {
    expect(compararVersiones("0.4.100", "0.4.99")).toBeGreaterThan(0);
    expect(compararVersiones("0.4.90", "0.4.91")).toBeLessThan(0);
    expect(compararVersiones("0.4.91", "0.4.91")).toBe(0);
    expect(compararVersiones("0.5", "0.4.99")).toBeGreaterThan(0);
  });
});

describe("haceMinutos", () => {
  it("minutos, horas y días", () => {
    expect(haceMinutos(null)).toBe("nunca");
    expect(haceMinutos(7)).toBe("hace 7 min");
    expect(haceMinutos(125)).toBe("hace 2 h");
    expect(haceMinutos(60 * 72)).toBe("hace 3 días");
  });
});
