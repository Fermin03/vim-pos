import { describe, it, expect } from "vitest";
import { segundosRestantes, etiquetaApp, etiquetaEstado, ordenarPedidos, idsNuevos, type PedidoApp } from "../pedidos-apps";

const base = (extra: Partial<PedidoApp>): PedidoApp => ({
  id: "x", app: "APP_UBEREATS", idExterno: "e", folioCorto: null, estado: "RECIBIDO", tipoEntrega: null, clienteNombre: null,
  notaCliente: null, items: [], totalCliente: null, venceAceptacion: null, recibidoAt: "2026-09-02T10:00:00Z", ticketId: null,
  ticketFolio: null, ultimoError: null, ...extra,
});

describe("pedidos de apps · helpers", () => {
  it("segundosRestantes cuenta hacia la ventana y nunca baja de 0", () => {
    const ahora = new Date("2026-09-02T10:00:00Z");
    expect(segundosRestantes("2026-09-02T10:11:00Z", ahora)).toBe(660);
    expect(segundosRestantes("2026-09-02T09:59:00Z", ahora)).toBe(0);
    expect(segundosRestantes(null, ahora)).toBeNull();
  });

  it("etiquetas en español", () => {
    expect(etiquetaApp("APP_UBEREATS")).toBe("Uber Eats");
    expect(etiquetaApp("APP_DIDI")).toBe("DiDi Food");
    expect(etiquetaApp("APP_RAPPI")).toBe("Rappi");
    expect(etiquetaEstado("RECIBIDO")).toBe("Por aceptar");
    expect(etiquetaEstado("ACEPTADO")).toBe("En preparación");
    expect(etiquetaEstado("LISTO")).toBe("Listo");
    expect(etiquetaEstado("EXPIRADO")).toBe("Expirado");
  });

  it("ordenarPedidos: pendientes con menos tiempo primero, luego aceptados, luego cerrados", () => {
    const p = [
      base({ id: "a", estado: "LISTO" }),
      base({ id: "b", estado: "RECIBIDO", venceAceptacion: "2026-09-02T10:11:00Z" }),
      base({ id: "c", estado: "RECIBIDO", venceAceptacion: "2026-09-02T10:05:00Z" }),
      base({ id: "d", estado: "ACEPTADO" }),
      base({ id: "e", estado: "CANCELADO" }),
    ];
    expect(ordenarPedidos(p).map((x) => x.id)).toEqual(["c", "b", "d", "a", "e"]);
  });

  it("idsNuevos detecta pedidos que no estaban", () => {
    expect(idsNuevos([base({ id: "a" })], [base({ id: "a" }), base({ id: "b" })])).toEqual(["b"]);
    expect(idsNuevos([], [])).toEqual([]);
  });
});
