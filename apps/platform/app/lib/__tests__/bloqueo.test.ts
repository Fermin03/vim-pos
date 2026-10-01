import { describe, it, expect } from "vitest";
import { fechaBloqueo, mensajeBloqueoPorDefecto } from "../bloqueo";

describe("fechaBloqueo", () => {
  it("suma la gracia y fija las 06:00 de México (UTC-6) del día resultante", () => {
    // 4 sep + 3 días = 7 sep, 06:00 México = 12:00Z
    expect(fechaBloqueo("2026-09-04", 3)).toBe("2026-09-07T12:00:00.000Z");
  });
  it("cruza de mes sin desbordarse", () => {
    expect(fechaBloqueo("2026-09-29", 3)).toBe("2026-10-02T12:00:00.000Z");
  });
  it("con 0 días bloquea ya: sin tolerancia (regla del 1 oct 2026)", () => {
    const ahora = new Date("2026-10-01T20:15:00.000Z");
    expect(fechaBloqueo("2026-10-01", 0, ahora)).toBe("2026-10-01T20:15:00.000Z");
  });
  it("rechaza gracia negativa o con decimales", () => {
    expect(() => fechaBloqueo("2026-09-04", -1)).toThrow();
    expect(() => fechaBloqueo("2026-09-04", 1.5)).toThrow();
  });
});

describe("mensajeBloqueoPorDefecto", () => {
  const ahora = new Date("2026-10-01T20:15:00.000Z");
  it("con el bloqueo en el futuro, da la fecha límite", () => {
    expect(mensajeBloqueoPorDefecto("2026-10-04T12:00:00.000Z", ahora)).toContain("antes del 4 de octubre");
  });
  it("con el bloqueo ya vigente no promete un plazo: dice que está bloqueada y cómo reactivarla", () => {
    const m = mensajeBloqueoPorDefecto("2026-10-01T20:15:00.000Z", ahora);
    expect(m).toContain("está bloqueada");
    expect(m).not.toContain("antes del");
  });
});
