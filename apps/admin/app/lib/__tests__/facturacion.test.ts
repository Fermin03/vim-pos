import { describe, expect, it } from "vitest";
import { formaPagoSatDe, receptorSchema } from "../facturacion";

describe("formaPagoSatDe", () => {
  it("mapea métodos directos al catálogo SAT", () => {
    expect(formaPagoSatDe([{ metodo: "EFECTIVO", monto: 100 }])).toBe("01");
    expect(formaPagoSatDe([{ metodo: "TARJETA_CREDITO", monto: 100 }])).toBe("04");
    expect(formaPagoSatDe([{ metodo: "TARJETA_DEBITO", monto: 100 }])).toBe("28");
  });

  it("en pago mixto manda el método con mayor monto acumulado", () => {
    expect(formaPagoSatDe([
      { metodo: "EFECTIVO", monto: 50 },
      { metodo: "TARJETA_CREDITO", monto: 80 },
      { metodo: "EFECTIVO", monto: 40 }, // efectivo acumula 90 > 80
    ])).toBe("01");
  });

  it("sin pagos o método desconocido → 99 (por definir)", () => {
    expect(formaPagoSatDe([])).toBe("99");
    expect(formaPagoSatDe([{ metodo: "VALES", monto: 100 }])).toBe("99");
  });
});

describe("receptorSchema", () => {
  const base = {
    rfc: "XAXX010101000", razon_social: "PUBLICO EN GENERAL", uso_cfdi: "S01",
    codigo_postal: "37000", regimen_fiscal: "616", email: "", forma_pago_sat: "01",
  };

  it("acepta receptor público en general", () => {
    expect(receptorSchema.parse(base).rfc).toBe("XAXX010101000");
  });

  it("normaliza RFC a mayúsculas y rechaza formato inválido", () => {
    expect(receptorSchema.parse({ ...base, rfc: "xaxx010101000" }).rfc).toBe("XAXX010101000");
    expect(receptorSchema.safeParse({ ...base, rfc: "NO-ES-RFC" }).success).toBe(false);
  });

  it("rechaza CP que no sea de 5 dígitos", () => {
    expect(receptorSchema.safeParse({ ...base, codigo_postal: "370" }).success).toBe(false);
  });
});
