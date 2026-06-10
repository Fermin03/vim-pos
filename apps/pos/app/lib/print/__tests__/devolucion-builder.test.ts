import { describe, it, expect } from "vitest";
import { construirDevolucionJob, type DatosDevolucion } from "../devolucion-builder";

const base: DatosDevolucion = {
  negocio: { nombre: "Knock-Out Burger", rfc: "XAXX010101000" },
  sucursal: { direccion: "Centro, León", telefono: null },
  folioOriginal: "A-000123",
  fechaIso: "2026-06-08T18:00:00.000Z",
  cajero: "María L.",
  caja: "Caja 1",
  autorizo: null,
  items: [{ cantidad: 1, nombre: "Hamburguesa Clásica", totalMxn: 120 }],
  motivo: "Producto defectuoso",
  medio: "Efectivo",
  totalReembolso: 120,
  ancho: 80,
};

describe("construirDevolucionJob", () => {
  it("arma un PrintJob TICKET con encabezado, reembolso y corte", () => {
    const job = construirDevolucionJob(base);
    expect(job.tipo).toBe("TICKET");
    expect(job.ancho).toBe(80);
    expect(job.bloques.some((b) => b.t === "texto" && b.valor === "COMPROBANTE DE DEVOLUCIÓN")).toBe(true);
    expect(job.bloques.some((b) => b.t === "fila" && b.izq === "REEMBOLSO" && b.der.includes("120"))).toBe(true);
    expect(job.bloques.some((b) => b.t === "fila" && b.izq === "Motivo:" && b.der === "Producto defectuoso")).toBe(true);
    expect(job.bloques.some((b) => b.t === "fila" && b.izq === "Medio:" && b.der === "Efectivo")).toBe(true);
    expect(job.bloques.at(-1)?.t).toBe("corte");
  });

  it("omite RFC y Autorizó cuando son nulos", () => {
    const job = construirDevolucionJob({ ...base, negocio: { nombre: "X", rfc: null }, autorizo: null });
    expect(job.bloques.some((b) => b.t === "texto" && b.valor.startsWith("RFC"))).toBe(false);
    expect(job.bloques.some((b) => b.t === "fila" && b.izq === "Autorizó:")).toBe(false);
  });
});
