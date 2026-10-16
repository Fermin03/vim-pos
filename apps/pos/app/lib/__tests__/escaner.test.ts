import { describe, expect, it } from "vitest";
import { crearDetectorEscaner } from "../escaner";

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
  return d.tecla({ key: "Enter", tiempo: t, enCampoAjeno });
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
    expect(d.tecla({ key: "Enter", tiempo: 3040, enCampoAjeno: false })).toBeNull();
  });

  it("umbral 80 acepta 60 ms", () => {
    expect(teclear(crearDetectorEscaner({ umbralMs: 80 }), "7501234567890", 60)).toBe("7501234567890");
    expect(teclear(crearDetectorEscaner({}), "7501234567890", 60)).toBeNull();
  });
});
