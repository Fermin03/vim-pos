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

  it("comida rápida (sin onCambio) no ofrece «Cambio de talla»; la tienda sí", () => {
    const sinCambio = renderToStaticMarkup(React.createElement(AccionesVenta, {
      venta, imprimiendo: false, onReimprimir: nada, onDevolver: nada, onReabrir: nada, onCambiarPago: nada,
    }));
    expect(sinCambio).not.toContain(">Cambio de talla<");
    expect(sinCambio).toContain(">Devolver<");
    expect(pintar(venta)).toContain(">Cambio de talla<");
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

  it("con algo devuelto (también la venta original de un cambio) no se reabre; el pago sí se cambia", () => {
    const renglon = { ticket_item_id: "i1", producto_id: "p1", nombre: "Polo M", cantidad: 2, devuelta: 1, precio_unitario: 349, total: 698 };
    const html = pintar({ ...venta, renglones: [renglon] });
    expect(html).not.toContain(">Reabrir<");
    expect(html).toContain(">Cambiar pago<");
    // Sin pago que cambiar tampoco queda una fila vacía.
    expect(pintar({ ...venta, renglones: [renglon], pagoCambiable: null })).not.toMatch(/<div class="flex gap-2"><\/div>/);
  });

  it("una venta cobrada en línea no se reabre ni cambia de pago (como en Cuentas cobradas)", () => {
    const html = pintar({ ...venta, pagadaEnLinea: true, pagoCambiable: null });
    for (const t of [">Reabrir<", ">Cambiar pago<"]) expect(html).not.toContain(t);
  });
});
