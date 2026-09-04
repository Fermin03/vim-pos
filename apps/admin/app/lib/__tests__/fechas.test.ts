import { describe, it, expect, vi, afterEach } from "vitest";
import { haceDiasISO, hoyISO } from "../fechas";

afterEach(() => vi.useRealTimers());

describe("fechas locales", () => {
  it("hoyISO usa el día local, no el UTC", () => {
    vi.useFakeTimers();
    // 3 sep 2026 23:30 hora local del proceso de pruebas
    vi.setSystemTime(new Date(2026, 8, 3, 23, 30));
    expect(hoyISO()).toBe("2026-09-03");
  });
  it("haceDiasISO cruza mes y año en día local", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 8, 0));
    expect(haceDiasISO(1)).toBe("2025-12-31");
    expect(haceDiasISO(0)).toBe("2026-01-01");
  });
});
