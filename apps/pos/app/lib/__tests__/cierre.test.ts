import { describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ employeeClient: () => ({}) }));

import { filasAnticipos, filasDeclarables } from "../cierre";

describe("filasDeclarables", () => {
  it("el efectivo va primero y CREDITO / SALDO_FAVOR no se declaran; los abonos con tarjeta sí", () => {
    const filas = filasDeclarables({
      efectivoEsperado: 1500,
      pagosPorMetodo: [
        { metodo: "CREDITO", total: 800, cantidad: 2 },
        { metodo: "EFECTIVO", total: 900, cantidad: 4 },
        { metodo: "SALDO_FAVOR", total: 50, cantidad: 1 },
        { metodo: "TARJETA_DEBITO", total: 300, cantidad: 2 },
      ],
    });
    expect(filas).toEqual([
      { metodo: "EFECTIVO", esperado: 1500 },
      { metodo: "TARJETA_DEBITO", esperado: 300 },
    ]);
  });
});

describe("anticipos en el corte", () => {
  it("ANTICIPO no se declara aunque llegara en pagos_por_metodo", () => {
    const filas = filasDeclarables({
      efectivoEsperado: 700,
      pagosPorMetodo: [
        { metodo: "ANTICIPO", total: 390, cantidad: 1 },
        { metodo: "TRANSFERENCIA", total: 200, cantidad: 1 },
      ],
    });
    expect(filas.map((f) => f.metodo)).toEqual(["EFECTIVO", "TRANSFERENCIA"]);
  });

  it("las cuatro cifras informativas, con sus textos, también en $0", () => {
    expect(filasAnticipos({ anticiposRecibidos: 200, pagadoConAnticipo: 390, anticiposDevueltos: 150, anticiposRetenidos: 100 })).toEqual([
      { l: "Anticipos recibidos", v: 200 },
      { l: "Pagado con anticipo", v: 390 },
      { l: "Anticipos devueltos", v: 150 },
      { l: "Anticipos retenidos (no reembolsables)", v: 100 },
    ]);
    expect(filasAnticipos({ anticiposRecibidos: 0, pagadoConAnticipo: 0, anticiposDevueltos: 0, anticiposRetenidos: 0 })).toEqual([
      { l: "Anticipos recibidos", v: 0 },
      { l: "Pagado con anticipo", v: 0 },
      { l: "Anticipos devueltos", v: 0 },
      { l: "Anticipos retenidos (no reembolsables)", v: 0 },
    ]);
  });
});
