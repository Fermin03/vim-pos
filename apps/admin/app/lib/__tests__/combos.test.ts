import { describe, it, expect } from "vitest";
import { precioCombo, vistaPrevia, type SlotConOpciones } from "../combos";

// MISMOS números que apps/pos/app/lib/__tests__/combos.test.ts ("suma base + precio de la hamburguesa + deltas" = 190).
const slots: SlotConOpciones[] = [
  { id: "g-hamb", nombre: "Hamburguesa", modo_precio: "SUMA_PRECIO_PRODUCTO", minimo_selecciones: 1, maximo_selecciones: 1, categoria_id: "cat-hamb",
    opciones: [{ producto_id: "h1", nombre: "Clásica", precio: 95, delta: 0, es_default: false }, { producto_id: "h2", nombre: "Doble", precio: 130, delta: 0, es_default: false }] },
  { id: "g-acom", nombre: "Acompañamiento", modo_precio: "DELTA", minimo_selecciones: 1, maximo_selecciones: 1, categoria_id: null,
    opciones: [{ producto_id: "a1", nombre: "Papas", precio: 45, delta: 0, es_default: true }, { producto_id: "a2", nombre: "Aros", precio: 55, delta: 15, es_default: false }] },
  { id: "g-beb", nombre: "Bebida", modo_precio: "DELTA", minimo_selecciones: 1, maximo_selecciones: 1, categoria_id: null,
    opciones: [{ producto_id: "b1", nombre: "Refresco", precio: 30, delta: 0, es_default: true }, { producto_id: "b2", nombre: "Malteada", precio: 55, delta: 25, es_default: false }] },
];

describe("precioCombo (paridad con la caja)", () => {
  it("Doble + Aros + Refresco = 45 + 130 + 15 + 0 = 190", () => {
    expect(precioCombo(45, slots, { "g-hamb": "h2", "g-acom": "a2", "g-beb": "b1" })).toBe(190);
  });
  it("Clásica con defaults = 140", () => {
    expect(precioCombo(45, slots, { "g-hamb": "h1", "g-acom": "a1", "g-beb": "b1" })).toBe(140);
  });
});

describe("vistaPrevia", () => {
  it("una fila por opción del primer slot con el resto en default, más los deltas de los otros slots", () => {
    const v = vistaPrevia(45, slots);
    expect(v.principales).toEqual([{ nombre: "Clásica", precio: 140 }, { nombre: "Doble", precio: 175 }]);
    expect(v.deltas).toEqual([{ slot: "Acompañamiento", nombre: "Aros", delta: 15 }, { slot: "Bebida", nombre: "Malteada", delta: 25 }]);
  });
});
