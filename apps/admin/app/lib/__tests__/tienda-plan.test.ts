import { describe, expect, it } from "vitest";
import { TIENDA_INCLUYE, TIENDA_INVITACION, estadoTienda, mensajeQuieroTienda, ofreceFotoDeProducto } from "../tienda-plan";

describe("tienda-plan", () => {
  it("la sección se enseña si está permitida; si la lectura de módulos falla, también", () => {
    expect(estadoTienda(null)).toBe("cargando");
    expect(estadoTienda("error")).toBe("permitida");
    expect(estadoTienda({ permitidos: { tienda: true }, efectivos: {} })).toBe("permitida");
    expect(estadoTienda({ permitidos: { tienda: false }, efectivos: {} })).toBe("sin_contratar");
    expect(estadoTienda({ permitidos: {}, efectivos: {} })).toBe("sin_contratar");
  });
  it("el mensaje de WhatsApp ya dice qué se quiere", () => {
    const m = mensajeQuieroTienda({ usuario: "Ana", negocio: "Mi Local", codigo: "mi-local" });
    expect(m).toMatch(/Quiero la tienda en línea\. Avísenme cuando esté lista\.$/);
    expect(m).toContain("Ana");
    expect(m).toContain("Mi Local");
    expect(m).not.toContain("Necesito ayuda");
  });
  it("mientras no se pueda contratar, la invitación pide que le avisen: no promete activarla", () => {
    expect(TIENDA_INVITACION).toEqual({
      cierre: "Estamos por lanzarla. Escríbenos y te avisamos en cuanto esté lista.",
      boton: "Avísenme cuando esté lista",
    });
  });
  it("lista lo que incluye", () => {
    expect(TIENDA_INCLUYE.map((i) => i.titulo)).toEqual(["Tu menú, siempre al día", "Pago al recibir", "Tus horarios", "Sin comisión"]);
  });
  it("la foto del producto solo se ofrece con la tienda concedida; cargando o sin poder leer, no", () => {
    expect(ofreceFotoDeProducto({ permitidos: { tienda: true }, efectivos: {} })).toBe(true);
    // Concedida aunque todavía apagada: lo que cuenta es lo permitido, como en el apartado.
    expect(ofreceFotoDeProducto({ permitidos: { tienda: true }, efectivos: { tienda: false } })).toBe(true);
    expect(ofreceFotoDeProducto({ permitidos: { tienda: false }, efectivos: { tienda: true } })).toBe(false);
    expect(ofreceFotoDeProducto({ permitidos: {}, efectivos: {} })).toBe(false);
    expect(ofreceFotoDeProducto(null)).toBe(false);
    expect(ofreceFotoDeProducto("error")).toBe(false);
  });
});
