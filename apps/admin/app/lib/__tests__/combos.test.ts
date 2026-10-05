import { describe, it, expect } from "vitest";
import { CASOS_PRECIO_COMBO, COMBO_BASE_MXN, opcionCombo, SLOTS_COMBO } from "@vim/db/fixtures-combos";
import { precioCombo, slotsEnMenu, vistaPrevia, type SlotConOpciones } from "../combos";
import type { FilaDeMenu } from "../menus";

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

// Menús del catálogo (ADR 0029): dentro de un menú propio la vista previa cuenta con los precios de
// ESE menú —el del combo y el de cada componente—, que es lo que cobra la caja de sus sucursales.
describe("vista previa dentro de un menú propio", () => {
  // El menú copia el General y luego cambia lo suyo: la Doble cuesta $15 más y los Aros no se venden.
  const doble = opcionCombo("h2");
  const aros = opcionCombo("a2");
  const filas = new Map<string, FilaDeMenu>(
    SLOTS_COMBO.flatMap((s) => s.opciones).map((o) => [o.productoId, { disponible: true, precio_mxn: o.precioMxn }]),
  );
  filas.set(doble.productoId, { disponible: true, precio_mxn: doble.precioMxn + 15 });
  filas.set(aros.productoId, { disponible: false, precio_mxn: aros.precioMxn });
  const enMenu = slotsEnMenu(slots, filas);
  const BASE_EN_MENU = COMBO_BASE_MXN + 10;

  it("cobra cada componente al precio del menú, y el combo a su precio en el menú", () => {
    const caso = CASOS_PRECIO_COMBO.dobleConDefaults;
    expect(precioCombo(BASE_EN_MENU, enMenu, caso.seleccion)).toBe(caso.esperadoMxn + 10 + 15);
  });
  it("lo que el menú no cambia cuesta lo mismo que en el General (más la diferencia del combo)", () => {
    const caso = CASOS_PRECIO_COMBO.clasicaConDefaults;
    expect(precioCombo(BASE_EN_MENU, enMenu, caso.seleccion)).toBe(caso.esperadoMxn + 10);
  });
  it("no ofrece lo que el menú tiene apagado ni lo que no está en el menú", () => {
    const acompanamientos = enMenu.find((s) => s.opciones.length !== slots.find((x) => x.id === s.id)!.opciones.length);
    expect(acompanamientos?.opciones.some((o) => o.producto_id === aros.productoId)).toBe(false);
    expect(vistaPrevia(BASE_EN_MENU, enMenu).deltas.some((d) => d.nombre === aros.nombre)).toBe(false);
    // Sin fila en el menú tampoco se ofrece: no se adivina un precio.
    const sinDoble = new Map(filas);
    sinDoble.delete(doble.productoId);
    expect(vistaPrevia(BASE_EN_MENU, slotsEnMenu(slots, sinDoble)).principales.map((x) => x.nombre)).toEqual(["Clásica"]);
  });
  it("no toca los pasos originales ni el «cuesta de más» del combo", () => {
    expect(slots.flatMap((s) => s.opciones).find((o) => o.producto_id === doble.productoId)?.precio).toBe(doble.precioMxn);
    expect(enMenu.flatMap((s) => s.opciones).map((o) => o.delta)).toEqual(
      slots.flatMap((s) => s.opciones).filter((o) => o.producto_id !== aros.productoId).map((o) => o.delta),
    );
  });
});
