import { describe, it, expect } from "vitest";
import { aFechaMx, sumarDias, sumarMeses } from "../index";

describe("aFechaMx", () => {
  it("de noche en México sigue siendo HOY, aunque en UTC ya sea mañana", () => {
    // 18 ago 2026, 19:00 en México = 19 ago 01:00 UTC. Este es el caso que fechó la suscripción
    // de Knock-Out un día adelante.
    const instante = new Date("2026-08-19T01:00:00Z");
    expect(instante.toISOString().slice(0, 10)).toBe("2026-08-19"); // lo que hacía el código viejo
    expect(aFechaMx(instante)).toBe("2026-08-18"); // lo que ve quien está en el restaurante
  });

  it("de madrugada en UTC-6 la fecha ya avanzó", () => {
    expect(aFechaMx(new Date("2026-08-19T06:30:00Z"))).toBe("2026-08-19");
  });

  it("a mediodía coinciden las dos, que es por lo que el error pasaba desapercibido", () => {
    const mediodia = new Date("2026-08-18T18:00:00Z");
    expect(aFechaMx(mediodia)).toBe(mediodia.toISOString().slice(0, 10));
  });
});

describe("sumarMeses", () => {
  it("suma un mes normal", () => {
    expect(sumarMeses("2026-08-18", 1)).toBe("2026-09-18");
  });

  it("recorta al último día: el 31 de enero cobra el 28, no el 3 de marzo", () => {
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("respeta el año bisiesto", () => {
    expect(sumarMeses("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("cruza el fin de año", () => {
    expect(sumarMeses("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("suma doce meses para el ciclo anual", () => {
    expect(sumarMeses("2026-08-18", 12)).toBe("2027-08-18");
  });

  it("rechaza una fecha que no entiende en vez de inventar uno", () => {
    expect(() => sumarMeses("no-es-fecha", 1)).toThrow();
  });
});

describe("sumarDias", () => {
  it("resta days para el rango 'últimos N días'", () => {
    expect(sumarDias("2026-08-18", -6)).toBe("2026-08-12");
  });

  it("cruza el cambio de mes hacia atrás", () => {
    expect(sumarDias("2026-09-02", -5)).toBe("2026-08-28");
  });

  it("cruza el año", () => {
    expect(sumarDias("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("29 de febrero en bisiesto", () => {
    expect(sumarDias("2028-03-01", -1)).toBe("2028-02-29");
  });
});
