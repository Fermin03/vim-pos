import { describe, it, expect } from "vitest";
import { detectarFormato, parsearConFormato } from "../importar-menu";

const SQUARE = [
  'Token,Item Name,Variation Name,SKU,Description,Category,Price',
  'tok1,Cheese Burger,Regular,CB-1,"Con queso americano",Hamburguesas,120',
  'tok2,Papas Gajo,,PG-1,,Acompañamientos,55',
  'tok3,,Grande,CB-1G,,,140', // variante sin nombre → se omite
].join("\n");

const TOAST = [
  "Menu Group,Menu Item,Price,Description",
  "Bebidas,Coca-Cola 600ml,30,Refresco",
  "Bebidas,Agua,20,",
].join("\n");

const LOYVERSE = [
  "Handle,SKU,Name,Category,Default price",
  "h1,S1,Latte,Café,55.50",
  "h2,S2,Croissant,Pan,38",
].join("\n");

const CLIP = [
  "Nombre,Categoría,Precio,Descripción",
  "Taco Pastor,Tacos,22,Con piña",
].join("\n");

const VIM = "Hamburguesas,Cheese Burger,120,Con queso\nBebidas,Coca,30,";

describe("Fase 4 — migración desde otros POS (presets de formato)", () => {
  it("detecta el origen por encabezados", () => {
    expect(detectarFormato(SQUARE)).toBe("SQUARE");
    expect(detectarFormato(TOAST)).toBe("TOAST");
    expect(detectarFormato(LOYVERSE)).toBe("LOYVERSE");
    expect(detectarFormato(CLIP)).toBe("CLIP");
    expect(detectarFormato(VIM)).toBe("VIM"); // sin encabezados conocidos → posicional VIM
  });

  it("Square: mapea Item Name/Category/Price/Description y omite variantes sin nombre", () => {
    const r = parsearConFormato(SQUARE, "AUTO");
    expect(r.formatoUsado).toBe("SQUARE");
    expect(r.filas).toHaveLength(2);
    expect(r.filas[0]).toMatchObject({ nombre: "Cheese Burger", categoria: "Hamburguesas", precio: 120, descripcion: "Con queso americano" });
  });

  it("Toast: Menu Group/Menu Item/Price", () => {
    const r = parsearConFormato(TOAST, "TOAST");
    expect(r.filas).toEqual([
      { categoria: "Bebidas", nombre: "Coca-Cola 600ml", precio: 30, descripcion: "Refresco" },
      { categoria: "Bebidas", nombre: "Agua", precio: 20, descripcion: "" },
    ]);
  });

  it("Loyverse: Default price con decimales", () => {
    const r = parsearConFormato(LOYVERSE, "AUTO");
    expect(r.formatoUsado).toBe("LOYVERSE");
    expect(r.filas[0]).toMatchObject({ nombre: "Latte", categoria: "Café", precio: 55.5 });
  });

  it("Clip: encabezados en español", () => {
    const r = parsearConFormato(CLIP, "AUTO");
    expect(r.formatoUsado).toBe("CLIP");
    expect(r.filas[0]).toMatchObject({ nombre: "Taco Pastor", categoria: "Tacos", precio: 22, descripcion: "Con piña" });
  });

  it("sin categoría en el export → cae a 'Importados'", () => {
    const sinCat = "Item Name,Price\nBrownie,45";
    const r = parsearConFormato(sinCat, "SQUARE");
    expect(r.filas[0]).toMatchObject({ nombre: "Brownie", categoria: "Importados", precio: 45 });
  });

  it("precio inválido se reporta como error de línea sin abortar el resto", () => {
    const conError = "Menu Group,Menu Item,Price\nBebidas,Coca,abc\nBebidas,Agua,20";
    const r = parsearConFormato(conError, "TOAST");
    expect(r.errores).toHaveLength(1);
    expect(r.filas).toHaveLength(1);
  });
});
