import { describe, expect, it } from "vitest";
import { redondearCentavos } from "../dinero";
import { previewDescuento } from "../descuento";
import { calcularTotalesDisplay, precioUnitarioLinea, type LineaCarrito } from "../carrito";
import type { Producto } from "../catalogo";

// Auditoría integral 30/09/2026 — B2-7: el redondeo del cliente debe dar lo mismo que
// round(x, 2) de Postgres sobre numeric (mitades alejándose del cero).

describe("redondearCentavos", () => {
  it("redondea los medios centavos como Postgres (1.005 → 1.01, no 1.00)", () => {
    expect(Math.round(1.005 * 100) / 100).toBe(1); // el bug: así redondeaba antes
    expect(redondearCentavos(1.005)).toBe(1.01);
    expect(redondearCentavos(2.675)).toBe(2.68);
    expect(redondearCentavos(1.045)).toBe(1.05);
    expect(redondearCentavos(8.345)).toBe(8.35);
  });

  it("los negativos se alejan del cero, como numeric", () => {
    expect(redondearCentavos(-1.005)).toBe(-1.01);
    expect(redondearCentavos(-0.005)).toBe(-0.01);
  });

  it("limpia el ruido binario y no produce -0", () => {
    expect(redondearCentavos(0.1 + 0.2)).toBe(0.3);
    expect(Object.is(redondearCentavos(-0.001), 0)).toBe(true);
    expect(redondearCentavos(149.999999999)).toBe(150);
  });

  it("deja intactos los montos que ya están en centavos", () => {
    for (const n of [0, 1, 49.5, 116, 1234.56, 99999.99]) expect(redondearCentavos(n)).toBe(n);
  });
});

describe("los que lo usan", () => {
  it("previewDescuento: 10% de 10.05 = 1.005 → 1.01 (lo que cobra la base)", () => {
    expect(previewDescuento("PORCENTAJE", 10, 10.05)).toBe(1.01);
  });

  it("carrito: un precio con medio centavo redondea como la base", () => {
    const producto = { id: "p", nombre: "X", descripcion: null, precio_base_mxn: 1.005, categoria_id: "c", agotado: false } as unknown as Producto;
    const l: LineaCarrito = { clientId: "l", producto, cantidad: 1, modificadores: [], notaCocina: null };
    expect(precioUnitarioLinea(l)).toBe(1.01);
    expect(calcularTotalesDisplay([l]).total).toBe(1.01);
  });
});
