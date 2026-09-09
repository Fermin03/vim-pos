import { describe, it, expect } from "vitest";
import { CASOS_PRECIO_COMBO, COMBO_BASE_MXN, opcionCombo, SLOTS_COMBO } from "@vim/db/fixtures-combos";
import type { Producto } from "../catalogo";
import { armarCombos, precioCombo, slotValido, componentesPorDefecto, combosQueAdmiten, diferencialCombo, type ComboDef, type ComponenteSel, type FilaComboGrupo } from "../combos";

// Los precios salen de la fixture compartida `@vim/db/fixtures-combos`, la MISMA que lee
// `apps/admin/app/lib/__tests__/combos.test.ts`. El precio del combo está implementado tres veces
// (RPC, caja y admin) y antes lo único que sostenía la paridad era que los dos archivos de prueba
// codificaban a mano los mismos 190 y 140: si una implementación se movía, el otro seguía verde.

const prod = (id: string, nombre: string, precio: number, categoria_id: string, extra: Partial<Producto> = {}): Producto => ({
  id, nombre, descripcion: null, precio_base_mxn: precio, categoria_id, agotado: false, esCombo: false,
  sku: null, tasaIva: 16, ivaIncluido: true, claveSat: null, unidadSat: null, categoriaNombre: null, ...extra,
});
const combo = prod("c1", "Combo", COMBO_BASE_MXN, "cat-combos", { esCombo: true });
// Fuera de la fixture: no participan en ningún precio, solo en la elegibilidad y el agotado.
const veggie = prod("h3", "Veggie", 105, "cat-hamb", { agotado: true });
const brownie = prod("p1", "Brownie", 45, "cat-pos");
const productos: Producto[] = [
  combo,
  ...SLOTS_COMBO.flatMap((s) => s.opciones.map((o) => prod(o.productoId, o.nombre, o.precioMxn, s.categoriaId))),
  veggie,
  brownie,
];
const porId = new Map(productos.map((p) => [p.id, p]));
const P = (id: string): Producto => {
  const p = porId.get(id);
  if (!p) throw new Error(`producto ${id} fuera del catálogo de prueba`);
  return p;
};
const clasica = P("h1");
const doble = P("h2");
const papas = P("a1");
const aros = P("a2");
const refresco = P("b1");

const filas: FilaComboGrupo[] = SLOTS_COMBO.map((s, i) => ({
  id: s.id,
  combo_producto_id: "c1",
  nombre: s.nombre,
  orden_visualizacion: i + 1,
  minimo_selecciones: 1,
  maximo_selecciones: 1,
  modo_precio: s.modoPrecio,
  categoria_id: s.porCategoria ? s.categoriaId : null,
  // Un slot por categoría no lista sus opciones —salen del catálogo—; la única fila que tiene aquí
  // es la del Veggie desactivada, para comprobar que armarCombos la excluye.
  opciones: s.porCategoria
    ? [{ producto_id: "h3", precio_delta_mxn: 0, es_default: false, activa: false, deleted_at: null, orden_visualizacion: 0 }]
    : s.opciones.map((o, j) => ({
        producto_id: o.productoId,
        precio_delta_mxn: o.deltaMxn,
        es_default: o.esDefault,
        activa: true,
        deleted_at: null,
        orden_visualizacion: j + 1,
      })),
}));

const comp = (grupoId: string, grupoNombre: string, producto: Producto, cantidad = 1): ComponenteSel =>
  ({ grupoId, grupoNombre, producto, cantidad, modificadores: [], notaCocina: null, clientId: `c-${producto.id}` });

/** Traduce un caso de la fixture (grupo_id → producto_id) a los componentes que espera la caja. */
const componentesDeCaso = (seleccion: Record<string, string>): ComponenteSel[] =>
  SLOTS_COMBO.map((s) => {
    const id = seleccion[s.id];
    if (!id) throw new Error(`el caso no elige nada en el slot ${s.id}`);
    return comp(s.id, s.nombre, P(id));
  });

describe("armarCombos", () => {
  it("resuelve un slot por categoría con todos sus productos y excluye la fila inactiva", () => {
    const [c] = armarCombos(filas, productos);
    expect(c!.producto.id).toBe("c1");
    expect(c!.slots.map((s) => s.nombre)).toEqual(["Hamburguesa", "Acompañamiento", "Bebida"]);
    expect(c!.slots[0]!.opciones.map((o) => o.producto.id)).toEqual(["h1", "h2"]);
    expect(c!.slots[1]!.opciones.find((o) => o.producto.id === "a2")?.delta).toBe(opcionCombo("a2").deltaMxn);
  });
  it("ignora slots de un combo que no está en el catálogo", () => {
    expect(armarCombos([{ ...filas[0]!, combo_producto_id: "zz" }], productos)).toEqual([]);
  });
});

describe("precioCombo", () => {
  const c: ComboDef = armarCombos(filas, productos)[0]!;
  it("suma base + precio de la hamburguesa + deltas", () => {
    const caso = CASOS_PRECIO_COMBO.dobleArosRefresco;
    expect(precioCombo(c, componentesDeCaso(caso.seleccion))).toBe(caso.esperadoMxn);
  });
  it("con defaults vale base + hamburguesa", () => {
    const caso = CASOS_PRECIO_COMBO.clasicaConDefaults;
    expect(precioCombo(c, [comp("g-hamb", "Hamburguesa", clasica), ...componentesPorDefecto(c).filter((x) => x.grupoId !== "g-hamb")]))
      .toBe(caso.esperadoMxn);
  });
  it("multiplica por la cantidad del componente", () => {
    const esperado = COMBO_BASE_MXN + opcionCombo("h1").precioMxn + opcionCombo("a2").deltaMxn * 2;
    expect(precioCombo(c, [comp("g-hamb", "Hamburguesa", clasica), comp("g-acom", "Acompañamiento", aros, 2), comp("g-beb", "Bebida", refresco)]))
      .toBe(esperado);
  });
});

describe("slotValido y defaults", () => {
  const c = armarCombos(filas, productos)[0]!;
  it("exige entre min y max", () => {
    expect(slotValido(c.slots[1]!, [])).toBe(false);
    expect(slotValido(c.slots[1]!, [comp("g-acom", "Acompañamiento", papas)])).toBe(true);
    expect(slotValido(c.slots[1]!, [comp("g-acom", "Acompañamiento", papas), comp("g-acom", "Acompañamiento", aros)])).toBe(false);
  });
  it("componentesPorDefecto preselecciona papas y refresco, no la hamburguesa (sin default)", () => {
    expect(componentesPorDefecto(c).map((x) => x.producto.id)).toEqual(["a1", "b1"]);
  });
  it("un default agotado no se preselecciona", () => {
    const c2 = armarCombos(filas, productos.map((p) => (p.id === "a1" ? { ...p, agotado: true } : p)))[0]!;
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
    // 175 (la Doble con los defaults) − 130 (la Doble suelta) = 45.
    const extra = CASOS_PRECIO_COMBO.dobleConDefaults.esperadoMxn - opcionCombo("h2").precioMxn;
    expect(diferencialCombo(combos[0]!, doble)).toEqual({ extra, resto: ["papas", "refresco"] });
  });
});
