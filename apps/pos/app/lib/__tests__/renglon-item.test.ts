import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RenglonItem } from "../../components/renglon-item";

// Los .tsx se transforman con JSX clásico en las pruebas: piden `React` global.
(globalThis as { React?: unknown }).React = React;

const pintar = (p: Partial<React.ComponentProps<typeof RenglonItem>>) =>
  renderToStaticMarkup(React.createElement(RenglonItem, { cantidad: 2, nombre: "Playera", modificadores: [], notaCocina: null, totalMxn: 300, ...p }));

describe("RenglonItem: la cantidad con su unidad", () => {
  it("una pieza (o un restaurante, sin unidad) se ve como siempre: «2×»", () => {
    expect(pintar({})).toContain(">2×<");
    expect(pintar({ unidad: "UNIDAD" })).toContain(">2×<");
  });
  it("a granel lleva su unidad y sus decimales, sin «×»", () => {
    const html = pintar({ cantidad: 1.25, nombre: "Jitomate", unidad: "PESO" });
    expect(html).toContain(">1.250 kg<");
    expect(html).not.toContain("×");
    expect(pintar({ cantidad: 7.5, unidad: "LONGITUD" })).toContain(">7.50 m<");
  });
});
