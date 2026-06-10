import { describe, it, expect } from "vitest";
import { alertaDeMesa } from "../mesas";

const base = { estado: "OCUPADA" as const, minutosOcupada: 0, minutosSinMovimiento: 0 };

describe("B4 Café/Bar — alertas de cuentas prolongadas (Flujos §5)", () => {
  it("sin alerta en cuentas recientes y con movimiento", () => {
    expect(alertaDeMesa({ ...base, minutosOcupada: 60, minutosSinMovimiento: 30 })).toBeNull();
  });

  it(">2 h ocupada → avisar al mesero", () => {
    expect(alertaDeMesa({ ...base, minutosOcupada: 120 })).toBe("OCUPADA_2H");
    expect(alertaDeMesa({ ...base, minutosOcupada: 180 })).toBe("OCUPADA_2H");
  });

  it(">4 h ocupada → avisar al supervisor (precede a 2h)", () => {
    expect(alertaDeMesa({ ...base, minutosOcupada: 240 })).toBe("OCUPADA_4H");
    expect(alertaDeMesa({ ...base, minutosOcupada: 300, minutosSinMovimiento: 200 })).toBe("OCUPADA_4H");
  });

  it(">1 h sin pedidos nuevos → sin movimiento", () => {
    expect(alertaDeMesa({ ...base, minutosOcupada: 90, minutosSinMovimiento: 60 })).toBe("SIN_MOVIMIENTO");
  });

  it("solo aplica a mesas OCUPADAS", () => {
    expect(alertaDeMesa({ estado: "LIBRE", minutosOcupada: 500, minutosSinMovimiento: 500 })).toBeNull();
  });
});
