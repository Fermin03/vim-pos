import { describe, expect, it } from "vitest";
import { conUnidad, tipoDeUnidadCsv, UNIDADES } from "../unidades";

describe("unidades de venta", () => {
  it("etiqueta del precio y abreviatura por tipo", () => {
    expect(UNIDADES.PESO.precio).toBe("Precio por kilo");
    expect(UNIDADES.LONGITUD.precio).toBe("Precio por metro");
    expect(UNIDADES.VOLUMEN.precio).toBe("Precio por litro");
    expect(conUnidad("1.5", "PESO")).toBe("1.5 kg");
    expect(conUnidad("3", undefined)).toBe("3 pz");
  });
  it("lee la unidad del CSV sin importar mayúsculas ni acentos", () => {
    expect(tipoDeUnidadCsv(" Pieza ")).toBe("UNIDAD");
    expect(tipoDeUnidadCsv("KG")).toBe("PESO");
    expect(tipoDeUnidadCsv("")).toBe("");
    expect(tipoDeUnidadCsv("libra")).toBeNull();
  });
});
