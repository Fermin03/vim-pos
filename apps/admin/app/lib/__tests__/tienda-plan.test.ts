import { describe, expect, it } from "vitest";
import { TIENDA_INCLUYE, estadoTienda, mensajeQuieroTienda } from "../tienda-plan";

describe("tienda-plan", () => {
  it("la sección se enseña si está permitida; si la lectura de módulos falla, también", () => {
    expect(estadoTienda(null)).toBe("cargando");
    expect(estadoTienda("error")).toBe("permitida");
    expect(estadoTienda({ permitidos: { tienda: true }, efectivos: {} })).toBe("permitida");
    expect(estadoTienda({ permitidos: { tienda: false }, efectivos: {} })).toBe("sin_contratar");
    expect(estadoTienda({ permitidos: {}, efectivos: {} })).toBe("sin_contratar");
  });
  it("el mensaje de WhatsApp ya dice qué se quiere", () => {
    expect(mensajeQuieroTienda({ usuario: "Ana", negocio: "Mi Local", codigo: "mi-local" })).toMatch(/Quiero activar la tienda en línea\.$/);
  });
  it("lista lo que incluye", () => {
    expect(TIENDA_INCLUYE.map((i) => i.titulo)).toEqual(["Tu menú, siempre al día", "Pago al recibir", "Tus horarios", "Sin comisión"]);
  });
});
