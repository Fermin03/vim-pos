import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModalCantidad, leerCantidad, teclear } from "../../components/modal-cantidad";
import { fmtCantidad } from "../unidades";
import type { Producto } from "../catalogo";

// Los .tsx se transforman con JSX clásico en las pruebas: piden `React` global.
(globalThis as { React?: unknown }).React = React;

const jitomate: Producto = { id: "j", nombre: "Jitomate", descripcion: null, precio_base_mxn: 28, categoria_id: "c", agotado: false, esCombo: false, seVendeAqui: true, tipoVenta: "PESO" };

describe("ModalCantidad", () => {
  it("1.250 kg se acepta y queda 1.250", () => {
    const n = leerCantidad("1.250", "PESO");
    expect(n).toBe(1.25);
    expect(fmtCantidad(n!, "PESO")).toBe("1.250 kg");
  });
  it("rechaza más decimales de los de su unidad, el 0 y lo vacío", () => {
    expect(leerCantidad("1.2505", "PESO")).toBeNull();
    expect(leerCantidad("0", "PESO")).toBeNull();
    expect(leerCantidad("0.000", "PESO")).toBeNull();
    expect(leerCantidad("", "PESO")).toBeNull();
    expect(leerCantidad(".", "PESO")).toBeNull();
    expect(leerCantidad("7.505", "LONGITUD")).toBeNull();
  });
  it("en metros, 7.5 queda 7.50", () => {
    expect(fmtCantidad(leerCantidad("7.5", "LONGITUD")!, "LONGITUD")).toBe("7.50 m");
  });
  it("el teclado: un solo punto, borrar y la coma como punto", () => {
    let t = "";
    for (const k of ["1", ".", "2", ".", ",", "5"]) t = teclear(t, k);
    expect(t).toBe("1.25");
    expect(teclear(t, "Backspace")).toBe("1.2");
    expect(teclear("", ".")).toBe("0.");
    expect(teclear("12", "x")).toBe("12");
  });
  it("título con la unidad y el precio por unidad", () => {
    const html = renderToStaticMarkup(React.createElement(ModalCantidad, { producto: jitomate, onConfirmar: () => {}, onCerrar: () => {} }));
    for (const t of ["Jitomate", "$28.00/kg", "Peso · kg", "0.000"]) expect(html).toContain(t);
  });
});
