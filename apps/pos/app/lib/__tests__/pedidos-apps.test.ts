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

// ── Tienda de Uber y expirados (spec A6) ─────────────────────────────────────
import { beforeAll } from "vitest";
import { etiquetaTienda, hayExpiradosSinVer, marcarExpiradosVistos, mensajeErrorTienda, OPCIONES_PAUSA, horaCorta } from "../pedidos-apps";

describe("tienda de Uber · helpers", () => {
  beforeAll(() => {
    const mapa = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: { getItem: (k: string) => mapa.get(k) ?? null, setItem: (k: string, v: string) => { mapa.set(k, v); }, removeItem: (k: string) => { mapa.delete(k); }, clear: () => mapa.clear() },
      configurable: true,
    });
  });

  it("etiquetaTienda: en línea, pausada hasta HH:mm en hora de León, sin datos", () => {
    const base = { hasta: null, motivo: null, consultado_at: "2026-09-02T18:10:00Z" };
    expect(etiquetaTienda({ ...base, estado: "EN_LINEA" })).toBe("Uber: en línea");
    expect(etiquetaTienda({ ...base, estado: "PAUSADA", hasta: "2026-09-02T18:40:00Z" })).toBe("Uber: pausada hasta 12:40");
    expect(etiquetaTienda({ ...base, estado: "PAUSADA" })).toBe("Uber: pausada");
    expect(etiquetaTienda({ ...base, estado: "DESCONOCIDO" })).toBe("Uber: sin datos");
    expect(etiquetaTienda(null)).toBe("Uber: sin datos");
    expect(horaCorta("no-es-fecha")).toBeNull();
  });

  it("hayExpiradosSinVer: solo si hay expirados posteriores a lo último visto en este dispositivo", () => {
    localStorage.clear();
    expect(hayExpiradosSinVer(null)).toBe(false);
    expect(hayExpiradosSinVer("2026-09-02T18:00:00Z")).toBe(true);
    marcarExpiradosVistos("2026-09-02T18:00:00Z");
    expect(hayExpiradosSinVer("2026-09-02T18:00:00Z")).toBe(false);
    expect(hayExpiradosSinVer("2026-09-02T18:05:00Z")).toBe(true);
  });

  it("mensajes y opciones de pausa", () => {
    expect(mensajeErrorTienda("TIENDA_ESTRATEGIA_UBER")).toMatch(/Uber Eats Manager/);
    expect(mensajeErrorTienda("SIN_CONEXION_UBER")).toMatch(/no tiene conectada/);
    expect(mensajeErrorTienda("PREP_FUERA_DE_RANGO")).toMatch(/1 y 180/);
    expect(OPCIONES_PAUSA.map((o) => o.codigo)).toEqual(["30m", "1h", "dia"]);
  });
});
