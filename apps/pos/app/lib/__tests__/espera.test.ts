import { describe, expect, it } from "vitest";
import { minutosEnEspera } from "../espera";

describe("minutosEnEspera", () => {
  const ahora = new Date("2026-06-11T12:00:00Z");

  it("calcula minutos transcurridos", () => {
    expect(minutosEnEspera("2026-06-11T11:45:00Z", ahora)).toBe(15);
  });

  it("redondea hacia abajo (piso)", () => {
    expect(minutosEnEspera("2026-06-11T11:58:30Z", ahora)).toBe(1);
  });

  it("nunca negativo aunque el reloj local esté atrasado", () => {
    expect(minutosEnEspera("2026-06-11T12:05:00Z", ahora)).toBe(0);
  });

  it("null o fecha inválida → 0", () => {
    expect(minutosEnEspera(null, ahora)).toBe(0);
    expect(minutosEnEspera("no-es-fecha", ahora)).toBe(0);
  });
});
