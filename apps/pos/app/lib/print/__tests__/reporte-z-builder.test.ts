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
  it("arma el PrintJob del corte Z — idéntico en contenido a ReciboZ (formato Soft Restaurant)", () => {
    const job = construirReporteZJob(D);
    expect(job.tipo).toBe("TICKET");

    // 1) Encabezado fiscal
    expect(job.bloques[0]).toEqual({ t: "texto", valor: "KNOCK-OUT BURGER", bold: true, size: 1 });
    expect(job.bloques).toContainEqual({ t: "texto", valor: `RFC: ${D.rfc}` });

    // 2) Identificación
    expect(job.bloques).toContainEqual({ t: "texto", valor: "CORTE DE CAJA Z", align: "centro", bold: true, size: 1 });

    // 3) CAJA — flujo de efectivo
    expect(job.bloques).toContainEqual({ t: "fila", izq: "+EFECTIVO:", der: "$11,230.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "=SALDO FINAL:", der: "$11,730.00", bold: true });

    // 4) FORMA DE PAGO VENTAS
    expect(job.bloques).toContainEqual({ t: "fila", izq: "EFECTIVO:", der: "$11,230.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "VISA:", der: "$12,780.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "TOTAL FORMAS DE PAGO", der: "$24,010.00", bold: true });

    // 6) Venta neta / IVA
    expect(job.bloques).toContainEqual({ t: "fila", izq: "VENTA NETA  :", der: "$24,010.00", bold: true });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "IMPUESTO 16%:", der: "$3,310.00" });

    // 9) Declaración de cajero + arqueo
    expect(job.bloques).toContainEqual({ t: "fila", izq: "TOTAL:", der: "$24,010.00", bold: true });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "SOBRANTE(+) O FALTANTE(-):", der: "$0.00", bold: true });

    // 11) Sello inmutable
    expect(job.bloques).toContainEqual({ t: "texto", valor: `Folio Z: ${D.folioZ}`, align: "centro" });
    expect(job.bloques).toContainEqual({ t: "texto", valor: `SHA: ${D.sello}`, align: "centro", size: 1 });

    expect(job.bloques[job.bloques.length - 1]).toEqual({ t: "corte" });
  });

  it("formatea una diferencia negativa (faltante)", () => {
    const job = construirReporteZJob({ ...D, diferenciaTotal: -50 });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "SOBRANTE(+) O FALTANTE(-):", der: "-$50.00", bold: true });
  });

  it("omite la sección VENTA RAPIDA POR TIPO cuando ningún modo la dispara", () => {
    const sinRapida = { ...D, ventaPorModoServicio: [{ modo: "COMER AQUI", total: 24010, cantidad: 87, porcentaje: 100 }] };
    const job = construirReporteZJob(sinRapida);
    expect(job.bloques.find((b) => b.t === "texto" && b.valor === "VENTA RAPIDA POR TIPO")).toBeUndefined();
  });

  it("incluye la sección DEVOLUCIONES solo cuando hay devoluciones", () => {
    const sinDevs = { ...D, devolucionesCantidad: 0, devolucionesMonto: 0 };
    const job = construirReporteZJob(sinDevs);
    expect(job.bloques.find((b) => b.t === "texto" && b.valor === "DEVOLUCIONES")).toBeUndefined();
  });
});
