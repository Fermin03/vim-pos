// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { BarrasEan13, formatoEtiqueta } from "../../components/barras-ean13";
import { modulosEan13 } from "../codigo-barras";

describe("etiquetas", () => {
  it("dibuja un trazo por tramo de módulos negros, con zonas quietas dentro del dibujo", () => {
    const html = renderToStaticMarkup(createElement(BarrasEan13, { codigo: "4006381333931" }));
    const tramos = modulosEan13("4006381333931").match(/1+/g)!.length;
    expect((html.match(/<path/g) ?? []).length).toBe(tramos);
    expect(html).not.toContain("<rect");
    expect(html).toContain('viewBox="-11 0 113 40"');
  });
  it("sin código EAN no dibuja barras", () => {
    expect(renderToStaticMarkup(createElement(BarrasEan13, { codigo: "POL-M" }))).toBe("");
  });
  it("hoja carta 3×10 y rollo a su tamaño", () => {
    expect(formatoEtiqueta({ tipo: "carta" })).toMatchObject({
      pagina: "letter", margen: "12.7mm 4.76mm", ancho: "66.675mm", alto: "25.4mm", columnas: 3, gap: "3.175mm",
    });
    expect(formatoEtiqueta({ tipo: "rollo", anchoMm: 50, altoMm: 25 })).toMatchObject({ pagina: "50mm 25mm", margen: "0", columnas: 1, gap: "0" });
  });
});
