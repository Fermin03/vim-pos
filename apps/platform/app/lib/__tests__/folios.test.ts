import { describe, it, expect } from "vitest";
import { leerAjuste } from "../folios";

describe("leerAjuste", () => {
  it("acepta enteros con o sin signo", () => {
    expect(leerAjuste("+50")).toBe(50);
    expect(leerAjuste("50")).toBe(50);
    expect(leerAjuste("-10")).toBe(-10);
  });
  it("rechaza lo que antes daba NaN o cero en silencio", () => {
    expect(leerAjuste("5-3")).toBeNull();
    expect(leerAjuste("--2")).toBeNull();
    expect(leerAjuste("0")).toBeNull();
    expect(leerAjuste("")).toBeNull();
  });
});
