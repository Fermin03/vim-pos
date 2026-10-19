import { describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ employeeClient: () => ({}) }));

import { filasDeclarables } from "../cierre";

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
