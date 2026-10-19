import { describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ employeeClient: () => ({}) }));

import { TEXTO_ANTICIPO, anticipoPorAplicar, pideReferencia, devuelveEnEfectivo, cobroEsperaAnticipo, permiteRetener, resumenAnticipoCobro, sugerenciaPendiente, decisionSugerida, pideAutorizacionAnticipo, sumaAnticipos, vigentes, type Anticipo } from "../anticipos";
import { fmtMxn } from "../turno";
import { capaTramo, seVeEnCalendario, tieneAnticipoPendiente } from "../agenda";

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

describe("devolver o retener sin permiso", () => {
  it("reconoce el rechazo que pide el PIN", () => {
    expect(pideAutorizacionAnticipo("Devolver un anticipo requiere autorización (venta.devolucion).")).toBe(true);
    expect(pideAutorizacionAnticipo("Retener un anticipo requiere autorización (venta.devolucion).")).toBe(true);
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

describe("el cobro enseña el anticipo sin aplicarlo", () => {
  it("desde el principio: Anticipo −$390 y Por cobrar $1,450 (boceto 2); nada aplicado aún", () => {
    expect(resumenAnticipoCobro({ citaId: "c", vigente: 390, aplicado: 0 }, 1840)).toEqual({ porAplicar: 390, anticipo: 390, porCobrar: 1450 });
  });
  it("si cubre todo, no queda nada por cobrar con otra forma de pago", () => {
    expect(resumenAnticipoCobro({ citaId: "c", vigente: 2000, aplicado: 0 }, 1840)).toEqual({ porAplicar: 1840, anticipo: 1840, porCobrar: 0 });
  });
  it("ya aplicado (primer pago confirmado): se sigue viendo y no se aplica de nuevo", () => {
    expect(resumenAnticipoCobro({ citaId: "c", vigente: 0, aplicado: 390 }, 1000)).toEqual({ porAplicar: 0, anticipo: 390, porCobrar: 1000 });
  });
  it("sin cita o sin anticipo: el cobro de siempre", () => {
    expect(resumenAnticipoCobro(null, 500)).toEqual({ porAplicar: 0, anticipo: 0, porCobrar: 500 });
  });
});

describe("anticipo pendiente: la cita sigue a la vista", () => {
  const v = [{ estado: "VIGENTE" }];
  it("cancelada o no llegó con anticipo vigente", () => {
    expect(tieneAnticipoPendiente("CANCELADA", v)).toBe(true);
    expect(tieneAnticipoPendiente("NO_LLEGO", v)).toBe(true);
    expect(tieneAnticipoPendiente("CANCELADA", [{ estado: "DEVUELTO" }, { estado: "RETENIDO" }])).toBe(false);
    expect(tieneAnticipoPendiente("AGENDADA", v)).toBe(false);
  });
  it("el calendario enseña la cancelada solo mientras su anticipo esté pendiente", () => {
    expect(seVeEnCalendario({ estado: "CANCELADA", anticipoPendiente: true })).toBe(true);
    expect(seVeEnCalendario({ estado: "CANCELADA", anticipoPendiente: false })).toBe(false);
    expect(seVeEnCalendario({ estado: "AGENDADA" })).toBe(true);
  });
  it("textos de la marca y del grupo", () => {
    expect(TEXTO_ANTICIPO.marcaPendiente).toBe("Anticipo pendiente");
    expect(TEXTO_ANTICIPO.grupoPendientes).toBe("Anticipos pendientes");
  });
});

describe("sobrante en una cita cobrada", () => {
  it("cuenta como pendiente y solo se devuelve", () => {
    expect(tieneAnticipoPendiente("COBRADA", [{ estado: "APLICADO" }, { estado: "VIGENTE" }])).toBe(true);
    expect(tieneAnticipoPendiente("COBRADA", [{ estado: "APLICADO" }])).toBe(false);
    expect(permiteRetener("COBRADA")).toBe(false);
    expect(permiteRetener("CANCELADA")).toBe(true);
    expect(permiteRetener("NO_LLEGO")).toBe(true);
    expect(TEXTO_ANTICIPO.sinUsar(fmtMxn(110))).toBe("Anticipo sin usar $110.00");
  });
});

describe("el cobro falla cerrado sin saber del anticipo", () => {
  it("belleza espera la lectura (o su reintento); tienda y restaurante no", () => {
    expect(cobroEsperaAnticipo(true, false)).toBe(true);
    expect(cobroEsperaAnticipo(true, true)).toBe(false);
    expect(cobroEsperaAnticipo(false, false)).toBe(false);
  });
});

describe("calendario: la cancelada no tapa a la cita viva", () => {
  it("cancelada → franja angosta debajo; las demás → tarjeta a todo el ancho", () => {
    expect(capaTramo({ estado: "CANCELADA" })).toBe("franja");
    for (const e of ["AGENDADA", "EN_CURSO", "TERMINADA", "NO_LLEGO", "COBRADA"] as const) expect(capaTramo({ estado: e })).toBe("tarjeta");
  });
});

describe("sugerida del aviso «pendiente»", () => {
  const inicia = t("2026-11-06T10:00:00-06:00");
  it("no llegó → Retener; sobrante de cobrada → Devolver", () => {
    expect(sugerenciaPendiente({ estado: "NO_LLEGO", inicia }, 24)).toBe("RETENER");
    expect(sugerenciaPendiente({ estado: "COBRADA", inicia }, 24)).toBe("DEVOLVER");
  });
  it("cancelada a tiempo → Devolver; tarde → Retener; sin hora de cancelación → sin sugerencia", () => {
    expect(sugerenciaPendiente({ estado: "CANCELADA", inicia, canceladaAt: t("2026-11-04T10:00:00-06:00") }, 24)).toBe("DEVOLVER");
    expect(sugerenciaPendiente({ estado: "CANCELADA", inicia, canceladaAt: t("2026-11-06T08:00:00-06:00") }, 24)).toBe("RETENER");
    expect(sugerenciaPendiente({ estado: "CANCELADA", inicia, canceladaAt: null }, 24)).toBeNull();
  });
});

describe("pideReferencia (devolver)", () => {
  it("con tarjeta o transferencia sí; en efectivo o pagado en línea (lo devuelve Mercado Pago) no", () => {
    expect(["TARJETA_DEBITO", "TARJETA_CREDITO", "TRANSFERENCIA"].every((m) => pideReferencia(m as Anticipo["metodo"]))).toBe(true);
    expect(pideReferencia("EFECTIVO")).toBe(false);
    expect(pideReferencia("PAGO_EN_LINEA")).toBe(false);
  });
});

describe("devuelveEnEfectivo", () => {
  const a = (metodo: Anticipo["metodo"], estado: Anticipo["estado"]): Anticipo => ({ id: `${metodo}-${estado}`, monto: 40, metodo, estado, ticketId: null });
  it("el efectivo y el sobrante de uno en línea ya usado en parte; el en línea entero lo devuelve Mercado Pago", () => {
    expect(devuelveEnEfectivo(a("EFECTIVO", "VIGENTE"), [])).toBe(true);
    expect(devuelveEnEfectivo(a("PAGO_EN_LINEA", "VIGENTE"), [a("PAGO_EN_LINEA", "VIGENTE")])).toBe(false);
    expect(devuelveEnEfectivo(a("PAGO_EN_LINEA", "VIGENTE"), [a("PAGO_EN_LINEA", "APLICADO"), a("PAGO_EN_LINEA", "VIGENTE")])).toBe(true);
    expect(devuelveEnEfectivo(a("TARJETA_DEBITO", "VIGENTE"), [a("PAGO_EN_LINEA", "APLICADO")])).toBe(false);
    // Revisión N1: la venta se canceló y lo aplicado volvió; el sobrante ya se había devuelto en efectivo.
    expect(devuelveEnEfectivo(a("PAGO_EN_LINEA", "VIGENTE"), [a("PAGO_EN_LINEA", "VIGENTE"), a("PAGO_EN_LINEA", "DEVUELTO")])).toBe(true);
  });
});
