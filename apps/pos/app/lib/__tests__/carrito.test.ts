import { describe, it, expect } from "vitest";
import { reducerCarrito, estadoInicial, precioUnitarioLinea, totalLinea, calcularTotalesDisplay, type LineaCarrito } from "../carrito";
import type { Producto } from "../catalogo";
import type { ComboDef } from "../combos";

const prod = (id: string, nombre: string, precio: number): Producto => ({
  id, nombre, descripcion: null, precio_base_mxn: precio, categoria_id: "c", agotado: false, esCombo: false,
  sku: null, tasaIva: 16, ivaIncluido: true, claveSat: null, unidadSat: null, categoriaNombre: null,
});
const combo = { ...prod("c1", "Combo", 45), esCombo: true };
const def: ComboDef = { producto: combo, slots: [] };
const lineaCombo: LineaCarrito = {
  clientId: "l1", producto: combo, cantidad: 2, modificadores: [], notaCocina: null,
  combo: { def, precioUnitario: 175, componentes: [
    { grupoId: "g1", grupoNombre: "Hamburguesa", producto: prod("h1", "Doble", 130), cantidad: 1, notaCocina: null, clientId: "k1",
      modificadores: [{ opcionId: "o1", grupoNombre: "Extras", opcionNombre: "Extra queso", precioExtra: 15, cantidad: 1 }] },
    { grupoId: "g2", grupoNombre: "Acompañamiento", producto: prod("a1", "Papas", 45), cantidad: 1, notaCocina: null, clientId: "k2", modificadores: [] },
  ] },
};

describe("precio de una línea de combo", () => {
  it("unitario = precio congelado del combo + extras de los hijos", () => {
    expect(precioUnitarioLinea(lineaCombo)).toBe(190);
  });
  it("total = unitario × cantidad", () => {
    expect(totalLinea(lineaCombo)).toBe(380);
  });
  it("una línea normal no cambia", () => {
    expect(precioUnitarioLinea({ clientId: "x", producto: prod("p", "Brownie", 45), cantidad: 1, modificadores: [], notaCocina: null })).toBe(45);
  });
});

describe("reemplazar", () => {
  it("sustituye la línea por clientId sin moverla de lugar", () => {
    const otra: LineaCarrito = { clientId: "l0", producto: prod("p", "Brownie", 45), cantidad: 1, modificadores: [], notaCocina: null };
    const e0 = { ...estadoInicial, lineas: [otra, lineaCombo] };
    const e1 = reducerCarrito(e0, { tipo: "reemplazar", linea: { ...lineaCombo, cantidad: 1 } });
    expect(e1.lineas.map((l) => l.clientId)).toEqual(["l0", "l1"]);
    expect(e1.lineas[1].cantidad).toBe(1);
  });
});

describe("envío por zona", () => {
  const linea: LineaCarrito = {
    clientId: "l1", producto: prod("p1", "Hamburguesa", 120), cantidad: 2,
    modificadores: [], notaCocina: null,
  };

  it("el cargo de la zona suma al total", () => {
    const t = calcularTotalesDisplay([linea], 16, 35);
    expect(t.total).toBe(275);
  });

  it("sin envío los totales no cambian", () => {
    expect(calcularTotalesDisplay([linea]).total).toBe(240);
  });

  it("el IVA se calcula sobre el total con envío", () => {
    const t = calcularTotalesDisplay([linea], 16, 35);
    expect(t.subtotal + t.iva).toBe(275);
  });

  it("la acción zona guarda la zona elegida", () => {
    const e = reducerCarrito(estadoInicial, {
      tipo: "zona", envio: { zonaId: "z1", nombre: "Zona Norte", costoMxn: 35 },
    });
    expect(e.envio?.costoMxn).toBe(35);
  });

  it("salir de domicilio borra el envío", () => {
    const con = reducerCarrito(
      { ...estadoInicial, modoServicio: "DELIVERY_PROPIO" },
      { tipo: "zona", envio: { zonaId: "z1", nombre: "Zona Norte", costoMxn: 35 } },
    );
    expect(reducerCarrito(con, { tipo: "modo", modo: "COMER_AQUI" }).envio).toBeNull();
  });

  it("limpiar el carrito deja el envío en el pedido anterior", () => {
    const con = reducerCarrito(
      { ...estadoInicial, modoServicio: "DELIVERY_PROPIO" },
      { tipo: "zona", envio: { zonaId: "z1", nombre: "Zona Norte", costoMxn: 35 } },
    );
    expect(reducerCarrito(con, { tipo: "limpiar" }).envio).toBeNull();
  });
});
