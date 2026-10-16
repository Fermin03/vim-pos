import { describe, it, expect } from "vitest";
import type { Producto } from "../catalogo";
import type { DatosCaja } from "../turno";
import { agruparTienda, buscarPorCodigo, decidirEscaneo, esTienda, estadoExistencia, matrizVariantes, resumenVitrina, type Existencia } from "../tienda";

const prod = (id: string, extra: Partial<Producto> = {}): Producto => ({
  id, nombre: id, descripcion: null, precio_base_mxn: 100, categoria_id: "c", agotado: false, esCombo: false, seVendeAqui: true, ...extra,
});
const padre = prod("P", { variante_ejes: ["Talla", "Color"] });
const h = (id: string, talla: string, color: string, precio = 100, extra: Partial<Producto> = {}) =>
  prod(id, { producto_padre_id: "P", variante_valores: { Talla: talla, Color: color }, precio_base_mxn: precio, ...extra });
const hijas = [h("h1", "M", "Negro"), h("h2", "L", "Negro"), h("h3", "M", "Rojo")];
const suelto = prod("S");
const ex = (producto_id: string, cantidad: number, minimo: number | null = null): Existencia => ({ producto_id, sucursal_id: "s1", cantidad, minimo });

describe("esTienda", () => {
  it("solo RETAIL", () => {
    expect(esTienda({ giro: "RETAIL" } as DatosCaja)).toBe(true);
    expect(esTienda({ giro: "RESTAURANTE" } as DatosCaja)).toBe(false);
    expect(esTienda({} as DatosCaja)).toBe(false);
    expect(esTienda(null)).toBe(false);
  });
});

describe("agruparTienda", () => {
  it("deja fuera las hijas", () => {
    const { vitrina, padres } = agruparTienda([padre, ...hijas, suelto]);
    expect(vitrina.map((p) => p.id)).toEqual(["P", "S"]);
    expect(padres.get("P")?.hijas.map((x) => x.id)).toEqual(["h1", "h2", "h3"]);
    expect(padres.get("P")?.ejes).toEqual(["Talla", "Color"]);
    expect(padres.has("S")).toBe(false);
  });
});

describe("buscarPorCodigo", () => {
  const lista = [padre, h("h1", "M", "Negro", 100, { codigo_barras: "750100", codigo_interno: "SKU-1" }), h("h2", "L", "Negro", 100, { codigo_interno: "750100" }),
    prod("P2", { codigo_barras: "999", variante_ejes: ["Talla"] }), prod("h9", { producto_padre_id: "P2", codigo_barras: "999" })];
  it("barras con espacios y mayúsculas, antes que SKU", () => {
    expect(buscarPorCodigo(lista, " 750100 ")?.id).toBe("h1");
    expect(buscarPorCodigo(lista, "sku-1")?.id).toBe("h1");
  });
  it("nunca un padre ni vacío", () => {
    expect(buscarPorCodigo(lista, "999")?.id).toBe("h9");
    expect(buscarPorCodigo([padre, ...hijas, prod("P3", { variante_ejes: ["Talla"], codigo_barras: "5" })], "5")).toBeNull();
    expect(buscarPorCodigo(lista, "  ")).toBeNull();
  });
});

describe("estadoExistencia", () => {
  it("umbrales", () => {
    expect(estadoExistencia(0, null)).toBe("agotada");
    expect(estadoExistencia(2, null)).toBe("pocas");
    expect(estadoExistencia(3, null)).toBe("normal");
    expect(estadoExistencia(5, 5)).toBe("pocas");
    expect(estadoExistencia(-1, 3)).toBe("agotada");
  });
});

describe("matrizVariantes", () => {
  const pt = agruparTienda([padre, ...hijas]).padres.get("P")!;
  const exs = [ex("h1", 4), ex("h2", 0), { ...ex("h3", 1), sucursal_id: "s2" }];
  it("dos ejes: null en combinación inexistente", () => {
    const m = matrizVariantes(pt, exs, "s1");
    expect(m.columnas).toEqual(["M", "L"]);
    expect(m.renglones).toEqual(["Negro", "Rojo"]);
    expect(m.celda("M", "Negro")).toMatchObject({ cantidad: 4, estado: "normal" });
    expect(m.celda("L", "Negro")).toMatchObject({ cantidad: 0, estado: "agotada" });
    expect(m.celda("L", "Rojo")).toBeNull();
    expect(m.celda("M", "Rojo")?.cantidad).toBe(0); // existe en otra sucursal, no en s1
  });
  it("un eje: un renglón", () => {
    const uno = agruparTienda([{ ...padre, variante_ejes: ["Talla"] }, prod("a", { producto_padre_id: "P", variante_valores: { Talla: "S" } }), prod("b", { producto_padre_id: "P", variante_valores: { Talla: "M" } })]).padres.get("P")!;
    const m = matrizVariantes(uno, [ex("b", 7)], "s1");
    expect(m.columnas).toEqual(["S", "M"]);
    expect(m.renglones).toEqual([""]);
    expect(m.celda("M", "")?.cantidad).toBe(7);
  });
});

describe("resumenVitrina", () => {
  const { padres } = agruparTienda([padre, ...hijas, suelto]);
  it("suma las hijas y precioDesde solo si difieren", () => {
    const exs = [ex("h1", 4), ex("h2", 1), ex("h3", 0)];
    expect(resumenVitrina(padre, padres, exs, "s1")).toEqual({ piezas: 5, estado: "normal", precioDesde: null });
    const caro = agruparTienda([padre, h("h1", "M", "Negro", 349), h("h2", "L", "Negro", 399)]).padres;
    expect(resumenVitrina(padre, caro, [ex("h1", 1), ex("h2", 1)], "s1")).toMatchObject({ piezas: 2, estado: "pocas", precioDesde: 349 });
  });
  it("producto suelto usa su propia existencia", () => {
    expect(resumenVitrina(suelto, padres, [ex("S", 0)], "s1")).toEqual({ piezas: 0, estado: "agotada", precioDesde: null });
  });
});

describe("decidirEscaneo", () => {
  const lista = [{ ...padre, codigo_barras: "PADRE-1" }, h("h1", "M", "Negro", 100, { codigo_barras: "750100" }), suelto];
  const libre = { cobroAbierto: false, ignorar: false };
  it("agrega lo que encuentra y avisa lo que no", () => {
    expect(decidirEscaneo(lista, "750100", libre)).toEqual({ tipo: "agregar", producto: lista[1] });
    expect(decidirEscaneo(lista, "000", libre)).toEqual({ tipo: "no-encontrado" });
  });
  it("el código de un padre abre su selector, nunca lo agrega", () => {
    expect(decidirEscaneo(lista, " padre-1 ", libre)).toEqual({ tipo: "selector", padre: lista[0] });
  });
  it("con el cobro abierto no agrega; bajo un diálogo se ignora (aunque el cobro esté abierto)", () => {
    expect(decidirEscaneo(lista, "750100", { cobroAbierto: true, ignorar: false })).toEqual({ tipo: "cobro" });
    expect(decidirEscaneo(lista, "750100", { cobroAbierto: true, ignorar: true })).toEqual({ tipo: "ignorar" });
    expect(decidirEscaneo(lista, "000", { cobroAbierto: false, ignorar: true })).toEqual({ tipo: "ignorar" });
  });
});
