import { describe, it, expect } from "vitest";
import { construirTicketJob } from "../ticket-builder";
import type { DatosTicketImpresion } from "../tipos";

const DATOS: DatosTicketImpresion = {
  negocio: { nombre: "Knock-Out Burger", razonSocial: "Knock-Out SA de CV", rfc: "KOB210101AAA" },
  sucursal: { nombre: "León Centro", direccion: "Av. Insurgentes 234, Centro, León, Gto. CP 37000", telefono: "477 712 5500" },
  meta: { folio: "KC-2026-000001", fechaIso: "2026-06-03T00:14:00.000Z", cajero: "María G.", caja: "Caja 01", modoServicio: "Para llevar" },
  lineas: [
    { cantidad: 1, nombre: "Hamburguesa Clásica", totalMxn: 120, modificadores: ["Tres cuartos", "Extra queso"] },
  ],
  totales: { subtotal: 103.45, descuentos: 12, iva: 16.55, total: 108, propina: 18 },
  pagos: [{ metodo: "Efectivo", montoMxn: 126, recibidoMxn: 200, cambioMxn: 74 }],
  qrUrl: "https://factura.vimpos.mx/knockout?folio=KC-2026-000001",
  ancho: 80,
};

describe("construirTicketJob", () => {
  it("arma el PrintJob TICKET con encabezado, líneas, totales, pago y QR", () => {
    const job = construirTicketJob(DATOS);
    expect(job.tipo).toBe("TICKET");
    expect(job.ancho).toBe(80);
    expect(job.destino).toBe("CAJA");
    expect(job.abrir_cajon).toBe(false);

    // Encabezado
    expect(job.bloques[0]).toEqual({ t: "texto", valor: "Knock-Out Burger", align: "centro", size: 2, bold: true });
    // La línea aparece como fila nombre/precio
    expect(job.bloques).toContainEqual({ t: "fila", izq: "1x Hamburguesa Clásica", der: "$120.00" });
    // Modificadores como texto chico
    expect(job.bloques).toContainEqual({ t: "texto", valor: "  Tres cuartos", size: 1 });
    expect(job.bloques).toContainEqual({ t: "texto", valor: "  Extra queso", size: 1 });
    // Totales
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Subtotal", der: "$103.45" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Descuento", der: "-$12.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "IVA (16%)", der: "$16.55" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "TOTAL", der: "$108.00" });
    // Pago
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Efectivo", der: "$126.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Recibido", der: "$200.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Cambio", der: "$74.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Propina", der: "$18.00" });
    // QR + corte
    expect(job.bloques).toContainEqual({ t: "qr", valor: "https://factura.vimpos.mx/knockout?folio=KC-2026-000001" });
    expect(job.bloques[job.bloques.length - 1]).toEqual({ t: "corte" });
  });

  it("omite la línea de descuento cuando es 0", () => {
    const sinDesc = { ...DATOS, totales: { ...DATOS.totales, descuentos: 0 } };
    const job = construirTicketJob(sinDesc);
    expect(job.bloques.find((b) => b.t === "fila" && b.izq === "Descuento")).toBeUndefined();
  });

  it("omite Propina cuando es 0", () => {
    const sinProp = { ...DATOS, totales: { ...DATOS.totales, propina: 0 } };
    const job = construirTicketJob(sinProp);
    expect(job.bloques.find((b) => b.t === "fila" && b.izq === "Propina")).toBeUndefined();
  });
});
