import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModalReabrirCuenta } from "../../components/modal-reabrir-cuenta";
import type { Empleado } from "../supabase";

// Los .tsx se transforman con JSX clásico en las pruebas: piden `React` global.
(globalThis as { React?: unknown }).React = React;

const nada = () => {};
const base = {
  token: "tok", empleado: { id: "e1", nombre: "Ana", rol: "DUENO" } as Empleado, ticketId: "t1", folio: "A-7", total: 116,
  cajaId: "c1", turnoId: "tu1", onReabierto: nada, onCerrar: nada,
};
const pintar = (p: Partial<React.ComponentProps<typeof ModalReabrirCuenta>> = {}) =>
  renderToStaticMarkup(React.createElement(ModalReabrirCuenta, { ...base, ...p }));

describe("ModalReabrirCuenta", () => {
  it("el restaurante conserva su aviso", () => {
    expect(pintar()).toContain("Se <b>anula el pago</b> registrado y el efectivo deja de contar en el corte hasta que se cobre de nuevo.");
  });
  it("la venta de un cambio sin diferencia no anula ningún pago", () => {
    const html = pintar({ pagoInterno: 116 });
    expect(html).toContain("No se anula ningún pago: la prenda devuelta cubre la venta.");
    expect(html).not.toContain("anula el pago");
  });
  it("la venta de un cambio con diferencia anula solo lo pagado aparte", () => {
    const html = pintar({ pagoInterno: 100 });
    expect(html).toContain("Se anula solo lo que el cliente pagó aparte; la prenda devuelta sigue cubriendo $100.00.");
    expect(html).not.toContain("anula el pago");
  });
});
