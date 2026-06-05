import { describe, it, expect } from "vitest";
import { construirComandaJob, type DatosComanda } from "../comanda-builder";

const D: DatosComanda = {
  folio: "KC-2026-000001",
  modoServicio: "PARA LLEVAR",
  cajero: "María G.",
  caja: "Caja 01",
  fechaIso: "2026-06-04T14:32:00.000Z",
  lineas: [
    { cantidad: 1, nombre: "Hamburguesa Clásica", modificadores: ["Tres cuartos", "Extra queso"], notaCocina: "Sin cebolla" },
    { cantidad: 2, nombre: "Papas Gajo", modificadores: [], notaCocina: null },
  ],
  ancho: 80,
};

describe("construirComandaJob", () => {
  it("arma el PrintJob de la comanda (encabezado, líneas grandes, modificadores, nota, sin precios)", () => {
    const job = construirComandaJob(D);
    expect(job.tipo).toBe("TICKET");
    expect(job.ancho).toBe(80);

    // Encabezado: COMANDA + modo + orden + hora
    expect(job.bloques).toContainEqual({ t: "texto", valor: "COMANDA", align: "centro", size: 3, bold: true });
    expect(job.bloques).toContainEqual({ t: "texto", valor: "PARA LLEVAR", align: "centro", size: 2, bold: true });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Orden", der: "KC-2026-000001" });

    // Líneas grandes con cantidad+nombre
    expect(job.bloques).toContainEqual({ t: "texto", valor: "1x Hamburguesa Clásica", size: 2, bold: true });
    expect(job.bloques).toContainEqual({ t: "texto", valor: "2x Papas Gajo", size: 2, bold: true });

    // Modificadores indentados (sin precios)
    expect(job.bloques).toContainEqual({ t: "texto", valor: "  - Tres cuartos", size: 1 });
    expect(job.bloques).toContainEqual({ t: "texto", valor: "  - Extra queso", size: 1 });

    // Nota cocina prominente
    expect(job.bloques).toContainEqual({ t: "texto", valor: "  Nota: Sin cebolla", size: 1, bold: true });

    // Pie con cajero
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Cajero", der: "María G." });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Caja", der: "Caja 01" });

    // SIN precios, SIN QR, SIN totales
    expect(job.bloques.find((b) => b.t === "qr")).toBeUndefined();
    expect(job.bloques.find((b) => b.t === "fila" && /TOTAL|Subtotal|IVA/.test(b.izq))).toBeUndefined();
    expect(job.bloques.find((b) => b.t === "texto" && /\$/.test(b.valor))).toBeUndefined();

    // Termina con corte
    expect(job.bloques[job.bloques.length - 1]).toEqual({ t: "corte" });
  });

  it("omite la línea de nota cuando no hay nota", () => {
    const sinNota: DatosComanda = { ...D, lineas: [{ cantidad: 1, nombre: "X", modificadores: [], notaCocina: null }] };
    const job = construirComandaJob(sinNota);
    expect(job.bloques.find((b) => b.t === "texto" && b.valor.startsWith("  Nota:"))).toBeUndefined();
  });
});
