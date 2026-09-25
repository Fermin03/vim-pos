import { describe, it, expect } from "vitest";
import { resumirCaja, serieHoraria } from "../dashboard-calculos";

describe("serieHoraria — eje continuo en orden del día contable", () => {
  it("rellena con ceros las horas sin venta entre la primera y la última", () => {
    const s = serieHoraria(new Map([[13, 500], [15, 200], [18, 900]]), 3);
    expect(s.map((p) => p.hora)).toEqual([13, 14, 15, 16, 17, 18]);
    expect(s.find((p) => p.hora === 16)?.total).toBe(0);
  });

  it("las ventas después de medianoche van al FINAL, no antes del mediodía", () => {
    const s = serieHoraria(new Map([[1, 300], [20, 1000], [23, 400]]), 3);
    expect(s.map((p) => p.hora)).toEqual([20, 21, 22, 23, 0, 1]);
  });

  it("sin ventas no hay serie", () => {
    expect(serieHoraria(new Map(), 3)).toEqual([]);
    expect(serieHoraria(new Map([[12, 0]]), 3)).toEqual([]);
  });
});

describe("resumirCaja — ¿cuadró?", () => {
  it("suma las diferencias de los turnos cerrados con su signo", () => {
    const r = resumirCaja([
      { estado: "CERRADO", diferencia: -50 },
      { estado: "PENDIENTE_VALIDACION", diferencia: 20 },
      { estado: "ABIERTO", diferencia: null },
    ]);
    expect(r).toEqual({ cerrados: 2, abiertos: 1, diferenciaNeta: -30, conDiferencia: 2 });
  });

  it("todo cuadrado: diferencia cero y ningún turno con diferencia", () => {
    expect(resumirCaja([{ estado: "CERRADO", diferencia: 0 }, { estado: "CERRADO", diferencia: 0.001 }])).toEqual({
      cerrados: 2, abiertos: 0, diferenciaNeta: 0, conDiferencia: 0,
    });
  });
});
