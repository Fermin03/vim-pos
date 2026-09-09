import { describe, it, expect } from "vitest";
import { CASOS_PRECIO_COMBO, COMBO_BASE_MXN, opcionCombo, SLOTS_COMBO } from "@vim/db/fixtures-combos";
import { precioCombo, vistaPrevia, type SlotConOpciones } from "../combos";

// MISMA fixture que lee `apps/pos/app/lib/__tests__/combos.test.ts`: el precio del combo está
// implementado tres veces (RPC, caja y admin) y esta prueba existe para que las dos de TypeScript
// no puedan divergir en silencio. Antes cada archivo codificaba a mano sus propios 190 y 140.
const slots: SlotConOpciones[] = SLOTS_COMBO.map((s) => ({
  id: s.id,
  nombre: s.nombre,
  modo_precio: s.modoPrecio,
  minimo_selecciones: 1,
  maximo_selecciones: 1,
  categoria_id: s.porCategoria ? s.categoriaId : null,
  opciones: s.opciones.map((o) => ({
    producto_id: o.productoId,
    nombre: o.nombre,
    precio: o.precioMxn,
    delta: o.deltaMxn,
    es_default: o.esDefault,
  })),
}));

describe("precioCombo (paridad con la caja)", () => {
  it("Doble + Aros + Refresco = base + precio de la Doble + delta de los Aros", () => {
    const caso = CASOS_PRECIO_COMBO.dobleArosRefresco;
    expect(precioCombo(COMBO_BASE_MXN, slots, caso.seleccion)).toBe(caso.esperadoMxn);
  });
  it("Clásica con defaults", () => {
    const caso = CASOS_PRECIO_COMBO.clasicaConDefaults;
    expect(precioCombo(COMBO_BASE_MXN, slots, caso.seleccion)).toBe(caso.esperadoMxn);
  });
  it("Doble con defaults (la fila que el dueño ve en la vista previa)", () => {
    const caso = CASOS_PRECIO_COMBO.dobleConDefaults;
    expect(precioCombo(COMBO_BASE_MXN, slots, caso.seleccion)).toBe(caso.esperadoMxn);
  });
});

describe("vistaPrevia", () => {
  it("una fila por opción del primer slot con el resto en default, más los deltas de los otros slots", () => {
    const v = vistaPrevia(COMBO_BASE_MXN, slots);
    expect(v.principales).toEqual([
      { nombre: "Clásica", precio: CASOS_PRECIO_COMBO.clasicaConDefaults.esperadoMxn },
      { nombre: "Doble", precio: CASOS_PRECIO_COMBO.dobleConDefaults.esperadoMxn },
    ]);
    expect(v.deltas).toEqual([
      { slot: "Acompañamiento", nombre: "Aros", delta: opcionCombo("a2").deltaMxn },
      { slot: "Bebida", nombre: "Malteada", delta: opcionCombo("b2").deltaMxn },
    ]);
  });
});
