import { describe, expect, it } from "vitest";
import { clasificarFoco } from "../use-escaner";

describe("clasificarFoco", () => {
  it("el buscador y los campos de Recibir no son ajenos", () => {
    expect(clasificarFoco(true, "busqueda")).toEqual({ enCampoAjeno: false, propio: "busqueda" });
    expect(clasificarFoco(true, "campo-recibir")).toEqual({ enCampoAjeno: false, propio: "campo-recibir" });
  });
  it("cualquier otro input sigue siendo ajeno (PIN, cobro, notas…)", () => {
    expect(clasificarFoco(true, undefined)).toEqual({ enCampoAjeno: true, propio: null });
    expect(clasificarFoco(true, "otra-cosa")).toEqual({ enCampoAjeno: true, propio: null });
  });
  it("sin input con foco no hay campo ajeno", () => {
    expect(clasificarFoco(false, undefined)).toEqual({ enCampoAjeno: false, propio: null });
  });
});
