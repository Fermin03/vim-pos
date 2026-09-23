import { describe, expect, it } from "vitest";
import { previewDescuento } from "../descuento";

/**
 * La vista previa del descuento de ticket tiene que decir lo mismo que la base.
 *
 * El envío no admite descuentos (spec zonas de envío §3, ADR 0017): `aplicar_descuento_manual`
 * calcula sobre la comida. Si la caja calculara sobre el total con envío, el cajero vería
 * "−$27.50" y la base aplicaría "−$24.00": el cliente oye un número y paga otro.
 *
 * Ticket de ejemplo: $240 de comida + $35 de envío = $275.
 */
describe("previewDescuento con envío", () => {
  it("el 10% se calcula sobre la comida, no sobre el envío", () => {
    expect(previewDescuento("PORCENTAJE", 10, 275, 35)).toBe(24);
  });

  it("la cortesía total regala la comida y deja el envío", () => {
    expect(previewDescuento("CORTESIA_TOTAL", 0, 275, 35)).toBe(240);
  });

  it("un monto fijo mayor que la comida se topa en la comida", () => {
    expect(previewDescuento("MONTO_FIJO", 300, 275, 35)).toBe(240);
  });

  it("sin envío se comporta como siempre", () => {
    expect(previewDescuento("PORCENTAJE", 10, 240)).toBe(24);
    expect(previewDescuento("CORTESIA_TOTAL", 0, 240)).toBe(240);
    expect(previewDescuento("MONTO_FIJO", 300, 240)).toBe(240);
    expect(previewDescuento("OVERRIDE_PRECIO", 100, 120)).toBe(20);
  });

  it("un ticket que solo trae envío no tiene nada que descontar", () => {
    expect(previewDescuento("PORCENTAJE", 10, 35, 35)).toBe(0);
    expect(previewDescuento("CORTESIA_TOTAL", 0, 35, 35)).toBe(0);
  });
});
