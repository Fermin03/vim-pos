import { describe, expect, it } from "vitest";
import { agenteCallado, COLOR_ESTADO_WA, ESTADOS_LECCION, ESTADOS_WA, esUuid, etiquetaEstado, etiquetaIntento, etiquetaLeccion, etiquetaTipo } from "../whatsapp";

describe("etiquetaEstado", () => {
  it("nombra los 7 estados en palabras", () => {
    expect(ESTADOS_WA.map(etiquetaEstado)).toEqual([
      "Activa", "Prospecto caliente", "Urgente: soporte", "Duda sin respuesta", "Resuelto", "Pago pendiente", "Pago por confirmar",
    ]);
  });
  it("los estados de pago tienen color: por confirmar en ámbar, pendiente neutro", () => {
    expect(COLOR_ESTADO_WA.PAGO_POR_CONFIRMAR).toBe("bg-warning-soft text-warning");
    expect(COLOR_ESTADO_WA.PAGO_PENDIENTE).toBe("bg-sel text-ink-2");
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

describe("etiquetaLeccion / etiquetaTipo", () => {
  it("nombra los 6 estados con las aprobadas primero", () => {
    expect(ESTADOS_LECCION.map(etiquetaLeccion)).toEqual(["Aprobada", "Enviada", "Pendiente", "Descartada", "Caducada", "Retirada"]);
  });
  it("nombra los 3 tipos", () => {
    expect(["DUDA", "TONO", "PREGUNTA"].map(etiquetaTipo)).toEqual(["Duda técnica", "Tono", "Pregunta sin respuesta"]);
  });
  it("lo desconocido se enseña como llegó", () => {
    expect(etiquetaLeccion("X")).toBe("X");
    expect(etiquetaTipo("X")).toBe("X");
  });
});

describe("etiquetaIntento", () => {
  it("nombra los 3 estados del intento y deja pasar lo desconocido", () => {
    expect(["PENDIENTE", "PAGADO", "RECHAZADO", "X"].map(etiquetaIntento)).toEqual(["Pendiente", "Pagado", "Rechazado", "X"]);
  });
});
