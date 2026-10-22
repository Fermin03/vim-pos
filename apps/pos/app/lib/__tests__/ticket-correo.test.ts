import { describe, expect, it } from "vitest";
import { bloquesParaCorreo, correoValido, mensajeEnvioTicket } from "../ticket-correo";

describe("mensajeEnvioTicket", () => {
  it("sin internet o sin nube lo dice así", () => {
    expect(mensajeEnvioTicket("SIN_RED")).toBe("No se pudo enviar: la caja no tiene internet.");
    expect(mensajeEnvioTicket("FUNCION_REQUIERE_NUBE")).toBe("No se pudo enviar: la caja no tiene internet.");
  });
  it("un correo mal escrito pide revisarlo", () =>
    expect(mensajeEnvioTicket("CORREO_INVALIDO")).toBe("Revisa el correo: parece que está mal escrito."));
  it("cualquier otra cosa invita a intentar de nuevo", () =>
    expect(mensajeEnvioTicket("NO_ENVIADO")).toBe("No se pudo enviar el correo. Intenta otra vez."));
});

describe("correoValido", () => {
  it("acepta un correo normal y rechaza lo demás", () => {
    expect(correoValido(" cliente@ejemplo.com ")).toBe(true);
    for (const c of ["", "cliente", "a@b", "a b@c.com"]) expect(correoValido(c)).toBe(false);
  });
});

describe("bloquesParaCorreo", () => {
  it("quita el logo y el corte, que solo sirven en papel", () => {
    const b = bloquesParaCorreo([
      { t: "raster", ancho: 8, alto: 1, datos: new Uint8Array(1) },
      { t: "texto", valor: "Total" },
      { t: "corte" },
    ]);
    expect(b).toEqual([{ t: "texto", valor: "Total" }]);
  });
});
