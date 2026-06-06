import { describe, it, expect } from "vitest";
import { construirReporteZJob, type DatosReporteZ } from "../reporte-z-builder";

const D: DatosReporteZ = {
  negocio: "Knock-Out Burger",
  razonSocial: "VIM Marketing SA de CV",
  rfc: "VIMF030828Z07",
  direccionSucursal: "Av. Universidad 101, Local 3, Lomas del Campestre, León Guanajuato, CP 37150",
  sucursal: "León Centro",
  folioZ: "Z-2026-000001",
  codigoTurno: "2026-06-04-C01-01",
  estacionCaja: "Caja 01",
  fechaApertura: "2026-06-04T14:00:00.000Z",
  fechaCierre: "2026-06-04T23:30:00.000Z",
  cajero: "María G.", caja: "Caja 01",
  efectivoInicial: 500, ventasEfectivo: 11230, ventasTarjeta: 12780, ventasVales: 0, ventasOtros: 0,
  depositosEfectivo: 0, retirosEfectivo: 0, propinasPagadas: 0,
  pagosPorMetodo: [
    { metodo: "EFECTIVO", total: 11230, cantidad: 60 },
    { metodo: "VISA", total: 12780, cantidad: 27 },
  ],
  pagosPropinaPorMetodo: [
    { metodo: "EFECTIVO", total: 900 },
  ],
  ventaPorModoServicio: [
    { modo: "PARA LLEVAR", total: 24010, cantidad: 87, porcentaje: 100 },
  ],
  ventaNeta: 24010, iva: 3310, descuentos: 420, propinaTotal: 900,
  ticketsPagados: 87, ticketsEmitidos: 90, ticketsCancelados: 2,
  cuentasConDescuento: 5, comensales: 87, ticketPromedio: 276,
  folioInicial: "K-2026-000050", folioFinal: "K-2026-000136",
  devolucionesCantidad: 1, devolucionesMonto: 485,
  propinasDistribuidas: [
    { nombre: "María G. (cajero)", monto: 900 },
  ],
  declaracionPorMetodo: [
    { metodo: "EFECTIVO", declarado: 11230 },
    { metodo: "VISA", declarado: 12780 },
  ],
  totalDeclarado: 24010,
  efectivoEsperado: 11230, efectivoDeclarado: 11230, diferenciaEfectivo: 0, diferenciaTotal: 0,
  sello: "7f3a9c2e1b48",
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
    expect(job.bloques).toContainEqual({ t: "fila", izq: "EFECTIVO", der: "$11,230.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Efectivo esperado", der: "$11,230.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Diferencia", der: "$0.00" });
    expect(job.bloques[job.bloques.length - 1]).toEqual({ t: "corte" });
  });

  it("formatea una diferencia negativa (faltante)", () => {
    const job = construirReporteZJob({ ...D, diferenciaEfectivo: -50 });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Diferencia", der: "-$50.00" });
  });
});
