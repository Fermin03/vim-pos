import { describe, it, expect } from "vitest";
import { aFechaMx, fechaLegible, haceCuanto, rangoLegible, sumarDias, sumarMeses } from "../index";

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

describe("fechaLegible", () => {
  it("una fecha de la base se lee sin correrse de día", () => {
    expect(fechaLegible("2026-09-24")).toBe("24 sep 2026");
    expect(fechaLegible("2026-01-01")).toBe("1 ene 2026");
  });
  it("un instante de noche en México sigue siendo ese día aunque en UTC ya sea mañana", () => {
    expect(fechaLegible("2026-09-25T03:30:00Z")).toBe("24 sep 2026");
  });
  it("sin valor pone un guion", () => {
    expect(fechaLegible(null)).toBe("—");
  });
  it("un rango de un solo día no repite la fecha", () => {
    expect(rangoLegible("2026-09-03", "2026-09-03")).toBe("3 sep 2026");
    expect(rangoLegible("2026-09-03", "2026-09-09")).toBe("3 sep 2026 – 9 sep 2026");
  });
});

describe("haceCuanto", () => {
  const ahora = Date.parse("2026-09-25T03:00:00Z");
  it("minutos, horas y días en palabras", () => {
    expect(haceCuanto("2026-09-25T02:56:00Z", ahora)).toBe("hace 4 min");
    expect(haceCuanto("2026-09-25T01:00:00Z", ahora)).toBe("hace 2 h");
    expect(haceCuanto("2026-09-22T03:00:00Z", ahora)).toBe("hace 3 días");
    expect(haceCuanto("2026-09-24T03:00:00Z", ahora)).toBe("hace 1 día");
  });
  it("recién, nunca y más de un mes", () => {
    expect(haceCuanto("2026-09-25T02:59:40Z", ahora)).toBe("hace un momento");
    expect(haceCuanto(null, ahora)).toBe("nunca");
    expect(haceCuanto("2026-07-01T18:00:00Z", ahora)).toBe("1 jul 2026");
  });
});
