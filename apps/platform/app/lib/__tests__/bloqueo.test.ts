import { describe, it, expect } from "vitest";
import { fechaBloqueo } from "../bloqueo";

describe("fechaBloqueo", () => {
  it("suma la gracia y fija las 06:00 de México (UTC-6) del día resultante", () => {
    // 4 sep + 3 días = 7 sep, 06:00 México = 12:00Z
    expect(fechaBloqueo("2026-09-04", 3)).toBe("2026-09-07T12:00:00.000Z");
  });
  it("cruza de mes sin desbordarse", () => {
    expect(fechaBloqueo("2026-09-29", 3)).toBe("2026-10-02T12:00:00.000Z");
  });
  it("rechaza gracia menor a 1", () => {
    expect(() => fechaBloqueo("2026-09-04", 0)).toThrow();
  });
});
