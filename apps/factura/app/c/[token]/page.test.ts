import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../lib/cotizacion", () => ({ buscarCotizacion: async () => null, fechaDia: (d: string) => d }));

describe("enlace de una cotización que no está", () => {
  it("dice que espere unos minutos (la caja aún no sincroniza)", async () => {
    const { default: PaginaCotizacion } = await import("./page");
    const html = renderToStaticMarkup(await PaginaCotizacion({ params: Promise.resolve({ token: "x" }) }));
    expect(html).toContain("No encontramos esta cotización.");
    expect(html).toContain("espera unos minutos y vuelve a abrir el enlace");
    expect(html).not.toContain("no existe");
  });
});
