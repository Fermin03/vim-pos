import { afterEach, describe, expect, it, vi } from "vitest";
import { crearDetectorEscaner, leerUmbral } from "../escaner";

/** Teclea `texto` con `paso` ms entre caracteres y cierra con Enter; devuelve lo que dijo Enter. */
function teclear(
  d: ReturnType<typeof crearDetectorEscaner>,
  texto: string,
  paso: number,
  enCampoAjeno = false,
  t0 = 0,
) {
  let t = t0;
  for (const key of texto) {
    d.tecla({ key, tiempo: t, enCampoAjeno });
    t += paso;
  }
  return d.tecla({ key: "Enter", tiempo: t, enCampoAjeno }).codigo;
}

describe("crearDetectorEscaner", () => {
  it("ráfaga de 13 dígitos a 10 ms + Enter → código", () => {
    expect(teclear(crearDetectorEscaner({}), "7501234567890", 10)).toBe("7501234567890");
  });

  it("tecleo a 120 ms + Enter → null", () => {
    expect(teclear(crearDetectorEscaner({}), "7501234567890", 120)).toBeNull();
  });

  it("5 caracteres + Enter → null", () => {
    expect(teclear(crearDetectorEscaner({}), "12345", 10)).toBeNull();
  });

  it("ráfaga en campo ajeno → null", () => {
    expect(teclear(crearDetectorEscaner({}), "7501234567890", 10, true)).toBeNull();
  });

  it("pausa a media ráfaga reinicia", () => {
    const d = crearDetectorEscaner({});
    teclear(d, "1234", 10); // cuatro y Enter: no llega al mínimo
    for (const [i, key] of [..."1234"].entries()) d.tecla({ key, tiempo: 1000 + i * 10, enCampoAjeno: false });
    // pausa larga: lo anterior se descarta, quedan solo 4
    for (const [i, key] of [..."5678"].entries()) d.tecla({ key, tiempo: 3000 + i * 10, enCampoAjeno: false });
    expect(d.tecla({ key: "Enter", tiempo: 3040, enCampoAjeno: false }).codigo).toBeNull();
  });

  it("umbral 80 acepta 60 ms", () => {
    expect(teclear(crearDetectorEscaner({ umbralMs: 80 }), "7501234567890", 60)).toBe("7501234567890");
    expect(teclear(crearDetectorEscaner({}), "7501234567890", 60)).toBeNull();
  });
});

describe("enRafaga", () => {
  it("a partir del 2º carácter rápido la tecla se marca como de ráfaga", () => {
    const d = crearDetectorEscaner({});
    const marcas = [..."75012"].map((key, i) => d.tecla({ key, tiempo: i * 10, enCampoAjeno: false }).enRafaga);
    expect(marcas).toEqual([false, true, true, true, true]);
  });

  it("un tecleo lento o un tiempo que retrocede no es ráfaga", () => {
    const d = crearDetectorEscaner({});
    d.tecla({ key: "1", tiempo: 1000, enCampoAjeno: false });
    expect(d.tecla({ key: "2", tiempo: 1200, enCampoAjeno: false }).enRafaga).toBe(false);
    expect(d.tecla({ key: "3", tiempo: 5, enCampoAjeno: false }).enRafaga).toBe(false);
  });

  it("en campo ajeno nunca es ráfaga", () => {
    const d = crearDetectorEscaner({});
    d.tecla({ key: "1", tiempo: 0, enCampoAjeno: true });
    expect(d.tecla({ key: "2", tiempo: 10, enCampoAjeno: true }).enRafaga).toBe(false);
  });
});

describe("leerUmbral", () => {
  afterEach(() => vi.unstubAllGlobals());
  const con = (v: string | null) => {
    vi.stubGlobal("localStorage", { getItem: () => v });
    return leerUmbral();
  };

  it("acota a 20-80 y cae al default si falta o no es número", () => {
    expect(con(null)).toBeUndefined();
    expect(con("-5")).toBe(20);
    expect(con("999")).toBe(80);
    expect(con("50")).toBe(50);
    expect(con("abc")).toBeUndefined();
  });
});
