import { describe, it, expect } from "vitest";
import { siguienteEstado, minutosEnCocina, labelModo, areasDeComandas, comandasNuevas, SIN_AREA } from "@vim/kds-core";

describe("kds — máquina de estados de cocina", () => {
  it("avanza EN_COCINA → LISTO → ENTREGADO y luego null", () => {
    expect(siguienteEstado("EN_COCINA")).toBe("LISTO");
    expect(siguienteEstado("LISTO")).toBe("ENTREGADO");
    expect(siguienteEstado("ENTREGADO")).toBeNull();
    expect(siguienteEstado("SIN_ENVIAR")).toBeNull();
  });

  it("labelModo traduce los modos conocidos y deja pasar el resto", () => {
    expect(labelModo("COMER_AQUI")).toBe("Comedor");
    expect(labelModo("PARA_LLEVAR")).toBe("Para llevar");
    expect(labelModo("DRIVE_THRU")).toBe("Pick-up");
    expect(labelModo("DELIVERY_PROPIO")).toBe("Domicilio");
    expect(labelModo("DESCONOCIDO")).toBe("DESCONOCIDO");
  });
});

describe("kds — minutos en cocina", () => {
  const ahora = new Date("2026-06-06T12:30:00Z").getTime();
  it("devuelve 0 si no hay fecha de envío", () => {
    expect(minutosEnCocina(null, ahora)).toBe(0);
  });
  it("calcula minutos transcurridos (piso)", () => {
    expect(minutosEnCocina("2026-06-06T12:18:30Z", ahora)).toBe(11);
    expect(minutosEnCocina("2026-06-06T12:29:50Z", ahora)).toBe(0);
  });
  it("nunca devuelve negativo si la fecha es futura", () => {
    expect(minutosEnCocina("2026-06-06T12:45:00Z", ahora)).toBe(0);
  });
  it("devuelve 0 con fecha inválida", () => {
    expect(minutosEnCocina("no-es-fecha", ahora)).toBe(0);
  });
});

describe("kds — F15 multi-área + nuevos pedidos", () => {
  it("areasDeComandas junta áreas únicas y mapea null → General", () => {
    const comandas = [
      { items: [{ area: "Cocina caliente" }, { area: null }] },
      { items: [{ area: "Barra" }, { area: "Cocina caliente" }] },
    ];
    expect(areasDeComandas(comandas)).toEqual(["Barra", "Cocina caliente", SIN_AREA]);
  });
  it("areasDeComandas con todo null → solo General", () => {
    expect(areasDeComandas([{ items: [{ area: null }, { area: null }] }])).toEqual([SIN_AREA]);
  });
  it("comandasNuevas cuenta solo los ids no vistos antes", () => {
    const previos = new Set(["a", "b"]);
    expect(comandasNuevas(previos, ["a", "b"])).toBe(0);
    expect(comandasNuevas(previos, ["a", "b", "c"])).toBe(1);
    expect(comandasNuevas(previos, ["c", "d"])).toBe(2);
    expect(comandasNuevas(new Set(), ["a"])).toBe(1);
  });
});
