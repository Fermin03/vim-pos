import { describe, expect, it } from "vitest";
import { combosNoComprables, type ComboParaRevisar } from "../tienda-combos";

const op = (productoId: string, nombre = productoId) => ({ productoId, nombre });
const paso = (nombre: string, opciones: ReturnType<typeof op>[], obligatorio = true) => ({ nombre, obligatorio, opciones });

describe("combos que la tienda no puede vender", () => {
  it("dos pasos obligatorios con el mismo único producto: el combo no se puede comprar", () => {
    const c: ComboParaRevisar = { nombre: "Combo Doble", slots: [paso("Bebida", [op("a", "Refresco")]), paso("Extra", [op("a", "Refresco")])] };
    expect(combosNoComprables([c])).toEqual([{ combo: "Combo Doble", producto: "Refresco", pasos: ["Bebida", "Extra"] }]);
  });

  it("si uno de los pasos tiene más de una opción, se puede elegir distinto: sin aviso", () => {
    const c: ComboParaRevisar = { nombre: "Combo", slots: [paso("Bebida", [op("a")]), paso("Extra", [op("a"), op("b")])] };
    expect(combosNoComprables([c])).toEqual([]);
  });

  it("un paso opcional se puede dejar vacío: sin aviso", () => {
    const c: ComboParaRevisar = { nombre: "Combo", slots: [paso("Bebida", [op("a")]), paso("Extra", [op("a")], false)] };
    expect(combosNoComprables([c])).toEqual([]);
  });

  it("dos pasos con productos únicos distintos: sin aviso", () => {
    const c: ComboParaRevisar = { nombre: "Combo", slots: [paso("Bebida", [op("a")]), paso("Papas", [op("b")])] };
    expect(combosNoComprables([c])).toEqual([]);
  });

  it("tres pasos con el mismo único producto salen en un solo aviso; cada combo avisa por separado", () => {
    const malo: ComboParaRevisar = { nombre: "Malo", slots: [paso("Uno", [op("a")]), paso("Dos", [op("a")]), paso("Tres", [op("a")])] };
    const otro: ComboParaRevisar = { nombre: "Otro", slots: [paso("Uno", [op("b")]), paso("Dos", [op("b")])] };
    const bueno: ComboParaRevisar = { nombre: "Bueno", slots: [paso("Uno", [op("a")])] };
    expect(combosNoComprables([malo, bueno, otro]).map((r) => [r.combo, r.pasos.length])).toEqual([["Malo", 3], ["Otro", 2]]);
  });

  it("sin combos o sin pasos no hay nada que avisar", () => {
    expect(combosNoComprables([])).toEqual([]);
    expect(combosNoComprables([{ nombre: "Vacío", slots: [] }])).toEqual([]);
  });
});
