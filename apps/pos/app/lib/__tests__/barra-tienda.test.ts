import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BarraTienda } from "../../components/barra-tienda";

(globalThis as { React?: unknown }).React = React;

describe("barra de la tienda", () => {
  it("dice Cobrar, Inventario, Transacciones, Notificaciones y Más, en ese orden", () => {
    const html = renderToStaticMarkup(
      React.createElement(BarraTienda, { seccion: "panel", onCambiar: () => {}, pendientes: 0, bloqueada: false }),
    );
    const etiquetas = [...html.matchAll(/<span class="max-w-full[^>]*>(.*?)<\/span>/g)].map((m) => m[1]);
    expect(etiquetas).toEqual(["Cobrar", "Inventario", "Transacciones", "Notificaciones", "Más"]);
  });
});
