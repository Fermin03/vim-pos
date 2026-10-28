import { describe, expect, it } from "vitest";
import { agenteCallado, ESTADOS_WA, esUuid, etiquetaEstado } from "../whatsapp";

describe("etiquetaEstado", () => {
  it("nombra los 5 estados en palabras", () => {
    expect(ESTADOS_WA.map(etiquetaEstado)).toEqual([
      "Activa", "Prospecto caliente", "Urgente: soporte", "Duda sin respuesta", "Resuelto",
    ]);
  });
  it("lo desconocido se enseña como llegó", () => {
    expect(etiquetaEstado("OTRO")).toBe("OTRO");
  });
});

describe("agenteCallado", () => {
  const ahora = new Date("2026-10-27T15:00:00Z");
  it("sin pausa, el agente habla", () => expect(agenteCallado(null, ahora)).toBe(false));
  it("pausa en el futuro: callado", () => expect(agenteCallado("2026-10-27T16:00:00Z", ahora)).toBe(true));
  it("pausa vencida: habla", () => expect(agenteCallado("2026-10-27T14:00:00Z", ahora)).toBe(false));
});

describe("esUuid", () => {
  it("acepta un uuid", () => expect(esUuid("3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b")).toBe(true));
  it("rechaza lo que no lo es", () => {
    expect(esUuid("abc")).toBe(false);
    expect(esUuid("")).toBe(false);
  });
});
