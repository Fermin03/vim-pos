import { describe, it, expect } from "vitest";
import { conciliarItems, resumenConciliacion, type LiqItem, type TicketPos } from "../conciliacion-match";

const items: LiqItem[] = [
  { id: "i1", folioExternoApp: "R-AAA", montoVentaMxn: 150, fechaOrden: "2026-05-22T13:00:00Z" }, // folio exacto
  { id: "i2", folioExternoApp: "r-bbb ", montoVentaMxn: 200, fechaOrden: "2026-05-22T14:00:00Z" }, // folio (normalizado)
  { id: "i3", folioExternoApp: "SIN-FOLIO", montoVentaMxn: 99.99, fechaOrden: "2026-05-23T10:00:00Z" }, // por monto+fecha
  { id: "i4", folioExternoApp: "R-NADA", montoVentaMxn: 500, fechaOrden: "2026-05-24T10:00:00Z" }, // sin match
];

const tickets: TicketPos[] = [
  { id: "t1", folioExternoApp: "R-AAA", totalMxn: 150, fecha: "2026-05-22T13:01:00Z" },
  { id: "t2", folioExternoApp: "R-BBB", totalMxn: 195, fecha: "2026-05-22T14:01:00Z" }, // $5 de diferencia
  { id: "t3", folioExternoApp: null, totalMxn: 100, fecha: "2026-05-23T10:30:00Z" }, // match monto+fecha (±1)
  { id: "t5", folioExternoApp: "R-EXTRA", totalMxn: 80, fecha: "2026-05-25T10:00:00Z" }, // ticket POS que la app no reportó
];

describe("conciliación Dark Kitchen — motor de match", () => {
  const res = conciliarItems(items, tickets);

  it("empareja por folio exacto (con normalización)", () => {
    expect(res[0]).toMatchObject({ itemId: "i1", ticketId: "t1", metodo: "FOLIO_EXACTO", diferenciaMxn: 0 });
    expect(res[1]).toMatchObject({ itemId: "i2", ticketId: "t2", metodo: "FOLIO_EXACTO", diferenciaMxn: 5 });
  });

  it("empareja por monto+fecha cuando no hay folio", () => {
    expect(res[2]).toMatchObject({ itemId: "i3", ticketId: "t3", metodo: "MONTO_FECHA" });
    expect(res[2].diferenciaMxn).toBeCloseTo(-0.01, 2);
  });

  it("deja sin match lo que no coincide", () => {
    expect(res[3]).toMatchObject({ itemId: "i4", ticketId: null, metodo: null, diferenciaMxn: null });
  });

  it("no empareja un mismo ticket dos veces", () => {
    const ids = res.map((r) => r.ticketId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resumen: % match, diferencia y ticket sin liquidar", () => {
    const r = resumenConciliacion(items, tickets, res);
    expect(r.conMatch).toBe(3);
    expect(r.sinMatch).toBe(1);
    expect(r.ticketsSinLiquidar).toBe(1); // t5
    expect(r.porcentajeMatch).toBe(75);
    expect(r.totalPosMxn).toBe(445); // 150 + 195 + 100
    expect(r.estado).toBe("CONCILIADA_CON_DIFERENCIAS");
  });

  it("cuadra perfecto → CONCILIADA", () => {
    const its: LiqItem[] = [{ id: "a", folioExternoApp: "X-1", montoVentaMxn: 100, fechaOrden: "2026-05-22T10:00:00Z" }];
    const tks: TicketPos[] = [{ id: "tx", folioExternoApp: "X-1", totalMxn: 100, fecha: "2026-05-22T10:00:00Z" }];
    const rr = conciliarItems(its, tks);
    expect(resumenConciliacion(its, tks, rr).estado).toBe("CONCILIADA");
  });
});
