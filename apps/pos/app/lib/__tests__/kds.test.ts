import { describe, it, expect } from "vitest";
import { siguienteEstado, minutosEnCocina, labelModo } from "../kds-estado";

describe("kds — máquina de estados de cocina", () => {
  it("avanza EN_COCINA → LISTO → ENTREGADO y luego null", () => {
    expect(siguienteEstado("EN_COCINA")).toBe("LISTO");
    expect(siguienteEstado("LISTO")).toBe("ENTREGADO");
    expect(siguienteEstado("ENTREGADO")).toBeNull();
    expect(siguienteEstado("SIN_ENVIAR")).toBeNull();
  });

  it("labelModo traduce los modos conocidos y deja pasar el resto", () => {
    expect(labelModo("COMER_AQUI")).toBe("Comer aquí");
    expect(labelModo("PARA_LLEVAR")).toBe("Para llevar");
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
