import { describe, it, expect, beforeAll } from "vitest";
import { coordenadasDe, iniciarConexionMp, mensajeErrorTerminal, validarStateMp, REGRESO_MP } from "../terminal";

beforeAll(() => {
  const mapa = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    value: { getItem: (k: string) => mapa.get(k) ?? null, setItem: (k: string, v: string) => { mapa.set(k, v); }, removeItem: (k: string) => { mapa.delete(k); } },
    configurable: true,
  });
});

describe("coordenadasDe", () => {
  it("lee los enlaces largos de Google Maps y el par suelto", () => {
    const leon = { latitud: 21.122019, longitud: -101.682541 };
    expect(coordenadasDe("https://www.google.com/maps/place/Knock/@21.122019,-101.682541,17z/data=!4m6")).toEqual(leon);
    expect(coordenadasDe("https://www.google.com/maps?q=21.122019,-101.682541")).toEqual(leon);
    expect(coordenadasDe("21.122019, -101.682541")).toEqual(leon);
  });

  it("prefiere el pin (!3d!4d) al centro del mapa (@)", () => {
    expect(coordenadasDe("https://www.google.com/maps/place/X/@21.100000,-101.600000,17z/data=!3d21.122019!4d-101.682541"))
      .toEqual({ latitud: 21.122019, longitud: -101.682541 });
  });

  it("no inventa coordenadas", () => {
    for (const malo of ["https://maps.app.goo.gl/AbCdEf123", "", "León, Guanajuato", "200.123456, 50.123456", "21, -101"]) {
      expect(coordenadasDe(malo)).toBeNull();
    }
  });
});

describe("conexión con Mercado Pago", () => {
  it("manda al dueño a autorizar con un state que solo vale una vez", () => {
    const u = new URL(iniciarConexionMp());
    expect(u.origin + u.pathname).toBe("https://auth.mercadopago.com/authorization");
    expect(u.searchParams.get("redirect_uri")).toBe(REGRESO_MP);
    expect(u.searchParams.get("response_type")).toBe("code");
    const state = u.searchParams.get("state");
    expect(state).toMatch(/^[0-9a-f]{32}$/);
    expect(validarStateMp("otro")).toBe(false); // y lo consume
    expect(validarStateMp(state)).toBe(false);
    const state2 = new URL(iniciarConexionMp()).searchParams.get("state");
    expect(validarStateMp(state2)).toBe(true);
    expect(validarStateMp(null)).toBe(false);
  });

  it("un código desconocido no se le enseña al dueño", () => {
    expect(mensajeErrorTerminal(new Error("ERROR_INTERNO"))).toBe("Algo salió mal con la terminal. Inténtalo de nuevo.");
    expect(mensajeErrorTerminal(new Error("SIN_PERMISO"))).toContain("administrador");
  });
});
