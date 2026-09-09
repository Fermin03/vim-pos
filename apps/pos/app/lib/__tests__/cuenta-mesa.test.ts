import { describe, it, expect } from "vitest";
import { agruparPadresHijos, type FilaItemPersistido } from "../cuenta-mesa";
import type { Producto } from "../catalogo";
import type { ComboDef } from "../combos";

const prod = (id: string, nombre: string, precio: number, esCombo = false): Producto => ({
  id, nombre, descripcion: null, precio_base_mxn: precio, categoria_id: "c", agotado: false, esCombo,
  sku: null, tasaIva: 16, ivaIncluido: true, claveSat: null, unidadSat: null, categoriaNombre: null,
});
const combo = prod("c1", "Combo", 45, true), doble = prod("h1", "Doble", 130), papas = prod("a1", "Papas", 45), brownie = prod("p1", "Brownie", 45);
const porId = new Map([combo, doble, papas, brownie].map((p) => [p.id, p]));
const def: ComboDef = { producto: combo, slots: [
  { id: "g1", nombre: "Hamburguesa", orden: 1, min: 1, max: 1, modo: "SUMA_PRECIO_PRODUCTO", opciones: [] },
  { id: "g2", nombre: "Acompañamiento", orden: 2, min: 1, max: 1, modo: "DELTA", opciones: [] },
] };
const fila = (f: Partial<FilaItemPersistido> & { id: string; producto_id: string }): FilaItemPersistido => ({
  client_id_local: null, cantidad: 1, nota_cocina: null, cancelado: false, parent_item_id: null, combo_rol: null,
  combo_grupo_nombre_snapshot: null, precio_unitario_snapshot: 0, ticket_item_modificadores: [], ...f,
});

describe("agruparPadresHijos", () => {
  it("arma una línea de combo con sus componentes y conserva el precio del padre", () => {
    const filas = [
      fila({ id: "P", producto_id: "c1", client_id_local: "cl-p", combo_rol: "PADRE", precio_unitario_snapshot: 175 }),
      fila({ id: "H1", producto_id: "h1", parent_item_id: "P", combo_rol: "HIJO", combo_grupo_nombre_snapshot: "Hamburguesa",
        ticket_item_modificadores: [{ opcion_modificador_id: "o1", grupo_nombre_snapshot: "Extras", opcion_nombre_snapshot: "Extra queso", precio_extra_snapshot: 15, cantidad: 1 }] }),
      fila({ id: "H2", producto_id: "a1", parent_item_id: "P", combo_rol: "HIJO", combo_grupo_nombre_snapshot: "Acompañamiento" }),
      fila({ id: "S", producto_id: "p1", precio_unitario_snapshot: 45 }),
    ];
    const lineas = agruparPadresHijos(filas, porId, [def]);
    expect(lineas.map((l) => l.clientId)).toEqual(["cl-p", "S"]);
    expect(lineas[0].combo?.precioUnitario).toBe(175);
    expect(lineas[0].combo?.componentes.map((c) => [c.grupoId, c.producto.id])).toEqual([["g1", "h1"], ["g2", "a1"]]);
    expect(lineas[0].combo?.componentes[0].modificadores[0].opcionNombre).toBe("Extra queso");
  });
  it("omite cancelados y productos fuera de catálogo; un hijo huérfano se omite", () => {
    const filas = [
      fila({ id: "P", producto_id: "c1", combo_rol: "PADRE", precio_unitario_snapshot: 175, cancelado: true }),
      fila({ id: "H1", producto_id: "h1", parent_item_id: "P", combo_rol: "HIJO", cancelado: true }),
      fila({ id: "H9", producto_id: "h1", parent_item_id: "NADIE", combo_rol: "HIJO" }),
    ];
    expect(agruparPadresHijos(filas, porId, [def])).toEqual([]);
  });
  it("con el hijo a cantidad 2 y el padre a 2, el componente queda en 1", () => {
    const filas = [
      fila({ id: "P", producto_id: "c1", combo_rol: "PADRE", cantidad: 2, precio_unitario_snapshot: 140 }),
      fila({ id: "H1", producto_id: "h1", parent_item_id: "P", combo_rol: "HIJO", cantidad: 2, combo_grupo_nombre_snapshot: "Hamburguesa" }),
    ];
    const [l] = agruparPadresHijos(filas, porId, [def]);
    expect(l.cantidad).toBe(2);
    expect(l.combo?.componentes[0].cantidad).toBe(1);
  });
});
