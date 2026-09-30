import { describe, expect, it } from "vitest";
import { diasEntre, estadoCobro, textoEstadoCobro } from "@vim/db/cobro";

describe("diasEntre", () => {
  it("cuenta días de calendario, cruzando meses y años", () => {
    expect(diasEntre("2026-09-30", "2026-10-01")).toBe(1);
    expect(diasEntre("2026-12-31", "2027-01-01")).toBe(1);
    expect(diasEntre("2026-03-10", "2026-03-01")).toBe(-9);
  });
  it("el cambio de horario no le quita ni le pone un día", () => {
    expect(diasEntre("2026-04-04", "2026-04-06")).toBe(2);
    expect(diasEntre("2026-10-24", "2026-10-26")).toBe(2);
  });
});

describe("estadoCobro", () => {
  const HOY = "2026-09-30";
  it("sin fecha de cobro no hay nada que decir", () => {
    expect(estadoCobro(null, HOY)).toEqual({ tipo: "SIN_COBRO" });
  });
  it("vencido, hoy, por vencer (5 días o menos) y al corriente", () => {
    expect(estadoCobro("2026-09-27", HOY)).toEqual({ tipo: "VENCIDO", dias: 3 });
    expect(estadoCobro("2026-09-30", HOY)).toEqual({ tipo: "HOY" });
    expect(estadoCobro("2026-10-05", HOY)).toEqual({ tipo: "POR_VENCER", dias: 5 });
    expect(estadoCobro("2026-10-06", HOY)).toEqual({ tipo: "AL_CORRIENTE", dias: 6 });
  });
  it("acepta un timestamp y se queda con la fecha", () => {
    expect(estadoCobro("2026-09-29T23:59:00Z", HOY)).toEqual({ tipo: "VENCIDO", dias: 1 });
  });
  it("las frases", () => {
    expect(textoEstadoCobro({ tipo: "VENCIDO", dias: 1 })).toBe("Vencido hace 1 día");
    expect(textoEstadoCobro({ tipo: "POR_VENCER", dias: 3 })).toBe("Toca pagar en 3 días");
  });
});
