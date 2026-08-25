import { describe, expect, it } from "vitest";
import { evaluarFolios, type SaldoFolios } from "../folios";

const saldo = (base: number, paquetes: number): SaldoFolios => ({
  baseRestante: base,
  paquetes,
  total: base + paquetes,
});

describe("evaluarFolios", () => {
  it("con saldo holgado solo muestra el número", () => {
    expect(evaluarFolios(saldo(50, 200))).toEqual({ nivel: "ok", texto: "250 folios" });
  });

  it("avisa cuando quedan pocos, con margen para reaccionar", () => {
    // El umbral es alto a propósito: reponer folios implica avisar, pagar y esperar acreditación.
    expect(evaluarFolios(saldo(0, 25)).nivel).toBe("pocos");
    expect(evaluarFolios(saldo(0, 26)).nivel).toBe("ok");
  });

  it("distingue el singular", () => {
    expect(evaluarFolios(saldo(0, 1)).texto).toBe("Queda 1 folio");
  });

  it("marca agotados cuando no queda ninguno", () => {
    expect(evaluarFolios(saldo(0, 0))).toEqual({ nivel: "agotados", texto: "Sin folios para facturar" });
  });

  it("suma la base mensual y los paquetes", () => {
    // Son dos bolsas distintas y el cajero solo necesita saber cuántas facturas puede emitir.
    expect(evaluarFolios(saldo(30, 5)).texto).toBe("35 folios");
  });

  it("acepta un umbral distinto", () => {
    expect(evaluarFolios(saldo(0, 40), 50).nivel).toBe("pocos");
  });
});
