import { describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ employeeClient: () => ({}) }));

import { resumenCambio } from "../cambio-talla";
import { fmtMxn } from "../turno";

describe("resumenCambio", () => {
  it("mismo precio: sin diferencia", () => {
    expect(resumenCambio(349, 349)).toEqual({ diferencia: 0, texto: "Sin diferencia" });
  });

  it("la nueva cuesta más: el cliente paga la diferencia", () => {
    expect(resumenCambio(349, 399)).toEqual({ diferencia: 50, texto: `El cliente paga ${fmtMxn(50)}` });
  });

  it("la nueva cuesta menos: se le regresa en efectivo", () => {
    expect(resumenCambio(349, 299)).toEqual({ diferencia: -50, texto: `Le regresas ${fmtMxn(50)} en efectivo` });
  });

  it("los centavos se redondean sin ruido del flotante", () => {
    const r = resumenCambio(349.5, 349.49);
    expect(r.diferencia).toBe(-0.01);
    expect(r.texto).toBe(`Le regresas ${fmtMxn(0.01)} en efectivo`);
    expect(resumenCambio(0.1, 0.3).diferencia).toBe(0.2);
    expect(resumenCambio(10.005, 10.005).texto).toBe("Sin diferencia");
  });
});
