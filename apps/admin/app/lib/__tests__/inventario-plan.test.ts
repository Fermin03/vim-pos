import { describe, expect, it } from "vitest";
import { estadoInventario, INVENTARIO_INCLUYE, mensajeQuieroInventario, rutaEsDeInventario } from "../inventario-plan";

/*
 * El inventario viene desde el plan Negocio (0148, ADR 0025). El panel no esconde la sección:
 * explica qué es y cómo pedirla. El candado de verdad está en la base; esto es solo qué pantalla
 * enseñar, y ante la duda (cargando, la consulta falló) NO se le pone un muro a quien sí lo paga.
 */

describe("estadoInventario", () => {
  it("mientras se lee no dice nada todavía", () => {
    expect(estadoInventario(null)).toBe("cargando");
  });
  it("con el módulo permitido, las pantallas de siempre", () => {
    expect(estadoInventario({ permitidos: { recetas: true }, efectivos: { recetas: false } })).toBe("permitido");
  });
  it("sin el módulo, la explicación", () => {
    expect(estadoInventario({ permitidos: { recetas: false, kds: true }, efectivos: {} })).toBe("no_incluido");
  });
  it("si la consulta falló o vino vacía se deja pasar: el candado es la base, no esta pantalla", () => {
    expect(estadoInventario("error")).toBe("permitido");
    expect(estadoInventario({ permitidos: {}, efectivos: {} })).toBe("permitido");
  });
});

describe("mensajeQuieroInventario", () => {
  it("dice quién es, de qué negocio y qué quiere", () => {
    expect(mensajeQuieroInventario({ usuario: "Ana", negocio: "Tacos El Güero", codigo: "tacos-el-guero" }))
      .toBe("Hola, soy Ana de Tacos El Güero (tacos-el-guero). Quiero pasar al plan Negocio para usar el inventario.");
  });
  it("lo que falte se omite, sin undefined ni paréntesis vacíos", () => {
    expect(mensajeQuieroInventario({})).toBe("Hola. Quiero pasar al plan Negocio para usar el inventario.");
    expect(mensajeQuieroInventario({ negocio: "Tacos El Güero" })).toBe("Hola, escribo de Tacos El Güero. Quiero pasar al plan Negocio para usar el inventario.");
  });
});

describe("lo que incluye", () => {
  it("nombra lo que el sitio promete: insumos, recetas, compras y mermas", () => {
    const todo = INVENTARIO_INCLUYE.map((x) => `${x.titulo} ${x.detalle}`).join(" ").toLowerCase();
    for (const palabra of ["insumos", "recetas", "compras", "mermas"]) expect(todo).toContain(palabra);
    expect(INVENTARIO_INCLUYE.length).toBeGreaterThanOrEqual(4);
  });
});

describe("rutaEsDeInventario", () => {
  it("la sección de inventario y las recetas del catálogo", () => {
    expect(rutaEsDeInventario("/inventario")).toBe(true);
    expect(rutaEsDeInventario("/inventario/compras/nueva")).toBe(true);
    expect(rutaEsDeInventario("/catalogo/recetas")).toBe(true);
    expect(rutaEsDeInventario("/catalogo/recetas/abc")).toBe(true);
  });
  it("el resto del catálogo no", () => {
    expect(rutaEsDeInventario("/catalogo/productos")).toBe(false);
    expect(rutaEsDeInventario("/inventarios")).toBe(false);
    expect(rutaEsDeInventario("/dashboard")).toBe(false);
  });
});
