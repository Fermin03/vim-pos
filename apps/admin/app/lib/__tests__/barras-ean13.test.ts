// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { BarrasEan13, formatoEtiqueta } from "../../components/barras-ean13";
import { modulosEan13 } from "../codigo-barras";

describe("etiquetas", () => {
  it("dibuja un rect por cada módulo negro", () => {
    const html = renderToStaticMarkup(createElement(BarrasEan13, { codigo: "4006381333931" }));
    const negros = [...modulosEan13("4006381333931")].filter((b) => b === "1").length;
    expect((html.match(/<rect/g) ?? []).length).toBe(negros);
    expect(html).toContain('viewBox="0 0 95');
  });
  it("sin código EAN no dibuja barras", () => {
    expect(renderToStaticMarkup(createElement(BarrasEan13, { codigo: "POL-M" }))).toBe("");
  });
  it("hoja carta 3×10 y rollo a su tamaño", () => {
    expect(formatoEtiqueta({ tipo: "carta" })).toMatchObject({ pagina: "letter", columnas: 3 });
    expect(formatoEtiqueta({ tipo: "rollo", anchoMm: 50, altoMm: 25 })).toMatchObject({ pagina: "50mm 25mm", columnas: 1 });
  });
});
