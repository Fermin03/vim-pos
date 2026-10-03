import { describe, it, expect } from "vitest";
import type { Categoria, Producto } from "../catalogo";
import { aplicarSucursal, menuVisible, type FilaProductoSucursal } from "../catalogo-sucursal";

// Mismos casos que 0035_menu_por_sucursal.test.sql y que menu-uber.test.ts: la regla vive en tres lugares.
const prod = (id: string, precio: number, categoria_id: string, extra: Partial<Producto> = {}): Producto => ({
  id, nombre: id, descripcion: null, precio_base_mxn: precio, categoria_id, agotado: false, esCombo: false, seVendeAqui: true,
  sku: null, tasaIva: 16, ivaIncluido: true, claveSat: null, unidadSat: null, categoriaNombre: null, ...extra,
});
const fila = (producto_id: string, extra: Partial<FilaProductoSucursal> = {}): FilaProductoSucursal => ({
  producto_id, disponible: true, precio_mxn: null, agotado_manual: false, agotado_automatico: false, ...extra,
});
const cat = (id: string): Categoria => ({ id, nombre: id, color_hex: null, icono: null, orden: 0 });

describe("aplicarSucursal", () => {
  it("sin fila, el producto queda igual: precio general, se vende, sin agotar", () => {
    const [p] = aplicarSucursal([prod("clasica", 120, "hamb")], []);
    expect(p).toMatchObject({ precio_base_mxn: 120, seVendeAqui: true, agotado: false });
  });

  it("con precio propio cobra ese, aunque PostgREST lo mande como texto", () => {
    const [p] = aplicarSucursal([prod("clasica", 120, "hamb")], [fila("clasica", { precio_mxn: "135.00" })]);
    expect(p!.precio_base_mxn).toBe(135);
  });

  it("con fila pero sin precio, sigue el general", () => {
    const [p] = aplicarSucursal([prod("clasica", 120, "hamb")], [fila("clasica", { agotado_manual: true })]);
    expect(p!.precio_base_mxn).toBe(120);
  });

  it("apagado aquí: se marca, no se quita (la reapertura de cuentas lo necesita)", () => {
    const r = aplicarSucursal([prod("papas", 55, "acomp")], [fila("papas", { disponible: false })]);
    expect(r).toHaveLength(1);
    expect(r[0]!.seVendeAqui).toBe(false);
  });

  it("agotado a mano o por inventario en esta sucursal", () => {
    const r = aplicarSucursal(
      [prod("papas", 55, "acomp"), prod("aros", 60, "acomp")],
      [fila("papas", { agotado_manual: true }), fila("aros", { agotado_automatico: true })],
    );
    expect(r.map((p) => p.agotado)).toEqual([true, true]);
  });

  it("un estado AGOTADO heredado sigue agotado aunque la fila no lo diga", () => {
    const [p] = aplicarSucursal([prod("papas", 55, "acomp", { agotado: true })], [fila("papas")]);
    expect(p!.agotado).toBe(true);
  });
});

describe("menuVisible", () => {
  it("quita de la cuadrícula lo que no se vende aquí", () => {
    const r = menuVisible([cat("hamb")], [prod("clasica", 120, "hamb"), prod("doble", 150, "hamb", { seVendeAqui: false })]);
    expect(r.productos.map((p) => p.id)).toEqual(["clasica"]);
  });

  it("esconde la categoría que se quedó vacía por eso, no la que ya estaba vacía", () => {
    const r = menuVisible(
      [cat("hamb"), cat("postres"), cat("nueva")],
      [prod("clasica", 120, "hamb"), prod("pay", 40, "postres", { seVendeAqui: false })],
    );
    expect(r.categorias.map((c) => c.id)).toEqual(["hamb", "nueva"]);
  });

  it("un producto de una caché vieja, sin seVendeAqui, cuenta como que se vende", () => {
    const viejo: Partial<Producto> = { ...prod("clasica", 120, "hamb") };
    delete viejo.seVendeAqui;
    expect(menuVisible([cat("hamb")], [viejo as Producto]).productos).toHaveLength(1);
  });
});
