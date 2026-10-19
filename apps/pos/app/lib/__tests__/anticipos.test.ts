import { describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ employeeClient: () => ({}) }));

import { TEXTO_ANTICIPO, anticipoPorAplicar, decisionSugerida, pideAutorizacionAnticipo, sumaAnticipos, vigentes, type Anticipo } from "../anticipos";
import { fmtMxn } from "../turno";

const t = (iso: string) => new Date(iso);

describe("decisionSugerida (devolver o retener)", () => {
  const cita = t("2026-11-06T10:00:00-06:00");
  it("cancela el salón: devolver, aunque sea tarde", () => {
    expect(decisionSugerida("SALON", cita, t("2026-11-06T09:30:00-06:00"), 24)).toBe("DEVOLVER");
  });
  it("la clienta cancela con más anticipación que el límite: devolver", () => {
    expect(decisionSugerida("CLIENTA", cita, t("2026-11-05T09:59:00-06:00"), 24)).toBe("DEVOLVER");
  });
  it("la clienta cancela tarde (justo en el límite o después): retener", () => {
    expect(decisionSugerida("CLIENTA", cita, t("2026-11-05T10:00:00-06:00"), 24)).toBe("RETENER");
    expect(decisionSugerida("CLIENTA", cita, t("2026-11-06T08:00:00-06:00"), 24)).toBe("RETENER");
  });
  it("no llegó: retener", () => {
    expect(decisionSugerida("NO_LLEGO", cita, t("2026-11-06T10:30:00-06:00"), 24)).toBe("RETENER");
  });
  it("en espera (sin hora) que cancela la clienta: devolver", () => {
    expect(decisionSugerida("CLIENTA", null, t("2026-11-06T10:30:00-06:00"), 24)).toBe("DEVOLVER");
  });
});

describe("«Anticipo» en el cobro", () => {
  it("solo con anticipos vigentes", () => {
    expect(anticipoPorAplicar(null, 1840)).toBe(0);
    expect(anticipoPorAplicar({ citaId: "c", vigente: 0, aplicado: 390 }, 1450)).toBe(0);
    expect(anticipoPorAplicar({ citaId: "c", vigente: 390, aplicado: 0 }, 1840)).toBe(390);
  });
  it("no pasa de lo que falta: si cubre todo, la venta se paga solo con anticipo", () => {
    expect(anticipoPorAplicar({ citaId: "c", vigente: 2000, aplicado: 0 }, 1840)).toBe(1840);
    expect(anticipoPorAplicar({ citaId: "c", vigente: 390, aplicado: 0 }, 0)).toBe(0);
  });
  it("suma solo los vigentes", () => {
    const a = (monto: number, estado: Anticipo["estado"]): Anticipo => ({ id: String(monto), monto, metodo: "EFECTIVO", estado, ticketId: null });
    const lista = [a(100.1, "VIGENTE"), a(200.2, "VIGENTE"), a(50, "DEVUELTO"), a(80, "APLICADO")];
    expect(sumaAnticipos(vigentes(lista))).toBe(300.3);
  });
});

describe("devolver en efectivo sin permiso", () => {
  it("reconoce el rechazo que pide el PIN", () => {
    expect(pideAutorizacionAnticipo("Devolver un anticipo en efectivo requiere autorización (venta.devolucion).")).toBe(true);
    expect(pideAutorizacionAnticipo("falta la referencia de la devolución con tarjeta o transferencia.")).toBe(false);
  });
});

describe("textos exactos", () => {
  it("ficha, diálogo y cobro", () => {
    expect(TEXTO_ANTICIPO.cobrar).toBe("Cobrar anticipo");
    expect(TEXTO_ANTICIPO.pagado(fmtMxn(390))).toBe("Anticipo pagado $390.00");
    expect(TEXTO_ANTICIPO.pregunta(fmtMxn(390))).toBe("¿Qué hacemos con el anticipo de $390.00?");
    expect([TEXTO_ANTICIPO.devolver, TEXTO_ANTICIPO.retener]).toEqual(["Devolver", "Retener"]);
    expect(TEXTO_ANTICIPO.pendiente).toBe("Anticipo pendiente de devolver o retener");
    expect([TEXTO_ANTICIPO.lineaCobro, TEXTO_ANTICIPO.porCobrar]).toEqual(["Anticipo", "Por cobrar"]);
  });
});
