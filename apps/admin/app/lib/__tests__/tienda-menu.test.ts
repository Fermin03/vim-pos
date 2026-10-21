import { describe, expect, it } from "vitest";
import {
  arbolMenu, conCambio, filaOculta, inverso, resumenCategoria,
  type CategoriaCatalogo, type Ocultos, type ProductoCatalogo,
} from "../tienda-menu";

const cat = (id: string, orden = 0, nombre = id): CategoriaCatalogo => ({ id, nombre, orden });
const prod = (id: string, categoriaId: string, extra: Partial<ProductoCatalogo> = {}): ProductoCatalogo => ({
  id, nombre: id, categoriaId, orden: 0, esCombo: false, precio: 10, visibleEnPos: true, pausado: false, seVendeAqui: true, ...extra,
});
const ocultos = (categorias: string[] = [], productos: string[] = []): Ocultos => ({ categorias: new Set(categorias), productos: new Set(productos) });

describe("el árbol del menú de la tienda", () => {
  it("sin nada escondido, todo se ve y el contador lo dice", () => {
    const [c] = arbolMenu([cat("hamb")], [prod("a", "hamb"), prod("b", "hamb")], ocultos());
    expect(c).toMatchObject({ id: "hamb", escondida: false, total: 2, visibles: 2, escondidos: [] });
    expect(c?.productos.map((p) => [p.id, p.escondido, p.nota])).toEqual([["a", false, null], ["b", false, null]]);
  });

  it("un producto escondido baja el contador y queda listo para «Mostrar todos»", () => {
    const [c] = arbolMenu([cat("hamb")], [prod("a", "hamb"), prod("b", "hamb")], ocultos([], ["b"]));
    expect(c).toMatchObject({ total: 2, visibles: 1, escondidos: ["b"] });
    expect(c?.productos.find((p) => p.id === "b")?.escondido).toBe(true);
  });

  it("con la categoría escondida no se ve ninguno, y lo que cada producto tenía elegido se conserva", () => {
    const [c] = arbolMenu([cat("hamb")], [prod("a", "hamb"), prod("b", "hamb")], ocultos(["hamb"], ["b"]));
    expect(c).toMatchObject({ escondida: true, total: 2, visibles: 0, escondidos: ["b"] });
    expect(c?.productos.map((p) => p.escondido)).toEqual([false, true]);
  });

  it("donde el interruptor no manda, el producto lleva su nota y no cuenta", () => {
    const [c] = arbolMenu([cat("hamb")], [
      prod("ok", "hamb"), prod("oculto-pos", "hamb", { visibleEnPos: false }),
      prod("pausado", "hamb", { pausado: true }), prod("no-aqui", "hamb", { seVendeAqui: false }),
    ], ocultos());
    expect(c).toMatchObject({ total: 1, visibles: 1 });
    expect(Object.fromEntries(c?.productos.map((p) => [p.id, p.nota]) ?? [])).toEqual({
      ok: null,
      "oculto-pos": "No está visible en el punto de venta",
      pausado: "Está pausado",
      "no-aqui": "No se vende en esta sucursal",
    });
  });

  it("la categoría sin nada que la tienda pueda enseñar no sale; tampoco la que no tiene productos", () => {
    const arbol = arbolMenu([cat("vacia"), cat("apagada"), cat("hamb")], [prod("x", "apagada", { visibleEnPos: false }), prod("a", "hamb")], ocultos());
    expect(arbol.map((c) => c.id)).toEqual(["hamb"]);
  });

  it("respeta el orden del catálogo y desempata por nombre", () => {
    const arbol = arbolMenu(
      [cat("z", 2), cat("b", 1, "Bebidas"), cat("a", 1, "Antojos")],
      [prod("z1", "z"), prod("b2", "b", { orden: 2 }), prod("b1", "b", { orden: 1 }), prod("a1", "a")], ocultos());
    expect(arbol.map((c) => c.id)).toEqual(["a", "b", "z"]);
    expect(arbol[1]?.productos.map((p) => p.id)).toEqual(["b1", "b2"]);
  });

  it("un producto de una categoría que no llegó (inactiva o borrada) no rompe nada", () => {
    expect(arbolMenu([cat("hamb")], [prod("a", "hamb"), prod("huerfano", "otra")], ocultos()).map((c) => c.id)).toEqual(["hamb"]);
  });
});

describe("aplicar y deshacer un cambio", () => {
  it("esconder agrega, mostrar quita, y no toca el conjunto original", () => {
    const antes = ocultos(["c1"], ["p1"]);
    const despues = conCambio(antes, { tipo: "producto", id: "p2", escondido: true });
    expect([...despues.productos]).toEqual(["p1", "p2"]);
    expect([...antes.productos]).toEqual(["p1"]);
    expect([...conCambio(despues, { tipo: "categoria", id: "c1", escondido: false }).categorias]).toEqual([]);
  });

  it("el inverso deja todo como estaba, aunque en medio haya entrado otro cambio", () => {
    const cambio = { tipo: "producto", id: "p1", escondido: true } as const;
    const conOtro = conCambio(conCambio(ocultos(), cambio), { tipo: "producto", id: "p2", escondido: true });
    expect([...conCambio(conOtro, inverso(cambio)).productos]).toEqual(["p2"]);
  });
});

describe("la fila que se guarda", () => {
  it("lleva exactamente una de las dos columnas", () => {
    expect(filaOculta("t", "s", { tipo: "categoria", id: "c" })).toEqual({ tenant_id: "t", sucursal_id: "s", categoria_id: "c", producto_id: null });
    expect(filaOculta("t", "s", { tipo: "producto", id: "p" })).toEqual({ tenant_id: "t", sucursal_id: "s", categoria_id: null, producto_id: "p" });
  });
});

describe("el resumen de una categoría", () => {
  it.each([
    [{ escondida: false, total: 15, visibles: 12 }, "12 de 15 productos visibles"],
    [{ escondida: false, total: 1, visibles: 1 }, "1 producto visible"],
    [{ escondida: false, total: 1, visibles: 0 }, "Su único producto está escondido"],
    [{ escondida: true, total: 15, visibles: 0 }, "Escondida: ninguno de sus 15 productos aparece en la tienda"],
    [{ escondida: true, total: 1, visibles: 0 }, "Escondida: su producto no aparece en la tienda"],
  ])("%j", (c, texto) => expect(resumenCategoria(c)).toBe(texto));
});
