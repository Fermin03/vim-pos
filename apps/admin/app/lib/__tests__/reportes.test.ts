import { describe, it, expect } from "vitest";
import { variacionPct } from "../reportes";

describe("variacionPct (deltas del dashboard P-177)", () => {
  it("calcula subidas y bajadas redondeadas a entero", () => {
    expect(variacionPct(16550 * 1.12, 16550)).toBe(12);
    expect(variacionPct(1240, 1280)).toBe(-3);
    expect(variacionPct(290, 280)).toBe(4);
  });

  it("devuelve 0 cuando no hubo cambio", () => {
    expect(variacionPct(500, 500)).toBe(0);
  });

  it("devuelve null sin base de comparación — nunca Infinity ni NaN", () => {
    // Primer día del negocio: no hay día previo.
    expect(variacionPct(18540, null)).toBeNull();
    expect(variacionPct(18540, undefined)).toBeNull();
    // Día previo cerrado en 0: "subió infinito%" no informa nada al dueño.
    expect(variacionPct(18540, 0)).toBeNull();
  });
});
