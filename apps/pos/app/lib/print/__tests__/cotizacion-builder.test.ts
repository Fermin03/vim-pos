import { describe, it, expect } from "vitest";
import { construirCotizacionJob } from "../cotizacion-builder";
import type { Cotizacion } from "../../cotizaciones";

const cot: Cotizacion = {
  id: "c1", folio: "COT-A-000012", estado: "VIGENTE", creadaIso: "2026-10-18T18:00:00.000Z", vigenteHasta: "2026-11-02", token: "t",
  cliente: { clienteId: "x", nombre: "Ana López", telefono: null },
  items: [
    { productoId: "j", nombre: "Jitomate", sku: null, cantidad: 1.25, precioUnitario: 28, unidadSat: "KGM", total: 35 },
    { productoId: "p", nombre: "Playera", sku: null, cantidad: 2, precioUnitario: 150, unidadSat: "H87", total: 300 },
  ],
  subtotal: 288.79, iva: 46.21, total: 335,
};
const enc = { negocio: "Tenis Union", rfc: "XAXX010101000", direccion: "Centro, León", telefono: null };
const textos = (job: ReturnType<typeof construirCotizacionJob>) => job.bloques.map((b) => (b.t === "texto" ? b.valor : b.t === "fila" ? `${b.izq}|${b.der}` : b.t));

describe("construirCotizacionJob", () => {
  it("encabezado, COTIZACIÓN, folio, vigencia, cliente, renglones con unidad y totales", () => {
    const t = textos(construirCotizacionJob(cot, enc, 80));
    expect(t[0]).toBe("Tenis Union");
    expect(t).toContain("COTIZACIÓN");
    expect(t).toContain("Folio:|COT-A-000012");
    expect(t).toContain("Válida hasta:|02/11/2026");
    expect(t).toContain("Cliente:|Ana López");
    expect(t).toContain("1.250 kg Jitomate|$35.00");
    expect(t).toContain("   $28.00/kg");
    expect(t).toContain("2x Playera|$300.00");
    expect(t).toContain("Subtotal|$288.79");
    expect(t).toContain("IVA|$46.21");
    expect(t).toContain("TOTAL|$335.00");
    expect(t).toContain("Precios sujetos a cambio después de la vigencia.");
    expect(t.at(-1)).toBe("corte");
  });

  it("sin pagos, QR ni lealtad; sin cliente no hay renglón de cliente", () => {
    const job = construirCotizacionJob({ ...cot, cliente: null }, enc, 58);
    expect(job.ancho).toBe(58);
    expect(job.abrir_cajon).toBeUndefined();
    expect(job.bloques.some((b) => b.t === "qr")).toBe(false);
    const t = textos(job).join("\n");
    for (const x of ["Cliente:", "Efectivo", "Cambio", "Pago", "Puntos", "Factura"]) expect(t).not.toContain(x);
  });
});
