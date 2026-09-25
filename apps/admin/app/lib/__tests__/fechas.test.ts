import { describe, it, expect, vi, afterEach } from "vitest";
import { aDatetimeLocal, haceDiasISO, hoyISO } from "../fechas";

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

describe("aDatetimeLocal (promociones)", () => {
  it("ida y vuelta: editar y guardar sin tocar nada deja la misma hora", () => {
    // Lo que regresa la base para una promo de las 18:00 en México.
    const deLaBase = "2026-09-25T00:00:00+00:00";
    const enElCampo = aDatetimeLocal(deLaBase);
    // Lo que hace payload() al guardar: new Date(valor del campo).toISOString().
    expect(new Date(enElCampo).toISOString()).toBe(new Date(deLaBase).toISOString());
  });
  it("el campo enseña la hora local, no la UTC de la base", () => {
    const d = new Date(2026, 8, 24, 18, 0); // 24 sep 18:00 hora local del proceso
    expect(aDatetimeLocal(d)).toBe("2026-09-24T18:00");
  });
});
