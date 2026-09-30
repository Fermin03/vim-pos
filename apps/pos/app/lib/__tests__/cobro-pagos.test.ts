import { describe, expect, it, vi } from "vitest";
import { aplicarPagosEnOrden, pagoEntroPeseAlError, ventaQuedoPagada, type PagoPorAplicar } from "../cobro-pagos";
import type { TotalesTicket } from "../cobro";

// Auditoría integral 30/09/2026 — B2-1 (propina en cobro dividido) y B2-2 (reintentos del cobro).

const tot = (over: Partial<TotalesTicket> = {}): TotalesTicket => ({
  ticketId: "t1", subtotal: 0, iva: 0, descuentos: 0, promociones: 0,
  total: 300, montoPagado: 0, cambio: 0, pendiente: 300, estadoFiscal: "ABIERTO", folio: null,
  ...over,
});

const lista: PagoPorAplicar[] = [
  { clientId: "p1", metodo: "EFECTIVO", monto: 100 },
  { clientId: "p2", metodo: "TARJETA_DEBITO", monto: 100 },
  { clientId: "p3", metodo: "TRANSFERENCIA", monto: 100 },
];

/**
 * Doble de la RPC aplicar_pago con la idempotencia de la base: un `client_id_local` repetido NO
 * vuelve a cobrar. `fallaUnaVez` hace que ese pago truene la primera vez (sin aplicarse).
 */
function bdFalsa(fallaUnaVez: string | null) {
  const cobrados = new Map<string, PagoPorAplicar>();
  let fallo = false;
  const aplicar = vi.fn(async (p: PagoPorAplicar) => {
    if (p.clientId === fallaUnaVez && !fallo) { fallo = true; throw new Error("red caída"); }
    if (!cobrados.has(p.clientId)) cobrados.set(p.clientId, p);
    return estado();
  });
  const estado = () => {
    const pagado = [...cobrados.values()].reduce((s, p) => s + p.monto, 0);
    return tot({ montoPagado: pagado, pendiente: 300 - pagado, estadoFiscal: pagado >= 300 ? "PAGADO" : "ABIERTO" });
  };
  return { cobrados, aplicar, releer: vi.fn(async () => estado()) };
}

describe("aplicarPagosEnOrden — B2-2", () => {
  it("si el pago 2 de 3 falla, se detiene, relee totales y dice cuáles entraron", async () => {
    const bd = bdFalsa("p2");
    const r = await aplicarPagosEnOrden(lista, bd.aplicar, bd.releer);
    expect(r.aplicados).toEqual(["p1"]);
    expect(r.error).toBeInstanceOf(Error);
    expect(bd.releer).toHaveBeenCalledTimes(1);
    expect(r.totales?.montoPagado).toBe(100);
    expect(bd.aplicar).toHaveBeenCalledTimes(2); // el 3 no se intentó
  });

  it("el reintento (lista podada de lo que entró) no duplica pagos ni corre los métodos", async () => {
    const bd = bdFalsa("p2");
    const r1 = await aplicarPagosEnOrden(lista, bd.aplicar, bd.releer);
    const restante = lista.filter((p) => !r1.aplicados.includes(p.clientId));
    const r2 = await aplicarPagosEnOrden(restante, bd.aplicar, bd.releer);
    expect(r2.error).toBeNull();
    expect(r2.aplicados).toEqual(["p2", "p3"]);
    expect([...bd.cobrados.values()].map((p) => [p.clientId, p.metodo, p.monto])).toEqual([
      ["p1", "EFECTIVO", 100],
      ["p2", "TARJETA_DEBITO", 100],
      ["p3", "TRANSFERENCIA", 100],
    ]);
    expect(ventaQuedoPagada(r2.totales)).toBe(true);
  });

  it("aunque se reenvíe la lista COMPLETA, los ids fijos hacen que la base no cobre dos veces", async () => {
    const bd = bdFalsa("p2");
    await aplicarPagosEnOrden(lista, bd.aplicar, bd.releer);
    await aplicarPagosEnOrden(lista, bd.aplicar, bd.releer);
    const total = [...bd.cobrados.values()].reduce((s, p) => s + p.monto, 0);
    expect(total).toBe(300);
    // Los ids que viajan son los del pago, los mismos en ambos intentos.
    expect(bd.aplicar.mock.calls.map((c) => c[0].clientId)).toEqual(["p1", "p2", "p1", "p2", "p3"]);
  });

  it("salta montos no positivos sin llamar a la base", async () => {
    const bd = bdFalsa(null);
    const r = await aplicarPagosEnOrden([{ clientId: "x", metodo: "EFECTIVO", monto: 0 }, lista[0]!], bd.aplicar, bd.releer);
    expect(r.aplicados).toEqual(["p1"]);
    expect(bd.aplicar).toHaveBeenCalledTimes(1);
  });

  it("si ni la relectura responde, conserva los últimos totales buenos", async () => {
    const aplicar = vi.fn()
      .mockResolvedValueOnce(tot({ montoPagado: 100, pendiente: 200 }))
      .mockRejectedValueOnce(new Error("x"));
    const r = await aplicarPagosEnOrden(lista, aplicar, () => Promise.reject(new Error("sin red")));
    expect(r.totales?.montoPagado).toBe(100);
  });
});

describe("B2-1 — propina en cobro dividido: el ticket ya quedó PAGADO", () => {
  it("el segundo pago rebota con 'estado PAGADO' pero la relectura dice PAGADO → venta cobrada", async () => {
    // El primer pago cubre el total sin propina y la BD (antes del arreglo de B) cierra el ticket.
    const aplicar = vi.fn()
      .mockResolvedValueOnce(tot({ montoPagado: 200, pendiente: 0, total: 200, estadoFiscal: "PAGADO", folio: "A-1" }))
      .mockRejectedValueOnce(new Error("No se puede aplicar pago a un ticket en estado PAGADO"));
    const releer = vi.fn(async () => tot({ montoPagado: 200, pendiente: 0, total: 200, estadoFiscal: "PAGADO", folio: "A-1" }));
    const r = await aplicarPagosEnOrden(
      [{ clientId: "a", metodo: "EFECTIVO", monto: 200 }, { clientId: "b", metodo: "TARJETA_CREDITO", monto: 20 }],
      aplicar,
      releer,
    );
    expect(r.error).toBeInstanceOf(Error);
    expect(ventaQuedoPagada(r.totales)).toBe(true);
    expect(r.totales?.folio).toBe("A-1");
  });

  it("ventaQuedoPagada es false con null o con un ticket abierto", () => {
    expect(ventaQuedoPagada(null)).toBe(false);
    expect(ventaQuedoPagada(tot())).toBe(false);
  });
});

describe("pagoEntroPeseAlError — pago suelto", () => {
  it("detecta que la RPC sí se aplicó aunque la respuesta se perdió", () => {
    expect(pagoEntroPeseAlError(tot(), tot({ montoPagado: 50 }))).toBe(true);
  });
  it("no lo da por aplicado si el pagado no subió o no se pudo releer", () => {
    expect(pagoEntroPeseAlError(tot({ montoPagado: 50 }), tot({ montoPagado: 50 }))).toBe(false);
    expect(pagoEntroPeseAlError(tot(), null)).toBe(false);
  });
});
