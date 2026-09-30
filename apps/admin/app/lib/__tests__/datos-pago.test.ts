import { describe, expect, it } from "vitest";
import { clabeLegible, enlaceWhatsapp, hayDatosPago, mensajeComprobante, mesDe } from "../datos-pago";

describe("datos de pago del dueño (0141)", () => {
  it("el mes sale de la fecha tal cual", () => {
    expect(mesDe("2026-10-01")).toBe("octubre 2026");
    expect(mesDe("2027-01-31")).toBe("enero 2027");
  });
  it("el mensaje de WhatsApp lleva negocio y mes", () => {
    expect(mensajeComprobante("Tortas Doña Mary", "octubre 2026")).toBe("Hola, les envío el comprobante de pago de Tortas Doña Mary, octubre 2026.");
  });
  it("el enlace codifica el mensaje y exige un número válido", () => {
    expect(enlaceWhatsapp("52 477 123 4567", "Hola, ¿qué tal?")).toBe("https://wa.me/524771234567?text=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F");
    expect(enlaceWhatsapp("123", "x")).toBeNull();
    expect(enlaceWhatsapp(null, "x")).toBeNull();
  });
  it("la CLABE en grupos de cuatro", () => {
    expect(clabeLegible("002010077777777771")).toBe("0020 1007 7777 7777 71");
  });
  it("sin cuenta ni contacto no hay nada que enseñar", () => {
    expect(hayDatosPago(null)).toBe(false);
    expect(hayDatosPago({ banco: "BBVA", titular: null, clabe: null, whatsapp: null, correo: null, instrucciones: null })).toBe(false);
    expect(hayDatosPago({ banco: null, titular: null, clabe: null, whatsapp: "524771234567", correo: null, instrucciones: null })).toBe(true);
  });
});
