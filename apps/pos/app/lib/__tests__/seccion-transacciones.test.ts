import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccionesVenta } from "../../components/seccion-transacciones";
import type { VentaDevolvible } from "../devoluciones";

// Los .tsx se transforman con JSX clásico en las pruebas: piden `React` global.
(globalThis as { React?: unknown }).React = React;

const nada = () => {};
const venta: VentaDevolvible = { ticketId: "t1", folio: "A-1", total: 349, fechaCobro: null, renglones: [], pagoCambiable: { metodo: "EFECTIVO" } };
const pintar = (v: VentaDevolvible) => renderToStaticMarkup(React.createElement(AccionesVenta, {
  venta: v, imprimiendo: false, onReimprimir: nada, onDevolver: nada, onCambio: nada, onReabrir: nada, onCambiarPago: nada,
}));

describe("Acciones del detalle de una venta (Transacciones)", () => {
  it("una venta pagada no facturada ofrece Reabrir y, con un solo pago, Cambiar pago", () => {
    const html = pintar(venta);
    for (const t of [">Reimprimir<", ">Devolver<", ">Cambio de talla<", ">Reabrir<", ">Cambiar pago<"]) expect(html).toContain(t);
  });

  it("sin pago que cambiar (dividido, o pagada con la prenda) no se pinta «Cambiar pago»", () => {
    const html = pintar({ ...venta, pagoCambiable: null });
    expect(html).toContain(">Reabrir<");
    expect(html).not.toContain(">Cambiar pago<");
  });

  it("una venta facturada no ofrece Reabrir ni Cambiar pago", () => {
    const html = pintar({ ...venta, facturada: true });
    for (const t of [">Reabrir<", ">Cambiar pago<", ">Cambio de talla<"]) expect(html).not.toContain(t);
    expect(html).toContain(">Devolver<");
  });

  it("una venta cobrada en línea no se reabre ni cambia de pago (como en Cuentas cobradas)", () => {
    const html = pintar({ ...venta, pagadaEnLinea: true, pagoCambiable: null });
    for (const t of [">Reabrir<", ">Cambiar pago<"]) expect(html).not.toContain(t);
  });
});
