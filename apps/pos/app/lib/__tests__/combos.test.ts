import { describe, it, expect } from "vitest";
import type { Producto } from "../catalogo";
import { armarCombos, precioCombo, slotValido, componentesPorDefecto, combosQueAdmiten, diferencialCombo, type ComboDef, type ComponenteSel, type FilaComboGrupo } from "../combos";

const prod = (id: string, nombre: string, precio: number, categoria_id: string, extra: Partial<Producto> = {}): Producto => ({
  id, nombre, descripcion: null, precio_base_mxn: precio, categoria_id, agotado: false, esCombo: false,
  sku: null, tasaIva: 16, ivaIncluido: true, claveSat: null, unidadSat: null, categoriaNombre: null, ...extra,
});
const combo = prod("c1", "Combo", 45, "cat-combos", { esCombo: true });
const clasica = prod("h1", "Clásica", 95, "cat-hamb");
const doble = prod("h2", "Doble", 130, "cat-hamb");
const veggie = prod("h3", "Veggie", 105, "cat-hamb", { agotado: true });
const papas = prod("a1", "Papas", 45, "cat-acom");
const aros = prod("a2", "Aros", 55, "cat-acom");
const refresco = prod("b1", "Refresco", 30, "cat-beb");
const malteada = prod("b2", "Malteada", 55, "cat-beb");
const brownie = prod("p1", "Brownie", 45, "cat-pos");
const productos = [combo, clasica, doble, veggie, papas, aros, refresco, malteada, brownie];

const filas: FilaComboGrupo[] = [
  { id: "g-hamb", combo_producto_id: "c1", nombre: "Hamburguesa", orden_visualizacion: 1, minimo_selecciones: 1, maximo_selecciones: 1, modo_precio: "SUMA_PRECIO_PRODUCTO", categoria_id: "cat-hamb",
    opciones: [{ producto_id: "h3", precio_delta_mxn: 0, es_default: false, activa: false, deleted_at: null, orden_visualizacion: 0 }] },
  { id: "g-acom", combo_producto_id: "c1", nombre: "Acompañamiento", orden_visualizacion: 2, minimo_selecciones: 1, maximo_selecciones: 1, modo_precio: "DELTA", categoria_id: null,
    opciones: [
      { producto_id: "a1", precio_delta_mxn: 0, es_default: true, activa: true, deleted_at: null, orden_visualizacion: 1 },
      { producto_id: "a2", precio_delta_mxn: 15, es_default: false, activa: true, deleted_at: null, orden_visualizacion: 2 },
    ] },
  { id: "g-beb", combo_producto_id: "c1", nombre: "Bebida", orden_visualizacion: 3, minimo_selecciones: 1, maximo_selecciones: 1, modo_precio: "DELTA", categoria_id: null,
    opciones: [
      { producto_id: "b1", precio_delta_mxn: 0, es_default: true, activa: true, deleted_at: null, orden_visualizacion: 1 },
      { producto_id: "b2", precio_delta_mxn: 25, es_default: false, activa: true, deleted_at: null, orden_visualizacion: 2 },
    ] },
];
const comp = (grupoId: string, grupoNombre: string, producto: Producto, cantidad = 1): ComponenteSel =>
  ({ grupoId, grupoNombre, producto, cantidad, modificadores: [], notaCocina: null, clientId: `c-${producto.id}` });

describe("armarCombos", () => {
  it("resuelve un slot por categoría con todos sus productos y excluye la fila inactiva", () => {
    const [c] = armarCombos(filas, productos);
    expect(c.producto.id).toBe("c1");
    expect(c.slots.map((s) => s.nombre)).toEqual(["Hamburguesa", "Acompañamiento", "Bebida"]);
    expect(c.slots[0].opciones.map((o) => o.producto.id)).toEqual(["h1", "h2"]);
    expect(c.slots[1].opciones.find((o) => o.producto.id === "a2")?.delta).toBe(15);
  });
  it("ignora slots de un combo que no está en el catálogo", () => {
    expect(armarCombos([{ ...filas[0], combo_producto_id: "zz" }], productos)).toEqual([]);
  });
});

describe("precioCombo", () => {
  const c: ComboDef = armarCombos(filas, productos)[0];
  it("suma base + precio de la hamburguesa + deltas", () => {
    expect(precioCombo(c, [comp("g-hamb", "Hamburguesa", doble), comp("g-acom", "Acompañamiento", aros), comp("g-beb", "Bebida", refresco)])).toBe(190);
  });
  it("con defaults vale base + hamburguesa", () => {
    expect(precioCombo(c, [comp("g-hamb", "Hamburguesa", clasica), ...componentesPorDefecto(c).filter((x) => x.grupoId !== "g-hamb")])).toBe(140);
  });
  it("multiplica por la cantidad del componente", () => {
    expect(precioCombo(c, [comp("g-hamb", "Hamburguesa", clasica), comp("g-acom", "Acompañamiento", aros, 2), comp("g-beb", "Bebida", refresco)])).toBe(170);
  });
});

describe("slotValido y defaults", () => {
  const c = armarCombos(filas, productos)[0];
  it("exige entre min y max", () => {
    expect(slotValido(c.slots[1], [])).toBe(false);
    expect(slotValido(c.slots[1], [comp("g-acom", "Acompañamiento", papas)])).toBe(true);
    expect(slotValido(c.slots[1], [comp("g-acom", "Acompañamiento", papas), comp("g-acom", "Acompañamiento", aros)])).toBe(false);
  });
  it("componentesPorDefecto preselecciona papas y refresco, no la hamburguesa (sin default)", () => {
    expect(componentesPorDefecto(c).map((x) => x.producto.id)).toEqual(["a1", "b1"]);
  });
  it("un default agotado no se preselecciona", () => {
    const c2 = armarCombos(filas, productos.map((p) => (p.id === "a1" ? { ...p, agotado: true } : p)))[0];
    expect(componentesPorDefecto(c2).map((x) => x.producto.id)).toEqual(["b1"]);
  });
});

describe("upsell", () => {
  const combos = armarCombos(filas, productos);
  it("una hamburguesa suelta es admitida por el combo; un brownie no", () => {
    expect(combosQueAdmiten(doble, combos).map((c) => c.producto.id)).toEqual(["c1"]);
    expect(combosQueAdmiten(brownie, combos)).toEqual([]);
  });
  it("el diferencial es el combo con defaults menos el precio suelto", () => {
    expect(diferencialCombo(combos[0], doble)).toEqual({ extra: 45, resto: ["papas", "refresco"] });
  });
});
