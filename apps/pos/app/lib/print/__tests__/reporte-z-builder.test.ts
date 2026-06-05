import { describe, it, expect } from "vitest";
import { construirReporteZJob, type DatosReporteZ } from "../reporte-z-builder";

const D: DatosReporteZ = {
  negocio: "Knock-Out Burger", sucursal: "León Centro",
  folioZ: "Z-2026-000001", fechaCierre: "2026-06-04T23:30:00.000Z",
  cajero: "María G.", caja: "Caja 01",
  ticketsPagados: 87, ventaNeta: 24010, iva: 3310, descuentos: 420, propinaTotal: 900,
  pagosPorMetodo: [
    { metodo: "Efectivo", total: 11230, cantidad: 60 },
    { metodo: "Tarjeta de débito", total: 12780, cantidad: 27 },
  ],
  efectivoEsperado: 11230, efectivoDeclarado: 11230, diferenciaEfectivo: 0,
  ancho: 80,
};

describe("construirReporteZJob", () => {
  it("arma el PrintJob del corte Z", () => {
    const job = construirReporteZJob(D);
    expect(job.tipo).toBe("TICKET");
    expect(job.bloques[0]).toEqual({ t: "texto", valor: "Knock-Out Burger", align: "centro", size: 2, bold: true });
    expect(job.bloques).toContainEqual({ t: "texto", valor: "CORTE Z", align: "centro", size: 2, bold: true });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Folio Z", der: "Z-2026-000001" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Venta neta", der: "$24,010.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Efectivo", der: "$11,230.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Efectivo esperado", der: "$11,230.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Diferencia", der: "$0.00" });
    expect(job.bloques[job.bloques.length - 1]).toEqual({ t: "corte" });
  });

  it("formatea una diferencia negativa (faltante)", () => {
    const job = construirReporteZJob({ ...D, diferenciaEfectivo: -50 });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Diferencia", der: "-$50.00" });
  });
});
