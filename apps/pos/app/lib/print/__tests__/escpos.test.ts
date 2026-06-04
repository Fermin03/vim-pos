import { describe, it, expect } from "vitest";
import { jobAEscpos } from "../escpos";
import type { PrintJob } from "../tipos";

/** Decodifica los bytes a string latin1 para inspeccionar secuencias de control. */
const txt = (bytes: Uint8Array) => String.fromCharCode(...bytes);

const JOB: PrintJob = {
  tipo: "TICKET", ancho: 80, destino: "CAJA", abrir_cajon: false,
  bloques: [
    { t: "texto", valor: "Knock-Out Burger", align: "centro", size: 2, bold: true },
    { t: "fila", izq: "Subtotal", der: "$103.45" },
    { t: "separador", estilo: "punteado" },
    { t: "qr", valor: "https://x.mx?f=1" },
    { t: "corte" },
  ],
};

describe("jobAEscpos", () => {
  it("inicializa con ESC @", () => {
    const out = jobAEscpos(JOB);
    expect(out[0]).toBe(0x1b);
    expect(out[1]).toBe(0x40);
  });

  it("centra y agranda el encabezado (ESC a 1, GS ! 0x11, ESC E 1)", () => {
    const s = txt(jobAEscpos(JOB));
    expect(s).toContain("\x1b\x61\x01"); // align centro
    expect(s).toContain("\x1d\x21\x11"); // size 2 (doble alto+ancho)
    expect(s).toContain("\x1b\x45\x01"); // bold on
    expect(s).toContain("Knock-Out Burger");
  });

  it("la fila queda justificada a 48 columnas", () => {
    const s = txt(jobAEscpos(JOB));
    const linea = s.split("\n").find((l) => l.startsWith("Subtotal"));
    expect(linea).toBeDefined();
    expect(linea!.length).toBe(48);
    expect(linea!.endsWith("$103.45")).toBe(true);
  });

  it("emite el QR (GS ( k) y termina con corte (GS V)", () => {
    const s = txt(jobAEscpos(JOB));
    expect(s).toContain("\x1d\x28\x6b"); // GS ( k  (QR)
    const out = jobAEscpos(JOB);
    expect(out[out.length - 4]).toBe(0x1d); // GS
    expect(out[out.length - 3]).toBe(0x56); // V
  });

  it("translitera acentos a ASCII", () => {
    const j: PrintJob = { ...JOB, bloques: [{ t: "texto", valor: "Cocción ñ á" }] };
    const s = txt(jobAEscpos(j));
    expect(s).toContain("Coccion n a");
  });
});
