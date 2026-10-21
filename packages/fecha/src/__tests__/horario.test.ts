import { describe, expect, it } from "vitest";
import { DIAS, cruzaMedianoche, horaValida, leerHorario } from "../index";

describe("horario de la tienda", () => {
  it("siete días, de lunes a domingo", () => {
    expect(DIAS.map((d) => d.dia).join("")).toBe("1234567");
    expect(DIAS[0]).toEqual({ dia: "1", nombre: "Lunes" });
    expect(DIAS[6]).toEqual({ dia: "7", nombre: "Domingo" });
  });
  it("lee lo que viene de la base y descarta lo malo", () => {
    expect(leerHorario(null)).toEqual({});
    expect(leerHorario([])).toEqual({});
    expect(leerHorario({ "1": "siempre" })).toEqual({});
    expect(leerHorario({ "8": ["10:00", "12:00"] })).toEqual({});
    expect(leerHorario({ "1": ["25:00", "12:00"] })).toEqual({});
    expect(leerHorario({ "1": ["10:00"] })).toEqual({});
    expect(leerHorario({ "1": ["10:00", "12:00", "13:00"] })).toEqual({});
    expect(leerHorario({ "1": ["10:00", "12:00"], "2": "x" })).toEqual({ "1": ["10:00", "12:00"] });
  });
  it("horaValida", () => {
    expect(horaValida("09:00")).toBe(true);
    expect(horaValida("23:59")).toBe(true);
    for (const mala of ["", "24:00", "9:00", "12:60", "12:00 "]) expect(horaValida(mala), mala).toBe(false);
  });
  it("cruza la medianoche si cierra antes de abrir; iguales, no", () => {
    expect(cruzaMedianoche(["18:00", "02:00"])).toBe(true);
    expect(cruzaMedianoche(["09:00", "18:00"])).toBe(false);
    expect(cruzaMedianoche(["00:00", "00:00"])).toBe(false);
  });
});
