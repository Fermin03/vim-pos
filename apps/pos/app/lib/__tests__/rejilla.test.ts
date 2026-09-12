import { describe, expect, it } from "vitest";
import { calcularBarraCategorias, calcularRejilla, clampPagina, tamanoEtiqueta, tamanoNombre } from "../rejilla";

/**
 * Aritmética del catálogo. Los anchos/altos de estas pruebas son el HUECO ÚTIL del catálogo
 * (ya descontados el sidebar del ticket, el chrome superior y el padding), no el de la ventana:
 *
 *   1366×768  → 889×538   (sidebar 26vw con piso de 18rem)
 *   1024×768  → 696×538
 *   1920×1080 → 1381×850
 */

describe("calcularRejilla", () => {
  it("en 1366×768 con un menú corto usa la ficha grande: 5 columnas × 4 filas", () => {
    const r = calcularRejilla({ ancho: 889, alto: 538, total: 12 });
    expect(r.columnas).toBe(5);
    expect(r.filas).toBe(4);
    expect(r.porPagina).toBe(20);
    expect(r.paginas).toBe(1);
  });

  it("densifica antes de paginar: 30 productos caben en una sola página", () => {
    const r = calcularRejilla({ ancho: 889, alto: 538, total: 30 });
    expect(r.porPagina).toBeGreaterThanOrEqual(30);
    expect(r.paginas).toBe(1);
  });

  it("densifica lo justo: 24 productos no llegan al tamaño mínimo de ficha", () => {
    const r = calcularRejilla({ ancho: 889, alto: 538, total: 24 });
    expect(r.columnas).toBe(6);
    expect(r.filas).toBe(5);
    expect(r.anchoFicha).toBeGreaterThan(110);
    expect(r.altoFicha).toBeGreaterThan(92);
  });

  it("cuando ni la densidad máxima alcanza, pagina en vez de encoger más", () => {
    const r = calcularRejilla({ ancho: 889, alto: 538, total: 100 });
    expect(r.porPagina).toBe(35);
    expect(r.paginas).toBe(3);
  });

  it("nunca baja del piso táctil de 110×92, por muchos productos que haya", () => {
    const r = calcularRejilla({ ancho: 889, alto: 538, total: 400 });
    expect(r.anchoFicha).toBeGreaterThanOrEqual(110);
    expect(r.altoFicha).toBeGreaterThanOrEqual(92);
  });

  it("la celda llena el hueco completo: ni franja muerta abajo ni canal a la derecha", () => {
    const r = calcularRejilla({ ancho: 889, alto: 538, total: 2 });
    const anchoUsado = r.columnas * r.anchoFicha + 12 * (r.columnas - 1);
    const altoUsado = r.filas * r.altoFicha + 12 * (r.filas - 1);
    expect(889 - anchoUsado).toBeLessThanOrEqual(r.columnas);
    expect(538 - altoUsado).toBeLessThanOrEqual(r.filas);
  });

  it("la celda mide igual con 3 productos que con 12: la cuadrícula no cambia de forma", () => {
    const pocos = calcularRejilla({ ancho: 889, alto: 538, total: 3 });
    const varios = calcularRejilla({ ancho: 889, alto: 538, total: 12 });
    expect(pocos.anchoFicha).toBe(varios.anchoFicha);
    expect(pocos.altoFicha).toBe(varios.altoFicha);
  });

  it("categoría vacía: una página y sin división entre cero", () => {
    const r = calcularRejilla({ ancho: 889, alto: 538, total: 0 });
    expect(r.paginas).toBe(1);
    expect(r.porPagina).toBeGreaterThan(0);
  });

  it("en tablet de 1024 caben 24 productos sin paginar y con ficha legible", () => {
    const r = calcularRejilla({ ancho: 696, alto: 538, total: 24 });
    expect(r.paginas).toBe(1);
    expect(r.columnas).toBeGreaterThanOrEqual(4);
    expect(r.anchoFicha).toBeGreaterThanOrEqual(110);
    expect(r.altoFicha).toBeGreaterThanOrEqual(92);
  });

  it("en Full HD 60 productos caben en una sola página", () => {
    const r = calcularRejilla({ ancho: 1381, alto: 850, total: 60 });
    expect(r.paginas).toBe(1);
    expect(r.anchoFicha).toBeGreaterThanOrEqual(110);
    expect(r.altoFicha).toBeGreaterThanOrEqual(92);
  });

  it("un hueco absurdamente chico sigue devolviendo una rejilla usable", () => {
    const r = calcularRejilla({ ancho: 90, alto: 60, total: 10 });
    expect(r.columnas).toBe(1);
    expect(r.filas).toBe(1);
    expect(r.porPagina).toBe(1);
    expect(r.paginas).toBe(10);
  });

  it("antes de la primera medición (hueco 0) no truena", () => {
    const r = calcularRejilla({ ancho: 0, alto: 0, total: 8 });
    expect(r.porPagina).toBeGreaterThan(0);
    expect(r.paginas).toBeGreaterThan(0);
  });
});

describe("clampPagina", () => {
  it("deja la página en su sitio cuando es válida", () => {
    expect(clampPagina(2, 5)).toBe(2);
  });

  it("baja a la última cuando la rejilla creció y sobran páginas", () => {
    // Pasa al maximizar la ventana estando en la página 3 de 3.
    expect(clampPagina(3, 2)).toBe(2);
  });

  it("nunca devuelve una página menor que 1", () => {
    expect(clampPagina(0, 3)).toBe(1);
    expect(clampPagina(-2, 3)).toBe(1);
  });
});

describe("calcularBarraCategorias", () => {
  it("reparte parejo en dos filas: 11 categorías salen 6 y 5, no 10 y 1", () => {
    const b = calcularBarraCategorias({ ancho: 971, total: 11 });
    expect(b.filas).toBe(2);
    expect(b.columnas).toBe(6);
  });

  it("con pocas categorías las pastillas llenan el ancho en una sola fila", () => {
    const b = calcularBarraCategorias({ ancho: 971, total: 4 });
    expect(b.filas).toBe(1);
    expect(b.columnas).toBe(4);
    expect(b.columnas * b.anchoPastilla + 8 * (b.columnas - 1)).toBeGreaterThan(971 - b.columnas);
  });

  it("un menú disparatado usa más filas antes que achicar la pastilla por debajo del mínimo", () => {
    const b = calcularBarraCategorias({ ancho: 696, total: 20 });
    expect(b.anchoPastilla).toBeGreaterThanOrEqual(88);
    expect(b.filas).toBeGreaterThan(2);
  });

  it("sin categorías todavía no truena", () => {
    const b = calcularBarraCategorias({ ancho: 971, total: 0 });
    expect(b.columnas).toBeGreaterThanOrEqual(1);
    expect(b.filas).toBeGreaterThanOrEqual(1);
  });

  it("antes de la primera medición devuelve una pastilla usable", () => {
    const b = calcularBarraCategorias({ ancho: 0, total: 8 });
    expect(b.anchoPastilla).toBeGreaterThanOrEqual(88);
  });
});

describe("tamaño del texto", () => {
  it("la celda grande usa el texto máximo y la mínima el mínimo", () => {
    expect(tamanoNombre(184, 128)).toBe(16);
    expect(tamanoNombre(110, 92)).toBe(11);
  });

  it("el nombre nunca baja de 11px ni sube de 16px", () => {
    expect(tamanoNombre(40, 30)).toBe(11);
    expect(tamanoNombre(900, 900)).toBe(16);
  });

  it("la etiqueta de categoría se achica con la pastilla pero no desaparece", () => {
    expect(tamanoEtiqueta(155)).toBe(14);
    expect(tamanoEtiqueta(92)).toBe(11);
  });
});
