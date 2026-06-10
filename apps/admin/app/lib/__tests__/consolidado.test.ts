import { describe, it, expect } from "vitest";
import { consolidarFilas } from "../consolidado";

const nombres = new Map([
  ["s1", "León Centro"],
  ["s2", "León Norte"],
]);

// Dos días de s1 + un día de s2 (filas de vw_estado_resultados_dia)
const filas = [
  { sucursal_id: "s1", tickets_completados: 10, tickets_cancelados: 1, total_neto_mxn: 1000, propinas_capturadas_mxn: 50, descuentos_manuales_mxn: 20, devoluciones_mxn: 0 },
  { sucursal_id: "s1", tickets_completados: 20, tickets_cancelados: 0, total_neto_mxn: 2000, propinas_capturadas_mxn: 100, descuentos_manuales_mxn: 0, devoluciones_mxn: 30 },
  { sucursal_id: "s2", tickets_completados: 10, tickets_cancelados: 2, total_neto_mxn: 1000, propinas_capturadas_mxn: 25, descuentos_manuales_mxn: 10, devoluciones_mxn: 0 },
];

describe("B5 Enterprise — consolidado por sucursal", () => {
  const c = consolidarFilas(filas, nombres);

  it("agrega los días de cada sucursal y ordena por venta", () => {
    expect(c.filas.map((f) => f.sucursal)).toEqual(["León Centro", "León Norte"]);
    expect(c.filas[0]).toMatchObject({ tickets: 30, cancelados: 1, venta: 3000, propinas: 150, devoluciones: 30 });
    expect(c.filas[1]).toMatchObject({ tickets: 10, venta: 1000 });
  });

  it("calcula ticket promedio y participación por sucursal", () => {
    expect(c.filas[0].ticketPromedio).toBe(100); // 3000/30
    expect(c.filas[0].participacionPct).toBe(75); // 3000/4000
    expect(c.filas[1].participacionPct).toBe(25);
  });

  it("fila total consolida el tenant completo", () => {
    expect(c.total).toMatchObject({ tickets: 40, venta: 4000, ticketPromedio: 100, propinas: 175, descuentos: 30 });
  });

  it("sin datos → vacío sin dividir por cero", () => {
    const v = consolidarFilas([], nombres);
    expect(v.filas).toEqual([]);
    expect(v.total.venta).toBe(0);
    expect(v.total.ticketPromedio).toBe(0);
  });
});
