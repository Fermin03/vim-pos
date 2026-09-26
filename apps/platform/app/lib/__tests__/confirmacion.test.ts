import { describe, it, expect } from "vitest";
import { evaluarConfirmacion } from "../confirmacion";

const base = { nombreEsperado: "Knock-Out Burger", nombreEscrito: "Knock-Out Burger", motivo: "Pago vencido desde agosto" };

describe("evaluarConfirmacion", () => {
  it("acepta nombre exacto y motivo suficiente", () => {
    expect(evaluarConfirmacion(base)).toEqual({ ok: true, faltantes: [] });
  });
  it("el nombre se compara sin distinguir mayúsculas ni espacios sobrantes", () => {
    expect(evaluarConfirmacion({ ...base, nombreEscrito: "  knock-out burger " }).ok).toBe(true);
  });
  it("rechaza nombre distinto", () => {
    const r = evaluarConfirmacion({ ...base, nombreEscrito: "Knockout" });
    expect(r.ok).toBe(false);
    expect(r.faltantes).toContain("nombre");
  });
  it("exige motivo de al menos 10 caracteres", () => {
    expect(evaluarConfirmacion({ ...base, motivo: "corto" }).faltantes).toContain("motivo");
  });
  it("si pide gracia, exige entero >= 1", () => {
    expect(evaluarConfirmacion({ ...base, requiereGracia: true, graciaDias: 0 }).faltantes).toContain("gracia");
    expect(evaluarConfirmacion({ ...base, requiereGracia: true, graciaDias: 3 }).ok).toBe(true);
  });
  it("si pide la casilla, exige marcarla", () => {
    expect(evaluarConfirmacion({ ...base, requiereEntiendo: true, entiendo: false }).faltantes).toContain("entiendo");
    expect(evaluarConfirmacion({ ...base, requiereEntiendo: true, entiendo: true }).ok).toBe(true);
  });
  it("con requiereNombre: false basta el motivo (fricción para lo reversible de un solo cliente)", () => {
    expect(evaluarConfirmacion({ ...base, requiereNombre: false, nombreEscrito: "" }).ok).toBe(true);
    expect(evaluarConfirmacion({ ...base, requiereNombre: false, nombreEscrito: "", motivo: "corto" }).faltantes).toEqual(["motivo"]);
  });
});
