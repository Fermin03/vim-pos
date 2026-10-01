import { describe, expect, it } from "vitest";
import { leerSoporte } from "../soporte";

describe("leerSoporte (0142)", () => {
  it("normaliza el WhatsApp y vacía lo opcional", () => {
    expect(leerSoporte({ whatsapp: "+52 56 6508 3346", horario: " 9:00 a 18:00 ", correo: "" })).toEqual({
      ok: true, datos: { whatsapp: "525665083346", horario: "9:00 a 18:00", correo: null },
    });
  });

  it("el WhatsApp es obligatorio y de 10 a 15 dígitos", () => {
    expect(leerSoporte({ whatsapp: "", horario: null, correo: null })).toMatchObject({ ok: false, campo: "whatsapp" });
    expect(leerSoporte({ whatsapp: "12345", horario: null, correo: null })).toMatchObject({ ok: false, campo: "whatsapp" });
    expect(leerSoporte({ whatsapp: "5256650833461234", horario: null, correo: null })).toMatchObject({ ok: false, campo: "whatsapp" });
  });

  it("rechaza un cuerpo parcial y un correo raro", () => {
    expect(leerSoporte({ whatsapp: "525665083346" })).toMatchObject({ ok: false });
    expect(leerSoporte({ whatsapp: "525665083346", horario: null, correo: "no-es-correo" })).toMatchObject({ ok: false, campo: "correo" });
  });
});
