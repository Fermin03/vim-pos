import { describe, it, expect } from "vitest";
import {
  MENU_GENERAL,
  armarMenus,
  avisoAlMover,
  conteoPorCategoria,
  elegirMenuInicial,
  estadoCategoria,
  estadoEnMenu,
  filasDelGeneral,
  hayMenus,
  hrefConMenu,
  sucursalesDe,
  type SucursalDeMenu,
} from "../menus";

const sucursales: SucursalDeMenu[] = [
  { id: "centro", nombre: "León Centro", menuId: null },
  { id: "norte", nombre: "León Norte", menuId: "m1" },
  { id: "sur", nombre: "León Sur", menuId: "m1" },
];
const menus = armarMenus([{ id: "m1", nombre: "Menú Norte" }, { id: "m2", nombre: "Vacío" }], sucursales);

describe("menús y sus sucursales", () => {
  it("cada menú lleva las sucursales que lo usan; uno sin sucursales se conserva", () => {
    expect(menus.map((m) => [m.nombre, m.sucursales.map((s) => s.id)])).toEqual([
      ["Menú Norte", ["norte", "sur"]],
      ["Vacío", []],
    ]);
  });
  it("las sucursales del General son las que no tienen menú", () => {
    expect(sucursalesDe(MENU_GENERAL, sucursales).map((s) => s.id)).toEqual(["centro"]);
    expect(sucursalesDe("m1", sucursales).map((s) => s.id)).toEqual(["norte", "sur"]);
  });
  it("el selector se pinta con dos sucursales o con algún menú propio", () => {
    expect(hayMenus([], [sucursales[0]!])).toBe(false);
    expect(hayMenus([], sucursales)).toBe(true);
    expect(hayMenus(menus, [sucursales[0]!])).toBe(true);
  });
});

describe("qué menú se abre", () => {
  it("URL, luego lo último que se usó, luego el General", () => {
    expect(elegirMenuInicial(menus, "m1", "m2")).toBe("m1");
    expect(elegirMenuInicial(menus, null, "m2")).toBe("m2");
    expect(elegirMenuInicial(menus, null, null)).toBe(MENU_GENERAL);
  });
  it("un menú que ya no existe no se abre", () => {
    expect(elegirMenuInicial(menus, "borrado", null)).toBe(MENU_GENERAL);
    expect(elegirMenuInicial(menus, "general", "m1")).toBe(MENU_GENERAL);
  });
});

describe("estado de un producto y de una categoría en un menú", () => {
  it("pausado gana; apagado en el menú es «no se vende»", () => {
    expect(estadoEnMenu("PAUSADO", false)).toBe("PAUSADO");
    expect(estadoEnMenu("ACTIVO", false)).toBe("NO_SE_VENDE");
    expect(estadoEnMenu("ACTIVO", true)).toBe("ACTIVO");
  });
  it("una categoría está encendida, apagada o parcial según cuántos de sus productos se venden", () => {
    expect(estadoCategoria(3, 3)).toBe("encendida");
    expect(estadoCategoria(0, 3)).toBe("apagada");
    expect(estadoCategoria(1, 3)).toBe("parcial");
    expect(estadoCategoria(0, 0)).toBe("vacia");
  });
  it("las filas del General salen del producto", () => {
    const filas = filasDelGeneral([
      { id: "p1", precio_base_mxn: 120, en_menu_general: true },
      { id: "p2", precio_base_mxn: 55, en_menu_general: false },
    ]);
    expect(filas.get("p1")).toEqual({ disponible: true, precio_mxn: 120 });
    expect(filas.get("p2")).toEqual({ disponible: false, precio_mxn: 55 });
  });
});

describe("avisos del modal al mover sucursales", () => {
  it("dice de qué menú propio sale una sucursal; del General no avisa", () => {
    expect(avisoAlMover(["norte", "centro"], "m2", sucursales, menus)).toEqual(["León Norte dejará de usar Menú Norte."]);
  });
  it("no avisa de las que ya eran de este menú", () => {
    expect(avisoAlMover(["norte", "sur"], "m1", sucursales, menus)).toEqual([]);
  });
});

describe("conteo de una categoría en un menú", () => {
  it("cuenta cuántos de sus productos se venden en ese menú", () => {
    const productos = [
      { id: "h1", categoria_id: "hamb" },
      { id: "h2", categoria_id: "hamb" },
      { id: "p1", categoria_id: "papas" },
    ];
    const filas = new Map([
      ["h1", { disponible: true, precio_mxn: 120 }],
      ["h2", { disponible: false, precio_mxn: 150 }],
      ["p1", { disponible: false, precio_mxn: 55 }],
    ]);
    const c = conteoPorCategoria(productos, filas);
    expect(c.get("hamb")).toEqual({ seVenden: 1, total: 2 });
    expect(c.get("papas")).toEqual({ seVenden: 0, total: 1 });
    expect(c.get("vacia")).toBeUndefined();
  });
  it("un producto sin fila todavía cuenta como que se vende", () => {
    const c = conteoPorCategoria([{ id: "x", categoria_id: "c" }], new Map());
    expect(c.get("c")).toEqual({ seVenden: 1, total: 1 });
  });
});

describe("enlaces que llevan el menú", () => {
  it("agrega ?menu= con el menú que se está viendo", () => {
    expect(hrefConMenu("/catalogo/productos/p1", "m-norte")).toBe("/catalogo/productos/p1?menu=m-norte");
    expect(hrefConMenu("/catalogo/combos/nuevo", MENU_GENERAL)).toBe("/catalogo/combos/nuevo?menu=general");
  });
  it("respeta una consulta que ya traía el enlace", () => {
    expect(hrefConMenu("/catalogo/recetas?sin=1", "m-norte")).toBe("/catalogo/recetas?sin=1&menu=m-norte");
  });
  it("sin menús que elegir, el enlace queda como siempre", () => {
    expect(hrefConMenu("/catalogo/productos/p1", null)).toBe("/catalogo/productos/p1");
  });
});
