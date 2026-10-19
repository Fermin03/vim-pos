import { describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ employeeClient: () => ({}) }));

import { avisoAbono, fechaLimiteCredito, filtrarDeudores, motivoDeLaBase, opcionesCredito, pideAutorizacionCredito, ventasConSaldo, type CreditoCliente, type Deudor } from "../credito";

const CREDITO: CreditoCliente = { activo: true, limite: 1000, plazoDias: 30, deuda: 200, disponible: 800, tieneVencido: false, deudaOtrasCajas: 0 };
const cuenta = (credito: CreditoCliente | null, saldoFavor = 0) => ({ clienteId: "c1", credito, saldoFavor });

describe("opcionesCredito", () => {
  it("sin el módulo no aparece «A crédito» ni «Saldo a favor»", () => {
    expect(opcionesCredito({ moduloCredito: false, cuenta: cuenta(CREDITO, 50), pendiente: 300, montoPagado: 0 }))
      .toEqual({ aCredito: null, saldoFavor: 0 });
  });
  it("sin cliente o sin crédito activo no aparece «A crédito»", () => {
    expect(opcionesCredito({ moduloCredito: true, cuenta: null, pendiente: 300, montoPagado: 0 }).aCredito).toBeNull();
    expect(opcionesCredito({ moduloCredito: true, cuenta: cuenta(null), pendiente: 300, montoPagado: 0 }).aCredito).toBeNull();
    expect(opcionesCredito({ moduloCredito: true, cuenta: cuenta({ ...CREDITO, activo: false }), pendiente: 300, montoPagado: 0 }).aCredito).toBeNull();
  });
  it("con cliente con crédito aparece «A crédito», salvo si la venta ya tiene pagos", () => {
    expect(opcionesCredito({ moduloCredito: true, cuenta: cuenta(CREDITO), pendiente: 300, montoPagado: 0 }).aCredito).toEqual(CREDITO);
    expect(opcionesCredito({ moduloCredito: true, cuenta: cuenta(CREDITO), pendiente: 100, montoPagado: 200 }).aCredito).toBeNull();
  });
  it("con saldo a favor aparece «Saldo a favor», hasta lo que falta por cobrar", () => {
    expect(opcionesCredito({ moduloCredito: true, cuenta: cuenta(null, 50), pendiente: 300, montoPagado: 0 }).saldoFavor).toBe(50);
    expect(opcionesCredito({ moduloCredito: true, cuenta: cuenta(null, 500), pendiente: 300, montoPagado: 0 }).saldoFavor).toBe(300);
    expect(opcionesCredito({ moduloCredito: true, cuenta: cuenta(CREDITO, 0), pendiente: 300, montoPagado: 0 }).saldoFavor).toBe(0);
  });
});

describe("rechazos de la base", () => {
  it("reconoce cuando pide el PIN y limpia el prefijo", () => {
    const m = "DATOS_INVALIDOS: la venta pasa el límite de crédito: pide autorización.";
    expect(pideAutorizacionCredito(m)).toBe(true);
    expect(pideAutorizacionCredito("DATOS_INVALIDOS: este cliente no tiene crédito.")).toBe(false);
    expect(motivoDeLaBase(m)).toBe("la venta pasa el límite de crédito: pide autorización.");
  });
});

describe("fechaLimiteCredito", () => {
  it("suma el plazo al día de la venta en México, no en UTC", () => {
    // 2 oct 03:00 UTC = 1 oct 21:00 en México.
    expect(fechaLimiteCredito("2026-10-02T03:00:00Z", 30)).toBe("2026-10-31");
    expect(fechaLimiteCredito("2026-12-15T18:00:00Z", 30)).toBe("2027-01-14");
  });
});

describe("ventasConSaldo", () => {
  it("resta los abonos, quita las liquidadas y marca las vencidas, de la más vieja a la más nueva", () => {
    const v = ventasConSaldo(
      [
        { ticketId: "t2", folio: "F2", fecha: "2026-10-10T18:00:00Z", monto: 300 },
        { ticketId: "t1", folio: "F1", fecha: "2026-09-01T18:00:00Z", monto: 500 },
        { ticketId: "t3", folio: "F3", fecha: "2026-10-12T18:00:00Z", monto: 100 },
      ],
      [{ ticketId: "t1", monto: 200 }, { ticketId: "t1", monto: 50 }, { ticketId: "t3", monto: 100 }],
      30,
      new Date("2026-10-18T18:00:00Z"),
    );
    expect(v).toEqual([
      { ticketId: "t1", folio: "F1", fecha: "2026-09-01T18:00:00Z", saldo: 250, fechaLimite: "2026-10-01", vencida: true },
      { ticketId: "t2", folio: "F2", fecha: "2026-10-10T18:00:00Z", saldo: 300, fechaLimite: "2026-11-09", vencida: false },
    ]);
  });
});

describe("avisoAbono", () => {
  it("dice el abono y lo que queda", () => {
    expect(avisoAbono(200, 300)).toBe("Abono de $200.00 registrado. Queda por pagar $300.00.");
    expect(avisoAbono(500, 0)).toBe("Abono de $500.00 registrado. Ya no debe nada.");
    expect(avisoAbono(500, 0, 120)).toBe("Abono de $500.00 registrado. Queda por pagar $120.00.");
  });
});

describe("filtrarDeudores", () => {
  const d = (nombre: string, telefono: string | null): Deudor => ({ ...CREDITO, clienteId: nombre, nombre, telefono });
  const lista = [d("José Pérez", "4771234567"), d("Ana López", "4779990000")];
  it("busca por nombre sin acentos o por teléfono", () => {
    expect(filtrarDeudores(lista, "jose").map((x) => x.nombre)).toEqual(["José Pérez"]);
    expect(filtrarDeudores(lista, "999").map((x) => x.nombre)).toEqual(["Ana López"]);
    expect(filtrarDeudores(lista, "")).toHaveLength(2);
  });
});
